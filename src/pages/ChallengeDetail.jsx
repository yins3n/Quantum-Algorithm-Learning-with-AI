import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";

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
      setResult(await api.submitExercise(exerciseId, { user_id: "demo-user", circuit: parsed }));
    } catch (submissionError) {
      setError(submissionError instanceof SyntaxError ? "Circuit JSON is invalid." : submissionError.message);
    }
  }

  if (error && !exercise) return <div className="page-content"><p role="alert">{error}</p></div>;
  if (!exercise) return <div className="page-content"><p>Loading challenge...</p></div>;

  return (
    <div className="page-content">
      <h1>{exercise.title}</h1>
      <p>{exercise.description}</p>
      <form onSubmit={submit}>
        <label htmlFor="challenge-circuit">Circuit JSON</label>
        <textarea id="challenge-circuit" value={circuit} onChange={(event) => setCircuit(event.target.value)} rows={14} />
        <button type="submit">Submit solution</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <section className="action-card">
          <h2>{result.passed ? "Passed" : "Not passed"} — {result.score}/100</h2>
          {result.feedback.map((item) => <p key={item}>{item}</p>)}
          <pre>{JSON.stringify(result.simulation, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

export default ChallengeDetail;
