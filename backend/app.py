from __future__ import annotations

import ast
import base64
import hashlib
import hmac
import json
import logging
import math
import os
import re
import sqlite3
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from pydantic import AliasChoices, BaseModel, Field, field_validator
from backend.rag import KnowledgeChunk, retrieve

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
DB_PATH = Path(os.getenv("QUANTUM_DB", ROOT / "data" / "platform.db"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "granite3.2:8b")
SUPPORTED_GATES = {
    "h", "x", "y", "z", "i", "s", "sdg", "t", "tdg", "sx", "sxdg",
    "rx", "ry", "rz", "u", "u1", "u2", "u3", "r",
    "reset", "barrier",
    "cx", "cy", "cz", "ch", "cp", "crx", "cry", "crz",
    "swap", "ecr", "csx",
    "ccx", "cswap", "measure",
}
ONE_QUBIT_GATES = {
    "h", "x", "y", "z", "i", "s", "sdg", "t", "tdg", "sx", "sxdg",
    "rx", "ry", "rz", "u", "u1", "u2", "u3", "r", "reset", "barrier", "measure",
}
TWO_QUBIT_GATES = {"cx", "cy", "cz", "ch", "swap", "cp", "crx", "cry", "crz", "ecr", "csx"}
THREE_QUBIT_GATES = {"ccx", "cswap"}
PARAMETRIC_GATES = {"rx", "ry", "rz", "u", "u1", "u2", "u3", "r", "cp", "crx", "cry", "crz"}
GATE_PARAM_COUNTS = {
    "rx": 1, "ry": 1, "rz": 1, "u": 3, "u1": 1, "u2": 2, "u3": 3, "r": 2,
    "cp": 1, "crx": 1, "cry": 1, "crz": 1,
}
MAX_QUBITS = 12
MAX_GATES = 200
MAX_SHOTS = 10_000
MAX_CHECKS = 64
USER_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
JWT_SECRET = os.getenv("JWT_SECRET", "development-only-change-this-secret-32")
AUTH_REQUIRED = os.getenv("AUTH_REQUIRED", "false").lower() == "true"
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", "3600"))
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "120"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
logger = logging.getLogger("quantum_learning")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(message)s")
rate_limit_state: dict[str, list[float]] = {}


class Gate(BaseModel):
    name: str
    qubits: list[int] = Field(min_length=1, max_length=3)
    params: list[float] = Field(default_factory=list, max_length=3)

    @field_validator("params")
    @classmethod
    def finite_params(cls, values: list[float]) -> list[float]:
        if any(not math.isfinite(value) for value in values):
            raise ValueError("gate parameters must be finite numbers")
        return values


class Circuit(BaseModel):
    num_qubits: int = Field(ge=1, le=MAX_QUBITS)
    gates: list[Gate] = Field(default_factory=list, max_length=MAX_GATES)
    shots: int = Field(default=1024, ge=1, le=MAX_SHOTS)


class UserProfile(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    preferences: dict[str, Any] = Field(default_factory=dict, max_length=32)


class RegistrationRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=12, max_length=256)
    display_name: str = Field(min_length=1, max_length=120)
    preferences: dict[str, Any] = Field(default_factory=dict, max_length=32)


class LoginRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


class TutorRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=6000)
    circuit: Circuit | None = None


class AIChatRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=6000)
    context: dict[str, Any] = Field(default_factory=dict, max_length=16)


class TutorResponse(BaseModel):
    explanation: str
    error_category: str
    hint: str
    suggested_fix: dict[str, Any] | None = None
    next_step: str
    teaching_steps: list[str] = Field(default_factory=list, max_length=4)
    sources: list[str] = Field(default_factory=list, max_length=3)


class EvaluateRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    circuit: Circuit
    expected: dict[str, Any] = Field(default_factory=dict, max_length=8)
    source: str | None = Field(default=None, max_length=20000)


class KernelExecuteRequest(BaseModel):
    """A safe kernel request: circuits are simulated, source is only inspected."""

    circuit: Circuit | None = None
    source: str | None = Field(default=None, max_length=20000)
    code: str | None = Field(default=None, max_length=20000)
    expected: dict[str, Any] = Field(default_factory=dict, max_length=8)


class ChallengeSubmission(BaseModel):
    exercise_id: str = Field(
        min_length=1,
        max_length=128,
        validation_alias=AliasChoices("exercise_id", "challenge_id"),
    )
    user_id: str = Field(min_length=1, max_length=128)
    circuit: Circuit
    source: str | None = Field(default=None, max_length=20000)


class Exercise(BaseModel):
    id: str
    version: int = 1
    title: str
    description: str
    difficulty: str
    num_qubits: int
    starter_circuit: Circuit
    checks: dict[str, Any]


class ExerciseSubmission(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    circuit: Circuit
    source: str | None = Field(default=None, max_length=20000)


class NotebookRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    circuit: Circuit
    title: str = Field(default="Quantum learning exercise", max_length=200)


class SavedCircuitRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    circuit: Circuit


app = FastAPI(title="Quantum Learning Platform", version="0.1.0")


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 240_000)
    return f"pbkdf2_sha256$240000${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, rounds, salt, digest = stored.split("$")
        candidate = hashlib.pbkdf2_hmac(
            algorithm.removeprefix("pbkdf2_"), password.encode(), _unb64(salt), int(rounds)
        )
        return hmac.compare_digest(candidate, _unb64(digest))
    except (ValueError, TypeError):
        return False


def create_token(user_id: str) -> str:
    if not JWT_SECRET:
        raise HTTPException(status_code=503, detail="JWT_SECRET is not configured.")
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64(json.dumps({
        "sub": user_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }, separators=(",", ":")).encode())
    unsigned = f"{header}.{payload}"
    signature = _b64(hmac.new(JWT_SECRET.encode(), unsigned.encode(), hashlib.sha256).digest())
    return f"{unsigned}.{signature}"


