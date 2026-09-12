import { useMemo } from "react";
import { Copy, Check, Plus, Minus } from "lucide-react";
import { useState } from "react";
import { NUMBER_OF_COLUMNS, getCircuitGroups } from "../../services/circuitService";
import "./composer.css";

function CircuitView({
  circuit,
  selectedCell,
  onCellClick,
  onDrop,
  onDragOver,
  renderGate,
  multiQubitGates,
}) {
  const groups = useMemo(() => getCircuitGroups(circuit), [circuit]);
  const connectors = groups.filter((group) => group.members.length > 1);

  return (
    <div className="quantum-circuit">
      <div className="column-header">
        <div className="qubit-header">Qubit / step</div>
        {Array.from({ length: NUMBER_OF_COLUMNS }, (_, column) => <div key={column} className="column-number">{column + 1}</div>)}
      </div>
      {circuit.map((row, qubit) => (
        <div className="qubit-row" key={qubit}>
          <div className="qubit-label">q<sub>{qubit}</sub></div>
          <div className="wire-area">
            <div className="quantum-wire" />
            <div className="circuit-cells">
              {row.map((cell, column) => {
                const selected = selectedCell?.id && typeof cell !== "string" && selectedCell.id === cell?.id;
                return (
                  <div
                    key={column}
                    data-qubit={qubit}
                    data-column={column}
                    className={`circuit-cell ${selected ? "selected-cell" : ""}`}
                    onClick={() => onCellClick(qubit, column)}
                    onDragOver={onDragOver}
                    onDrop={(event) => onDrop(event, qubit, column)}
                  >
                    {cell && (
                      <div
                        className={`placed-gate ${cell.pending ? "pending-gate" : ""} ${multiQubitGates.has(typeof cell === "string" ? cell : cell.name) ? "multi-gate" : ""}`}
                        title={`${typeof cell === "string" ? cell : cell.name}`.toUpperCase() + ` on q${qubit}`}
                      >
                        {renderGate(cell)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
      <div className="cnot-connectors" aria-hidden="true">
        {connectors.map((group) => {
          const qubits = group.members.map((member) => member.qubit).sort((a, b) => a - b);
          return (
            <span
              className="cnot-connector"
              key={group.id}
              style={{ "--connector-column": group.column, "--connector-control": qubits[0], "--connector-span": qubits[qubits.length - 1] - qubits[0] }}
            />
          );
        })}
      </div>
      {!groups.length && (
        <div className="empty-circuit">
          <div className="empty-icon">＋</div>
          <h3>Build your circuit</h3>
          <p>Drag a gate to a slot or select one from the palette.</p>
        </div>
      )}
    </div>
  );
}

function QasmView({ qasm }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(qasm);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="qasm-view">
      <div className="qasm-toolbar">
        <span className="qasm-kind">OPENQASM 3.0</span>
        <button type="button" className="clear-button" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy QASM"}
        </button>
      </div>
      <pre><code>{qasm}</code></pre>
    </div>
  );
}

function QuantumCanvas({
  circuit,
  selectedCell,
  onCellClick,
  onDrop,
  onDragOver,
  renderGate,
  multiQubitGates,
  view = "circuit",
  onViewChange = () => {},
  qasm = "",
  onAddQubit,
  onRemoveQubit,
  canRemoveQubit = true,
  qubitCapReached = false,
}) {
  const groups = useMemo(() => getCircuitGroups(circuit), [circuit]);

  return (
    <div className="circuit-canvas quantum-canvas">
      <div className="canvas-topbar">
        <div>
          <button type="button" className={`canvas-tab ${view === "circuit" ? "active" : ""}`} onClick={() => onViewChange("circuit")}>Circuit</button>
          <button type="button" className={`canvas-tab ${view === "code" ? "active" : ""}`} onClick={() => onViewChange("code")}>OpenQASM 3</button>
        </div>
        <div className="circuit-stats">
          <span className="qubit-controls">
            <span>Qubits:<strong>{circuit.length}</strong></span>
            <button type="button" onClick={onAddQubit} disabled={qubitCapReached} aria-label="Add qubit"><Plus size={12} /></button>
            <button type="button" onClick={onRemoveQubit} disabled={!canRemoveQubit} aria-label="Remove qubit"><Minus size={12} /></button>
          </span>
          <span>Gates:<strong>{groups.length}</strong></span>
        </div>
      </div>

      {view === "code"
        ? <QasmView qasm={qasm} />
        : (
          <CircuitView
            circuit={circuit}
            selectedCell={selectedCell}
            onCellClick={onCellClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            renderGate={renderGate}
            multiQubitGates={multiQubitGates}
          />
        )}
    </div>
  );
}

export default QuantumCanvas;