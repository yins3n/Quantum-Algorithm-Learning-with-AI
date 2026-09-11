export const NUMBER_OF_QUBITS = 3;
export const NUMBER_OF_COLUMNS = 8;

export function createEmptyCircuit(numQubits = NUMBER_OF_QUBITS, columns = NUMBER_OF_COLUMNS) {
  return Array.from({ length: numQubits }, () => Array(columns).fill(null));
}

export function createCircuitJSON(circuit, shots = 1024) {
  const gates = [];
  const seenCnot = new Set();

  circuit.forEach((row, qubit) => row.forEach((gate, column) => {
    if (!gate) return;
    const name = gate.toLowerCase();
    if (name === "cnot") {
      const key = `${column}:cnot`;
      if (seenCnot.has(key)) return;
      const targets = circuit
        .map((otherRow, index) => otherRow[column]?.toLowerCase() === "cnot" ? index : null)
        .filter((index) => index !== null);
      if (targets.length !== 2) return;
      seenCnot.add(key);
      gates.push({ name: "cx", qubits: targets, params: [] });
      return;
    }
    gates.push({ name, qubits: [qubit], params: [] });
  }));

  return { num_qubits: circuit.length, shots, gates };
}

export function validateCircuit(circuit) {
  if (!Array.isArray(circuit) || circuit.length === 0) {
    return { valid: false, message: "Circuit is empty." };
  }
  for (const row of circuit) {
    if (!Array.isArray(row)) return { valid: false, message: "Invalid circuit rows." };
  }
  for (let column = 0; column < (circuit[0]?.length || 0); column += 1) {
    const cnotCount = circuit.filter((row) => row[column]?.toLowerCase() === "cnot").length;
    if (cnotCount === 1) {
      return { valid: false, message: "CNOT requires a control and target. Click a second qubit in the same column." };
    }
    if (cnotCount > 2) {
      return { valid: false, message: "CNOT can use exactly two qubits." };
    }
  }
  return { valid: true, message: "Circuit is valid." };
}
