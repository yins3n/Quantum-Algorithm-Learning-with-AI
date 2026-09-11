from __future__ import annotations

import ast
import json
import os
import sqlite3
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from backend.rag import KnowledgeChunk, retrieve

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv("QUANTUM_DB", ROOT / "data" / "platform.db"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "granite3.2:8b")
SUPPORTED_GATES = {
    "h", "x", "y", "z", "s", "sdg", "t", "tdg",
    "rx", "ry", "rz", "u", "cx", "cy", "cz", "swap",
    "ch", "ccx", "measure",
}
ONE_QUBIT_GATES = {"h", "x", "y", "z", "s", "sdg", "t", "tdg", "rx", "ry", "rz", "u", "measure"}
TWO_QUBIT_GATES = {"cx", "cy", "cz", "swap", "ch"}
PARAMETRIC_GATES = {"rx", "ry", "rz", "u"}


class Gate(BaseModel):
    name: str
    qubits: list[int] = Field(min_length=1, max_length=3)
    params: list[float] = Field(default_factory=list, max_length=3)


class Circuit(BaseModel):
    num_qubits: int = Field(ge=1, le=20)
    gates: list[Gate] = Field(default_factory=list, max_length=200)
    shots: int = Field(default=1024, ge=1, le=100_000)


class UserProfile(BaseModel):
    user_id: str
    preferences: dict[str, Any] = Field(default_factory=dict)


class TutorRequest(BaseModel):
    user_id: str
    message: str = Field(min_length=1, max_length=6000)
    circuit: Circuit | None = None


class TutorResponse(BaseModel):
    explanation: str
    error_category: str
    hint: str
    suggested_fix: dict[str, Any] | None = None
    next_step: str
    teaching_steps: list[str] = Field(default_factory=list, max_length=4)
    sources: list[str] = Field(default_factory=list, max_length=3)


class EvaluateRequest(BaseModel):
    user_id: str
    circuit: Circuit
    expected: dict[str, Any] = Field(default_factory=dict)
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
    user_id: str
    circuit: Circuit
    source: str | None = Field(default=None, max_length=20000)


class NotebookRequest(BaseModel):
    circuit: Circuit
    title: str = "Quantum learning exercise"


