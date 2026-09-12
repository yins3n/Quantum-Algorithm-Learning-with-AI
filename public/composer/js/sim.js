"use strict";

// ---------------------------------------------------------------------------
// Quantum statevector simulator (OpenQASM 2.0 / qelib1 gate set).
// States are arrays of [re, im] amplitude pairs, length 2^n.
// ---------------------------------------------------------------------------

const C1 = [1, 0];
const C0 = [0, 0];
const CI = [0, 1]; // imaginary unit
const CI_N = [0, -1];
const CS = Math.SQRT1_2;

const GateLib = {
  I: [[C1, C0], [C0, C1]],
  H: [[[CS, 0], [CS, 0]], [[CS, 0], [-CS, 0]]],
  X: [[C0, C1], [C1, C0]],
  Y: [[C0, CI_N], [CI, C0]],
  Z: [[C1, C0], [C0, [-1, 0]]],
  S: [[C1, C0], [C0, CI]],
  SDG: [[C1, C0], [C0, CI_N]],
  T: [[C1, C0], [C0, [CS, CS]]],
  TDG: [[C1, C0], [C0, [CS, -CS]]],
  SX: [[[0.5, 0.5], [0.5, -0.5]], [[0.5, -0.5], [0.5, 0.5]]],
  SXDG: [[[0.5, -0.5], [0.5, 0.5]], [[0.5, 0.5], [0.5, -0.5]]],

  RX: (t) => [
    [[Math.cos(t / 2), 0], [0, -Math.sin(t / 2)]],
    [[0, -Math.sin(t / 2)], [Math.cos(t / 2), 0]],
  ],

  RY: (t) => [
    [[Math.cos(t / 2), 0], [Math.sin(t / 2), 0]],
    [[-Math.sin(t / 2), 0], [Math.cos(t / 2), 0]],
  ],
  RZ: (t) => [
    [[Math.cos(-t / 2), Math.sin(-t / 2)], C0],
    [C0, [Math.cos(t / 2), Math.sin(t / 2)]],
  ],
  P: (phi) => [
    [C1, C0],
    [C0, [Math.cos(phi), Math.sin(phi)]],
  ],
  U: (t, phi, lam) => [
    [[Math.cos(t / 2), 0], [-Math.cos(lam) * Math.sin(t / 2), -Math.sin(lam) * Math.sin(t / 2)]],
    [[Math.cos(phi) * Math.sin(t / 2), Math.sin(phi) * Math.sin(t / 2)], [Math.cos(phi + lam) * Math.cos(t / 2), Math.sin(phi + lam) * Math.cos(t / 2)]],
  ],
};

// complex helpers: entries are [re, im]
function cx(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1],
    a[0] * b[1] + a[1] * b[0],
  ];
}
function cadd(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}
function cscale(a, s) {
  return [a[0] * s, a[1] * s];
}

// ---------------------------------------------------------------------------
// Statevector
// ---------------------------------------------------------------------------

function newState(n) {
  const dim = 1 << n;
  const data = new Array(dim);
  for (let i = 0; i < dim; i++) data[i] = [0, 0];
  data[0] = [1, 0];
  return { n, dim, data };
}

// Apply a 2x2 matrix U (entries as [re,im]) to qubit q.
function applySingle(state, n, U, q) {
  const { dim, data } = state;
  const step = 1 << q;
  for (let i = 0; i < dim; i += step << 1) {
    for (let j = i; j < i + step; j++) {
      const z = data[j];
      const o = data[j + step];
      data[j] = cadd(cx(U[0][0], z), cx(U[0][1], o));
      data[j + step] = cadd(cx(U[1][0], z), cx(U[1][1], o));
    }
  }
}

// Controlled-U: applies U to target when control bit is 1.
// Each (control=1) pair is processed exactly once: we only act on the state
// whose target bit is 0, so involutive controlled gates are not applied twice.
function applyControlled(state, n, c, t, U) {
  const { dim, data } = state;
  const tstep = 1 << t;
  for (let i = 0; i < dim; i++) {
    if (!((i >> c) & 1)) continue;
    if ((i >> t) & 1) continue; // handle the pair from the target=0 side
    const j = i ^ tstep; // same index with target bit flipped
    const z = data[j];
    const o = data[i];
    data[j] = cadd(cx(U[0][0], z), cx(U[0][1], o));
    data[i] = cadd(cx(U[1][0], z), cx(U[1][1], o));
  }
}

