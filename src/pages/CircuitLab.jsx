import { useState } from "react";
import SimulationResults from "../components/circuit/SimulationResults";
import { api } from "../services/api";

import {
  NUMBER_OF_COLUMNS,
  createEmptyCircuit,
  createCircuitJSON,
  validateCircuit,
} from "../services/circuitService";

import {
  Play,
  RotateCcw,
  Plus,
  Atom,
  Trash2,
} from "lucide-react";

import "./CircuitLab.css";


/* =========================
   QUANTUM GATES
========================= */

const GATES = [
  {
    name: "H",
    label: "Hadamard",
    description: "Creates superposition",
  },
  {
    name: "X",
    label: "Pauli-X",
    description: "Quantum NOT gate",
  },
  {
    name: "Y",
    label: "Pauli-Y",
    description: "Y rotation",
  },
  {
    name: "Z",
    label: "Pauli-Z",
    description: "Phase flip",
  },
  {
    name: "CNOT",
    label: "Controlled-X",
    description: "Two-qubit gate",
  },
];


/* =========================
   CIRCUIT LAB
========================= */

function CircuitLab() {

  /* =========================
     CIRCUIT STATE
  ========================= */

  const [circuit, setCircuit] = useState(
    createEmptyCircuit()
  );

  const [selectedGate, setSelectedGate] = useState(null);

  const [selectedCell, setSelectedCell] = useState(null);

  const [simulationResult, setSimulationResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingCnot, setPendingCnot] = useState(null);


  /* =========================
     CELL CLICK
  ========================= */

  const handleCellClick = (qubit, column) => {

    // If a gate is selected, place it
    if (selectedGate) {

      const newCircuit = circuit.map((row) => [...row]);
      if (selectedGate === "CNOT") {
        if (!pendingCnot) {
          newCircuit[qubit][column] = "CNOT";
          setPendingCnot({ qubit, column });
        } else if (pendingCnot.column === column && pendingCnot.qubit !== qubit) {
          newCircuit[qubit][column] = "CNOT";
          setPendingCnot(null);
        } else {
          setError("Place the CNOT control and target in the same column on different qubits.");
          return;
        }
      } else {
        newCircuit[qubit][column] = selectedGate;
      }

      setCircuit(newCircuit);

      setSelectedCell({
        qubit,
        column,
      });

      return;
    }

    // Otherwise select the cell
    setSelectedCell({
      qubit,
      column,
    });
  };


  /* =========================
     REMOVE GATE
  ========================= */

  const removeGate = () => {

    if (!selectedCell) {
      return;
    }

    const {
      qubit,
      column,
    } = selectedCell;

    const newCircuit = circuit.map((row) => [...row]);

    if (newCircuit[qubit][column]?.toLowerCase() === "cnot") {
      newCircuit.forEach((row) => {
        if (row[column]?.toLowerCase() === "cnot") row[column] = null;
      });
    } else {
      newCircuit[qubit][column] = null;
    }

    setCircuit(newCircuit);

    setSelectedCell(null);
    setSelectedGate(null);
    setPendingCnot(null);
  };


  /* =========================
     CLEAR CIRCUIT
  ========================= */

  const clearCircuit = () => {

    setCircuit(createEmptyCircuit());

    setSelectedGate(null);

    setSelectedCell(null);

    setSimulationResult(null);
    setError("");
    setPendingCnot(null);
  };


  /* =========================
     COUNT GATES
  ========================= */

  const gateCount = circuit
    .flat()
    .filter(Boolean)
    .length;

  const cnotLinks = Array.from({ length: NUMBER_OF_COLUMNS }, (_, column) => {
    const qubits = circuit
      .map((row, qubit) => row[column] === "CNOT" ? qubit : null)
      .filter((qubit) => qubit !== null);
    return qubits.length === 2
      ? { column, control: qubits[0], target: qubits[1] }
      : null;
  }).filter(Boolean);


  /* =========================
     RUN CIRCUIT
  ========================= */

  const runCircuit = async () => {

    const circuitJSON = createCircuitJSON(circuit);

    const validation = validateCircuit(circuit);

    if (!validation.valid) {

      setError(validation.message);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setSimulationResult(await api.simulate(circuitJSON));
    } catch (requestError) {
      setSimulationResult(null);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };


  /* =========================
     UI
  ========================= */

  return (

    <div className="circuit-page">


      {/* =====================
          HEADER
      ===================== */}

      <header className="circuit-header">

        <div className="circuit-title">

          <div className="circuit-title-icon">
            <Atom size={22} />
          </div>

          <div>

            <h1>
              Circuit Lab
            </h1>

            <p>
              Build and experiment with quantum circuits
            </p>

          </div>

        </div>


        <div className="circuit-actions">

          <button
            type="button"
            className="clear-button"
            onClick={clearCircuit}
          >

            <RotateCcw size={16} />

            Clear

          </button>


          <button
            type="button"
            className="run-circuit-button"
            onClick={runCircuit}
            disabled={loading}
          >

            <Play size={16} />

            {loading ? "Simulating..." : "Run Circuit"}

          </button>

        </div>

      </header>

      {error && <div className="circuit-error" role="alert">{error}</div>}


      {/* =====================
          WORKSPACE
      ===================== */}

      <div className="circuit-workspace">


        {/* =================
            GATE PALETTE
        ================= */}

        <aside className="gate-panel">

          <div className="panel-heading">

            <h2>
              Quantum Gates
            </h2>

            <p>
              Composer-style grid · choose a gate and click a slot
            </p>

          </div>


          <div className="gate-list">

            {GATES.map((gate) => (

              <button
                key={gate.name}
                type="button"
                className={`gate-item ${
                  selectedGate === gate.name
                    ? "selected-gate-item"
                    : ""
                }`}
                onClick={() =>
                  setSelectedGate((current) => current === gate.name ? null : gate.name)
                }
                aria-pressed={selectedGate === gate.name}
              >

                <div className="gate-symbol">
                  {gate.name}
                </div>


                <div className="gate-info">

                  <strong>
                    {gate.label}
                  </strong>

                  <span>
                    {gate.description}
                  </span>

                </div>


                <Plus size={15} />

              </button>

            ))}

          </div>


          {/* =================
              SELECTED GATE
          ================= */}

          {selectedGate && (

            <div className="selected-gate">

              <span>{pendingCnot ? "CNOT placement" : "Selected gate"}</span>

              <strong>
                {pendingCnot ? "Choose target" : selectedGate}
              </strong>

            </div>

          )}


          {/* =================
              REMOVE
          ================= */}

          {selectedCell && (

            <button
              className="remove-gate-button"
              onClick={removeGate}
            >

              <Trash2 size={15} />

              Remove Selected Gate

            </button>

          )}


          {/* =================
              HELP
          ================= */}

          <div className="gate-help">

            <strong>
              💡 Tip
            </strong>

            <p>
              Choose a gate, then click a slot in the grid. CNOT uses two
              slots in one column; click the second qubit to complete it.
            </p>

          </div>

        </aside>


        {/* =================
            CIRCUIT
        ================= */}

        <div className="circuit-canvas">


          {/* =================
              TOP BAR
          ================= */}

          <div className="canvas-topbar">

            <div>

              <span>
                Quantum Circuit
              </span>

              <small>
                {circuit.length} qubits · {NUMBER_OF_COLUMNS} steps
              </small>

            </div>


            <div className="circuit-stats">

              <span>
                Qubits:
                <strong>
                  {circuit.length}
                </strong>
              </span>

              <span>
                Gates:
                <strong>
                  {gateCount}
                </strong>
              </span>

            </div>

          </div>


          {/* =================
              CIRCUIT AREA
          ================= */}

          <div className="quantum-circuit">


            {/* COLUMN NUMBERS */}

            <div className="column-header">

              <div className="qubit-header">
                Qubit / step
              </div>


              {Array.from(
                {
                  length: NUMBER_OF_COLUMNS,
                },
                (_, column) => (

                  <div
                    key={column}
                    className="column-number"
                  >
                    {column + 1}
                  </div>

                )
              )}

            </div>


            {/* =================
                QUBIT ROWS
            ================= */}

            {circuit.map(
              (row, qubit) => (

                <div
                  className="qubit-row"
                  key={qubit}
                >


                  {/* QUBIT LABEL */}

                  <div className="qubit-label">

                    q<sub>{qubit}</sub>

                  </div>


                  {/* WIRE */}

                  <div className="wire-area">

                    <div className="quantum-wire"></div>


                    {/* CELLS */}

                    <div className="circuit-cells">

                      {row.map(
                        (gate, column) => {

                          const isSelected =
                            selectedCell?.qubit === qubit &&
                            selectedCell?.column === column;
                          const cnotQubits = circuit
                            .map((otherRow, index) => otherRow[column] === "CNOT" ? index : null)
                            .filter((index) => index !== null);


                          return (

                            <div
                              key={column}
                              data-qubit={qubit}
                              data-column={column}
                              className={`circuit-cell ${
                                isSelected
                                  ? "selected-cell"
                                  : ""
                              }`}
                              onClick={() =>
                                handleCellClick(
                                  qubit,
                                  column
                                )
                              }
                            >

                              {gate && (
                                <div className={`placed-gate ${gate === "CNOT" ? "placed-cnot" : ""}`}>
                                  {gate === "CNOT"
                                    ? (cnotQubits[0] === qubit ? "●" : "⊕")
                                    : gate}
                                </div>
                              )}

                            </div>

                          );

                        }
                      )}

                    </div>

                  </div>

                </div>

              )
            )}

            <div className="cnot-connectors" aria-hidden="true">
              {cnotLinks.map(({ column, control, target }) => (
                <span
                  className="cnot-connector"
                  key={`${column}-${control}-${target}`}
                  style={{
                    "--connector-column": column,
                    "--connector-control": control,
                    "--connector-span": target - control,
                  }}
                />
              ))}
            </div>

          </div>


          {/* =================
              EMPTY MESSAGE
          ================= */}

          {gateCount === 0 && (

            <div className="empty-circuit">

              <div className="empty-icon">

                <Plus size={25} />

              </div>


              <h3>
                Build your circuit
              </h3>


              <p>
                Select a gate from the palette, then click a slot on a wire.
              </p>

            </div>

          )}

        </div>

      </div>


      {/* =========================
          SIMULATION RESULTS
      ========================= */}

      <SimulationResults
        result={simulationResult}
      />


    </div>
  );
}


export default CircuitLab;