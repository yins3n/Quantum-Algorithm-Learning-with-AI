import { useState } from "react";
import SimulationResults from "../components/circuit/SimulationResults";

import {
  NUMBER_OF_QUBITS,
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


  /* =========================
     CELL CLICK
  ========================= */

  const handleCellClick = (qubit, column) => {

    // If a gate is selected, place it
    if (selectedGate) {

      const newCircuit = circuit.map((row) => [...row]);

      newCircuit[qubit][column] = selectedGate;

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

    newCircuit[qubit][column] = null;

    setCircuit(newCircuit);

    setSelectedCell(null);
    setSelectedGate(null);
  };


  /* =========================
     CLEAR CIRCUIT
  ========================= */

  const clearCircuit = () => {

    setCircuit(createEmptyCircuit());

    setSelectedGate(null);

    setSelectedCell(null);

    setSimulationResult(null);
  };


  /* =========================
     COUNT GATES
  ========================= */

  const gateCount = circuit
    .flat()
    .filter(Boolean)
    .length;


  /* =========================
     RUN CIRCUIT
  ========================= */

  const runCircuit = () => {

    const circuitJSON = createCircuitJSON(circuit);

    const validation = validateCircuit(circuit);

    if (!validation.valid) {

      alert(validation.message);

      return;
    }

    console.log("Quantum Circuit JSON:");

    console.log(
      JSON.stringify(circuitJSON, null, 2)
    );


    /* =========================
       TEMPORARY SIMULATION DATA

       This will later be replaced
       by the real backend response.
    ========================= */

    const demoResult = {

      probabilities: {
        "000": 0.5,
        "111": 0.5,
      },

      statevector: [
        "0.7071",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0.7071",
      ],
    };


    setSimulationResult(demoResult);

    alert("Circuit simulated successfully!");
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
            className="clear-button"
            onClick={clearCircuit}
          >

            <RotateCcw size={16} />

            Clear

          </button>


          <button
            className="run-circuit-button"
            onClick={runCircuit}
          >

            <Play size={16} />

            Run Circuit

          </button>

        </div>

      </header>


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
              Select a gate and click a circuit slot
            </p>

          </div>


          <div className="gate-list">

            {GATES.map((gate) => (

              <div
                key={gate.name}
                className={`gate-item ${
                  selectedGate === gate.name
                    ? "selected-gate-item"
                    : ""
                }`}
                onClick={() =>
                  setSelectedGate(gate.name)
                }
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

              </div>

            ))}

          </div>


          {/* =================
              SELECTED GATE
          ================= */}

          {selectedGate && (

            <div className="selected-gate">

              <span>
                Selected Gate
              </span>

              <strong>
                {selectedGate}
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
              Select a quantum gate from this
              panel and click a circuit slot.
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
                {NUMBER_OF_QUBITS} qubits
              </small>

            </div>


            <div className="circuit-stats">

              <span>
                Qubits:
                <strong>
                  {NUMBER_OF_QUBITS}
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
                Qubit
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

                                <div className="placed-gate">

                                  {gate}

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
                Select a quantum gate from the
                left panel and click a circuit slot.
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