import { useState } from "react";
import { Bot, ChevronRight, Send, X } from "lucide-react";
import { api } from "../../services/api";
import { getCurrentUserId } from "../../services/user";
import "./composer.css";

function ComposerAssistant({ circuit }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", text: "Ask me for a hint about the circuit on your canvas." }]);
  const send = async (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    const question = prompt.trim();
    setPrompt("");
    setMessages((current) => [...current, { role: "user", text: question }]);
    try {
      const response = await api.aiChat({ user_id: getCurrentUserId(), message: question, context: { circuit } });
      const answer = response?.message?.explanation || response?.message?.hint || "I could not generate a hint right now.";
      setMessages((current) => [...current, { role: "assistant", text: answer }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", text: error.message }]);
    }
  };
  return (
    <>
      <button type="button" className="composer-assistant-trigger" onClick={() => setOpen(true)}><Bot size={16} /> Circuit hint <ChevronRight size={14} /></button>
      {open && <aside className="composer-drawer" aria-label="AI circuit hints">
        <div className="composer-drawer-header"><div><span className="eyebrow">AI TUTOR</span><h3>Circuit hints</h3></div><button type="button" onClick={() => setOpen(false)} aria-label="Close hints"><X size={17} /></button></div>
        <div className="composer-messages">{messages.map((message, index) => <div className={`composer-message ${message.role}`} key={`${message.role}-${index}`}>{message.text}</div>)}</div>
        <form className="composer-chat-form" onSubmit={send}><input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask about this circuit…" /><button type="submit" aria-label="Send question"><Send size={15} /></button></form>
      </aside>}
    </>
  );
}

export default ComposerAssistant;
