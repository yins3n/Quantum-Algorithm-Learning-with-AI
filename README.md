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
This prototype uses an explicit development access boundary: user-specific
endpoints allow only IDs listed in `DEV_USER_IDS` (default `demo-user`). This
is not authentication and must not be exposed publicly; production requires a
real authentication and authorization integration.

## Website integration contract

| Endpoint | Purpose |
| --- | --- |
| `POST /tutor` | Adaptive Granite tutor and circuit debugging |
| `POST /api/ai/chat` | Global AI chat grounded by the validated tutor pipeline |
| `GET /knowledge/search` | Search the trusted local quantum knowledge base |
| `GET /users/{id}` | Learner preferences, skill state, and recent errors |
| `PUT /users/{id}/preferences` | Persist learning preferences |
| `GET /health/ready` | Check database and simulator readiness (503 when unavailable) |
| `GET /exercises` | List available CodeChef-style exercises |
| `GET /exercises/{id}` | Load an exercise definition and its public checks |
| `POST /exercises/{id}/submit` | Evaluate a learner circuit, score it, and record the attempt |

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

Supported gates include single-qubit gates (`h`, `x`, `y`, `z`, `i`, `s`,
`sdg`, `t`, `tdg`, `sx`, `sxdg`, `rx`, `ry`, `rz`, `u`, `u1`, `u2`, `u3`,
`r`, `reset`, `barrier`), two-qubit gates (`cx`, `cy`, `cz`, `swap`, `ch`,
`cp`, `crx`, `cry`, `crz`, `ecr`, `csx`), three-qubit gates (`ccx`,
`cswap`), and `measure`. Parametric gates use a `params` array in radians;
`rx`, `ry`, and `rz` take one value, `u`/`u3` take three, `u2` takes two,
`u1` takes one, `r` takes two, and `cp`, `crx`, `cry`, and `crz` take one.
Explicit measurements are supported only as terminal operations and map qubit
`i` to classical bit `i`. Circuits without explicit measurements are
measured automatically at the end; non-terminal or duplicate measurements
are rejected.

The evaluator validates the circuit before simulation. It never treats an LLM
response as mathematical truth. Qiskit Aer remains the source of simulator
results, while Granite explains the validated result and helps the learner.
The current evaluator establishes the CodeChef-style execution contract; a
curriculum can add exercise-specific checks without changing the frontend
integration. Exercise pass/fail is determined by circuit validation and
Qiskit Aer results; Granite is not used as an evaluator.
If Aer is unavailable, no simulator result or passing score is fabricated.

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

The registration portal creates an account through `POST /auth/register` and
stores a signed bearer token locally. Login is available through
`POST /auth/login`; user-owned profiles, attempts, tutor history, and notebook
exports require a matching token. Development mode can still use the
`DEV_USER_IDS` compatibility boundary, but it must not be exposed publicly.

The frontend provides evaluator-backed progress at `/progress` and routes AI
questions through `POST /api/ai/chat`. These features require the API URL
configured in `VITE_QUANTUM_ENGINE_URL`.

## Production operations

Set `AUTH_REQUIRED=true`, `USER_ACCESS_MODE=production`, and a random
`JWT_SECRET` of at least 32 characters before public deployment. The API emits
structured request logs and applies an in-memory rate limit for a single
prototype instance; use a shared gateway or Redis-backed limiter when scaling
horizontally.

Run `docker compose up --build` for the API, React frontend, Ollama, and
persistent volumes. Use `scripts/backup_db.sh` for SQLite backups. SQLite is
appropriate for a single-instance pilot; use PostgreSQL plus a migration runner
for multi-instance production. Pull requests run backend tests/compilation and
frontend tests/lint/build through `.github/workflows/ci.yml`.
