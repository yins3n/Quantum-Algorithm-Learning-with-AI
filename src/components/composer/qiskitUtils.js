// DSL name -> { patch: fn of (name, params, qubits) -> qiskit line }
function qiskitCall(gate) {
  const { name, qubits, params = [] } = gate;
  const targets = qubits.join(", ");
  switch (name) {
    case "measure":
      return `qc.measure(${qubits[0]}, ${qubits[0]})`;
    case "reset":
      return `qc.reset(${qubits[0]})`;
    case "barrier":
      return `qc.barrier(${targets})`;
    case "i":
      return `qc.id(${qubits[0]})`;
    case "u1":
      return `qc.p(${params[0]}, ${qubits[0]})`;
    case "u2":
      return `qc.u(np.pi / 2, ${params[0]}, ${params[1]}, ${qubits[0]})`;
    case "u3":
    case "u":
      return `qc.u(${[...params, qubits[0]].join(", ")})`;
    case "r":
      return `qc.r(${[...params, qubits[0]].join(", ")})`;
    default:
      return `qc.${name}(${[...params, targets].filter(Boolean).join(", ")})`;
  }
}

export function circuitToQiskit(circuit) {
  const lines = [`from qiskit import QuantumCircuit`, `import numpy as np`, "", `qc = QuantumCircuit(${circuit.num_qubits})`];
  (circuit.gates || []).forEach((gate) => {
    lines.push(qiskitCall(gate));
  });
  return [...lines, "", "qc.measure_all()"].join("\n");
}

const GATE_ARITY = {
  h: [0, 1], x: [0, 1], y: [0, 1], z: [0, 1], i: [0, 1], id: [0, 1],
  s: [0, 1], sdg: [0, 1], t: [0, 1], tdg: [0, 1], sx: [0, 1], sxdg: [0, 1],
  rx: [1, 1], ry: [1, 1], rz: [1, 1], u: [3, 1], u1: [1, 1], u2: [2, 1], u3: [3, 1],
  p: [1, 1], r: [2, 1], reset: [0, 1],
  cx: [0, 2], cy: [0, 2], cz: [0, 2], ch: [0, 2], swap: [0, 2],
  cp: [1, 2], crx: [1, 2], cry: [1, 2], crz: [1, 2], ecr: [0, 2], csx: [0, 2],
  ccx: [0, 3], cswap: [0, 3],
};

const DSL_ALIAS = { p: "u1", id: "i", u: "u3" };

export function parseQiskit(source) {
  const header = source.match(/QuantumCircuit\s*\(\s*(\d+)/i);
  if (!header) throw new Error("Add a QuantumCircuit(n) declaration first.");
  const gates = [];
  const pattern = /^\s*(?:qc|circuit)\.([a-z][a-z0-9_]*)\s*\(([^)]*)\)/gim;
  let match;
  while ((match = pattern.exec(source))) {
    const name = match[1].toLowerCase();
    if (name === "measure_all") continue;
    const values = match[2].split(",").map((value) => value.trim()).filter(Boolean);

    if (name === "barrier") {
      const qubits = values.map(Number).filter(Number.isInteger);
      if (qubits.length) gates.push({ name: "barrier", qubits, params: [] });
      continue;
    }
    if (name === "measure") {
      gates.push({ name: "measure", qubits: [Number(values[0])], params: [] });
      continue;
    }

    const arity = GATE_ARITY[name];
    if (!arity) continue;
    const [paramCount, qubitCount] = arity;
    const qubits = values.slice(values.length - qubitCount).map(Number);
    const params = values.slice(0, values.length - qubitCount);
    if (qubits.some((qubit) => !Number.isInteger(qubit)) || qubits.length !== qubitCount) {
      throw new Error(`Could not read qubits for qc.${name}(...).`);
    }
    if (params.length !== paramCount) throw new Error(`qc.${name}(...) needs ${paramCount} parameter(s).`);
    gates.push({ name: DSL_ALIAS[name] || name, qubits, params: params.map(evalParam) });
  }
  if (!gates.length) throw new Error("No supported gate calls found.");
  return { num_qubits: Number(header[1]), gates };
}

function evalParam(value) {
  const cleaned = ` ${value} `
    .replace(/np\s*\.\s*pi\b/g, ` ${Math.PI.toFixed(15)} `)
    .replace(/pi\b/g, String(Math.PI));
  const result = Number(Function(`"use strict"; return (${cleaned});`)());
  if (!Number.isFinite(result)) throw new Error(`Could not read parameter '${value}'.`);
  return result;
}

export function circuitToQasm3(circuit) {
  const lines = ["OPENQASM 3.0;", 'include "stdgates.inc";'];
  const names = new Set((circuit.gates || []).map((gate) => gate.name));
  if (names.has("sxdg")) lines.push("gate sxdg q { s q; h q; s q; }");
  if (names.has("ecr")) lines.push("gate ecr q0, q1 { s q0; sx q1; cx q0, q1; x q0; }");
  lines.push(`bit[${circuit.num_qubits}] c;`);
  lines.push(`qubit[${circuit.num_qubits}] q;`);
  (circuit.gates || []).forEach(({ name, qubits, params = [] }) => {
    const targets = qubits.map((qubit) => `q[${qubit}]`).join(", ");
    switch (name) {
      case "measure":
        lines.push(`c[${qubits[0]}] = measure q[${qubits[0]}];`);
        break;
      case "reset":
        lines.push(`reset q[${qubits[0]}];`);
        break;
      case "barrier":
        lines.push(`barrier ${targets};`);
        break;
      case "i":
        lines.push(`id q[${qubits[0]}];`);
        break;
      case "u1":
        lines.push(`p(${params[0]}) q[${qubits[0]}];`);
        break;
      case "u2":
        lines.push(`U(pi/2, ${params[0]}, ${params[1]}) q[${qubits[0]}];`);
        break;
      case "u":
      case "u3":
        lines.push(`U(${params.join(", ")}) q[${qubits[0]}];`);
        break;
      case "r":
        lines.push(`U(${params[0]}, -pi/2 + ${params[1]}, pi/2 - ${params[1]}) q[${qubits[0]}];`);
        break;
      default:
        lines.push(`${name}${params.length ? `(${params.join(", ")})` : ""} ${targets};`);
    }
  });
  return lines.join("\n");
}