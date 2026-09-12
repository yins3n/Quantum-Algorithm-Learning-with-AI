import { useMemo, useState } from "react";
import SimulationResults from "../components/circuit/SimulationResults";
import ProbabilityChart from "../components/circuit/ProbabilityChart";
import BlochSphere from "../components/circuit/BlochSphere";
import QuantumCanvas from "../components/composer/QuantumCanvas";
import QiskitConverter from "../components/composer/QiskitConverter";
import ComposerAssistant from "../components/composer/ComposerAssistant";
import { circuitToQasm3 } from "../components/composer/qiskitUtils";
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
import { Atom, Code2, Play, Plus, RotateCcw, Trash2, WandSparkles } from "lucide-react";
import "./CircuitLab.css";

const MAX_QUBITS = 12;

const GATE_GROUPS = [
  {
    label: "Operations",
    gates: [
      ["measure", "M", "Measure qubit to a classical bit"],
      ["reset", "Reset", "Reset qubit to |0⟩"],
      ["barrier", "Barrier", "Prevent operations merging across it"],
    ],
  },
  {
    label: "Pauli",
    gates: [
      ["i", "I", "Identity (do nothing)"],
      ["x", "X", "Quantum NOT"],
      ["y", "Y", "Bit and phase flip"],
      ["z", "Z", "Phase flip"],
    ],
  },
  {
    label: "Clifford",
    gates: [
      ["h", "H", "Hadamard, superposition"],
      ["s", "S", "Quarter-turn phase"],
      ["sdg", "S†", "Inverse S phase"],
      ["t", "T", "Eighth-turn phase"],
      ["tdg", "T†", "Inverse T phase"],
      ["sx", "Sx", "√X root-of-NOT"],
      ["sxdg", "Sx†", "Inverse √X"],
    ],
  },
  {
    label: "Rotation",
    gates: [
      ["rx", "RX", "X-axis rotation"],
      ["ry", "RY", "Y-axis rotation"],
      ["rz", "RZ", "Z-axis rotation"],
      ["u1", "U1", "Diagonal U(λ)"],
      ["u2", "U2", "U(π/2, φ, λ)"],
      ["u3", "U3", "General U(θ, φ, λ)"],
      ["r", "R", "General R(θ, φ) rotation"],
    ],
  },
  {
    label: "Two-qubit",
    gates: [
      ["cx", "CX", "Controlled-X"],
      ["cy", "CY", "Controlled-Y"],
      ["cz", "CZ", "Controlled-Z"],
      ["ch", "CH", "Controlled-H"],
      ["cp", "CP", "Controlled phase"],
      ["crx", "CRX", "Controlled-RX"],
      ["cry", "CRY", "Controlled-RY"],
      ["crz", "CRZ", "Controlled-RZ"],
      ["swap", "SWAP", "Exchange two qubits"],
      ["ecr", "ECR", "Echoed cross-resonance"],
      ["csx", "CSX", "Controlled √X"],
    ],
  },
  {
    label: "Multi-qubit",
    gates: [
      ["ccx", "CCX", "Toffoli (3 qubits)"],
      ["cswap", "CSWAP", "Fredkin, controlled SWAP"],
    ],
  },
].map((group) => ({
  ...group,
  gates: group.gates.map(([name, label, description]) => ({ name, label, description })),
}));

const MULTI_QUBIT_GATES = new Set([...TWO_QUBIT_GATES, ...THREE_QUBIT_GATES]);

const GATE_SYMBOLS = {
  h: "H", x: "X", y: "Y", z: "Z", i: "I", s: "S", sdg: "S†", t: "T", tdg: "T†",
  sx: "Sx", sxdg: "Sx†", rx: "RX", ry: "RY", rz: "RZ", u: "U", u1: "U1", u2: "U2", u3: "U3", r: "R",
  measure: "M", reset: "Reset", barrier: "—",
};
const GATE_PARAM_LABELS = {
  u: ["θ", "φ", "λ"], u3: ["θ", "φ", "λ"], u2: ["φ", "λ"], u1: ["λ"], r: ["θ", "φ"],
};

