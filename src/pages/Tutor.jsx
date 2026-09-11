import { useState } from "react";
import { api } from "../services/api";

function Tutor() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState("");
  const userId = "demo-user";

  async function askTutor(event) {
    event.preventDefault();
    if (!message.trim()) return;
    setError("");
    try {
      const response = await api.tutor({ user_id: userId, message });
      setAnswer(response.answer);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="page-content">
      <h1>AI Tutor</h1>
      <p>Ask Granite for a grounded explanation or debugging hint.</p>
      <form onSubmit={askTutor}>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What are you stuck on?" rows={5} />
        <button type="submit">Ask tutor</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {answer && (
        <section className="action-card">
          <h3>{answer.error_category}</h3>
          <p>{answer.explanation}</p>
          <p><strong>Hint:</strong> {answer.hint}</p>
          <p><strong>Next step:</strong> {answer.next_step}</p>
          {answer.teaching_steps?.length > 0 && <ul>{answer.teaching_steps.map((step) => <li key={step}>{step}</li>)}</ul>}
        </section>
      )}
    </div>
  );
}

export default Tutor;
