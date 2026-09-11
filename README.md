# Quantum-Algorithm-Learning-with-AI

AI Integrated Quantum Algorithm Learning Platform.

## Website Features

This repository now includes a full-stack starter website that integrates:

- **Qiskit Composer (Terra)**: Circuit template loading and QASM editing UI.
- **Qiskit Simulator (Aer)**: Simulation API (`/api/simulator/run`) with Qiskit Aer execution when available and a safe fallback response otherwise.
- **Qiskit Evaluator**: Code-and-test style evaluator API (`/api/evaluator/*`) for sample test validation.
- **Jupyter Notebook Integration**: Notebook catalog API and in-page iframe integration.
- **AI Help (Granite 3.2 8B Instruct)**: Quantum query helper endpoint (`/api/ai-help`) surfaced in the website UI.

Built with **FastAPI + JavaScript**.

## Run locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open: `http://127.0.0.1:8000/`

## API Summary

- `GET /api/health`
- `GET /api/composer/templates`
- `POST /api/simulator/run`
- `GET /api/evaluator/problems`
- `POST /api/evaluator/submit`
- `GET /api/notebooks`
- `POST /api/ai-help`
