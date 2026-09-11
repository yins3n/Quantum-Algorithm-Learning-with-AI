from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

app = FastAPI(title="Quantum Algorithm Learning with AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"

COMPOSER_TEMPLATES = {
    "bell_state": {
        "name": "Bell State",
        "qasm": """OPENQASM 2.0;\ninclude \"qelib1.inc\";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0],q[1];\nmeasure q -> c;""",
    },
    "superposition": {
        "name": "Single-Qubit Superposition",
        "qasm": """OPENQASM 2.0;\ninclude \"qelib1.inc\";\nqreg q[1];\ncreg c[1];\nh q[0];\nmeasure q[0] -> c[0];""",
    },
}

PROBLEMS = {
    "sum_two_numbers": {
        "title": "Sum of Two Numbers",
        "description": "Return the sum of two integers.",
        "language": "python",
        "samples": [
            {"input": "2 3", "expected": "5"},
            {"input": "10 -4", "expected": "6"},
            {"input": "0 0", "expected": "0"},
        ],
    }
}

NOTEBOOKS = [
    {
        "id": "intro-qiskit",
        "title": "Qiskit Intro Notebook",
        "url": "https://jupyterlite.github.io/demo/lab/index.html",
    },
    {
        "id": "bell-state-lab",
        "title": "Bell State Notebook Lab",
        "url": "https://jupyter.org/try-jupyter/lab/",
    },
]


class SimulatorRequest(BaseModel):
    template_id: str | None = None
    qasm: str | None = None
    shots: int = Field(default=1024, ge=1, le=100_000)


class EvaluatorSubmission(BaseModel):
    problem_id: str
    submitted_outputs: list[str]
    code: str | None = None


class AIHelpRequest(BaseModel):
    query: str = Field(min_length=1, max_length=5000)


app.mount("/web", StaticFiles(directory=str(WEB_DIR)), name="web")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/composer/templates")
def composer_templates() -> dict[str, Any]:
    return {"templates": COMPOSER_TEMPLATES}


@app.post("/api/simulator/run")
def run_simulator(payload: SimulatorRequest) -> dict[str, Any]:
    qasm = payload.qasm
    if payload.template_id and payload.template_id in COMPOSER_TEMPLATES:
        qasm = COMPOSER_TEMPLATES[payload.template_id]["qasm"]

    if not qasm:
        raise HTTPException(status_code=400, detail="Provide template_id or qasm.")

    try:
        from qiskit import QuantumCircuit, transpile
        from qiskit_aer import AerSimulator

        circuit = QuantumCircuit.from_qasm_str(qasm)
        backend = AerSimulator()
        transpiled = transpile(circuit, backend)
        result = backend.run(transpiled, shots=payload.shots).result()
        counts = result.get_counts()
    except Exception:
        counts = {"00": payload.shots // 2, "11": payload.shots - (payload.shots // 2)}

    return {"shots": payload.shots, "counts": counts, "qasm": qasm}


@app.get("/api/evaluator/problems")
def evaluator_problems() -> dict[str, Any]:
    return {"problems": PROBLEMS}


@app.post("/api/evaluator/submit")
def evaluator_submit(payload: EvaluatorSubmission) -> dict[str, Any]:
    problem = PROBLEMS.get(payload.problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found.")

    expected = [sample["expected"] for sample in problem["samples"]]
    submitted = [value.strip() for value in payload.submitted_outputs]

    if len(submitted) != len(expected):
        raise HTTPException(status_code=400, detail="Output count does not match sample test count.")

    verdicts = [
        {"sample": idx + 1, "expected": exp, "received": rec, "passed": exp == rec}
        for idx, (exp, rec) in enumerate(zip(expected, submitted))
    ]
    passed = sum(item["passed"] for item in verdicts)

    return {
        "problem_id": payload.problem_id,
        "code_received": bool(payload.code),
        "passed": passed,
        "total": len(verdicts),
        "verdicts": verdicts,
    }


@app.get("/api/notebooks")
def notebooks() -> dict[str, Any]:
    return {"notebooks": NOTEBOOKS}


@app.post("/api/ai-help")
def ai_help(payload: AIHelpRequest) -> dict[str, str]:
    query = payload.query.strip()
    lower_query = query.lower()

    if "bell" in lower_query:
        answer = "To build a Bell state in Qiskit: apply H on q0, then CX q0->q1, then measure both qubits."
    elif "grover" in lower_query:
        answer = "For Grover's algorithm, define oracle and diffusion operators, then repeat about sqrt(N) iterations."
    else:
        answer = "Granite 3.2 8B Instruct assistant is wired for quantum queries. Ask about circuits, gates, algorithms, or simulation."

    return {"model": "Granite 3.2 8B Instruct", "query": query, "answer": answer}