let nextGateId = 0;

function createGateId(name, column, qubit) {
  nextGateId += 1;
  return `${name}-${column}-${qubit}-${nextGateId}`;
}

function defaultParams(name) {
  if (name === "u" || name === "u3") return [0, 0, 0];
  if (name === "u2") return [0, 0];
  if (name === "u1") return [0];
  if (name === "r") return [0, 0];
  if (PARAMETRIC_GATES.has(name)) return [0];
  return [];
}

function makeCell(name, id, order, role, params = defaultParams(name), pending = false) {
  return { id, name, order, role, params, pending };
}

function circuitFromOperations(payload) {
  const circuit = createEmptyCircuit(payload.num_qubits);
  (payload.gates || []).forEach((gate, column) => {
    if (column >= NUMBER_OF_COLUMNS) throw new Error(`Qiskit import supports up to ${NUMBER_OF_COLUMNS} steps.`);
    const name = gate.name.toLowerCase();
    const qubits = gate.qubits || [];
    const roles = name === "swap"
      ? ["swap-a", "swap-b"]
      : name === "cswap"
        ? ["control", "swap-a", "swap-b"]
        : qubits.length === 3
          ? ["control", "control", "target"]
          : qubits.length === 2
            ? ["control", "target"]
            : ["single"];
    const id = createGateId(name, column, qubits[0] || 0);
    qubits.forEach((qubit, order) => {
      if (!Number.isInteger(qubit) || qubit < 0 || qubit >= circuit.length) throw new Error(`Invalid qubit q${qubit} in Qiskit code.`);
      circuit[qubit][column] = makeCell(name, id, order, roles[order], gate.params || []);
    });
  });
  return circuit;
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

function paramLabels(name) {
  return GATE_PARAM_LABELS[name] || ["angle"];
}

function CircuitLab() {
  const [circuit, setCircuit] = useState(createEmptyCircuit());
  const [selectedGate, setSelectedGate] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [pendingPlacement, setPendingPlacement] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [transpiled, setTranspiled] = useState(null);
  const [view, setView] = useState("circuit");

  const groups = useMemo(() => getCircuitGroups(circuit), [circuit]);
  const selectedGroup = selectedCell
    ? groups.find((group) => group.id === selectedCell.id)
    : null;
  const openQasm = useMemo(() => circuitToQasm3(createCircuitJSON(circuit)), [circuit]);

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
      : name === "cswap"
        ? ["control", "swap-a", "swap-b"]
        : size === 3
          ? ["control", "control", "target"]
          : pendingPlacement.firstRole === "target"
            ? ["target", "control"]
            : ["control", "target"];
    const orderedOrders = name !== "swap"
      && name !== "cswap"
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

  const addQubit = () => {
    if (circuit.length >= MAX_QUBITS) return;
    const columns = circuit[0].length;
    setCircuit((current) => [...current, Array(columns).fill(null)]);
    setSimulationResult(null);
    setTranspiled(null);
    setError("");
  };

  const removeQubit = () => {
    if (circuit.length <= 1) return;
    setSelectedGate(null);
    setSelectedCell(null);
    setPendingPlacement(null);
    setSimulationResult(null);
    setTranspiled(null);
    setError("");
    setCircuit((current) => current.slice(0, -1));
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
      setTranspiled(null);
    } catch (requestError) {
      setSimulationResult(null);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const transpileCircuit = async () => {
    const validation = validateCircuit(circuit);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setTranspiled(await api.transpile(createCircuitJSON(circuit)));
    } catch (requestError) {
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

  const importQiskit = (payload) => {
    try {
      setCircuit(circuitFromOperations(payload));
      setSelectedCell(null);
      setSelectedGate(null);
      setPendingPlacement(null);
      setSimulationResult(null);
      setTranspiled(null);
      setError("");
    } catch (importError) {
      setError(importError.message);
    }
  };

  const renderGate = (cell) => {
    if (!cell) return null;
    const name = cellGateName(cell);
    if (name === "measure") return "M";
    if (name === "reset") return "Reset";
    if (name === "barrier") return "—";
    if (MULTI_QUBIT_GATES.has(name)) {
      if (typeof cell === "string") return "●";
      if (cell.role === "target") return "⊕";
      if (cell.role?.includes("swap")) return "×";
      return "●";
    }
    return GATE_SYMBOLS[name] || name.toUpperCase().replace("SDG", "S†").replace("TDG", "T†");
  };

  return (
    <div className="circuit-page">
      <header className="circuit-header">
        <div className="circuit-title">
          <div className="circuit-title-icon"><Atom size={22} /></div>
          <div>
            <div className="composer-breadcrumb">WORKSPACE / CIRCUITS / <strong>UNTITLED CIRCUIT</strong></div>
            <h1>Quantum Composer</h1>
            <p>Design · simulate · understand</p>
          </div>
        </div>
        <div className="circuit-actions">
          <span className="engine-status"><i /> Aer simulator ready</span>
          <button type="button" className="clear-button" onClick={clearCircuit}>
            <RotateCcw size={16} /> Clear
          </button>
          <button type="button" className="run-circuit-button" onClick={runCircuit} disabled={loading}>
            <Play size={16} /> {loading ? "Simulating..." : "Run Circuit"}
          </button>
          <button type="button" className="clear-button" onClick={exportJupyter}>Export Jupyter</button>
          <button type="button" className="clear-button" onClick={transpileCircuit} disabled={loading}>
            <WandSparkles size={15} /> Transpile
          </button>
        </div>
      </header>

      {error && <div className="circuit-error" role="alert">{error}</div>}

      <div className="circuit-workspace">
        <aside className="gate-panel">
          <div className="panel-heading">
            <span className="panel-kicker">INSTRUCTIONS</span>
            <h2>Gate library</h2>
            <p>Drag an instruction onto a wire. Click to select.</p>
          </div>
          {GATE_GROUPS.map((group) => (
            <div className="gate-group" key={group.label}>
              <div className="gate-group-heading">{group.label}</div>
              <div className="gate-list">
                {group.gates.map((gate) => (
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
            </div>
          ))}

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
                      {paramLabels(selectedGroup.name)[index]}
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

        <QuantumCanvas
          circuit={circuit}
          selectedCell={selectedCell}
          onCellClick={handleCellClick}
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          renderGate={renderGate}
          multiQubitGates={MULTI_QUBIT_GATES}
          view={view}
          onViewChange={setView}
          qasm={openQasm}
          onAddQubit={addQubit}
          onRemoveQubit={removeQubit}
          canRemoveQubit={circuit.length > 1}
          qubitCapReached={circuit.length >= MAX_QUBITS}
        />
      </div>

      <div className="composer-toolbar">
        <ComposerAssistant circuit={createCircuitJSON(circuit)} />
      </div>
      <SimulationResults result={simulationResult} />
      {simulationResult && (
        <div className="circuit-visualizations">
          <ProbabilityChart result={simulationResult} />
          <BlochSphere result={simulationResult} />
        </div>
      )}
      {transpiled && (
        <section className="transpilation-panel">
          <div className="visualization-heading">
            <div><span className="eyebrow">QISKIT PIPELINE</span><h3><Code2 size={17} /> Transpiled circuit</h3></div>
            <span className="visualization-meta">{transpiled.original_gate_count} → {transpiled.transpiled_gate_count} gates</span>
          </div>
          <pre><code>{transpiled.qiskit_code}</code></pre>
        </section>
      )}
      <QiskitConverter circuit={createCircuitJSON(circuit)} onImport={importQiskit} />
    </div>
  );
}

export default CircuitLab;
