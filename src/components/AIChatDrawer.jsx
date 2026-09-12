import { useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { api } from "../services/api";
import { getCurrentUserId } from "../services/user";
import "./AIChatDrawer.css";

function AIChatDrawer() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  async function send(event) {
    event.preventDefault();
    const text = message.trim();
    if (!text || loading) return;
    setMessage("");
    setMessages((current) => [...current, { role: "user", text }]);
    setLoading(true);
    try {
      const response = await api.aiChat({ user_id: getCurrentUserId(), message: text });
      const answer = response.message?.explanation || response.message?.hint || "I could not generate a response.";
      setMessages((current) => [...current, { role: "assistant", text: answer }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error.message }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="ai-drawer-trigger" type="button" onClick={() => setOpen(true)} aria-label="Open AI assistant">
        <Bot size={18} /> AI assistant
      </button>
      {open && (
        <aside className="ai-drawer" aria-label="Global AI assistant">
          <header><div><span className="eyebrow">GRANITE TUTOR</span><h2>Ask anything</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={18} /></button></header>
          <div className="ai-drawer-messages">
            {!messages.length && <p className="ai-drawer-empty">Ask for a concept explanation, circuit hint, or next step.</p>}
            {messages.map((item, index) => <p className={`ai-drawer-message ${item.role}`} key={`${item.role}-${index}`}>{item.text}</p>)}
          </div>
          <form onSubmit={send}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask the tutor…" /><button type="submit" disabled={loading} aria-label="Send"><Send size={16} /></button></form>
        </aside>
      )}
    </>
  );
}

export default AIChatDrawer;
