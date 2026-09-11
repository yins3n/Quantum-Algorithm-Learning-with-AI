# Requirements Before Launch

This checklist defines the work required before exposing the Quantum Algorithm
Learning Platform to real users. The current repository is an integration-ready
prototype; these items should be completed by the team before production launch.

## 1. Security and privacy

- [ ] Add authentication and authorization for every user, circuit, attempt, and notebook.
- [ ] Ensure users can access only their own learner profile and saved work.
- [ ] Replace wildcard CORS with the exact production frontend origins.
- [ ] Deploy the API and frontend behind HTTPS.
- [ ] Store secrets in a deployment secret manager; never commit API keys or tokens.
- [ ] Add rate limits and request-size limits for tutor, evaluation, notebook, and export endpoints.
- [ ] Add abuse protection for prompt flooding and denial-of-service requests.
- [ ] Define what learner data is collected, why it is collected, and how long it is retained.
- [ ] Provide account deletion and learner-data export workflows.
- [ ] Log access to personal data without logging prompts or code containing sensitive information.

## 2. AI tutor and Granite service

- [ ] Pin and verify the supported Granite 3.2 8B Instruct model version.
- [ ] Deploy Ollama or the selected inference service with health checks, timeouts, and restart policies.
- [ ] Define fallback behavior when Granite is unavailable; do not return fabricated tutor responses.
- [ ] Use structured tutor responses for explanations, hints, error categories, and suggested next steps.
- [ ] Keep simulator output authoritative; Granite must not invent statevectors, probabilities, or execution results.
- [ ] Add prompt-injection tests and ensure user content cannot override system safety rules.
- [ ] Add evaluation sets for technical accuracy, pedagogical quality, tone, and adaptation to preferences.
- [ ] Review and approve the system prompt and supported tutoring boundaries.

## 3. Code evaluation and quantum execution

- [ ] Define the exercise schema: problem statement, input format, expected result, constraints, hints, and tests.
- [ ] Implement exercise-specific assertions in addition to basic circuit validation.
- [ ] Decide whether submissions use the circuit JSON DSL, Qiskit code, or both.
- [ ] If arbitrary code execution is enabled, run it in isolated containers or microVMs with:
  - [ ] No host filesystem access
  - [ ] No network access by default
  - [ ] CPU, memory, process, and execution-time limits
  - [ ] Restricted imports and system calls
  - [ ] Automatic cleanup after every submission
- [ ] Add deterministic test cases for supported gates, malformed circuits, large circuits, and invalid qubit indices.
- [ ] Pin compatible Python, Qiskit, and Qiskit Aer versions.
- [ ] Define maximum qubits, gates, shots, and simulator runtime per request.
- [ ] Return stable error codes and feedback formats that the frontend can render.

## 4. Learner progress and curriculum

- [ ] Move learner profiles and attempts from SQLite to a managed production database.
- [ ] Add migrations, backups, restore procedures, and a data-retention policy.
- [ ] Track skills, completed exercises, retries, hints, misconceptions, and curriculum progress.
- [ ] Make preference updates explicit and explain how preferences affect tutor behavior.
- [ ] Add a curriculum and exercise versioning strategy so old attempts remain reproducible.
- [ ] Define instructor/admin roles and moderation workflows.

## 5. Frontend and integration contract

- [ ] Publish an OpenAPI contract and version the API (`/api/v1` or equivalent).
- [ ] Generate or maintain typed frontend client models from the API schema.
- [ ] Define the canonical circuit JSON format, gate names, qubit ordering, and measurement conventions.
- [ ] Add loading, timeout, retry, validation-error, and service-unavailable states to the UI.
- [ ] Add a circuit editor that can import/export the canonical circuit format.
- [ ] Integrate live simulator results, probability charts, statevector views, and error explanations.
- [ ] Define how Qiskit Composer links or QASM exports are presented to users.
- [ ] Define notebook download, storage, and execution behavior for the Jupyter integration.
- [ ] Add WebSocket or server-sent event contracts only if live streaming is required.

## 6. Deployment and operations

- [ ] Provide production Docker images or an equivalent repeatable deployment.
- [ ] Separate development, staging, and production environments.
- [ ] Add CI checks for formatting, type checking, tests, dependency vulnerabilities, and container scanning.
- [ ] Add readiness and liveness checks for the API, database, Ollama, and quantum simulator.
- [ ] Add structured logs with request IDs and correlation IDs.
- [ ] Add metrics for latency, error rate, token usage, simulator runtime, queue depth, and evaluation outcomes.
- [ ] Configure alerting and an on-call owner for API, AI, database, and simulator failures.
- [ ] Document backup, rollback, incident response, and disaster-recovery procedures.
- [ ] Load-test tutor and evaluation endpoints using the expected concurrent learner count.
- [ ] Set cost and resource budgets for model inference and simulation.

## 7. Quality and launch acceptance

- [ ] Add unit tests for validation, profile persistence, QASM export, notebook export, and error handling.
- [ ] Add API integration tests with mocked Granite and simulator services.
- [ ] Add end-to-end tests covering sign-in, circuit creation, evaluation, tutoring, and progress updates.
- [ ] Verify accessibility, keyboard navigation, responsive layouts, and usable error messages.
- [ ] Run a security review and resolve all critical and high-severity findings.
- [ ] Conduct a pilot with representative learners and instructors.
- [ ] Define launch metrics: completion rate, evaluation accuracy, tutor helpfulness, latency, and availability.
- [ ] Obtain final product, privacy, security, and infrastructure sign-off.

## Suggested launch gates

The platform should not launch publicly until authentication, authorization,
HTTPS, production data storage, isolated code execution (if arbitrary code is
supported), simulator correctness tests, Granite failure handling, monitoring,
backups, and a pilot review are complete.
