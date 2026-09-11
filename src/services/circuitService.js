// Number of qubits in our circuit
export const NUMBER_OF_QUBITS = 3;

// Number of gate positions/columns
export const NUMBER_OF_COLUMNS = 8;


/*
  Create an empty quantum circuit.

  Example:

  [
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null]
  ]

  Each row represents one qubit.
*/
export function createEmptyCircuit() {

  const circuit = [];

  for (let qubit = 0; qubit < NUMBER_OF_QUBITS; qubit++) {

    const row = [];

    for (
      let column = 0;
      column < NUMBER_OF_COLUMNS;
      column++
    ) {
      row.push(null);
    }

    circuit.push(row);
  }

  return circuit;
}


/*
  Convert our visual circuit into
  backend-friendly JSON.
*/
export function createCircuitJSON(circuit) {

  const gates = [];

  circuit.forEach((row, qubit) => {

    row.forEach((gate, column) => {

      if (gate) {

        gates.push({
          gate: gate,
          qubit: qubit,
          column: column
        });

      }

    });

  });


  return {
    qubits: NUMBER_OF_QUBITS,
    columns: NUMBER_OF_COLUMNS,
    gates: gates
  };
}


/*
  Basic validation before sending
  the circuit to the backend.
*/
export function validateCircuit(circuit) {

  if (!circuit) {
    return {
      valid: false,
      message: "Circuit is empty."
    };
  }


  if (circuit.length !== NUMBER_OF_QUBITS) {
    return {
      valid: false,
      message: "Invalid number of qubits."
    };
  }


  return {
    valid: true,
    message: "Circuit is valid."
  };
}