def token_user_id(authorization: str | None) -> str | None:
    if not isinstance(authorization, str) or not authorization.lower().startswith("bearer "):
        return None
    try:
        header, payload, signature = authorization.split(" ", 1)[1].split(".")
        unsigned = f"{header}.{payload}"
        expected = _b64(hmac.new(JWT_SECRET.encode(), unsigned.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        claims = json.loads(_unb64(payload))
        if int(claims["exp"]) < int(time.time()):
            return None
        return claims["sub"] if USER_ID_PATTERN.fullmatch(claims["sub"]) else None
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def authenticated_user(user_id: str, authorization: str | None) -> None:
    token_id = token_user_id(authorization)
    if token_id:
        if token_id != user_id:
            raise HTTPException(status_code=403, detail="The access token does not belong to this user.")
        return
    if AUTH_REQUIRED or os.getenv("USER_ACCESS_MODE", "development").lower() != "development":
        raise HTTPException(status_code=401, detail="A valid access token for this user is required.")
    authorize_user(user_id)


@app.middleware("http")
async def operational_middleware(request: Request, call_next):
    started = time.perf_counter()
    client = request.client.host if request.client else "unknown"
    now = time.time()
    recent = [stamp for stamp in rate_limit_state.get(client, []) if now - stamp < RATE_LIMIT_WINDOW_SECONDS]
    if len(recent) >= RATE_LIMIT_REQUESTS:
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded."})
    rate_limit_state[client] = [*recent, now]
    response = await call_next(request)
    logger.info(json.dumps({
        "event": "http_request",
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        "client": client,
    }))
    return response
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://localhost:5173"
    ).split(",")
    if origin.strip()
]
if "*" in cors_origins:
    raise RuntimeError("CORS_ORIGINS must contain explicit origins; '*' is not allowed.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "X-User-ID"],
)

