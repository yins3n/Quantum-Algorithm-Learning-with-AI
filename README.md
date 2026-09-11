# Quantum Algorithm Learning with AI

This repository now contains a website-ready backend and a terminal shell for an
adaptive quantum-learning environment.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
ollama pull granite3.2:8b
uvicorn backend.app:app --reload
```

The API is available at `http://localhost:8000/docs`. In another terminal:

```bash
./quantum_shell.py
```

The backend uses **Granite 3.2 8B Instruct** through Ollama. Set `OLLAMA_URL`,
`OLLAMA_MODEL`, and `CORS_ORIGINS` using `.env.example` values when needed.

## Website integration contract

| Endpoint | Purpose |
| --- | --- |
| `POST /tutor` | Adaptive Granite tutor and circuit debugging |
| `GET /knowledge/search` | Search the trusted local quantum knowledge base |
| `GET /users/{id}` | Learner preferences, skill state, and recent errors |
| `PUT /users/{id}/preferences` | Persist learning preferences |
| `POST /evaluate` | Validate submitted code syntax/safety, validate the circuit, and run Qiskit Aer when installed |
| `POST /simulate` | Run a validated circuit with Qiskit Aer and return counts/probabilities |
| `GET /exercises` | List available CodeChef-style exercises |
| `GET /exercises/{id}` | Load an exercise definition and its public checks |
| `POST /exercises/{id}/submit` | Evaluate a learner circuit, score it, and record the attempt |
| `POST /integrations/composer` | Convert the circuit to OpenQASM for live Composer editing |
| `POST /integrations/jupyter` | Return a downloadable `.ipynb` notebook |

The shared circuit format is:

```json
{
  "num_qubits": 2,
  "gates": [
    {"name": "h", "qubits": [0]},
    {"name": "cx", "qubits": [0, 1]}
  ]
}
```

Supported gates include single-qubit gates (`h`, `x`, `y`, `z`, `s`, `sdg`,
`t`, `tdg`, `rx`, `ry`, `rz`, `u`), two-qubit gates (`cx`, `cy`, `cz`, `swap`,
`ch`), `ccx`, and `measure`. Parametric gates use a `params` array in radians;
`rx`, `ry`, and `rz` take one value and `u` takes three.

The evaluator validates the circuit before simulation. It never treats an LLM
response as mathematical truth. Qiskit Aer remains the source of simulator
results, while Granite explains the validated result and helps the learner.
The current evaluator establishes the CodeChef-style execution contract; a
curriculum can add exercise-specific checks without changing the frontend
integration. Exercise pass/fail is determined by circuit validation and
Qiskit Aer results; Granite is not used as an evaluator.

## Retrieval and reasoning

The tutor uses a dependency-free local retrieval layer in `backend/rag.py`.
It retrieves trusted quantum notes and platform rules, then sends them to
Granite alongside validated circuit errors and Aer results. This is RAG for
grounding, not a replacement for the simulator. Add reviewed knowledge chunks
there as the curriculum grows.

The tutor returns short `teaching_steps` that describe observable educational
steps. It does not expose hidden chain-of-thought. The engine performs
validation and simulation first, constrains Granite to JSON, validates the
response with Pydantic, applies low-temperature/repetition controls, and uses
a deterministic fallback if Ollama is unavailable or returns invalid JSON.

## Safety and persistence

Learner preferences and attempt feedback are stored in `data/platform.db`
(SQLite). AI-generated Python is not executed by the API. The supported gate
DSL is validated first, which provides a safe foundation for adding isolated
exercise runners later.
