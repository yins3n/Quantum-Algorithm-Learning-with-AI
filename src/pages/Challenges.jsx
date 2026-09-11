import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

function Challenges() {
  const [exercises, setExercises] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.exercises().then(setExercises).catch((requestError) => setError(requestError.message));
  }, []);

  return (
    <div className="page-content">
      <h1>Challenges</h1>
      <p>Build circuits and submit them to the deterministic evaluator.</p>
      {error && <p role="alert">{error}</p>}
      <div className="quick-grid">
        {exercises.map((exercise) => (
          <div className="action-card" key={exercise.id}>
            <h3>{exercise.title}</h3>
            <p>{exercise.description}</p>
            <span>{exercise.difficulty}</span>
            <Link to={`/challenges/${exercise.id}`}>Open challenge</Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Challenges;