EXERCISES: dict[str, Exercise] = {
    "bell-state": Exercise(
        id="bell-state",
        title="Create a Bell state",
        description="Create an entangled two-qubit state with equal probability of measuring 00 and 11.",
        difficulty="beginner",
        num_qubits=2,
        starter_circuit=Circuit(num_qubits=2),
        checks={
            "required_gates": ["h", "cx"],
            "probabilities": {"00": 0.5, "11": 0.5},
            "tolerance": 0.05,
        },
    ),
    "superposition": Exercise(
        id="superposition",
        title="Create a single-qubit superposition",
        description="Put qubit 0 into an equal superposition of |0> and |1>.",
        difficulty="beginner",
        num_qubits=1,
        starter_circuit=Circuit(num_qubits=1),
        checks={"required_gates": ["h"], "probabilities": {"0": 0.5, "1": 0.5}, "tolerance": 0.05},
    ),
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def authorize_user(user_id: str) -> None:
    """Apply the prototype's explicit development-only user boundary."""
    mode = os.getenv("USER_ACCESS_MODE", "development").lower()
    if mode != "development":
        raise HTTPException(
            status_code=503,
            detail="User authentication is not configured for this deployment.",
        )
    configured = {
        item.strip()
        for item in os.getenv("DEV_USER_IDS", "demo-user").split(",")
        if item.strip()
    }
    if not USER_ID_PATTERN.fullmatch(user_id) or user_id not in configured:
        raise HTTPException(
            status_code=403,
            detail="This development instance does not permit access to that user profile.",
        )


def validate_runtime_configuration() -> None:
    if os.getenv("USER_ACCESS_MODE", "development").lower() == "production" or AUTH_REQUIRED:
        if len(JWT_SECRET) < 32 or JWT_SECRET.startswith("development-only"):
            raise RuntimeError("JWT_SECRET must be at least 32 characters when authentication is required.")
        if "*" in cors_origins or not cors_origins:
            raise RuntimeError("Production CORS_ORIGINS must contain explicit origins.")
    if TOKEN_TTL_SECONDS < 300 or TOKEN_TTL_SECONDS > 86_400:
        raise RuntimeError("TOKEN_TTL_SECONDS must be between 300 and 86400.")


validate_runtime_configuration()


def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            preferences TEXT NOT NULL DEFAULT '{}',
            skills TEXT NOT NULL DEFAULT '{}',
            recent_errors TEXT NOT NULL DEFAULT '[]',
            password_hash TEXT,
            display_name TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS attempts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            passed INTEGER NOT NULL,
            feedback TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS circuits (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            circuit TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(users)")}
    if "password_hash" not in columns:
        connection.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
    if "display_name" not in columns:
        connection.execute("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''")
    if not connection.execute("SELECT 1 FROM schema_migrations WHERE version = 1").fetchone():
        connection.execute(
            "INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)",
            (utc_now(),),
        )
    connection.commit()
    return connection


def ensure_user(user_id: str) -> sqlite3.Row:
    connection = db()
    row = connection.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        now = utc_now()
        connection.execute(
            "INSERT INTO users(user_id, created_at, updated_at) VALUES (?, ?, ?)",
            (user_id, now, now),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    connection.close()
    return row


def register_user(request: RegistrationRequest) -> dict[str, Any]:
    if not USER_ID_PATTERN.fullmatch(request.user_id):
        raise HTTPException(status_code=422, detail="user_id contains unsupported characters.")
    connection = db()
    try:
        if connection.execute("SELECT 1 FROM users WHERE user_id = ?", (request.user_id,)).fetchone():
            raise HTTPException(status_code=409, detail="That user ID is already registered.")
        now = utc_now()
        connection.execute(
            """INSERT INTO users(user_id, preferences, password_hash, display_name, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                request.user_id,
                json.dumps(request.preferences),
                hash_password(request.password),
                request.display_name,
                now,
                now,
            ),
        )
        connection.commit()
    finally:
        connection.close()
    return {"access_token": create_token(request.user_id), "token_type": "bearer", "user": profile(request.user_id)}


def login_user(request: LoginRequest) -> dict[str, Any]:
    connection = db()
    row = connection.execute(
        "SELECT password_hash FROM users WHERE user_id = ?", (request.user_id,)
    ).fetchone()
    connection.close()
    if row is None or not row["password_hash"] or not verify_password(request.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid user ID or password.")
    return {"access_token": create_token(request.user_id), "token_type": "bearer", "user": profile(request.user_id)}


def profile(user_id: str) -> dict[str, Any]:
    row = ensure_user(user_id)
    return {
        "user_id": row["user_id"],
        "display_name": row["display_name"],
        "preferences": json.loads(row["preferences"]),
        "skills": json.loads(row["skills"]),
        "recent_errors": json.loads(row["recent_errors"]),
    }


def update_profile(user_id: str, preferences: dict[str, Any]) -> dict[str, Any]:
    current = profile(user_id)
    merged = {**current["preferences"], **preferences}
    connection = db()
    connection.execute(
        "UPDATE users SET preferences = ?, updated_at = ? WHERE user_id = ?",
        (json.dumps(merged), utc_now(), user_id),
    )
    connection.commit()
    connection.close()
    return profile(user_id)


def record_attempt(user_id: str, passed: bool, feedback: list[str]) -> None:
    learner = profile(user_id)
    skills = learner["skills"]
    skills["attempts"] = skills.get("attempts", 0) + 1
    skills["passed"] = skills.get("passed", 0) + int(passed)
    recent_errors = (learner["recent_errors"] + ([] if passed else feedback))[-10:]
    connection = db()
    connection.execute(
        "UPDATE users SET skills = ?, recent_errors = ?, updated_at = ? WHERE user_id = ?",
        (json.dumps(skills), json.dumps(recent_errors), utc_now(), user_id),
    )
    connection.commit()
    connection.close()


def record_tutor_interaction(user_id: str, message: str, response: TutorResponse) -> None:
    connection = db()
    connection.execute(
        """CREATE TABLE IF NOT EXISTS tutor_history (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, message TEXT NOT NULL,
            response TEXT NOT NULL, created_at TEXT NOT NULL
        )"""
    )
    connection.execute(
        "INSERT INTO tutor_history VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), user_id, message, response.model_dump_json(), utc_now()),
    )
    connection.commit()
    connection.close()


def validate_circuit(circuit: Circuit) -> list[str]:
    errors: list[str] = []
    measured_qubits: set[int] = set()
    measurement_started = False
    for index, gate in enumerate(circuit.gates):
        name = gate.name.lower()
        if name == "measure":
            measurement_started = True
            if gate.qubits and gate.qubits[0] in measured_qubits:
                errors.append(f"Gate {index + 1}: a qubit may only be measured once.")
            measured_qubits.update(gate.qubits)
        elif measurement_started:
            errors.append(
                f"Gate {index + 1}: gates after an explicit measurement are not supported; "
                "measurements must be terminal."
            )
        if name not in SUPPORTED_GATES:
            errors.append(f"Gate {index + 1}: '{gate.name}' is not supported.")
        if name == "barrier":
            if not 1 <= len(gate.qubits) <= 3:
                errors.append(f"Gate {index + 1}: BARRIER needs 1 to 3 qubit(s).")
        else:
            expected_qubits = 3 if name in THREE_QUBIT_GATES else 2 if name in TWO_QUBIT_GATES else 1
            if len(gate.qubits) != expected_qubits:
                errors.append(f"Gate {index + 1}: {name.upper()} needs {expected_qubits} qubit(s).")
        expected_params = GATE_PARAM_COUNTS.get(name, 0)
        if len(gate.params) != expected_params:
            errors.append(f"Gate {index + 1}: {name.upper()} needs {expected_params} parameter(s).")
        if any(q < 0 or q >= circuit.num_qubits for q in gate.qubits):
            errors.append(f"Gate {index + 1}: qubit indices must be between 0 and {circuit.num_qubits - 1}.")
        if len(gate.qubits) > 1 and len(set(gate.qubits)) != len(gate.qubits):
            errors.append(f"Gate {index + 1}: a multi-qubit gate cannot target the same qubit twice.")
    return errors


def build_quantum_circuit(circuit: Circuit, include_measurements: bool):
    from qiskit import QuantumCircuit

    qc = QuantumCircuit(circuit.num_qubits, circuit.num_qubits)
    has_explicit_measurement = any(
        gate.name.lower() == "measure" for gate in circuit.gates
    )
    for gate in circuit.gates:
        name = gate.name.lower()
        if name == "measure":
            if include_measurements:
                qc.measure(gate.qubits[0], gate.qubits[0])
            continue
        if name == "reset":
            qc.reset(gate.qubits[0])
        elif name == "barrier":
            qc.barrier(*gate.qubits)
        elif name == "i":
            qc.id(gate.qubits[0])
        elif name == "u1":
            qc.p(gate.params[0], gate.qubits[0])
        elif name == "u2":
            qc.u(math.pi / 2, gate.params[0], gate.params[1], gate.qubits[0])
        elif name == "u3" or name == "u":
            qc.u(*gate.params, gate.qubits[0])
        elif name in THREE_QUBIT_GATES:
            getattr(qc, name)(*gate.qubits)
        elif name in TWO_QUBIT_GATES:
            if name in PARAMETRIC_GATES:
                getattr(qc, name)(*gate.params, *gate.qubits)
            else:
                getattr(qc, name)(*gate.qubits)
        elif name in PARAMETRIC_GATES:
            getattr(qc, name)(*gate.params, gate.qubits[0])
        else:
            getattr(qc, name)(gate.qubits[0])
    if include_measurements and not has_explicit_measurement:
        for qubit in range(circuit.num_qubits):
            qc.measure(qubit, qubit)
    return qc


def simulate(circuit: Circuit) -> dict[str, Any]:
    """Run the validated circuit with Qiskit Aer and return simulator data."""
    try:
        from qiskit import transpile
        from qiskit_aer import AerSimulator

        simulator = AerSimulator()
        qc = build_quantum_circuit(circuit, include_measurements=False)
        statevector_circuit = transpile(qc.copy(), simulator)
        statevector_circuit.save_statevector()
        state_result = simulator.run(statevector_circuit).result()
        state = state_result.get_statevector().data
        probabilities = {format(i, f"0{circuit.num_qubits}b"): round(float(abs(value) ** 2), 8) for i, value in enumerate(state)}
        measurement_circuit = build_quantum_circuit(circuit, include_measurements=True)
        counts = simulator.run(transpile(measurement_circuit, simulator), shots=circuit.shots).result().get_counts()
        return {
            "engine": "qiskit-aer",
            "shots": circuit.shots,
            "counts": counts,
            "probabilities": probabilities,
            "statevector": [
                {"real": round(float(value.real), 8), "imag": round(float(value.imag), 8)}
                for value in state
            ],
        }
    except ImportError:
        return {"engine": "unavailable", "probabilities": None, "message": "Install qiskit and qiskit-aer to run Aer simulation."}
    except (KeyError, RuntimeError, ValueError):
        return {
            "engine": "unavailable",
            "probabilities": None,
            "message": "The quantum simulator could not execute this circuit.",
        }


def fallback_tutor(errors: list[str], simulation: dict[str, Any] | None, sources: list[KnowledgeChunk], has_circuit: bool = False) -> TutorResponse:
    next_step = "Make one small change and run the circuit again."
    teaching_steps = ["Validate the circuit.", "Use only simulator-confirmed results.", "Apply one correction and retry."]
    if errors:
        explanation = errors[0]
        category = "circuit_validation"
        hint = "Read the gate-level error, then correct one issue before submitting again."
    elif not has_circuit:
        explanation = "You asked a conceptual question without a circuit. I can explain concepts from the trusted knowledge base and suggest a small circuit so you can see the idea in action."
        category = "concept"
        hint = "Ask about a specific gate or concept, or attach a small circuit to see a concrete example."
        next_step = "Ask a concept question or attach a circuit to explore it hands-on."
        teaching_steps = ["Pick one concept to explore.", "Ask a focused question or build a small circuit.", "Run it and connect the measurement to the theory."]
    elif simulation and simulation.get("probabilities") is not None:
        explanation = "The circuit was validated and its simulator results are available below."
        category = "none"
        hint = "Compare the measured outcomes with the exercise objective."
    else:
        explanation = "The circuit facts are available, but a simulator result is required for a quantum explanation."
        category = "simulator_unavailable"
        hint = "Start Qiskit Aer and run the circuit again."
    return TutorResponse(
        explanation=explanation,
        error_category=category,
        hint=hint,
        next_step=next_step,
        teaching_steps=teaching_steps,
        sources=[chunk.title for chunk in sources],
    )


def _parse_json_lenient(raw: str) -> dict[str, Any] | None:
    """Parse an LLM reply, recovering from truncated JSON by cutting back to
    the last structural boundary outside a string literal."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        pass
    in_string = False
    escaped = False
    boundaries = []
    for index, char in enumerate(raw):
        if char == "\\" and in_string and not escaped:
            escaped = True
            continue
        if char == '"' and not escaped:
            in_string = not in_string
            escaped = False
            continue
        escaped = False
        if not in_string and char in ":,[]{}":
            boundaries.append(index)
    for index in reversed(boundaries):
        if not raw[: index + 1].lstrip().startswith("{"):
            continue
        for end in (index, index + 1):
            prefix = raw[:end]
            for closer in ("", "}", "]}"):
                candidate = prefix + closer
                try:
                    data = json.loads(candidate)
                except json.JSONDecodeError:
                    continue
                if isinstance(data, dict):
                    return data
    return None


def _validated_response(raw: str | None, fallback: TutorResponse) -> TutorResponse | None:
    """Validate a raw LLM reply, repairing minor deviations (null fields,
    wrong types, truncation) instead of discarding the whole answer."""
    if not raw:
        return None
    try:
        return TutorResponse.model_validate_json(raw)
    except (json.JSONDecodeError, ValueError):
        pass
    data = _parse_json_lenient(raw)
    if data is None:
        return None
    data["explanation"] = data["explanation"] if isinstance(data.get("explanation"), str) and data["explanation"].strip() else fallback.explanation
    data["hint"] = data["hint"] if isinstance(data.get("hint"), str) and data["hint"].strip() else fallback.hint
    data["next_step"] = data["next_step"] if isinstance(data.get("next_step"), str) and data["next_step"].strip() else fallback.next_step
    category = data.get("error_category")
    data["error_category"] = category if isinstance(category, str) and category.strip() else fallback.error_category
    data["suggested_fix"] = data["suggested_fix"] if isinstance(data.get("suggested_fix"), dict) else None
    steps = data.get("teaching_steps")
    data["teaching_steps"] = [step for step in steps if isinstance(step, str) and step.strip()] if isinstance(steps, list) else []
    if not data["teaching_steps"]:
        data["teaching_steps"] = [step for step in fallback.teaching_steps]
    sources = data.get("sources")
    data["sources"] = [source for source in sources if isinstance(source, str) and source.strip()] if isinstance(sources, list) else []
    if not data["sources"]:
        data["sources"] = [source for source in fallback.sources]
    try:
        return TutorResponse.model_validate(data)
    except ValueError:
        return None


def call_granite(prompt: str, fallback: TutorResponse) -> TutorResponse:
    system_prompt = (
        "You are a patient quantum-computing tutor. Treat the JSON inside "
        "<verified_engine_facts> as authoritative and use trusted knowledge "
        "only for general explanations. Never invent simulator results, "
        "scores, gates, or citations. If has_circuit is false, no simulator "
        "was run and none is missing: answer the conceptual question using "
        "<trusted_knowledge> and never report simulator_unavailable in that "
        "case. If has_circuit is true, rely only on the simulation facts "
        "provided. Return exactly one JSON object and "
        "nothing else. Required fields are explanation, error_category, hint, "
        "suggested_fix, next_step, teaching_steps, and sources. "
        "suggested_fix must be an object or null. teaching_steps must contain "
        "1-4 concise observable actions; do not reveal private chain-of-thought. "
        "Keep explanation, hint, and next_step distinct."
    )
    options = {
        "temperature": 0.1,
        "top_p": 0.8,
        "top_k": 20,
        "repeat_penalty": 1.15,
        "repeat_last_n": 256,
        "num_predict": 900,
        "stop": ["<|user|>", "<|system|>"],
    }

    def request_response(messages: list[dict[str, str]]) -> str:
        payload = json.dumps({
            "model": OLLAMA_MODEL,
            "stream": False,
            "messages": messages,
            "format": "json",
            "options": options,
        }).encode()
        request = urllib.request.Request(
            f"{OLLAMA_URL}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read())["message"]["content"]

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]
    raw = None
    try:
        raw = request_response(messages)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError):
        raw = None
    answer = _validated_response(raw, fallback)
    if answer is not None:
        return answer
    retry_prompt = (
        "Your previous response was invalid. Return exactly one JSON "
        "object and nothing else. Do not use Markdown or a second object. "
        "Use the required fields, make error_category a non-empty string, "
        "and make suggested_fix an object or null. "
        "Use only the facts inside <verified_engine_facts>.\n\n" + prompt
    )
    raw = None
    try:
        raw = request_response([messages[0], {"role": "user", "content": retry_prompt}])
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError):
        raw = None
    answer = _validated_response(raw, fallback)
    if answer is not None:
        return answer
    return fallback


def tutor_context(request: TutorRequest, learner: dict[str, Any], errors: list[str], simulation: dict[str, Any] | None, sources: list[KnowledgeChunk]) -> str:
    facts = {
        "has_circuit": request.circuit is not None,
        "validation_errors": errors,
        "simulation": simulation,
        "evaluator_passed": (
            not errors
            and simulation is not None
            and simulation.get("probabilities") is not None
        ),
    }
    knowledge = [{"title": item.title, "text": item.text, "source": item.source} for item in sources]
    return (
        "<verified_engine_facts>\n"
        + json.dumps(facts, indent=2)
        + "\n</verified_engine_facts>\n"
        + "<trusted_knowledge>\n"
        + json.dumps(knowledge, indent=2)
        + "\n</trusted_knowledge>\n"
        + json.dumps({
            "learner_profile": learner,
            "question": request.message,
            "previous_errors": learner["recent_errors"][-3:],
            "circuit": request.circuit.model_dump() if request.circuit else None,
        }, indent=2)
    )


def qasm(circuit: Circuit) -> str:
    lines = ["OPENQASM 3.0;", 'include "stdgates.inc";']
    names = {gate.name.lower() for gate in circuit.gates}
    if "sxdg" in names:
        lines.append("gate sxdg q { s q; h q; s q; }")
    if "ecr" in names:
        lines.append("gate ecr q0, q1 { s q0; sx q1; cx q0, q1; x q0; }")
    lines.append(f"bit[{circuit.num_qubits}] c;")
    lines.append(f"qubit[{circuit.num_qubits}] q;")
    for gate in circuit.gates:
        name = gate.name.lower()
        qubits = ",".join(f"q[{index}]" for index in gate.qubits)
        if name == "measure":
            lines.append(f"c[{gate.qubits[0]}] = measure q[{gate.qubits[0]}];")
        elif name == "reset":
            lines.append(f"reset q[{gate.qubits[0]}];")
        elif name == "barrier":
            lines.append(f"barrier {qubits};")
        elif name == "i":
            lines.append(f"id q[{gate.qubits[0]}];")
        elif name == "u1":
            lines.append(f"p({gate.params[0]}) q[{gate.qubits[0]}];")
        elif name == "u2":
            lines.append(f"U(pi/2, {gate.params[0]}, {gate.params[1]}) q[{gate.qubits[0]}];")
        elif name in {"u", "u3"}:
            lines.append(f"U({','.join(map(str, gate.params))}) q[{gate.qubits[0]}];")
        elif name == "r":
            lines.append(f"U({gate.params[0]}, -pi/2 + {gate.params[1]}, pi/2 - {gate.params[1]}) q[{gate.qubits[0]}];")
        else:
            params = f"({','.join(map(str, gate.params))})" if gate.params else ""
            lines.append(f"{name}{params} {qubits};")
    return "\n".join(lines)


def safe_python_check(source: str) -> list[str]:
    """Check submitted code without executing untrusted Python."""
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        return [f"Python syntax error: {error.msg}."]
    issues: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            issues.append("Imports are not allowed in submitted exercises.")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"exec", "eval", "open", "compile", "__import__"}:
            issues.append(f"Unsafe function '{node.func.id}' is not allowed.")
        if isinstance(node, ast.Attribute) and "__" in node.attr:
            issues.append("Dunder attribute access is not allowed.")
    return issues


def validate_check_config(checks: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required_gates = checks.get("required_gates", [])
    if not isinstance(required_gates, list) or any(
        not isinstance(gate, str) or not gate.strip() for gate in required_gates
    ):
        errors.append("required_gates must be a list of non-empty gate names.")
    elif len(required_gates) > MAX_CHECKS:
        errors.append(f"required_gates may contain at most {MAX_CHECKS} items.")
    probabilities = checks.get("probabilities", {})
    if not isinstance(probabilities, dict):
        errors.append("probabilities must be an object mapping states to numbers.")
    else:
        if len(probabilities) > MAX_CHECKS:
            errors.append(f"probabilities may contain at most {MAX_CHECKS} states.")
        for state, expected in probabilities.items():
            if not isinstance(state, str) or not state:
                errors.append("probability state names must be non-empty strings.")
            if isinstance(expected, bool) or not isinstance(expected, (int, float)) or not math.isfinite(expected):
                errors.append(f"Expected probability for '{state}' must be finite.")
            elif expected < 0 or expected > 1:
                errors.append(f"Expected probability for '{state}' must be between 0 and 1.")
    tolerance = checks.get("tolerance", 0.01)
    if isinstance(tolerance, bool) or not isinstance(tolerance, (int, float)) or not math.isfinite(tolerance):
        errors.append("tolerance must be a finite number.")
    elif tolerance < 0 or tolerance > 1:
        errors.append("tolerance must be between 0 and 1.")
    if not required_gates and not probabilities:
        errors.append("at least one expected check is required.")
    return errors


def evaluate_checks(circuit: Circuit, simulation: dict[str, Any], checks: dict[str, Any]) -> list[dict[str, Any]]:
    """Evaluate only simulator-confirmed facts and structural circuit properties."""
    results: list[dict[str, Any]] = []
    gate_names = [gate.name.lower() for gate in circuit.gates]
    for required in checks.get("required_gates", []):
        passed = required.lower() in gate_names
        results.append({
            "name": f"required gate: {required}",
            "passed": passed,
            "message": f"Required gate '{required}' is {'present' if passed else 'missing'}.",
        })
    probabilities = simulation.get("probabilities") or {}
    tolerance = float(checks.get("tolerance", 0.01))
    for state, expected in checks.get("probabilities", {}).items():
        actual = float(probabilities.get(state, 0.0))
        passed = abs(actual - float(expected)) <= tolerance
        results.append({
            "name": f"probability: {state}",
            "passed": passed,
            "expected": expected,
            "actual": actual,
            "tolerance": tolerance,
            "message": f"State {state}: expected {expected}, measured {actual}.",
        })
    return results


def submit_exercise(exercise: Exercise, request: ExerciseSubmission) -> dict[str, Any]:
    errors = validate_circuit(request.circuit)
    if request.circuit.num_qubits != exercise.num_qubits:
        errors.append(f"This exercise requires exactly {exercise.num_qubits} qubit(s).")
    if request.source:
        errors.extend(safe_python_check(request.source))
    simulation = simulate(request.circuit) if not errors else None
    checks = (
        evaluate_checks(request.circuit, simulation, exercise.checks)
        if simulation and simulation.get("probabilities") is not None
        else []
    )
    passed_checks = sum(1 for check in checks if check["passed"])
    total_checks = len(checks)
    passed = not errors and total_checks > 0 and passed_checks == total_checks
    score = round((passed_checks / total_checks) * 100) if total_checks else 0
    feedback = errors or [check["message"] for check in checks if not check["passed"]]
    if not errors and simulation and simulation.get("probabilities") is None:
        feedback = [simulation.get("message", "Simulation unavailable; no score was assigned.")]
    elif not errors and not checks:
        feedback = ["No executable checks were available; no score was assigned."]
    if passed:
        feedback = ["All public checks passed."]
    record_attempt(request.user_id, passed, feedback)
    connection = db()
    connection.execute(
        "INSERT INTO attempts VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), request.user_id, int(passed), json.dumps(feedback), utc_now()),
    )
    connection.commit()
    connection.close()
    return {
        "exercise_id": exercise.id,
        "version": exercise.version,
        "passed": passed,
        "score": score,
        "checks": checks,
        "feedback": feedback,
        "simulation": simulation,
    }


def execute_kernel(request: KernelExecuteRequest) -> dict[str, Any]:
    """Validate and simulate the supported circuit DSL without running Python."""
    source = request.source if request.source is not None else request.code
    source_errors = safe_python_check(source) if source else []
    circuit_errors = validate_circuit(request.circuit) if request.circuit else []
    errors = [*source_errors, *circuit_errors]
    simulation = simulate(request.circuit) if request.circuit and not errors else None

    check_errors = validate_check_config(request.expected) if request.expected else []
    malformed_checks = [
        error for error in check_errors
        if error != "at least one expected check is required."
    ]
    if malformed_checks:
        raise HTTPException(status_code=422, detail=malformed_checks)
    checks = (
        evaluate_checks(request.circuit, simulation, request.expected)
        if request.circuit and simulation and simulation.get("probabilities") is not None and not errors
        else []
    )
    return {
        "executed": bool(
            request.circuit
            and not errors
            and simulation
            and simulation.get("probabilities") is not None
        ),
        "validated_errors": errors,
        "source_checked": source is not None,
        "simulation": simulation,
        "checks": checks,
        "passed": bool(checks) and all(check["passed"] for check in checks),
    }


def dependency_status() -> dict[str, str]:
    status = {"database": "unavailable", "simulator": "unavailable", "rag": "available"}
    connection = None
    try:
        connection = db()
        connection.execute("SELECT 1").fetchone()
        status["database"] = "available"
    except (OSError, sqlite3.Error):
        pass
    finally:
        if connection is not None:
            connection.close()
    try:
        import qiskit_aer  # noqa: F401

        status["simulator"] = "available"
    except Exception:
        pass
    return status


@app.get("/health")
def health() -> dict[str, Any]:
    dependencies = dependency_status()
    return {
        "status": "ok",
        "llm": OLLAMA_MODEL,
        "qiskit": dependencies["simulator"],
        "rag": "local",
        "dependencies": dependencies,
        "llm_status": "configured" if OLLAMA_URL and OLLAMA_MODEL else "not_configured",
    }


@app.post("/auth/register")
def register(request: RegistrationRequest) -> dict[str, Any]:
    return register_user(request)


@app.post("/auth/login")
def login(request: LoginRequest) -> dict[str, Any]:
    return login_user(request)


@app.get("/auth/me")
def me(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user_id = token_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="A valid access token is required.")
    return profile(user_id)


@app.get("/health/ready")
@app.get("/ready")
def readiness() -> dict[str, Any]:
    dependencies = dependency_status()
    blocking = {
        name: value for name, value in dependencies.items()
        if name in {"database", "simulator"} and value != "available"
    }
    if blocking:
        raise HTTPException(
            status_code=503,
            detail={"status": "not_ready", "dependencies": dependencies},
        )
    return {"status": "ready", "dependencies": dependencies}


@app.get("/knowledge/search")
def search_knowledge(query: str, limit: int = 3) -> list[dict[str, Any]]:
    if not query.strip():
        raise HTTPException(status_code=400, detail="query must not be empty.")
    if limit < 1 or limit > 5:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 5.")
    return [chunk.__dict__ for chunk in retrieve(query, limit)]


@app.get("/exercises")
def list_exercises() -> list[dict[str, Any]]:
    return [
        exercise.model_dump(exclude={"starter_circuit", "checks"})
        for exercise in EXERCISES.values()
    ]


@app.get("/exercises/{exercise_id}")
def get_exercise(exercise_id: str) -> Exercise:
    exercise = EXERCISES.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found.")
    return exercise


@app.post("/exercises/{exercise_id}/submit")
def submit(
    exercise_id: str,
    request: ExerciseSubmission,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    exercise = EXERCISES.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found.")
    authenticated_user(request.user_id, authorization)
    return submit_exercise(exercise, request)


@app.post("/api/challenges/submit")
def submit_challenge(
    request: ChallengeSubmission,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    exercise = EXERCISES.get(request.exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found.")
    authenticated_user(request.user_id, authorization)
    return submit_exercise(
        exercise,
        ExerciseSubmission(
            user_id=request.user_id,
            circuit=request.circuit,
            source=request.source,
        ),
    )


@app.get("/users/{user_id}")
def get_user(user_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticated_user(user_id, authorization)
    return profile(user_id)


@app.put("/users/{user_id}/preferences")
def put_preferences(user_id: str, request: UserProfile, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if request.user_id != user_id:
        raise HTTPException(status_code=400, detail="user_id in the path and body must match.")
    authenticated_user(user_id, authorization)
    return update_profile(user_id, request.preferences)


@app.get("/users/{user_id}/attempts")
def get_attempts(user_id: str, authorization: str | None = Header(default=None)) -> list[dict[str, Any]]:
    authenticated_user(user_id, authorization)
    connection = db()
    rows = connection.execute(
        "SELECT id, passed, feedback, created_at FROM attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
        (user_id,),
    ).fetchall()
    connection.close()
    return [
        {"id": row["id"], "passed": bool(row["passed"]), "feedback": json.loads(row["feedback"]), "created_at": row["created_at"]}
        for row in rows
    ]


@app.get("/users/{user_id}/circuits")
def get_circuits(user_id: str, authorization: str | None = Header(default=None)) -> list[dict[str, Any]]:
    authenticated_user(user_id, authorization)
    connection = db()
    rows = connection.execute(
        "SELECT id, name, circuit, created_at, updated_at FROM circuits WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100",
        (user_id,),
    ).fetchall()
    connection.close()
    return [
        {"id": row["id"], "name": row["name"], "circuit": json.loads(row["circuit"]),
         "created_at": row["created_at"], "updated_at": row["updated_at"]}
        for row in rows
    ]


@app.post("/users/{user_id}/circuits")
def save_circuit(
    user_id: str,
    request: SavedCircuitRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if request.user_id != user_id:
        raise HTTPException(status_code=400, detail="user_id in the path and body must match.")
    authenticated_user(user_id, authorization)
    errors = validate_circuit(request.circuit)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    circuit_id = str(uuid.uuid4())
    now = utc_now()
    connection = db()
    connection.execute(
        "INSERT INTO circuits VALUES (?, ?, ?, ?, ?, ?)",
        (circuit_id, user_id, request.name, request.circuit.model_dump_json(), now, now),
    )
    connection.commit()
    connection.close()
    return {"id": circuit_id, "name": request.name, "circuit": request.circuit.model_dump(), "created_at": now, "updated_at": now}


@app.get("/users/{user_id}/tutor-history")
def get_tutor_history(user_id: str, authorization: str | None = Header(default=None)) -> list[dict[str, Any]]:
    authenticated_user(user_id, authorization)
    connection = db()
    connection.execute(
        """CREATE TABLE IF NOT EXISTS tutor_history (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, message TEXT NOT NULL,
            response TEXT NOT NULL, created_at TEXT NOT NULL
        )"""
    )
    rows = connection.execute(
        "SELECT id, message, response, created_at FROM tutor_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
        (user_id,),
    ).fetchall()
    connection.close()
    return [
        {"id": row["id"], "message": row["message"], "response": json.loads(row["response"]), "created_at": row["created_at"]}
        for row in rows
    ]


@app.post("/tutor")
def tutor(request: TutorRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticated_user(request.user_id, authorization)
    learner = profile(request.user_id)
    errors = validate_circuit(request.circuit) if request.circuit else []
    simulation = simulate(request.circuit) if request.circuit and not errors else None
    sources = retrieve(f"{request.message} {' '.join(errors)}")
    fallback = fallback_tutor(errors, simulation, sources, has_circuit=request.circuit is not None)
    answer = call_granite(tutor_context(request, learner, errors, simulation, sources), fallback)
    record_tutor_interaction(request.user_id, request.message, answer)
    return {
        "answer": answer.model_dump(),
        "validated_errors": errors,
        "simulation": simulation,
        "retrieved_sources": [chunk.title for chunk in sources],
        "learner_profile": learner,
    }


@app.post("/api/ai/chat")
def ai_chat(request: AIChatRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """Global AI entry point, grounded by the same validated tutor pipeline."""
    circuit_payload = request.context.get("circuit")
    circuit = Circuit.model_validate(circuit_payload) if circuit_payload else None
    response = tutor(
        TutorRequest(user_id=request.user_id, message=request.message, circuit=circuit),
        authorization,
    )
    return {"message": response["answer"], "context": response["learner_profile"]}


@app.post("/evaluate")
def evaluate(request: EvaluateRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticated_user(request.user_id, authorization)
    errors = validate_circuit(request.circuit)
    if request.source:
        errors.extend(safe_python_check(request.source))
    check_errors = validate_check_config(request.expected)
    malformed_check_errors = [
        error for error in check_errors
        if error != "at least one expected check is required."
    ]
    if malformed_check_errors:
        raise HTTPException(status_code=422, detail=malformed_check_errors)
    simulation = simulate(request.circuit) if not errors else None
    checks = (
        evaluate_checks(request.circuit, simulation, request.expected)
        if simulation and simulation.get("probabilities") is not None and not check_errors
        else []
    )
    passed = (
        not errors
        and not check_errors
        and bool(checks)
        and all(check["passed"] for check in checks)
    )
    feedback = errors or [check["message"] for check in checks if not check["passed"]]
    if not errors and check_errors:
        feedback = check_errors
    elif not errors and simulation and simulation.get("probabilities") is None:
        feedback = [simulation.get("message", "Simulation unavailable; no score was assigned.")]
    if not feedback:
        feedback = ["All supplied checks passed."]
    record_attempt(request.user_id, passed, feedback)
    connection = db()
    connection.execute("INSERT INTO attempts VALUES (?, ?, ?, ?, ?)", (str(uuid.uuid4()), request.user_id, int(passed), json.dumps(feedback), utc_now()))
    connection.commit()
    connection.close()
    return {"passed": passed, "score": 100 if passed else 0, "checks": checks, "feedback": feedback, "simulation": simulation}


@app.post("/simulate")
@app.post("/api/quantum/simulate")
def run_simulation(circuit: Circuit) -> dict[str, Any]:
    errors = validate_circuit(circuit)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    result = simulate(circuit)
    if result.get("probabilities") is None:
        raise HTTPException(status_code=503, detail=result.get("message", "Simulator unavailable."))
    return result


@app.post("/api/kernel/execute")
def kernel_execute(request: KernelExecuteRequest) -> dict[str, Any]:
    return execute_kernel(request)


@app.post("/integrations/composer")
def composer(circuit: Circuit) -> dict[str, Any]:
    errors = validate_circuit(circuit)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    return {"qasm": qasm(circuit), "format": "openqasm-3.0", "composer": "Paste the QASM into IBM Quantum Composer to continue editing live."}


@app.post("/integrations/transpile")
def transpile_circuit(circuit: Circuit) -> dict[str, Any]:
    errors = validate_circuit(circuit)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    try:
        from qiskit import transpile as qiskit_transpile
        from qiskit.qasm2 import dumps
        qc = build_quantum_circuit(circuit, include_measurements=True)
        transpiled = qiskit_transpile(qc, basis_gates=["u", "cx"], optimization_level=1)
        transpiled_qasm = dumps(transpiled)
        return {
            "qiskit_code": (
                "from qiskit import QuantumCircuit, transpile\n\n"
                f"qc = QuantumCircuit.from_qasm_str({transpiled_qasm!r})\n"
                "optimized = transpile(qc, basis_gates=['u', 'cx'], optimization_level=1)\n"
                "optimized.draw('text')"
            ),
            "qasm": transpiled_qasm,
            "original_gate_count": len(circuit.gates),
            "transpiled_gate_count": len(transpiled.data),
            "basis_gates": ["u", "cx"],
        }
    except (ImportError, KeyError, RuntimeError, ValueError) as error:
        raise HTTPException(status_code=503, detail=f"Transpilation unavailable: {error}") from error


@app.post("/integrations/jupyter")
def jupyter(request: NotebookRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    authenticated_user(request.user_id, authorization)
    errors = validate_circuit(request.circuit)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    code = f"""from qiskit import QuantumCircuit\nfrom qiskit_aer import AerSimulator\n\nqc = QuantumCircuit.from_qasm_str({qasm(request.circuit)!r})\nqc.draw('mpl')\nresult = AerSimulator().run(qc, shots=1024).result()\nresult.get_counts()\n"""
    return {"metadata": {"title": request.title, "source": "quantum-learning-platform"}, "nbformat": 4, "nbformat_minor": 5, "cells": [{"cell_type": "markdown", "metadata": {}, "source": [f"# {request.title}\\n"]}, {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": code.splitlines(True)}]}
