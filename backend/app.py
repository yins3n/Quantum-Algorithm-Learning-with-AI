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
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.getenv("QUANTUM_DB", ROOT / "data" / "platform.db"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "granite3.2:8b")
SUPPORTED_GATES = {"h", "x", "y", "z", "cx", "measure"}


class Gate(BaseModel):
    name: str
    qubits: list[int] = Field(min_length=1, max_length=2)


class Circuit(BaseModel):
    num_qubits: int = Field(ge=1, le=20)
    gates: list[Gate] = Field(default_factory=list, max_length=200)


class UserProfile(BaseModel):
    user_id: str
    preferences: dict[str, Any] = Field(default_factory=dict)


class TutorRequest(BaseModel):
    user_id: str
    message: str = Field(min_length=1, max_length=6000)
    circuit: Circuit | None = None


class EvaluateRequest(BaseModel):
    user_id: str
    circuit: Circuit
    expected: dict[str, Any] = Field(default_factory=dict)
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
        expected_qubits = 2 if name == "cx" else 1
        if len(gate.qubits) != expected_qubits:
            errors.append(f"Gate {index + 1}: {name.upper()} needs {expected_qubits} qubit(s).")
        if any(q < 0 or q >= circuit.num_qubits for q in gate.qubits):
            errors.append(f"Gate {index + 1}: qubit indices must be between 0 and {circuit.num_qubits - 1}.")
        if name == "cx" and len(gate.qubits) == 2 and gate.qubits[0] == gate.qubits[1]:
            errors.append(f"Gate {index + 1}: a CNOT control and target must differ.")
    return errors


def simulate(circuit: Circuit) -> dict[str, Any]:
    """Use Qiskit when available; otherwise provide a deterministic small-circuit fallback."""
    try:
        from qiskit import QuantumCircuit
        from qiskit_aer import AerSimulator

        qc = QuantumCircuit(circuit.num_qubits, circuit.num_qubits)
        for gate in circuit.gates:
            name = gate.name.lower()
            if name == "measure":
                qc.measure(gate.qubits[0], gate.qubits[0])
            elif name == "cx":
                qc.cx(*gate.qubits)
            else:
                getattr(qc, name)(gate.qubits[0])
        qc.save_statevector()
        result = AerSimulator().run(qc).result()
        state = result.get_statevector().data
        probabilities = {format(i, f"0{circuit.num_qubits}b"): round(abs(value) ** 2, 8) for i, value in enumerate(state)}
        return {"engine": "qiskit-aer", "probabilities": probabilities}
    except ImportError:
        # Keeps the API usable before optional Qiskit dependencies are installed.
        return {"engine": "validation-only", "probabilities": None, "message": "Install qiskit and qiskit-aer for live simulation."}


def call_granite(prompt: str) -> str:
    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": "You are a patient quantum-computing tutor. Explain errors clearly, ask guiding questions, and adapt to the learner profile. Never invent simulator results."},
            {"role": "user", "content": prompt},
        ],
        "options": {"temperature": 0.2},
    }).encode()
    request = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read())["message"]["content"]
    except (urllib.error.URLError, TimeoutError) as error:
        raise HTTPException(status_code=503, detail=f"Granite is unavailable at {OLLAMA_URL}. Start Ollama and load {OLLAMA_MODEL}.") from error


def qasm(circuit: Circuit) -> str:
    lines = ["OPENQASM 2.0;", 'include "qelib1.inc";', f"qreg q[{circuit.num_qubits}];", f"creg c[{circuit.num_qubits}];"]
    for gate in circuit.gates:
        name = gate.name.lower()
        if name == "measure":
            lines.append(f"measure q[{gate.qubits[0]}] -> c[{gate.qubits[0]}];")
        elif name == "cx":
            lines.append(f"cx q[{gate.qubits[0]}],q[{gate.qubits[1]}];")
        else:
            lines.append(f"{name} q[{gate.qubits[0]}];")
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


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "llm": OLLAMA_MODEL, "qiskit": "optional"}


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
    prompt = json.dumps({"learner_profile": learner, "question": request.message, "circuit": request.circuit.model_dump() if request.circuit else None, "validated_errors": errors}, indent=2)
    return {"answer": call_granite(prompt), "validated_errors": errors, "learner_profile": learner}


@app.post("/evaluate")
def evaluate(request: EvaluateRequest) -> dict[str, Any]:
    errors = validate_circuit(request.circuit)
    if request.source:
        errors.extend(safe_python_check(request.source))
    simulation = simulate(request.circuit) if not errors else None
    passed = not errors
    feedback = errors or ["Circuit structure is valid. Run it in the simulator and compare the result with the exercise expectation."]
    record_attempt(request.user_id, passed, feedback)
    connection = db()
    connection.execute("INSERT INTO attempts VALUES (?, ?, ?, ?, ?)", (str(uuid.uuid4()), request.user_id, int(passed), json.dumps(feedback), utc_now()))
    connection.commit()
    connection.close()
    return {"passed": passed, "feedback": feedback, "simulation": simulation}


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
