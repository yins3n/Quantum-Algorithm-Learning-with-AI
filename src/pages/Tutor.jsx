import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import NotebookCard from "../components/NotebookCard";
import { getCurrentUserId } from "../services/user";
import "./Tutor.css";

function Tutor() {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [circuitText, setCircuitText] = useState(() => window.localStorage.getItem("quantum_last_circuit") || "");
  const userId = getCurrentUserId();
  const threadEndRef = useRef(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  function appendBubble(role, text) {
    setMessages((current) => [...current, { role, text }]);
  }

  function renderAnswer(answer) {
    const parts = [answer.explanation];
    if (answer.hint) parts.push("Hint: " + answer.hint);
    if (answer.next_step) parts.push("Next step: " + answer.next_step);
    if (answer.teaching_steps?.length) {
      parts.push("Teaching steps:\n" + answer.teaching_steps.map((step, index) => (index + 1) + ". " + step).join("\n"));
    }
    return parts.join("\n\n");
  }

  async function askTutor(event) {
    event.preventDefault();
    const text = message.trim();
    if (!text || pending) return;
    setMessage("");
    setError("");
    appendBubble("user", text);
    setPending(true);
    try {
      let circuit;
      if (circuitText.trim()) circuit = JSON.parse(circuitText);
      const response = await api.tutor({ user_id: userId, message: text, circuit });
      appendBubble("ai", renderAnswer(response.answer));
    } catch (requestError) {
      appendBubble("ai", "Something went wrong: " + requestError.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-content">
      <header className="page-hero">
        <p className="page-label">NOTEBOOK / TUTOR</p>
        <h1>AI Tutor</h1>
        <p>Ask Granite for a grounded explanation or debugging hint — follow-up questions are remembered.</p>
      </header>

      <div className="tutor-thread" aria-live="polite">
        {messages.length === 0 && (
          <p className="ai-drawer-empty">
            Ask a question below — for example <em>“why does measuring collapse the superposition?”</em>
          </p>
        )}
        {messages.map((item, index) => (
          <p className={"ai-drawer-message" + (item.role === "user" ? " user" : "")} key={index}>
            {item.text.split("\n").map((line, lineIndex) => (
              <span key={lineIndex}>{line}</span>
            ))}
          </p>
        ))}
        {pending && (
          <p className="ai-drawer-message pending" role="status">
            <span className="tutor-thinking">Thinking</span>
            <span className="tutor-dots"><span /><span /><span /></span>
          </p>
        )}
        <div ref={threadEndRef} />
      </div>

      <NotebookCard label="INPUT" title="Your question" meta={userId}>
        <form className="notebook-form" onSubmit={askTutor}>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What are you stuck on?" rows={5} />
          <label htmlFor="tutor-circuit">Optional active circuit JSON</label>
          <textarea id="tutor-circuit" value={circuitText} onChange={(event) => setCircuitText(event.target.value)} rows={5} />
          <button className="primary-button" type="submit">Ask tutor</button>
        </form>
      </NotebookCard>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}

export default Tutor;