// CZ: phase flip when both control and target are 1.
function applyCZ(state, c, t) {
  const { data } = state;
  const both = (1 << c) | (1 << t);
  for (let i = 0; i < state.dim; i++) {
    if ((i & both) === both) {
      data[i][0] = -data[i][0];
      data[i][1] = -data[i][1];
    }
  }
}

function applyToffoli(state, ca, cb, t) {
  const { data } = state;
  const tabs = 1 << t;
  for (let i = 0; i < state.dim; i++) {
    if ((i >> ca) & 1 && (i >> cb) & 1 && !((i >> t) & 1)) {
      const k = i ^ tabs;
      const tmp = data[i];
      data[i] = data[k];
      data[k] = tmp;
    }
  }
}

function applySwapOp(state, a, b) {
  const { data } = state;
  const ba = 1 << a;
  const bb = 1 << b;
  for (let i = 0; i < state.dim; i++) {
    // canonical orientation: qubit a is 0, qubit b is 1 -> swap once
    if (!((i >> a) & 1) && ((i >> b) & 1)) {
      const k = i ^ ba ^ bb;
      const tmp = data[i];
      data[i] = data[k];
      data[k] = tmp;
    }
  }
}

function getMatrix(g, p) {
  switch (g) {
    case "id":
      return GateLib.I;
    case "h":
      return GateLib.H;
    case "x":
      return GateLib.X;
    case "y":
      return GateLib.Y;
    case "z":
      return GateLib.Z;
    case "s":
      return GateLib.S;
    case "sdg":
      return GateLib.SDG;
    case "t":
      return GateLib.T;
    case "tdg":
      return GateLib.TDG;
    case "sx":
      return GateLib.SX;
    case "sxdg":
      return GateLib.SXDG;
    case "rx":
      return GateLib.RX(p.theta);
    case "ry":
      return GateLib.RY(p.theta);
    case "rz":
      return GateLib.RZ(p.theta);
    case "p":
      return GateLib.P(p.theta);
    case "u":
    case "u3":
      return GateLib.U(p.theta, p.phi, p.lambda);
    default:
      return null;
  }
}

// Simulate a circuit: { qubits:[...], ops:[{gateKey,targets:[...],params,col}] }
function simulateCircuit(circuit) {
  const n = circuit.qubits.length;
  const state = newState(n);
  const byCol = {};
  const cols = [];
  for (const op of circuit.ops) {
    if (!op.gateKey || op.gateKey === "measure" || op.gateKey === "barrier") continue;
    if (!cols[op.col]) cols[op.col] = [];
    cols[op.col].push(op);
  }
  for (let c = 0; c < cols.length; c++) {
    const group = cols[c];
    if (!group) continue;
    for (const op of group) applyOp(state, n, op);
  }
  const probs = state.data.map((x) => x[0] * x[0] + x[1] * x[1]);
  return { state, probs };
}

function applyOp(state, n, op) {
  const g = op.gateKey;
  const t = op.targets;
  const p = op.params || {};
  switch (g) {
    case "cx":
      applyControlled(state, n, t[0], t[1], GateLib.X);
      break;
    case "ch":
      applyControlled(state, n, t[0], t[1], GateLib.H);
      break;
    case "crz":
      applyControlled(state, n, t[0], t[1], GateLib.RZ(p.theta));
      break;
    case "cp":
      applyControlled(state, n, t[0], t[1], GateLib.P(p.theta));
      break;
    case "cz":
      applyCZ(state, t[0], t[1]);
      break;
    case "ccx":
      applyToffoli(state, t[0], t[1], t[2]);
      break;
    case "swap":
      applySwapOp(state, t[0], t[1]);
      break;
    default: {
      const U = getMatrix(g, p);
      if (U) applySingle(state, n, U, t[0]);
    }
  }
}

// Sample `shots` measurement outcomes from probs (number of states).
function sampleCounts(probs, shots) {
  const n = probs.length;
  const counts = {};
  for (let s = 0; s < shots; s++) {
    let r = Math.random();
    let acc = 0;
    let sel = n - 1;
    for (let i = 0; i < n; i++) {
      acc += probs[i];
      if (r < acc) {
        sel = i;
        break;
      }
    }
    counts[sel] = (counts[sel] || 0) + 1;
  }
  return counts;
}

function probsOfQubit(probs, n, q) {
  let p1 = 0;
  for (let i = 0; i < probs.length; i++) if ((i >> q) & 1) p1 += probs[i];
  return p1;
}