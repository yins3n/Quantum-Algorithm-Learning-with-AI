"use strict";

/* ---------------------------------------------------------------------------
   Quantum Composer: application logic
--------------------------------------------------------------------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- Gate catalog (palette) ----------
const GATE_CATALOG = {
  h: { name: "Hadamard", sym: "H", kind: "single", params: [], color: "#be95ff", desc: "Creates a superposition: maps |0> to (|0>+|1>)/√2." },
  x: { name: "Pauli-X (NOT)", sym: "X", kind: "single", params: [], color: "#fa4d56", desc: "Bit flip: |0>↔|1>, like a classical NOT gate." },
  y: { name: "Pauli-Y", sym: "Y", kind: "single", params: [], color: "#ff832b", desc: "Rotates |ψ> by π around the Y-axis of the Bloch sphere." },
  z: { name: "Pauli-Z", sym: "Z", kind: "single", params: [], color: "#08bdba", desc: "Phase flip: flips the sign of the |1> amplitude." },
  s: { name: "Phase (S)", sym: "S", kind: "single", params: [], color: "#78a9ff", desc: "Rotates by π/2 around the Z-axis." },
  sdg: { name: "Phase dagger", sym: "S†", kind: "single", params: [], color: "#78a9ff", desc: "Inverse of the S gate: rotates by −π/2 around Z." },
  t: { name: "T", sym: "T", kind: "single", params: [], color: "#6fdc8c", desc: "Rotates by π/4 around the Z-axis." },
  tdg: { name: "T dagger", sym: "T†", kind: "single", params: [], color: "#6fdc8c", desc: "Inverse of T: rotates by −π/4 around Z." },
  sx: { name: "√X", sym: "√X", kind: "single", params: [], color: "#f1c21b", desc: "Square root of X: X = SX·SX." },
  sxdg: { name: "√X dagger", sym: "√X†", kind: "single", params: [], color: "#f1c21b", desc: "Inverse square root of X." },
  id: { name: "Identity", sym: "I", kind: "single", params: [], color: "#8d9199", desc: "Identity gate: does nothing (1 unit of time)." },
  rx: { name: "RX", sym: "RX", kind: "rotation", params: { theta: [0, "<i>θ</i>"] }, color: "#3ddbd9", desc: "Rotation by θ around the X-axis of the Bloch sphere." },
  ry: { name: "RY", sym: "RY", kind: "rotation", params: { theta: [0, "<i>θ</i>"] }, color: "#3ddbd9", desc: "Rotation by θ around the Y-axis." },
  rz: { name: "RZ", sym: "RZ", kind: "rotation", params: { theta: [0, "<i>θ</i>"] }, color: "#3ddbd9", desc: "Rotation by θ around the Z-axis." },
  p: { name: "Phase", sym: "P", kind: "rotation", params: { theta: [0, "<i>φ</i>"] }, color: "#3ddbd9", desc: "Adds a relative phase e^{iφ} to the |1> amplitude." },
  u: { name: "U", sym: "U", kind: "rotation3", params: { theta: [0, "<i>θ</i>"], phi: [0, "<i>φ</i>"], lambda: [0, "<i>λ</i>"] }, color: "#3ddbd9", desc: "General single-qubit unitary U(θ, φ, λ)." },
  cx: { name: "CNOT", sym: "CX", kind: "1-to-2", params: [], color: "#8a3ffc", desc: "Controlled-X / CNOT: flips the target iff the control is |1>." },
  cz: { name: "CZ", sym: "CZ", kind: "1-to-2", params: [], color: "#8a3ffc", desc: "Controlled-Z: applies Z on target iff control is |1>." },
  ch: { name: "CH", sym: "CH", kind: "1-to-2", params: [], color: "#8a3ffc", desc: "Controlled-Hadamard." },
  crz: { name: "CRZ", sym: "CRZ", kind: "rotation-1to2", params: { theta: [0, "<i>θ</i>"] }, color: "#8a3ffc", desc: "Controlled-RZ." },
  cp: { name: "CP", sym: "CP", kind: "rotation-1to2", params: { theta: [0, "<i>φ</i>"] }, color: "#8a3ffc", desc: "Controlled-Phase: controlled-P by φ." },
  swap: { name: "SWAP", sym: "X", kind: "2-qubit", params: [], color: "#4589ff", desc: "Swaps the states of two qubits." },
  ccx: { name: "Toffoli", sym: "X", kind: "2-to-3", params: [], color: "#4589ff", desc: "CCNOT / Toffoli: flips target iff both controls are |1>." },
  measure: { name: "Measure", sym: "M", kind: "measure", params: [], color: "#4589ff", desc: "Entangling measurement into a classical register." },
};
const SINGLE_KEYS = ["h", "x", "y", "z", "s", "sdg", "t", "tdg", "sx", "sxdg"];
const ROT_KEYS = ["rx", "ry", "rz", "p", "u"];
const MULTI_KEYS = ["cx", "cz", "ch", "crz", "cp", "swap", "ccx"];

const PALETTE_GROUPS = [
  { title: "Single-qubit gates", keys: [...SINGLE_KEYS] },
  { title: "Rotations", keys: [...ROT_KEYS] },
  { title: "Two-qubit gates", keys: ["cx", "cz", "ch", "crz", "cp", "swap"] },
  { title: "Three-qubit gates", keys: ["ccx"] },
  { title: "Measurements", keys: ["measure"] },
];

// multi-qubit target cardinality
const MULTI_QUIRK = {
  cx: 2, cz: 2, ch: 2, crz: 2, cp: 2, swap: 2, ccx: 3,
};

// ---------- SVG helpers ----------
const SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, children = []) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

// ---------- Circuit model ----------
const state = {
  name: "Untitled circuit",
  qubits: [{ name: "q0" }, { name: "q1" }],
  classics: [],
  ops: [], // {id, gateKey, targets:[..], params:{..}, col}
  nextId: 1,
  selectedId: null,
  undoStack: [],
  redoStack: [],
};

const GEOM = {
  boxW: 34,
  boxH: 34,
  rowH: 72,
  colStep: 60,
  wirePadTop: 40,
  wirePadBottom: 50,
  wirePadLeft: 210,
  rightPad: 90,
  measuredW: 90,
};

function wireY(i) {
  return GEOM.wirePadTop + i * GEOM.rowH;
}
function colX(c) {
  return GEOM.wirePadLeft + c * GEOM.colStep + GEOM.colStep / 2;
}
function maxCol() {
  let m = -1;
  for (const op of state.ops) m = Math.max(m, op.col);
  return m;
}
function opsOn(qubitIdx) {
  return state.ops.filter((o) => o.targets.includes(qubitIdx));
}
function opsTouching(targets) {
  return state.ops.filter((o) => o.targets.some((t) => targets.includes(t)));
}
function snapshot() {
  return JSON.stringify({ qubits: state.qubits.length, classics: state.classics.length, ops: state.ops, name: state.name });
}
function pushHistory() {
  state.undoStack.push(snapshot());
  if (state.undoStack.length > 200) state.undoStack.shift();
  state.redoStack = [];
  updateSaveButtons();
}
function restoreSnapshot(s) {
  const d = JSON.parse(s);
  state.qubits = Array.from({ length: d.qubits }, (_, i) => ({ name: "q" + i }));
  state.classics = Array.from({ length: d.classics }, (_, i) => ({ name: "c" + i }));
  state.ops = d.ops;
  state.name = d.name || "Untitled circuit";
  $("#circuit-name").value = state.name;
  state.selectedId = null;
}
function undo() {
  if (!state.undoStack.length) return;
  state.redoStack.push(snapshot());
  restoreSnapshot(state.undoStack.pop());
  afterCircuitChange({ code: true, vis: true, select: true });
}
function redo() {
  if (!state.redoStack.length) return;
  state.undoStack.push(snapshot());
  restoreSnapshot(state.redoStack.pop());
  afterCircuitChange({ code: true, vis: true, select: true });
}
function updateSaveButtons() {
  $("#save-btn").disabled = false;
}

// compact columns (left alignment)
function compactColumns() {
  const ordered = [...state.ops].sort((a, b) => a.col - b.col || a.targets[0] - b.targets[0]);
  let col = 0;
  ordered.forEach((o) => (o.col = col++));
}

function placeGate(gateKey, targets, params, desiredCol) {
  const spec = GATE_CATALOG[gateKey];
  if (!spec) return;
  if (state.qubits.length === 0) return;

  // default to appending at end for new gate
  let col = desiredCol;
  if (col === undefined || col === null) {
    let m = 0;
    for (const t of targets) {
      for (const op of opsOn(t)) m = Math.max(m, op.col);
    }
    col = m + 1;
  }
  if (gateKey === "measure") {
    // measurements always go to the end
    col = maxCol() + 1;
  }
  if (col < 0) col = 0;

  // shift any ops occupying the same column on the target qubits
  let guard = 0;
  while (guard < 200) {
    const clash = opsTouching(targets).filter((o) => o.col === col);
    if (!clash.length) break;
    for (const o of clash) o.col++;
    guard++;
  }

  const params2 = { ...params };
  state.ops.push({ id: state.nextId++, gateKey, targets, params: params2, col });
  if (state.alignment === "left") compactColumns();
  return state.ops[state.ops.length - 1];
}

function removeOp(id) {
  state.ops = state.ops.filter((o) => o.id !== id);
  if (state.selectedId === id) state.selectedId = null;
}

// ---------- entry point after any circuit change ----------
function afterCircuitChange(opts = {}) {
  const { code = true, vis = true, select = true } = opts;
  renderCircuit();
  if (code) renderCode();
  if (vis) updateVisualizations();
  if (select) state.selectedId = null;
  setSyncLabel("synced");
}

// ---------- SVG circuit rendering ----------
let svgEl;
let gateSvgCache = {};

function gateFill(gateKey) {
  if (state.gateTheme === "monochrome") return "#606269";
  const spec = GATE_CATALOG[gateKey];
  return spec ? spec.color : "#606269";
}
function wireColor() {
  return "rgba(128,132,142,1)";
}

function renderCircuit() {
  svgEl = $("#circuit-svg");
  svgEl.innerHTML = "";

  const n = state.qubits.length;
  const mc = maxCol();
  const W = GEOM.wirePadLeft + (mc + 2) * GEOM.colStep + GEOM.rightPad;
  const H = GEOM.wirePadTop + n * GEOM.rowH + GEOM.wirePadBottom;
  svgEl.setAttribute("width", W);
  svgEl.setAttribute("height", Math.max(H, GEOM.wirePadTop + GEOM.rowH + GEOM.wirePadBottom));

  const inPageTheme = document.body.dataset.pageTheme;
  const pageIsLight = inPageTheme === "light";
  const bgFill = pageIsLight ? "#f2f2f4" : "#16171b";
  const labelFill = pageIsLight ? "#16171b" : "#e6e6ea";
  const mutedFill = pageIsLight ? "#5b5d66" : "#a6a8b0";
  const faintFill = pageIsLight ? "#8b8d96" : "#6f7178";
  const borderStroke = pageIsLight ? "#d7d7de" : "#35363f";

  // background (click handler for deselect / placing pending gate)
  const bg = svg("rect", { x: 0, y: 0, width: W, height: H, fill: bgFill, class: "bg-rect" });
  svgEl.appendChild(bg);

  // layer / alignment guides
  if (state.alignment === "layers") {
    for (let c = 0; c <= mc; c++) {
      if (!state.ops.some((o) => o.col === c)) continue;
      svgEl.appendChild(svg("line", { x1: colX(c), y1: GEOM.wirePadTop - 10, x2: colX(c), y2: H - GEOM.wirePadBottom + 14, stroke: borderStroke, "stroke-width": 1, "stroke-dasharray": "3 4", class: "col-layer-line" }));
    }
  }

  // quantum state computation for phase disks
  let simResult = null;
  if (n <= 12 && n > 0) {
    try {
      simResult = simulateCircuit(state);
    } catch (e) {
      simResult = null;
    }
  }

  // wires + labels + phase disks
  for (let i = 0; i < n; i++) {
    const y = wireY(i);
    svgEl.appendChild(svg("line", { x1: GEOM.wirePadLeft + 34, y1: y, x2: W - 20, y2: y, class: "wire" }));
    svgEl.appendChild(svg("circle", { cx: 22, cy: y, r: 11, fill: bgFill, stroke: mutedFill, "stroke-width": 1.4 }));
    svgEl.appendChild(svg("text", { x: 22, y: y + 4, "text-anchor": "middle", class: "wire-label", fill: labelFill, text: "q" + i }));
  }

  // phase disks for each qubit
  if (simResult) {
    for (let i = 0; i < n; i++) {
      const y = wireY(i);
      const op = simResult.state;
      // marginal magnitude for qubit i (|1>)
      let a = 0, b = 0;
      for (let k = 0; k < op.dim; k++) {
        const p = op.data[k][0] * op.data[k][0] + op.data[k][1] * op.data[k][1];
        if ((k >> i) & 1) b += p;
        else a += p;
      }
      const p1 = Math.sqrt(Math.min(1, b));
      const p0 = Math.sqrt(Math.min(1, a));
      const th = 2 * Math.atan2(p1, p0) || 0;
      const r = 8;
      const dx = Math.sin(th) * r;
      const dy = -Math.cos(th) * r;
      const cx = 48, cy = y - 22;
      const g = svg("g", { class: "phase-disk" });
      g.appendChild(svg("circle", { cx, cy, r: r + 5, fill: bgFill, stroke: borderStroke, "stroke-width": 1 }));
      g.appendChild(svg("line", { x1: cx - r - 4, y1: cy, x2: cx + r + 4, y2: cy, stroke: borderStroke, "stroke-width": 1, class: "axis" }));
      g.appendChild(svg("line", { x1: cx, y1: cy - r - 4, x2: cx, y2: cy + r + 4, stroke: borderStroke, "stroke-width": 1, class: "axis" }));
      g.appendChild(svg("line", { x1: cx, y1: cy, x2: cx + dx, y2: cy + dy, stroke: gateFill("z"), "stroke-width": 2.4, "stroke-linecap": "round", class: "beam" }));
      g.appendChild(svg("circle", { cx: cx + dx, cy: cy + dy, r: 3, fill: gateFill("z"), class: "beam" }));
      svgEl.appendChild(g);
    }
  }

  // empty hint
  if (n === 0) {
    svgEl.appendChild(svg("text", { x: GEOM.wirePadLeft + 40, y: GEOM.wirePadTop + 20, class: "empty-hint", fill: faintFill, text: "Add qubits or drop gates here" }));
  }

  // gates, grouped by column
  const byCol = {};
  for (const op of state.ops) {
    if (!byCol[op.col]) byCol[op.col] = [];
    byCol[op.col].push(op);
  }
  const cols = Object.keys(byCol)
    .map(Number)
    .sort((a, b) => a - b);
  for (const c of cols) {
    const group = byCol[c];
    group.sort((a, b) => a.targets[0] - b.targets[0]);
    const g = svg("g", { class: "gate-layer" });
    for (const op of group) {
      g.appendChild(renderGateOp(op));
    }
    svgEl.appendChild(g);
  }

  // pending-gate ghost when in "add mode"
  if (state.pendingGate && state.pendingGhost) {
    const gh = renderGateOp({
      gateKey: state.pendingGate,
      targets: state.pendingGhost.targets,
      params: defaultParams(state.pendingGate),
      col: state.pendingGhost.col,
      _ghost: true,
    });
    svgEl.appendChild(gh);
  }

  bindCanvasInteractions();
  updateVisualizations();
}

function defaultParams(gateKey) {
  const spec = GATE_CATALOG[gateKey];
  const p = {};
  if (spec.params) for (const [k, v] of Object.entries(spec.params)) p[k] = 0;
  return p;
}

function renderGateOp(op) {
  const g = svg("g", { class: "gate-group shape-" + op.gateKey, "data-id": op.id });
  if (op._ghost) g.setAttribute("class", g.getAttribute("class") + " drop-placeholder");
  if (state.selectedId === op.id && !op._ghost) {
    g.classList.add("selected");
  }

  const spec = GATE_CATALOG[op.gateKey];
  if (!spec) return g;
  const fill = gateFill(op.gateKey);
  const t = op.targets;

  switch (op.gateKey) {
    case "cx":
    case "cz":
    case "ch":
    case "crz":
    case "cp": {
      const x = colX(op.col);
      const y0 = wireY(t[0]);
      const y1 = wireY(t[1]);
      // control dot
      g.appendChild(svg("line", { x1: x, y1: y0, x2: x, y2: y1, class: "cnx-line" }));
      const dot = svg("circle", { cx: x, cy: y0, r: 5, fill, class: "g-dot", "data-id": op.id });
      g.appendChild(dot);
      // target
      if (op.gateKey === "cx") {
        const circ = svg("circle", { cx: x, cy: y1, r: 13, fill: "none", stroke: fill, "stroke-width": 2, class: "x-target" });
        const cxm = svg("circle", { cx: x, cy: y1, r: 13, fill: "none", stroke: "transparent", "stroke-width": 10, "data-id": op.id });
        g.appendChild(circ);
        g.appendChild(svg("line", { x1: x - 8, y1: y1, x2: x + 8, y2: y1, stroke: fill, "stroke-width": 2 }));
        g.appendChild(svg("line", { x1: x, y1: y1 - 8, x2: x, y2: y1 + 8, stroke: fill, "stroke-width": 2 }));
        g.appendChild(cxm);
      } else if (op.gateKey === "cz") {
        g.appendChild(svg("circle", { cx: x, cy: y1, r: 5, fill, class: "g-dot" }));
      } else {
        // CH, CRZ, CP -> labeled box on target
        const bx = x - 17;
        const by = y1 - 17;
        g.appendChild(svg("rect", { x: bx, y: by, width: 34, height: 34, rx: 4, fill, class: "g-rect" }));
        const label = op.gateKey === "ch" ? "H" : op.gateKey === "crz" ? "RZ" : "P";
        g.appendChild(svg("text", { x, y: y1 + 4, "text-anchor": "middle", text: label, class: "g-label-sym" }));
        if ((op.gateKey === "crz" || op.gateKey === "cp") && op.params) {
          g.appendChild(svg("text", { x, y: y1 + 15, "text-anchor": "middle", class: "g-param", text: fmtParam(op.params.theta) }));
        }
      }
      break;
    }
    case "ccx": {
      const x = colX(op.col);
      const y0 = wireY(t[0]);
      const y1 = wireY(t[1]);
      const y2 = wireY(t[2]);
      g.appendChild(svg("line", { x1: x, y1: y0, x2: x, y2: y2, class: "cnx-line" }));
      for (const ty of [y0, y1]) {
        g.appendChild(svg("circle", { cx: x, cy: ty, r: 5, fill, class: "g-dot" }));
      }
      const circ = svg("circle", { cx: x, cy: y2, r: 13, fill: "none", stroke: fill, "stroke-width": 2, class: "x-target" });
      g.appendChild(circ);
      g.appendChild(svg("line", { x1: x - 8, y1: y2, x2: x + 8, y2: y2, stroke: fill, "stroke-width": 2 }));
      g.appendChild(svg("line", { x1: x, y1: y2 - 8, x2: x, y2: y2 + 8, stroke: fill, "stroke-width": 2 }));
      break;
    }
    case "swap": {
      const x = colX(op.col);
      const y0 = wireY(t[0]);
      const y1 = wireY(t[1]);
      g.appendChild(svg("line", { x1: x, y1: y0, x2: x, y2: y1, class: "cnx-line" }));
      for (const ty of [y0, y1]) {
        g.appendChild(svg("line", { x1: x - 7, y1: ty - 7, x2: x + 7, y2: ty + 7, stroke: fill, "stroke-width": 2, "stroke-linecap": "round" }));
        g.appendChild(svg("line", { x1: x - 7, y1: ty + 7, x2: x + 7, y2: ty - 7, stroke: fill, "stroke-width": 2, "stroke-linecap": "round" }));
      }
      break;
    }
    case "measure": {
      const x = colX(op.col);
      const y = wireY(t[0]);
      const w = GEOM.measuredW;
      g.appendChild(svg("rect", { x: x - w / 2, y: y - 16, width: w, height: 32, rx: 4, fill, class: "g-rect" }));
      const lx = x - w / 2 + 10;
      // meter dial
      g.appendChild(svg("path", { d: "M " + (lx) + "," + (y + 9) + " a 4 4 0 1 1 0.1 0", fill: "none", stroke: "#fff", "stroke-width": 2 }));
      g.appendChild(svg("line", { x1: lx + 4, y1: y + 5, x2: lx + 3, y2: y + 1, stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round" }));
      g.appendChild(svg("text", { x: x + 6, y: y + 5, "text-anchor": "middle", text: "M", class: "g-label-sym" }));
      break;
    }
    default: {
      // single-qubit labeled gate (possibly with params)
      const x = colX(op.col);
      const y = wireY(t[0]);
      const bx = x - GEOM.boxW / 2;
      const by = y - GEOM.boxH / 2;
      g.appendChild(svg("rect", { x: bx, y: by, width: GEOM.boxW, height: GEOM.boxH, rx: 4, fill, class: "g-rect" }));
      const sym = symText(op.gateKey);
      if (["rx", "ry", "rz", "p", "u"].includes(op.gateKey)) {
        g.appendChild(svg("text", { x, y: y - 1, "text-anchor": "middle", text: sym, class: "g-label-sym" }));
        const pLabel = op.gateKey === "u" ? fmtParams(op.params) : fmtParam(op.params ? op.params.theta : 0);
        g.appendChild(svg("text", { x, y: y + 12, "text-anchor": "middle", class: "g-param", text: pLabel }));
      } else {
        g.appendChild(svg("text", { x, y: y + 4.5, "text-anchor": "middle", text: sym, class: "g-label-sym" }));
      }
      break;
    }
  }
  return g;
}

function symText(key) {
  switch (key) {
    case "sdg":
      return "S†";
    case "tdg":
      return "T†";
    case "sx":
      return "√X";
    case "sxdg":
      return "√X†";
    default:
      return GATE_CATALOG[key].sym;
  }
}
function fmtParam(v) {
  if (v === 0) return "0";
  const pi = Math.PI;
  const q = v / pi;
  if (Math.abs(q - Math.round(q)) < 1e-4) {
    const r = Math.round(q);
    if (r === 1) return "π";
    if (r === -1) return "−π";
    return r + "π";
  }
  const h = q * 2;
  if (Math.abs(h - Math.round(h)) < 1e-4) {
    const r = Math.round(h);
    if (r === 1) return "π/2";
    if (r === -1) return "−π/2";
    if (r === -3) return "−3π/2";
    return r + "π/2";
  }
  return String(Math.round(v * 1000) / 1000);
}
function fmtParams(p) {
  return fmtParam(p.theta) + "," + fmtParam(p.phi) + "," + fmtParam(p.lambda);
}

// ---------- Canvas interactions ----------
function svgPoint(svgEl, evt) {
  const rect = svgEl.getBoundingClientRect();
  const scroll = $("#canvas-scroll");
  const x = evt.clientX - rect.left + scroll.scrollLeft;
  const y = evt.clientY - rect.top + scroll.scrollTop;
  return { x, y };
}

function wireFromY(y) {
  const best = Math.round((y - GEOM.wirePadTop) / GEOM.rowH);
  return Math.max(0, Math.min(state.qubits.length - 1, best));
}
function colFromX(x) {
  let c = Math.round((x - GEOM.wirePadLeft - GEOM.colStep / 2) / GEOM.colStep);
  return Math.max(0, c);
}

// Resolve what wires a gate occupies given the wire the user dropped on.
function targetsForGate(gateKey, wire) {
  const spec = GATE_CATALOG[gateKey];
  if (!spec) return null;
  const n = state.qubits.length;
  if (["single", "rotation", "rotation3", "measure"].includes(spec.kind)) return [wire];
  if (spec.kind === "2-qubit" || spec.kind === "1-to-2") return [wire, Math.min(n - 1, wire + 1)];
  if (spec.kind === "2-to-3") return [wire, Math.min(n - 1, wire + 1), Math.min(n - 1, wire + 2)];
  return null;
}

function bindCanvasInteractions() {
  const scroll = $("#canvas-scroll");

  svgEl.querySelectorAll(".gate-group").forEach((g) => {
    g.addEventListener("click", (evt) => {
      evt.stopPropagation();
      const id = parseInt(g.dataset.id, 10);
      const op = state.ops.find((o) => o.id === id);
      if (op) selectGate(op, evt);
    });
  });

  svgEl.addEventListener("click", (evt) => {
    if (evt.target.classList && evt.target.classList.contains("bg-rect")) {
      state.selectedId = null;
      if (state.pendingGate) {
        const pt = svgPoint(svgEl, evt);
        dropPendingGate(pt);
      } else {
        $("#gate-info").classList.add("hidden");
        renderCircuit();
      }
    }
  });
}

function dropPendingGate(pt) {
  const wire = wireFromY(pt.y);
  const col = colFromX(pt.x);
  const key = state.pendingGate;
  state.pendingGate = null;
  state.pendingGhost = null;
  $("body").style.cursor = "";
  if (!key) return;
  const rawTargets = targetsForGate(key, wire);
  if (!rawTargets) return;
  if (rawTargets.length > 1 && state.qubits.length < rawTargets.length) {
    notify("Need more qubits for the " + GATE_CATALOG[key].name + " gate.");
    return;
  }
  const targets = [...new Set(rawTargets)];
  if (rawTargets.length > 1 && targets.length < rawTargets.length) {
    notify("The " + GATE_CATALOG[key].name + " gate needs " + rawTargets.length + " distinct wires.");
    return;
  }
  pushHistory();
  state.selectedId = null;
  placeGate(key, targets, defaultParams(key), col);
  afterCircuitChange();
}

// ---------- gate palette ----------
function buildPalette() {
  const wrap = $("#gate-palette");
  wrap.innerHTML = "";
  for (const group of PALETTE_GROUPS) {
    const div = document.createElement("div");
    div.className = "palette-group";
    const title = document.createElement("div");
    title.className = "palette-group-title";
    title.textContent = group.title;
    div.appendChild(title);
    const grid = document.createElement("div");
    grid.className = "palette-grid";
    for (const key of group.keys) {
      const spec = GATE_CATALOG[key];
      const item = document.createElement("div");
      item.className = "palette-gate";
      item.dataset.gate = key;
      item.title = spec.name + " — " + spec.desc;
      item.innerHTML =
        '<div class="g-box" style="width:34px;height:30px;background:' +
        gateFill(key, true) +
        ';color:#fff;font-weight:700">' +
        '<span class="g-label">' +
        escHtml(spec.sym) +
        "</span></div>" +
        '<span class="g-name">' +
        escHtml(spec.name) +
        "</span>";
      item.draggable = true;
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", key);
        e.dataTransfer.effectAllowed = "copy";
      });
      item.addEventListener("click", () => {
        togglePendingGate(key);
      });
      grid.appendChild(item);
    }
    div.appendChild(grid);
    wrap.appendChild(div);
  }
}
function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function gateFill(key, palette) {
  if (state.gateTheme === "monochrome") return "#606269";
  return GATE_CATALOG[key].color;
}
function togglePendingGate(key) {
  if (state.pendingGate === key) {
    state.pendingGate = null;
    state.pendingGhost = null;
    $("body").style.cursor = "";
    $("#gate-info").classList.add("hidden");
    renderCircuit();
    return;
  }
  state.pendingGate = key;
  $("#gate-info").classList.add("hidden");
  notify("Click a wire on the circuit to place the " + GATE_CATALOG[key].name + " gate. Esc to cancel.");
}

// drag & drop onto canvas
function bindDragDrop() {
  const scroll = $("#canvas-scroll");
  scroll.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!state.pendingGate) e.dataTransfer.dropEffect = "copy";
  });
  scroll.addEventListener("drop", (e) => {
    e.preventDefault();
    const key = e.dataTransfer.getData("text/plain");
    if (!key || !GATE_CATALOG[key]) return;
    const sp = svgPoint(svgEl, e);
    const wire = wireFromY(sp.y);
    const col = colFromX(sp.x);
    const rawTargets = targetsForGate(key, wire);
    if (!rawTargets) return;
    if (rawTargets.length > 1 && state.qubits.length < rawTargets.length) {
      notify("Need more qubits for the " + GATE_CATALOG[key].name + " gate.");
      return;
    }
    const targets = [...new Set(rawTargets)];
    if (rawTargets.length > 1 && targets.length < rawTargets.length) {
      notify("The " + GATE_CATALOG[key].name + " gate needs " + rawTargets.length + " distinct wires.");
      return;
    }
    pushHistory();
    state.selectedId = null;
    placeGate(key, targets, defaultParams(key), col);
    afterCircuitChange();
  });
}

// ---------- selection / in-context panel ----------
function selectGate(op, evt) {
  state.selectedId = op.id;
  renderCircuit();
  const info = $("#gate-info");
  const spec = GATE_CATALOG[op.gateKey];
  if (!spec) return;
  $("#gate-info-name").textContent = spec.name + " (" + op.gateKey.toUpperCase() + ")";
  $("#gate-info-name").dataset.opid = op.id;
  $("#gate-info-desc").textContent = spec.desc;
  const pwrap = $("#gate-info-params");
  pwrap.innerHTML = "";
  const hasParams = op.params && Object.keys(op.params).length;
  if (hasParams) {
    for (const [k, v] of Object.entries(op.params)) {
      const lbl = document.createElement("label");
      const symLbl = GATE_CATALOG[op.gateKey].params[k][1];
      lbl.innerHTML = symLbl + " ";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = fmtParamToInput(op.params[k]);
      inp.dataset.param = k;
      inp.addEventListener("change", () => {
        const val = parseFloat(inp.value.replace("π", "pi").replace("−", "-").replace(/pi/g, "(Math.PI)").replace("-0", "0") || 0);
        const num = evalParam(inp.value);
        pushHistory();
        op.params[k] = num;
        afterCircuitChange();
        inp.value = fmtParamToInput(num);
      });
      lbl.appendChild(inp);
      pwrap.appendChild(lbl);
    }
  }
  // position panel near the gate on screen
  const rect = svgEl.getBoundingClientRect();
  const g = svgEl.querySelector('.gate-group[data-id="' + op.id + '"]');
  let left, top;
  if (g) {
    const gr = g.getBoundingClientRect();
    left = gr.right + 10;
    top = gr.top;
  } else {
    left = rect.left + 40;
    top = rect.top + 120;
  }
  info.style.left = Math.min(left, window.innerWidth - 260) + "px";
  info.style.top = Math.min(top, window.innerHeight - 180) + "px";
  info.classList.remove("hidden");

  $("#gate-info-delete").onclick = () => {
    pushHistory();
    removeOp(op.id);
    info.classList.add("hidden");
    afterCircuitChange();
  };
  $("#gate-info-clone").onclick = () => {
    pushHistory();
    const copy = { ...op, col: op.col + 1, id: state.nextId++ };
    state.ops.push(copy);
    if (state.alignment === "left") compactColumns();
    afterCircuitChange();
  };
}
function fmtParamToInput(v) {
  const pi = Math.PI;
  const q = v / pi;
  if (Math.abs(q - Math.round(q)) < 1e-4) {
    const r = Math.round(q);
    return (r === 1 ? "π" : r === -1 ? "−π" : r + "π");
  }
  const h = q * 2;
  if (Math.abs(h - Math.round(h)) < 1e-4) {
    const r = Math.round(h);
    return (r === 1 ? "π/2" : r === -1 ? "−π/2" : r + "π/2");
  }
  return String(Math.round(v * 1000) / 1000);
}
function evalParam(s) {
  const expr = String(s)
    .replace(/π/g, "") // handled below
    .replace(/−/g, "-")
    .replace(/pi/g, "(Math.PI)")
    .replace(/π/g, "(Math.PI)")
    .replace(/sqrt/g, "Math.sqrt");
  try {
    const v = Function('"use strict";return (' + expr + ")")();
    return typeof v === "number" && isFinite(v) ? v : 0;
  } catch (e) {
    return 0;
  }
}

function notify(msg) {
  // simple transient toast
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--bg-elev-2);color:var(--text);border:1px solid var(--border-hi);padding:8px 14px;border-radius:6px;z-index:300;font-size:13px;box-shadow:var(--shadow);max-width:70vw;text-align:center";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 2600);
}

// ---------- code editor ----------
const codeText = $("#code-text");
let codeFocused = false;

function renderCode() {
  const fmt = $("#code-format").value;
  if (fmt === "qasm") {
    $("#code-lang-label").textContent = "OpenQASM";
    codeText.value = Qasm.fromCircuit(state);
  } else {
    $("#code-lang-label").textContent = "Qiskit";
    codeText.value = toQiskit(state);
  }
  codeText.setAttribute("readonly", fmt === "qiskit" ? "readonly" : "");
}

function toQiskit(state) {
  const lines = [];
  lines.push("from qiskit import QuantumCircuit");
  lines.push("");
  lines.push("qc = QuantumCircuit(" + state.qubits.length + ", " + state.classics.length + ")");
  const byCol = [];
  for (const op of state.ops) {
    if (!byCol[op.col]) byCol[op.col] = [];
    byCol[op.col].push(op);
  }
  let m = 0;
  for (let c = 0; c < byCol.length; c++) {
    for (const op of byCol[c] || []) {
      const t = op.targets;
      const p = op.params || {};
      const arg = t.map((i) => "q[" + i + "]").join(", ");
      switch (op.gateKey) {
        case "measure":
          lines.push("qc.measure(q[" + t[0] + "], c[" + m++ + "])");
          break;
        case "cx":
          lines.push("qc.cx(q[" + t[0] + "], q[" + t[1] + "])");
          break;
        case "cz":
          lines.push("qc.cz(q[" + t[0] + "], q[" + t[1] + "])");
          break;
        case "ch":
          lines.push("qc.ch(q[" + t[0] + "], q[" + t[1] + "])");
          break;
        case "swap":
          lines.push("qc.swap(q[" + t[0] + "], q[" + t[1] + "])");
          break;
        case "ccx":
          lines.push("qc.ccx(q[" + t[0] + "], q[" + t[1] + "], q[" + t[2] + "])");
          break;
        case "rx": case "ry": case "rz": case "p":
          lines.push("qc." + op.gateKey + "(" + roundNum(p.theta) + ", q[" + t[0] + "])");
          break;
        case "u":
          lines.push("qc.u(" + roundNum(p.theta) + ", " + roundNum(p.phi) + ", " + roundNum(p.lambda) + ", q[" + t[0] + "])");
          break;
        default:
          lines.push("qc." + op.gateKey + "(q[" + t[0] + "])");
      }
    }
  }
  return lines.join("\n");
}
function roundNum(x) {
  return Math.round((x + 1e-12) * 10000) / 10000;
}

function setSyncLabel(label) {
  const el = $("#code-sync");
  el.textContent = label === "error" ? "error in code" : label;
  el.classList.toggle("dirty", label !== "synced" && label !== "error");
}

codeText.addEventListener("focus", () => {
  codeFocused = true;
});
codeText.addEventListener("blur", () => {
  codeFocused = false;
  if ($("#code-format").value === "qasm") {
    tryImportCode();
    setSyncLabel("synced");
  }
});
codeText.addEventListener("input", () => {
  if ($("#code-format").value !== "qasm") return;
  try {
    importFromText(codeText.value, { pushHistory: false });
    renderCircuit();
    setSyncLabel("synced");
  } catch (e) {
    setSyncLabel("error");
  }
});

function tryImportCode() {
  try {
    importFromText(codeText.value, { pushHistory: true });
    setSyncLabel("synced");
  } catch (e) {
    setSyncLabel("error");
    return;
  }
  afterCircuitChange();
}

function importFromText(text, opts = {}) {
  if (opts.pushHistory) pushHistory();
  Qasm.toCircuit(text, {
    setQubits(n, names) {
      state.qubits = Array.from({ length: n }, (_, i) => ({ name: "q" + i }));
      state.classics = [];
      state.ops = [];
      state.selectedId = null;
    },
    addOp(gateKey, targets, params) {
      placeGate(gateKey, targets, params);
    },
    setClassics(n) {
      state.classics = Array.from({ length: n }, (_, i) => ({ name: "c" + i }));
    },
  });
  if (state.alignment === "left") compactColumns();
}

// ---------- visualizations ----------
let lastSim = null;
function updateVisualizations() {
  const n = state.qubits.length;
  if (n === 0 || n > 12) {
    lastSim = null;
    setVizUnavailable(n);
    return;
  }
  try {
    lastSim = simulateCircuit(state);
  } catch (e) {
    lastSim = null;
    setVizUnavailable(n);
    return;
  }
  drawStatevector(lastSim);
  drawProbabilities(lastSim);
  drawQsphere(lastSim);
  $("#sv-count").textContent = "2^" + n + " amplitudes";
  $("#qsphere-hint").textContent = n <= 5 ? "" : "2^5 states shown (limit)";
}

function setVizUnavailable(n) {
  if (n === 0) {
    $("#sv-count").textContent = "no qubits";
    $("#qsphere-hint").textContent = "add qubits first";
  } else {
    $("#sv-count").textContent = "too many (" + n + ")";
    $("#qsphere-hint").textContent = "simulator supports up to 12 qubits";
  }
  const sv = $("#sv-table");
  sv.innerHTML = "<tr><td style='color:var(--text-faint);padding:12px'>Add qubits or build a circuit to see the statevector.</td></tr>";
  const pc = $("#prob-canvas");
  pc.width = pc.clientWidth || 200;
  pc.height = pc.clientHeight || 100;
  const ctx = pc.getContext("2d");
  ctx.clearRect(0, 0, pc.width, pc.height);
  const qc = $("#qsphere-canvas");
  qc.width = qc.clientWidth || 200;
  qc.height = qc.clientHeight || 100;
  qc.getContext("2d").clearRect(0, 0, qc.width, qc.height);
  $("#prob-legend").textContent = "";
}

function drawStatevector(sim) {
  const n = state.qubits.length;
  const table = $("#sv-table");
  table.innerHTML = "";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["State", "Amplitude (real)", "Amplitude (imag)", "Probability"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  const bits = (k) =>
    Array.from({ length: n }, (_, i) => String((k >> (n - 1 - i)) & 1)).join("");
  for (let k = 0; k < sim.state.dim; k++) {
    const [re, im] = sim.state.data[k];
    const p = sim.probs[k];
    if (p < 1e-9 && k > 8) continue;
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.className = "state";
    td1.textContent = "|" + bits(k) + ">";
    const td2 = document.createElement("td");
    td2.className = "amp re";
    td2.textContent = fmtAmp(re);
    const td3 = document.createElement("td");
    td3.className = "amp im";
    td3.textContent = (im < 0 ? "−" : im >= 0 ? "+" : "+") + fmtAmp(Math.abs(Math.round(im * 10000) / 10000)) + (im >= 0 ? "" : "") + (im !== 0 ? "i" : "");
    const td4 = document.createElement("td");
    td4.innerHTML = '<span class="prob">' + (p * 100).toFixed(2) + "%</span>";
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}
function fmtAmp(x) {
  const v = Math.round(x * 10000) / 10000;
  if (v === 0) return "0";
  if (Math.abs(v) === Math.round(Math.SQRT1_2 * 10000) / 10000) return (v > 0 ? "" : "−") + "1/√2";
  return String(v);
}

function drawProbabilities(sim) {
  const canvas = $("#prob-canvas");
  const n = state.qubits.length;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(200, canvas.clientWidth);
  const h = Math.max(120, canvas.clientHeight);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const leg = $("#prob-legend");
  leg.textContent = "";

  const states = sim.probs.map((p, k) => ({ k, p }));
  const maxP = Math.max(0.01, ...sim.probs);
  const padL = 30;
  const padB = 0;
  const padT = 8;
  const plotW = w - padL - 2;
  const plotH = h - padT - padB - 14;
  const barW = plotW / states.length;
  const dots = [];
  for (const { k, p } of states) {
    const x = padL + k * barW;
    const bh = Math.max(0, (p / maxP) * plotH);
    const y = padT + plotH - bh;
    ctx.fillStyle = "rgba(0,114,195,1)";
    if (p > 1e-5) ctx.fillRect(x + Math.max(0, barW * 0.15), y, Math.max(1, barW * 0.7), bh);
    if (p > 1e-5 && (p < maxP * 0.999 || sim.probs.length === 1)) {
      dots.push({ x: x + barW / 2, y: y - 6, p });
    }
    const label = "|" + stateBits(k, n) + ">";
    if (barW > 14 && k < 40) {
      ctx.fillStyle = "rgba(128,132,142,1)";
      ctx.font = "9px " + getComputedStyle(document.body).getPropertyValue("--mono").replace(/"/g, "");
      ctx.textAlign = "center";
      ctx.fillText(label, x + barW / 2, h - 4);
    } else if (sim.probs.length <= 16) {
      ctx.fillStyle = "rgba(128,132,142,1)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, x + barW / 2, h - 4);
    }
    if (p > 1e-5 && sim.probs.length <= 16) {
      ctx.fillStyle = "rgba(166,168,176,1)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText((p * 100).toFixed(0) + "%", x + barW / 2, y > 16 ? y - 4 : y + 10);
    }
  }
  // axis
  ctx.strokeStyle = "rgba(128,132,142,0.5)";
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(w - 2, padT + plotH);
  ctx.stroke();
  if (sim.probs.length < 2) leg.textContent = "1 basis state";
}
function stateBits(k, n) {
  return Array.from({ length: n }, (_, i) => String((k >> (n - 1 - i)) & 1)).join("");
}

function drawQsphere(sim) {
  const canvas = $("#qsphere-canvas");
  const n = state.qubits.length;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(200, canvas.clientWidth);
  const h = Math.max(150, canvas.clientHeight);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.42;
  const nStates = sim.state.dim;
  const showLabels = n <= 4;

  // group states by popcount so states cluster nicely (qiskit-ish)
  const order = Array.from({ length: nStates }, (_, i) => i).sort((a, b) => {
    const ca = popcount(a),
      cb = popcount(b);
    return ca - cb || a - b;
  });
  const golden = (Math.sqrt(5) - 1) / 2;

  // draw sphere outline
  ctx.strokeStyle = "rgba(128,132,142,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, R * 0.35, R, 0, 0, Math.PI * 2);
  ctx.stroke();

  const points = [];
  order.forEach((k, idx) => {
    const t = nStates === 1 ? 0.5 : idx / (nStates - 1);
    let z = 1 - 2 * t;
    let theta = Math.acos(z);
    let phi = order.length > 1 ? idx * golden * 2 * Math.PI : 0;
    const amp = sim.state.data[k];
    const phase = Math.atan2(amp[1], amp[0]);
    const p = sim.probs[k];
    const r = Math.max(0, Math.sqrt(p)) * R * 0.55;
    const x = cx + Math.sin(theta) * Math.cos(phi) * R;
    const y = cy - Math.cos(theta) * R;
    const hue = ((phase + Math.PI) / (2 * Math.PI)) * 360;
    const size = Math.max(2, r * 0.5 + 1.5);
    points.push({ x, y, p, k, size, hue });
  });
  // draw back-to-front (larger first)
  points.sort((a, b) => a.size - b.size);
  for (const pt of points) {
    const a = 0.35 + 0.65 * Math.min(1, pt.size / (R * 0.3 + 1.5));
    ctx.globalAlpha = Math.max(0.15, a);
    ctx.fillStyle = "hsl(" + Math.round(pt.hue) + ",80%,58%)";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(1.2, pt.size * 0.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (showLabels && pt.p > 1e-3) {
      ctx.fillStyle = "rgba(166,168,176,1)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText("|" + stateBits(pt.k, n) + ">", pt.x, pt.y - pt.size - 3);
    }
  }
}
function popcount(x) {
  let c = 0;
  while (x) {
    c += x & 1;
    x >>= 1;
  }
  return c;
}

// ---------- run (simulated shots) ----------
function runCircuit() {
  const shots = Math.max(1, parseInt($("#run-shots").value || "1024", 10));
  const n = state.qubits.length;
  if (n === 0 || n > 12) {
    notify("Simulator supports 1 to 12 qubits.");
    return;
  }
  let sim;
  try {
    sim = simulateCircuit(state);
  } catch (e) {
    notify("Could not simulate circuit: " + e.message);
    return;
  }
  const counts = sampleCounts(sim.probs, shots);
  const out = $("#run-counts");
  out.innerHTML = "";
  const rows = Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!rows.length) {
    out.innerHTML = "<div style='color:var(--text-faint)'>No results.</div>";
  }
  const maxC = Math.max(1, ...rows.map(([, c]) => c));
  const nbits = n;
  for (const [k, c] of rows) {
    const div = document.createElement("div");
    div.className = "run-count-row";
    const stateStr = stateBits(Number(k), nbits);
    const pct = ((c / shots) * 100).toFixed(1);
    div.innerHTML =
      '<span style="font-weight:600">|' +
      stateStr +
      "></span>" +
      '<span class="run-count-bar" style="width:' +
      Math.max(2, (c / maxC) * 100) +
      '%"></span>' +
      "<span>" +
      c +
      " (" +
      pct +
      "%)</span>";
    out.appendChild(div);
  }
  $("#run-result").classList.remove("hidden");
}

// ---------- menus ----------
function closeMenus() {
  $$(".menu-drop").forEach((d) => d.classList.remove("open"));
  $$(".menu-btn").forEach((b) => b.classList.remove("open"));
}

function bindMenus() {
  $$(".menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = btn.dataset.menu;
      const drop = $("#menu-" + m);
      const open = drop.classList.contains("open");
      closeMenus();
      if (!open) {
        drop.classList.add("open");
        btn.classList.add("open");
      }
    });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".menu")) closeMenus();
  });

  const actions = {
    "new-qasm2": () => newCircuit(), // default is QASM2 editor
    "new-qasm3": () => newCircuit(),
    upload: () => $("#file-upload").click(),
    duplicate: () => duplicateFile(),
    share: () => shareFile(),
    "export-image": () => exportImage(),
    save: () => saveFile(),
    undo,
    redo,
    cut: () => notify("Use Delete on a selected gate"),
    copy: () => copyQasm(),
    paste: () => notify("Paste is handled by the GPU… well, paste QASM into the code editor"),
    "select-all": () => notify("Ctrl+A focuses the code editor (shortcut added)"),
    "clear-circuit": () => clearCircuit(),
    registers: () => manageRegisters(),
    "clear-clip": () => copyQasm(),
    "reset-workspace": () => resetWorkspace(),
    "help-first": () => showTour(0),
    "help-features": () => showTour(0),
    "help-about": () => showAbout(),
  };
  $$(".menu-item[data-action]").forEach((item) => {
    item.addEventListener("click", (e) => {
      const a = item.dataset.action;
      if (actions[a]) actions[a]();
      closeMenus();
    });
  });
  $("#gate-theme-select").addEventListener("change", (e) => {
    state.gateTheme = e.target.value;
    document.body.dataset.gateTheme = e.target.value;
    buildPalette();
    renderCircuit();
  });
  $("#align-select").addEventListener("change", (e) => {
    state.alignment = e.target.value;
    if (state.alignment === "left") compactColumns();
    renderCircuit();
  });
  $("#code-format").addEventListener("change", () => {
    renderCode();
    if ($("#code-format").value === "qasm") {
      tryImportCode();
    }
  });
  $$(".menu-item input[data-panel]").forEach((cb) => {
    cb.addEventListener("change", () => applyPanelToggles());
  });
  $("#page-theme-toggle").addEventListener("click", () => {
    const cur = document.body.dataset.pageTheme;
    document.body.dataset.pageTheme = cur === "dark" ? "light" : "dark";
    renderCircuit();
    updateVisualizations();
  });
}

function applyPanelToggles() {
  const get = (p) => $('.menu-item input[data-panel="' + p + '"]').checked;
  $("#graphical-editor").style.display = get("graphical") ? "" : "none";
  $("#code-editor").classList.toggle("hidden", !get("code"));
  const sv = get("statevector"),
    pr = get("probabilities"),
    qs = get("qsphere");
  $("#tab-statevector").classList.toggle("hidden", !sv);
  $("#tab-probabilities").classList.toggle("hidden", !pr);
  $("#tab-qsphere").classList.toggle("hidden", !qs);
  const right = $("#right-panel");
  const anyViz = sv || pr || qs;
  right.style.display = anyViz ? "" : "none";
  // adjust grid
  if (!anyViz) $(".workspace").style.gridTemplateColumns = "260px 1fr";
  else $(".workspace").style.gridTemplateColumns = "";
  if (!get("graphical") && right.style.display === "none" && get("code")) {
    $(".center").style.gridColumn = "1 / -1";
  } else {
    $(".center").style.gridColumn = "";
  }
  const tabs = $$("#right-tabs .tab");
  tabs.forEach((t) => {
    const tabName = t.dataset.tab;
    const map = { statevector: sv, probabilities: pr, qsphere: qs };
    t.style.display = map[tabName] ? "" : "none";
  });
  if (!sv || !$("#tab-statevector").classList.contains("hidden")) {
    // pick first visible tab
    const firstVisible = tabs.find((t) => t.style.display !== "none");
    if (firstVisible) activateTab(firstVisible.dataset.tab);
  } else {
    const firstVisible = tabs.find((t) => t.style.display !== "none");
    if (firstVisible) activateTab(firstVisible.dataset.tab);
  }
}

function activateTab(name) {
  $$("#right-tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  ["statevector", "probabilities", "qsphere"].forEach((n) => {
    $("#tab-" + n).classList.toggle("hidden", n !== name);
  });
}

// ---------- actions ----------
function newCircuit() {
  pushHistory();
  state.name = "Untitled circuit";
  $("#circuit-name").value = state.name;
  state.qubits = [{ name: "q0" }, { name: "q1" }];
  state.classics = [];
  state.ops = [];
  state.selectedId = null;
  // default Bell state
  const h = placeGate("h", [0]);
  const cx = placeGate("cx", [0, 1]);
  const m0 = placeGate("measure", [0]);
  const m1 = placeGate("measure", [1]);
  state.classics = [{ name: "c0" }, { name: "c1" }];
  afterCircuitChange();
}

function clearCircuit() {
  pushHistory();
  state.ops = [];
  state.classics = [];
  state.selectedId = null;
  afterCircuitChange();
}

function manageRegisters() {
  notify("Qubits: " + state.qubits.length + ", classical bits: " + state.classics.length + ". Use +/− Qubit in the editor toolbar.");
}

function copyQasm() {
  const code = Qasm.fromCircuit(state);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => notify("Copied QASM to clipboard."), () => {});
    return;
  }
  const ta = $("#clipboard-buffer");
  ta.value = code;
  ta.select();
  document.execCommand("copy");
  notify("Copied QASM to clipboard.");
}

function duplicateFile() {
  const code = Qasm.fromCircuit(state);
  const b64 = btoa(unescape(encodeURIComponent(code)));
  window.open(location.pathname + "?qasm=" + b64, "_blank");
}

function shareFile() {
  const code = Qasm.fromCircuit(state);
  const b64 = btoa(unescape(encodeURIComponent(code)));
  const url = location.href.split("?")[0] + "?qasm=" + b64;
  copyQasm();
  notify("Circuit code copied. Share that code, or the link: " + url.slice(0, 60) + "…");
}

function saveFile() {
  const code = Qasm.fromCircuit(state);
  const name = ($("#circuit-name").value || "circuit").replace(/[^\w.-]+/g, "-");
  const blob = new Blob([code], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name + ".qasm";
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportImage() {
  const serialized = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (state.name || "circuit") + ".svg";
  a.click();
  URL.revokeObjectURL(url);
  notify("Circuit exported as SVG.");
}

function resetWorkspace() {
  $$(".menu-item input[data-panel]").forEach((cb) => ((cb.checked = true)));
  $("#graphical-editor").style.display = "";
  $("#code-editor").classList.remove("hidden");
  $(".workspace").style.gridTemplateColumns = "";
  $(".center").style.gridColumn = "";
  applyPanelToggles();
}

// ---------- tour ----------
const TOUR_SLIDES = [
  {
    title: "Build your first quantum circuit",
    body: "Quantum Composer offers a customizable set of tools to help you build, visualize, and run quantum circuits on a simulator. Your first circuit is a Bell state – two qubits in a maximally entangled state. Drag H and CX gates from the catalog onto the wires.",
  },
  {
    title: "Circuit view customization",
    body: "Add or remove qubits with the +/− Qubit buttons in the editor toolbar, and change alignment (Left / Freeform / Layers) from the View menu.",
  },
  {
    title: "Visualizations",
    body: "Watch the Statevector, Probabilities and Q-sphere panels update in real time. Click any gate to inspect it, edit rotation parameters, clone or delete it.",
  },
  {
    title: "Code editor",
    body: "Changes to the circuit are automatically synced with the code editor, and vice versa. Edit OpenQASM 2.0 text directly, or switch to a read-only Qiskit view. Export or upload .qasm files from the File menu.",
  },
  {
    title: "Run your circuit",
    body: "Press “Set up and run” to simulate the circuit and get measurement statistics. Everything runs locally in your browser.",
  },
];
function showTour(start) {
  let idx = start || 0;
  const modal = $("#tour-modal");
  modal.classList.remove("hidden");
  function render() {
    const s = TOUR_SLIDES[idx];
    $("#tour-title").textContent = s.title;
    $("#tour-text").textContent = s.body;
    $("#tour-img").src = "";
    $("#tour-img").style.display = "none";
    $("#tour-prev").style.visibility = idx === 0 ? "hidden" : "visible";
    $("#tour-next").textContent = idx === TOUR_SLIDES.length - 1 ? "Close" : "Next";
  }
  render();
  $("#tour-next").onclick = () => {
    idx++;
    if (idx >= TOUR_SLIDES.length) modal.classList.add("hidden");
    else render();
  };
  $("#tour-prev").onclick = () => {
    idx = Math.max(0, idx - 1);
    render();
  };
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
}

function showAbout() {
  notify("Quantum Composer — an interactive OpenQASM circuit editor and simulator. Built for learning, inspired by IBM Quantum Platform.");
}

// ---------- toolbar ----------
function bindToolbar() {
  $("#save-btn").addEventListener("click", saveFile);
  $("#run-btn").addEventListener("click", () => {
    $("#run-modal").classList.remove("hidden");
    $("#run-result").classList.add("hidden");
  });
  $("#run-start").addEventListener("click", () => runCircuit());
  $("#run-close").addEventListener("click", () => $("#run-modal").classList.add("hidden"));
  $("#run-close2").addEventListener("click", () => $("#run-modal").classList.add("hidden"));
  $("#run-modal").addEventListener("click", (e) => {
    if (e.target.id === "run-modal") $("#run-modal").classList.add("hidden");
  });
  $("#add-qubit-btn").addEventListener("click", () => {
    pushHistory();
    state.qubits.push({ name: "q" + state.qubits.length });
    afterCircuitChange();
  });
  $("#remove-qubit-btn").addEventListener("click", () => {
    if (state.qubits.length < 2) {
      notify("At least one qubit is required.");
      return;
    }
    pushHistory();
    const i = state.qubits.length - 1;
    state.ops = state.ops.filter((o) => !o.targets.includes(i));
    state.qubits.pop();
    afterCircuitChange();
  });
  $("#edit-name-btn").addEventListener("click", () => {
    state.name = $("#circuit-name").value;
    $("#circuit-name").focus();
  });
  $("#circuit-name").addEventListener("change", () => {
    state.name = $("#circuit-name").value;
  });
  $("#file-upload").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importFromText(String(reader.result), { pushHistory: true });
        state.name = f.name.replace(/\.qasm$/i, "");
        $("#circuit-name").value = state.name;
        afterCircuitChange();
        notify("Uploaded " + f.name);
      } catch (err) {
        notify("Could not parse file: " + err.message);
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  });
  $("#gate-info-close").addEventListener("click", () => {
    $("#gate-info").classList.add("hidden");
    state.selectedId = null;
    renderCircuit();
  });
}

// ---------- keyboard ----------
function bindKeys() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      if (document.activeElement === codeText) return;
      e.preventDefault();
      copyQasm();
      return;
    }
    if (e.key === "Escape") {
      state.pendingGate = null;
      state.pendingGhost = null;
      $("body").style.cursor = "";
      state.selectedId = null;
      $("#gate-info").classList.add("hidden");
      closeMenus();
      renderCircuit();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (document.activeElement === codeText || document.activeElement === $("#circuit-name")) return;
      if (state.selectedId != null) {
        e.preventDefault();
        pushHistory();
        removeOp(state.selectedId);
        $("#gate-info").classList.add("hidden");
        afterCircuitChange();
      }
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // move selection
    }
  });
}

// ---------- mousemove ghost for pending gate ----------
function bindGhostTracking() {
  const scroll = $("#canvas-scroll");
  scroll.addEventListener("mousemove", (e) => {
    if (!state.pendingGate) {
      if (state.pendingGhost) {
        state.pendingGhost = null;
        renderCircuit();
      }
      return;
    }
    const rect = svgEl.getBoundingClientRect();
    const x = e.clientX - rect.left + scroll.scrollLeft;
    const y = e.clientY - rect.top + scroll.scrollTop;
    const wire = wireFromY(y);
    const col = colFromX(x);
    state.pendingGhost = { targets: targetsForGate(state.pendingGate, wire) || [wire], col };
    renderCircuit();
  });
  scroll.addEventListener("mouseleave", () => {
    if (state.pendingGhost) {
      state.pendingGhost = null;
      renderCircuit();
    }
  });
}

// ---------- search filter ----------
function bindSearch() {
  $("#gate-search").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    const items = $$("#gate-palette .palette-gate");
    items.forEach((it) => {
      const spec = GATE_CATALOG[it.dataset.gate];
      const hay = (it.textContent + " " + (spec ? spec.name : "")).toLowerCase();
      it.style.display = hay.includes(q) ? "" : "none";
    });
    $$("#gate-palette .palette-group").forEach((gp) => {
      const any = Array.from(gp.querySelectorAll(".palette-gate")).some((it) => it.style.display !== "none");
      gp.style.display = any ? "" : "none";
    });
  });
}

// ---------- tabs ----------
function bindTabs() {
  $$("#right-tabs .tab").forEach((t) => {
    t.addEventListener("click", () => activateTab(t.dataset.tab));
  });
}

// ---------- init ----------
function loadFromHash() {
  const params = new URLSearchParams(location.search);
  const qasm = params.get("qasm");
  if (qasm) {
    try {
      const text = decodeURIComponent(escape(atob(qasm)));
      importFromText(text, { pushHistory: false });
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

function init() {
  state.alignment = "left";
  state.gateTheme = "default";
  buildPalette();
  bindMenus();
  bindToolbar();
  bindDragDrop();
  bindKeys();
  bindGhostTracking();
  bindSearch();
  bindTabs();
  $("#gate-info").classList.add("hidden");
  const loaded = loadFromHash();
  if (!loaded) newCircuit();
  else afterCircuitChange();
  renderCode();
  setSyncLabel("synced");
  if (!location.search.includes("qasm")) showTour(0);
}

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("resize", () => {
  if (lastSim) updateVisualizations();
  renderCircuit();
});