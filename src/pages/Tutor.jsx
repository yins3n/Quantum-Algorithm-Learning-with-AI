import { useState } from "react";
import { api } from "../services/api";
import NotebookCard from "../components/NotebookCard";
import { getCurrentUserId } from "../services/user";

function Tutor() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState("");
  const [circuitText, setCircuitText] = useState(() => window.localStorage.getItem("quantum_last_circuit") || "");
  const userId = getCurrentUserId();

  async function askTutor(event) {
    event.preventDefault();
    if (!message.trim()) return;
    setError("");
    try {
      let circuit;
      if (circuitText.trim()) circuit = JSON.parse(circuitText);
      const response = await api.tutor({ user_id: userId, message, circuit });
      setAnswer(response.answer);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="page-content">
      <header className="page-hero">
        <p className="page-label">NOTEBOOK / TUTOR</p>
        <h1>AI Tutor</h1>
        <p>Ask Granite for a grounded explanation or debugging hint.</p>
      </header>
      <NotebookCard label="INPUT" title="Your question" meta={userId}>
        <form className="notebook-form" onSubmit={askTutor}>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What are you stuck on?" rows={5} />
          <label htmlFor="tutor-circuit">Optional active circuit JSON</label>
          <textarea id="tutor-circuit" value={circuitText} onChange={(event) => setCircuitText(event.target.value)} rows={5} />
          <button className="primary-button" type="submit">Ask tutor</button>
        </form>
      </NotebookCard>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {answer && (
        <div className="notebook-stack">
          <NotebookCard label="OUTPUT" title={answer.error_category || "Tutor response"} meta="validated context">
            <p>{answer.explanation}</p>
            <div className="tutor-callout"><strong>Hint</strong><span>{answer.hint}</span></div>
            <div className="tutor-callout"><strong>Next step</strong><span>{answer.next_step}</span></div>
          </NotebookCard>
          {answer.teaching_steps?.length > 0 && (
            <NotebookCard label="NOTES" title="Teaching steps">
              <ol className="notebook-list">{answer.teaching_steps.map((step) => <li key={step}>{step}</li>)}</ol>
            </NotebookCard>
          )}
        </div>
      )}
    </div>
  );
}

export default Tutor;
