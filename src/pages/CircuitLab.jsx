import { useMemo, useState } from "react";
import SimulationResults from "../components/circuit/SimulationResults";
import { api } from "../services/api";
import { getCurrentUserId } from "../services/user";
import {
  NUMBER_OF_COLUMNS,
  PARAMETRIC_GATES,
  THREE_QUBIT_GATES,
  TWO_QUBIT_GATES,
  createCircuitJSON,
  createEmptyCircuit,
  getCircuitGroups,
  validateCircuit,
} from "../services/circuitService";
import { Atom, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import "./CircuitLab.css";

const GATES = [
  ["h", "Hadamard", "Superposition"],
  ["x", "Pauli-X", "Quantum NOT"],
  ["y", "Pauli-Y", "Bit and phase flip"],
  ["z", "Pauli-Z", "Phase flip"],
  ["s", "S", "Quarter-turn phase"],
  ["sdg", "S†", "Inverse S phase"],
  ["t", "T", "Eighth-turn phase"],
  ["tdg", "T†", "Inverse T phase"],
  ["rx", "RX", "X-axis rotation"],
  ["ry", "RY", "Y-axis rotation"],
  ["rz", "RZ", "Z-axis rotation"],
  ["u", "U", "General single-qubit gate"],
  ["cx", "CX", "Controlled-X"],
  ["cy", "CY", "Controlled-Y"],
  ["cz", "CZ", "Controlled-Z"],
  ["swap", "SWAP", "Exchange two qubits"],
  ["ch", "CH", "Controlled-H"],
  ["ccx", "CCX", "Toffoli (3 qubits)"],
  ["measure", "M", "Measure qubit"],
].map(([name, label, description]) => ({ name, label, description }));

const MULTI_QUBIT_GATES = new Set([...TWO_QUBIT_GATES, ...THREE_QUBIT_GATES]);
let nextGateId = 0;

function createGateId(name, column, qubit) {
  nextGateId += 1;
  return `${name}-${column}-${qubit}-${nextGateId}`;
}

function defaultParams(name) {
  if (name === "u") return [0, 0, 0];
  if (PARAMETRIC_GATES.has(name)) return [0];
  return [];
}

function makeCell(name, id, order, role, params = defaultParams(name), pending = false) {
  return { id, name, order, role, params, pending };
}

function gateSize(name) {
  return THREE_QUBIT_GATES.has(name) ? 3 : TWO_QUBIT_GATES.has(name) ? 2 : 1;
}

function cellGateName(cell) {
  return typeof cell === "string" ? cell.toLowerCase() : cell?.name;
}

function updateGroup(circuit, id, update) {
  return circuit.map((row) => row.map((cell) => {
    if (!cell || typeof cell === "string" || cell.id !== id) return cell;
    return update(cell);
  }));
}

function CircuitLab() {
  const [circuit, setCircuit] = useState(createEmptyCircuit());
  const [selectedGate, setSelectedGate] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [pendingPlacement, setPendingPlacement] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const groups = useMemo(() => getCircuitGroups(circuit), [circuit]);
  const selectedGroup = selectedCell
    ? groups.find((group) => group.id === selectedCell.id)
    : null;
  const gateCount = groups.length;
  const connectors = groups.filter((group) => group.members.length > 1);

  const selectGate = (name) => {
    if (pendingPlacement) return;
    setError("");
    setSelectedGate((current) => (current === name ? null : name));
  };

  const placeGate = (qubit, column, name = selectedGate) => {
    if (!name) return;
    setError("");

    const existing = circuit[qubit][column];
    if (existing) {
      setSelectedCell({ id: typeof existing === "string" ? null : existing.id, qubit, column });
      setError("That slot is occupied. Select it to edit or remove the existing gate.");
      return;
    }

    const size = gateSize(name);
    if (size === 1) {
      const id = createGateId(name, column, qubit);
      const next = circuit.map((row) => [...row]);
      next[qubit][column] = makeCell(name, id, 0, "single");
      setCircuit(next);
      setSelectedCell({ id, qubit, column });
      return;
    }

    if (!pendingPlacement) {
      const id = createGateId(name, column, qubit);
      const next = circuit.map((row) => [...row]);
      next[qubit][column] = makeCell(
        name,
        id,
        0,
        size === 3 ? "control" : name === "swap" ? "swap-a" : "control",
        defaultParams(name),
        true,
      );
      setCircuit(next);
      setPendingPlacement({ id, name, column, qubits: [qubit], firstRole: "control" });
      setSelectedGate(name);
      setSelectedCell({ id, qubit, column });
      return;
    }

    if (
      pendingPlacement.name !== name
      || pendingPlacement.column !== column
      || pendingPlacement.qubits.includes(qubit)
    ) {
      setError(`Choose another qubit in step ${column + 1} to finish ${pendingPlacement.name.toUpperCase()}.`);
      return;
    }

    const qubits = [...pendingPlacement.qubits, qubit];
    if (qubits.length < size) {
      const next = circuit.map((row) => [...row]);
      next[qubit][column] = makeCell(
        name,
        pendingPlacement.id,
        qubits.length - 1,
        "control",
        defaultParams(name),
        true,
      );
      setCircuit(next);
      setPendingPlacement({ ...pendingPlacement, qubits });
      setSelectedCell({ id: pendingPlacement.id, qubit, column });
      return;
    }

    const orderedRoles = name === "swap"
      ? ["swap-a", "swap-b"]
      : size === 3
        ? ["control", "control", "target"]
        : pendingPlacement.firstRole === "target"
          ? ["target", "control"]
          : ["control", "target"];
    const orderedOrders = name !== "swap"
      && size === 2
      && pendingPlacement.firstRole === "target"
      ? [1, 0]
      : [0, 1, 2];
    const completed = updateGroup(circuit, pendingPlacement.id, (cell) => ({
      ...cell,
      pending: false,
      role: orderedRoles[cell.order],
      order: orderedOrders[cell.order],
    })).map((row) => row.map((cell) => {
      if (!cell || typeof cell === "string" || cell.id !== pendingPlacement.id) return cell;
      if (cell.qubit === undefined) return cell;
      return cell;
    }));
    const withLastCell = completed.map((row) => [...row]);
    withLastCell[qubit][column] = makeCell(
      name,
      pendingPlacement.id,
      orderedOrders[qubits.length - 1],
      orderedRoles[qubits.length - 1],
      defaultParams(name),
      false,
    );
    setCircuit(withLastCell);
    setPendingPlacement(null);
    setSelectedGate(null);
    setSelectedCell({ id: pendingPlacement.id, qubit, column });
  };

  const handleCellClick = (qubit, column) => {
    const cell = circuit[qubit][column];
    if (selectedGate) {
      placeGate(qubit, column);
      return;
    }
    if (cell) {
      setSelectedCell({
        id: typeof cell === "string" ? null : cell.id,
        qubit,
        column,
      });
      setError("");
    } else {
      setSelectedCell({ id: null, qubit, column });
    }
  };

  const handleDrop = (event, qubit, column) => {
    event.preventDefault();
    const name = event.dataTransfer.getData("text/plain");
    if (name) placeGate(qubit, column, name);
  };

  const removeSelected = () => {
    if (!selectedCell?.id) return;
    setCircuit((current) => current.map((row) => row.map((cell) => (
      cell && typeof cell !== "string" && cell.id === selectedCell.id ? null : cell
    ))));
    setPendingPlacement(null);
    setSelectedCell(null);
    setSelectedGate(null);
    setError("");
  };

  const clearCircuit = () => {
    setCircuit(createEmptyCircuit());
    setSelectedGate(null);
    setSelectedCell(null);
    setPendingPlacement(null);
    setSimulationResult(null);
    setError("");
  };

  const updateSelectedParams = (index, value) => {
    if (!selectedGroup) return;
    const params = [...selectedGroup.params];
    const numericValue = Number(value);
    params[index] = value === "" || !Number.isFinite(numericValue) ? 0 : numericValue;
    setCircuit((current) => updateGroup(current, selectedGroup.id, (cell) => ({ ...cell, params })));
  };

  const runCircuit = async () => {
    const validation = validateCircuit(circuit);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = createCircuitJSON(circuit);
      window.localStorage.setItem("quantum_last_circuit", JSON.stringify(payload));
      setSimulationResult(await api.simulate(payload));
    } catch (requestError) {
      setSimulationResult(null);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const exportJupyter = async () => {
    try {
      const notebook = await api.jupyter(getCurrentUserId(), createCircuitJSON(circuit), "Circuit Lab notebook");
      const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "quantum-circuit.ipynb";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const renderGate = (cell) => {
    if (!cell) return null;
    const name = cellGateName(cell);
    if (name === "measure") return "M";
    if (!MULTI_QUBIT_GATES.has(name) && name !== "ccx") {
      return name.toUpperCase().replace("SDG", "S†").replace("TDG", "T†");
    }
    if (name === "swap") return "×";
    return cell.role === "target" ? "⊕" : "●";
  };

  return (
    <div className="circuit-page">
      <header className="circuit-header">
        <div className="circuit-title">
          <div className="circuit-title-icon"><Atom size={22} /></div>
          <div>
            <h1>Circuit Lab</h1>
            <p>Build and experiment with quantum circuits</p>
          </div>
        </div>
        <div className="circuit-actions">
          <button type="button" className="clear-button" onClick={clearCircuit}>
            <RotateCcw size={16} /> Clear
          </button>
          <button type="button" className="run-circuit-button" onClick={runCircuit} disabled={loading}>
            <Play size={16} /> {loading ? "Simulating..." : "Run Circuit"}
          </button>
          <button type="button" className="clear-button" onClick={exportJupyter}>Export Jupyter</button>
        </div>
      </header>

      {error && <div className="circuit-error" role="alert">{error}</div>}

      <div className="circuit-workspace">
        <aside className="gate-panel">
          <div className="panel-heading">
            <h2>Quantum Gates</h2>
            <p>Drag a gate to a slot, or select one and click a slot.</p>
          </div>
          <div className="gate-list">
            {GATES.map((gate) => (
              <button
                key={gate.name}
                type="button"
                className={`gate-item ${selectedGate === gate.name ? "selected-gate-item" : ""}`}
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/plain", gate.name)}
                onClick={() => selectGate(gate.name)}
                aria-pressed={selectedGate === gate.name}
              >
                <div className="gate-symbol">{gate.label}</div>
                <div className="gate-info">
                  <strong>{gate.label}</strong>
                  <span>{gate.description}</span>
                </div>
                <Plus size={15} />
              </button>
            ))}
          </div>

          {selectedGate && (
            <div className="selected-gate">
              <span>{pendingPlacement ? "Placing multi-qubit gate" : "Selected gate"}</span>
              <strong>{pendingPlacement ? `${pendingPlacement.name.toUpperCase()} · choose next qubit` : selectedGate.toUpperCase()}</strong>
              {pendingPlacement && (
                <small>
                  Step {pendingPlacement.column + 1}: {pendingPlacement.qubits.map((qubit) => `q${qubit}`).join(", ")}
                </small>
              )}
            </div>
          )}

          {pendingPlacement && (
            <div className="placement-controls">
              {gateSize(pendingPlacement.name) === 2 && pendingPlacement.name !== "swap" && (
                <label>
                  First qubit is
                  <select
                    value={pendingPlacement.firstRole}
                    onChange={(event) => setPendingPlacement({ ...pendingPlacement, firstRole: event.target.value })}
                  >
                    <option value="control">control</option>
                    <option value="target">target</option>
                  </select>
                </label>
              )}
              <span>
                {gateSize(pendingPlacement.name) === 3
                  ? "Pick one more qubit in this step (first two are controls)."
                  : "Pick the other qubit in this step."}
              </span>
            </div>
          )}

          {selectedGroup && (
            <div className="gate-editor">
              <div className="editor-heading">
                <strong>{selectedGroup.name.toUpperCase()} editor</strong>
                <button type="button" onClick={removeSelected} aria-label="Delete selected gate">
                  <Trash2 size={15} />
                </button>
              </div>
              {PARAMETRIC_GATES.has(selectedGroup.name) && (
                <div className="parameter-fields">
                  {selectedGroup.params.map((param, index) => (
                    <label key={`${selectedGroup.id}-${index}`}>
                      {selectedGroup.name === "u" ? ["θ", "φ", "λ"][index] : "angle"}
                      <input
                        type="number"
                        step="0.1"
                        value={param}
                        onChange={(event) => updateSelectedParams(index, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              )}
              <button type="button" className="remove-gate-button" onClick={removeSelected}>
                <Trash2 size={15} /> Delete selected gate
              </button>
            </div>
          )}

          <div className="gate-help">
            <strong>💡 Tip</strong>
            <p>Multi-qubit gates occupy one column. Start on one wire, then click or drop on the remaining wire(s).</p>
          </div>
        </aside>

        <div className="circuit-canvas">
          <div className="canvas-topbar">
            <div><span>Quantum Circuit</span><small>{circuit.length} qubits · {NUMBER_OF_COLUMNS} steps</small></div>
            <div className="circuit-stats"><span>Qubits:<strong>{circuit.length}</strong></span><span>Gates:<strong>{gateCount}</strong></span></div>
          </div>

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
                          onClick={() => handleCellClick(qubit, column)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => handleDrop(event, qubit, column)}
                        >
                          {cell && (
                            <div
                              className={`placed-gate ${cell.pending ? "pending-gate" : ""} ${MULTI_QUBIT_GATES.has(cellGateName(cell)) || cellGateName(cell) === "ccx" ? "multi-gate" : ""}`}
                              title={`${cellGateName(cell).toUpperCase()} on q${qubit}`}
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
                    style={{
                      "--connector-column": group.column,
                      "--connector-control": qubits[0],
                      "--connector-span": qubits[qubits.length - 1] - qubits[0],
                    }}
                  />
                );
              })}
            </div>
          </div>

          {gateCount === 0 && (
            <div className="empty-circuit">
              <div className="empty-icon"><Plus size={25} /></div>
              <h3>Build your circuit</h3>
              <p>Drag a gate to a slot or select one from the palette.</p>
            </div>
          )}
        </div>
      </div>

      <SimulationResults result={simulationResult} />
    </div>
  );
}

export default CircuitLab;
