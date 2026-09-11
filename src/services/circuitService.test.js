import test from "node:test";
import assert from "node:assert/strict";
import { createCircuitJSON, createEmptyCircuit, getCircuitGroups, validateCircuit } from "./circuitService.js";

test("serializes a Bell circuit in gate order", () => {
  const circuit = createEmptyCircuit(2, 2);
  circuit[0][0] = { id: "h", name: "h", params: [], order: 0 };
  circuit[0][1] = { id: "cx", name: "cx", params: [], order: 0 };
  circuit[1][1] = { id: "cx", name: "cx", params: [], order: 1 };
  assert.deepEqual(createCircuitJSON(circuit, 128), {
    num_qubits: 2,
    shots: 128,
    gates: [
      { name: "h", qubits: [0], params: [] },
      { name: "cx", qubits: [0, 1], params: [] },
    ],
  });
});

test("rejects incomplete multi-qubit placement", () => {
  const circuit = createEmptyCircuit(2, 1);
  circuit[0][0] = { id: "cx", name: "cx", params: [], order: 0, pending: true };
  assert.equal(validateCircuit(circuit).valid, false);
});

test("groups gates by stable id", () => {
  const circuit = createEmptyCircuit(2, 1);
  circuit[0][0] = { id: "swap", name: "swap", params: [], order: 0 };
  circuit[1][0] = { id: "swap", name: "swap", params: [], order: 1 };
  assert.equal(getCircuitGroups(circuit).length, 1);
});
