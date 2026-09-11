import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import NotebookCard from "../components/NotebookCard";
import { getCurrentUserId } from "../services/user";

function ChallengeDetail() {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [circuit, setCircuit] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.exercise(exerciseId)
      .then((data) => {
        setExercise(data);
        setCircuit(JSON.stringify(data.starter_circuit, null, 2));
      })
      .catch((requestError) => setError(requestError.message));
  }, [exerciseId]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const parsed = JSON.parse(circuit);
      setResult(await api.submitExercise(exerciseId, { user_id: getCurrentUserId(), circuit: parsed }));
    } catch (submissionError) {
      setError(submissionError instanceof SyntaxError ? "Circuit JSON is invalid." : submissionError.message);
    }
  }

  if (error && !exercise) return <div className="page-content"><p role="alert">{error}</p></div>;
  if (!exercise) return <div className="page-content"><p>Loading challenge...</p></div>;

  return (
    <div className="page-content">
      <header className="page-hero">
        <p className="page-label">CHALLENGE / {exercise.difficulty.toUpperCase()}</p>
        <h1>{exercise.title}</h1>
        <p>{exercise.description}</p>
      </header>
      <NotebookCard label="CODE" title="Circuit definition" meta={`${exercise.num_qubits} qubits`}>
        <form className="notebook-form" onSubmit={submit}>
          <label htmlFor="challenge-circuit">Shared circuit JSON</label>
          <textarea id="challenge-circuit" value={circuit} onChange={(event) => setCircuit(event.target.value)} rows={14} />
          <button className="primary-button" type="submit">Submit solution</button>
        </form>
      </NotebookCard>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {result && (
        <div className="notebook-stack">
          <NotebookCard label="RESULT" title={result.passed ? "Challenge passed" : "Keep iterating"} meta={`${result.score}/100`}>
            <div className={`result-banner ${result.passed ? "passed" : "needs-work"}`}>
              <strong>{result.passed ? "All public checks passed." : "Some checks need attention."}</strong>
            </div>
            <ul className="feedback-list">{result.feedback.map((item) => <li key={item}>{item}</li>)}</ul>
          </NotebookCard>
          {result.simulation && (
            <NotebookCard label="OUTPUT" title="Simulation snapshot" meta={result.simulation.engine}>
              <div className="result-metrics">
                <span><strong>{result.simulation.shots ?? "—"}</strong> shots</span>
                <span><strong>{Object.keys(result.simulation.counts || {}).length}</strong> observed states</span>
              </div>
              <div className="counts-grid">
                {Object.entries(result.simulation.counts || {}).map(([state, count]) => <div className="count-chip" key={state}><span>|{state}⟩</span><strong>{count}</strong></div>)}
              </div>
            </NotebookCard>
          )}
        </div>
      )}
    </div>
  );
}

export default ChallengeDetail;