app = FastAPI(title="Quantum Learning Platform", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            preferences TEXT NOT NULL DEFAULT '{}',
            skills TEXT NOT NULL DEFAULT '{}',
            recent_errors TEXT NOT NULL DEFAULT '[]',
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
        """
    )
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


def profile(user_id: str) -> dict[str, Any]:
    row = ensure_user(user_id)
    return {
        "user_id": row["user_id"],
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


def validate_circuit(circuit: Circuit) -> list[str]:
    errors: list[str] = []
    for index, gate in enumerate(circuit.gates):
        name = gate.name.lower()
        if name not in SUPPORTED_GATES:
            errors.append(f"Gate {index + 1}: '{gate.name}' is not supported.")
        expected_qubits = 3 if name == "ccx" else 2 if name in TWO_QUBIT_GATES else 1
        if len(gate.qubits) != expected_qubits:
            errors.append(f"Gate {index + 1}: {name.upper()} needs {expected_qubits} qubit(s).")
        expected_params = 3 if name == "u" else 1 if name in {"rx", "ry", "rz"} else 0
        if len(gate.params) != expected_params:
            errors.append(f"Gate {index + 1}: {name.upper()} needs {expected_params} parameter(s).")
        if any(q < 0 or q >= circuit.num_qubits for q in gate.qubits):
            errors.append(f"Gate {index + 1}: qubit indices must be between 0 and {circuit.num_qubits - 1}.")
        if len(gate.qubits) > 1 and len(set(gate.qubits)) != len(gate.qubits):
            errors.append(f"Gate {index + 1}: a multi-qubit gate cannot target the same qubit twice.")
    return errors


def simulate(circuit: Circuit) -> dict[str, Any]:
    """Run the validated circuit with Qiskit Aer and return simulator data."""
    try:
        from qiskit import QuantumCircuit
        from qiskit_aer import AerSimulator

        qc = QuantumCircuit(circuit.num_qubits, circuit.num_qubits)
        for gate in circuit.gates:
            name = gate.name.lower()
            if name == "measure":
                continue
            if name == "ccx":
                qc.ccx(*gate.qubits)
            elif name in TWO_QUBIT_GATES:
                getattr(qc, name)(*gate.qubits)
            elif name in PARAMETRIC_GATES:
                getattr(qc, name)(*gate.params, gate.qubits[0])
            else:
                getattr(qc, name)(gate.qubits[0])
        statevector_circuit = qc.copy()
        statevector_circuit.save_statevector()
        state_result = AerSimulator().run(statevector_circuit).result()
        state = state_result.get_statevector().data
        probabilities = {format(i, f"0{circuit.num_qubits}b"): round(float(abs(value) ** 2), 8) for i, value in enumerate(state)}
        measurement_circuit = qc.copy()
        measurement_circuit.measure_all()
        counts = AerSimulator().run(measurement_circuit, shots=circuit.shots).result().get_counts()
        return {
            "engine": "qiskit-aer",
            "shots": circuit.shots,
            "counts": counts,
            "probabilities": probabilities,
        }
    except ImportError:
        return {"engine": "unavailable", "probabilities": None, "message": "Install qiskit and qiskit-aer to run Aer simulation."}


def fallback_tutor(errors: list[str], simulation: dict[str, Any] | None, sources: list[KnowledgeChunk]) -> TutorResponse:
    if errors:
        explanation = errors[0]
        category = "circuit_validation"
        hint = "Read the gate-level error, then correct one issue before submitting again."
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
        next_step="Make one small change and run the circuit again.",
        teaching_steps=["Validate the circuit.", "Use only simulator-confirmed results.", "Apply one correction and retry."],
        sources=[chunk.title for chunk in sources],
    )


def call_granite(prompt: str, fallback: TutorResponse) -> TutorResponse:
    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": "You are a patient quantum-computing tutor. Use only VERIFIED_ENGINE_FACTS and TRUSTED_KNOWLEDGE. Never invent simulator results, scores, gates, or citations. Return only valid JSON with keys explanation, error_category, hint, suggested_fix, next_step, teaching_steps, and sources. teaching_steps must be 1-4 concise, observable teaching actions; do not reveal private chain-of-thought. Avoid repeating previous_errors; advance the learner one step."},
            {"role": "user", "content": prompt},
        ],
        "format": "json",
        "options": {"temperature": 0.15, "top_p": 0.8, "repeat_penalty": 1.15, "repeat_last_n": 256},
    }).encode()
    request = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = json.loads(response.read())["message"]["content"]
            parsed = TutorResponse.model_validate_json(raw)
            return parsed
    except (urllib.error.URLError, TimeoutError) as error:
        return fallback
    except (json.JSONDecodeError, KeyError, ValueError):
        return fallback


def tutor_context(request: TutorRequest, learner: dict[str, Any], errors: list[str], simulation: dict[str, Any] | None, sources: list[KnowledgeChunk]) -> str:
    return json.dumps({
        "VERIFIED_ENGINE_FACTS": {
            "validation_errors": errors,
            "simulation": simulation,
            "evaluator_passed": not errors if simulation is not None else None,
        },
        "TRUSTED_KNOWLEDGE": [{"title": item.title, "text": item.text, "source": item.source} for item in sources],
        "learner_profile": learner,
        "question": request.message,
        "previous_errors": learner["recent_errors"][-3:],
        "circuit": request.circuit.model_dump() if request.circuit else None,
    }, indent=2)


def qasm(circuit: Circuit) -> str:
    lines = ["OPENQASM 2.0;", 'include "qelib1.inc";', f"qreg q[{circuit.num_qubits}];", f"creg c[{circuit.num_qubits}];"]
    for gate in circuit.gates:
        name = gate.name.lower()
        if name == "measure":
            lines.append(f"measure q[{gate.qubits[0]}] -> c[{gate.qubits[0]}];")
        elif name == "ccx":
            lines.append(f"ccx q[{gate.qubits[0]}],q[{gate.qubits[1]}],q[{gate.qubits[2]}];")
        elif name in TWO_QUBIT_GATES:
            lines.append(f"{name} q[{gate.qubits[0]}],q[{gate.qubits[1]}];")
        else:
            params = f"({','.join(map(str, gate.params))})" if gate.params else ""
            lines.append(f"{name}{params} q[{gate.qubits[0]}];")
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
    checks = evaluate_checks(request.circuit, simulation, exercise.checks) if simulation else []
    passed_checks = sum(1 for check in checks if check["passed"])
    total_checks = len(checks)
    passed = not errors and total_checks > 0 and passed_checks == total_checks
    score = round((passed_checks / total_checks) * 100) if total_checks else 0
    feedback = errors or [check["message"] for check in checks if not check["passed"]]
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


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "llm": OLLAMA_MODEL, "qiskit": "optional", "rag": "local"}


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
def submit(exercise_id: str, request: ExerciseSubmission) -> dict[str, Any]:
    exercise = EXERCISES.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found.")
    return submit_exercise(exercise, request)


@app.get("/users/{user_id}")
def get_user(user_id: str) -> dict[str, Any]:
    return profile(user_id)


@app.put("/users/{user_id}/preferences")
def put_preferences(user_id: str, request: UserProfile) -> dict[str, Any]:
    if request.user_id != user_id:
        raise HTTPException(status_code=400, detail="user_id in the path and body must match.")
    return update_profile(user_id, request.preferences)


@app.post("/tutor")
def tutor(request: TutorRequest) -> dict[str, Any]:
    learner = profile(request.user_id)
    errors = validate_circuit(request.circuit) if request.circuit else []
    simulation = simulate(request.circuit) if request.circuit and not errors else None
    sources = retrieve(f"{request.message} {' '.join(errors)}")
    fallback = fallback_tutor(errors, simulation, sources)
    answer = call_granite(tutor_context(request, learner, errors, simulation, sources), fallback)
    return {
        "answer": answer.model_dump(),
        "validated_errors": errors,
        "simulation": simulation,
        "retrieved_sources": [chunk.title for chunk in sources],
        "learner_profile": learner,
    }


@app.post("/evaluate")
def evaluate(request: EvaluateRequest) -> dict[str, Any]:
    errors = validate_circuit(request.circuit)
    if request.source:
        errors.extend(safe_python_check(request.source))
    simulation = simulate(request.circuit) if not errors else None
    checks = evaluate_checks(request.circuit, simulation, request.expected) if simulation and request.expected else []
    passed = not errors and all(check["passed"] for check in checks)
    feedback = errors or [check["message"] for check in checks if not check["passed"]]
    if not feedback:
        feedback = ["Circuit structure is valid."] if not request.expected else ["All supplied checks passed."]
    record_attempt(request.user_id, passed, feedback)
    connection = db()
    connection.execute("INSERT INTO attempts VALUES (?, ?, ?, ?, ?)", (str(uuid.uuid4()), request.user_id, int(passed), json.dumps(feedback), utc_now()))
    connection.commit()
    connection.close()
    return {"passed": passed, "score": 100 if passed else 0, "checks": checks, "feedback": feedback, "simulation": simulation}


@app.post("/simulate")
def run_simulation(circuit: Circuit) -> dict[str, Any]:
    errors = validate_circuit(circuit)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    return simulate(circuit)


@app.post("/integrations/composer")
def composer(circuit: Circuit) -> dict[str, Any]:
    errors = validate_circuit(circuit)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    return {"qasm": qasm(circuit), "format": "openqasm-2.0", "composer": "Paste the QASM into IBM Quantum Composer to continue editing live."}


@app.post("/integrations/jupyter")
def jupyter(request: NotebookRequest) -> dict[str, Any]:
    errors = validate_circuit(request.circuit)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    code = f"""from qiskit import QuantumCircuit\nfrom qiskit_aer import AerSimulator\n\nqc = QuantumCircuit.from_qasm_str({qasm(request.circuit)!r})\nqc.draw('mpl')\nresult = AerSimulator().run(qc, shots=1024).result()\nresult.get_counts()\n"""
    return {"metadata": {"title": request.title, "source": "quantum-learning-platform"}, "nbformat": 4, "nbformat_minor": 5, "cells": [{"cell_type": "markdown", "metadata": {}, "source": [f"# {request.title}\\n"]}, {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": code.splitlines(True)}]}
