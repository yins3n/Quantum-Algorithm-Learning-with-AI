import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Code2 } from "lucide-react";
import { circuitToQiskit, parseQiskit } from "./qiskitUtils";
import "./composer.css";

function QiskitConverter({ circuit, onImport }) {
  const initial = useMemo(() => circuitToQiskit(circuit), [circuit]);
  const [code, setCode] = useState(initial);
  const [message, setMessage] = useState("");

  const updateFromCircuit = () => { setCode(circuitToQiskit(circuit)); setMessage("Exported current canvas."); };
  const importToCanvas = () => {
    try { onImport(parseQiskit(code)); setMessage("Imported Qiskit code into the canvas."); }
    catch (error) { setMessage(error.message); }
  };

  return (
    <section className="composer-code-panel">
      <div className="composer-section-heading">
        <div><span className="eyebrow">CODE BRIDGE</span><h3><Code2 size={17} /> Canvas ↔ Qiskit</h3></div>
        <div className="composer-code-actions">
          <button type="button" className="clear-button" onClick={updateFromCircuit}><ArrowUpFromLine size={14} /> Canvas → code</button>
          <button type="button" className="run-circuit-button" onClick={importToCanvas}><ArrowDownToLine size={14} /> Code → canvas</button>
        </div>
      </div>
      <textarea className="qiskit-editor" value={code} onChange={(event) => setCode(event.target.value)} spellCheck="false" aria-label="Qiskit code" />
      {message && <p className="composer-inline-message">{message}</p>}
    </section>
  );
}

export default QiskitConverter;
