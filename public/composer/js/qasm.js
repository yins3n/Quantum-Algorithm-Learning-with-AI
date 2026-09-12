"use strict";

// ---------------------------------------------------------------------------
// OpenQASM 2.0 import / export
// ---------------------------------------------------------------------------

const Qasm = (function () {
  // ---- math expression evaluator for gate parameters (pi, sqrt, +,-,*,/) ----
  function evalExpr(expr) {
    const s = String(expr)
      .replace(/pi/g, "(" + Math.PI + ")")
      .replace(/sqrt/g, "Math.sqrt")
      .replace(/exp/g, "Math.exp")
      .trim();
    if (!s) return 0;
    try {
      const v = Function('"use strict";return (' + s + ")")();
      return typeof v === "number" && isFinite(v) ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function stripComments(line) {
    return line.replace(/\/\/.*$/, "").trim();
  }

  // Parse a gate arg string like "q[3]" or "c[1]" -> {reg, idx}
  function parseArg(a) {
    a = a.trim();
    const m = /^([a-zA-Z_]\w*)\s*\[\s*(\d+)\s*\]$/.exec(a);
    if (m) return { reg: m[1], idx: parseInt(m[2], 10) };
    const m2 = /^([a-zA-Z_]\w*)$/.exec(a);
    if (m2) return { reg: m2[1], idx: null };
    throw new Error("Bad argument: " + a);
  }

  // Convert a parsed circuit (from parseQasmText -> uses circuit build helpers)
  function toCircuit(text, builder) {
    // builder: { setQubits(n), addOp(name, targets, params, qubitNames) }
    const qubits = [];
    const qregs = [];
    const cregs = [];
    const usedQubits = [];
    const gatesApplied = [];

    const lines = text.split(/\n/);
    let found = false;
    for (const rawLine of lines) {
      let line = stripComments(rawLine);
      if (!line) continue;
      line = line.replace(/;/g, "; ").trim();
      // split on semicolons
      const stmts = line.split(";").map((s) => s.trim()).filter(Boolean);
      for (const stmtRaw of stmts) {
        const stmt = stripComments(stmtRaw);
        if (!stmt) continue;
        let parts = stmt.trim().split(/\s+/);
        const kw = parts[0];
        if (kw === "OPENQASM") {
          found = true;
          continue;
        }
        if (kw === "include") continue;
        if (kw === "qreg") {
          const m = /^([a-zA-Z_]\w*)\[(\d+)\]$/.exec(parts[1] || "");
          if (m) qregs.push({ name: m[1], size: parseInt(m[2], 10) });
          continue;
        }
        if (kw === "creg") {
          const m = /^([a-zA-Z_]\w*)\[(\d+)\]$/.exec(parts[1] || "");
          if (m) cregs.push({ name: m[1], size: parseInt(m[2], 10) });
          continue;
        }
        if (kw === "barrier") {
          // ignore barriers for import (kept simple)
          continue;
        }
        if (kw === "measure") {
          // measure q[i] -> c[j];
          const m = /measure\s+([^\->]+)\s*->\s*([^\s]+)/.exec(stmt);
          if (m) {
            const q = parseArg(m[1]);
            const c = parseArg(m[2]);
            if (q.idx == null) {
              // measure on whole register
              for (let i = 0; i < qregOf(q.reg).size; i++) {
                gatesApplied.push({ gate: "measure", targets: [qubitIndexOf(q.reg, i)] });
              }
            } else {
              gatesApplied.push({ gate: "measure", targets: [qubitIndexOf(q.reg, q.idx)] });
            }
          }
          continue;
        }
        // gate application: NAME [params] target, target, ...;
        const m = /^([a-zA-Z_]\w*)\s*(\((.*)\))?\s*(.*)$/.exec(stmt);
        if (!m) continue;
        const gateName = m[1];
        const paramStr = m[3] ? m[3].split(",") : [];
        const params = paramStr.map((p) => evalExpr(p));
        const argsStr = m[4] || "";
        const args = argsStr
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
          .map(parseArg);
        if (!args.length) continue;

        // flatten register targets
        for (const arg of args) {
          if (arg.reg === "q" || qregExists(arg.reg)) {
            if (arg.idx == null) {
              const reg = qregOf(arg.reg);
              for (let i = 0; i < reg.size; i++) usedQubits.push({ qreg: reg.name, idx: i });
            } else {
              usedQubits.push({ qreg: arg.reg, idx: arg.idx });
            }
          }
        }
        const gatesTargets = [];
        for (const arg of args) {
          if (arg.reg === "q" || qregExists(arg.reg)) {
            const reg = qregOf(arg.reg);
            if (arg.idx == null) {
              for (let i = 0; i < reg.size; i++) gatesTargets.push({ qreg: reg.name, idx: i });
            } else {
              gatesTargets.push({ qreg: arg.reg, idx: arg.idx });
            }
          }
        }
        if (gatesTargets.length) {
          gatesApplied.push({
            gate: gateName,
            targets: gatesTargets, // array of {qreg, idx}
            params,
          });
        }
      }
    }

    function qregExists(name) {
      return qregs.some((r) => r.name === name);
    }
    function qregOf(name) {
      const r = qregs.find((r) => r.name === name);
      if (r) return r;
      // fall back to a default one-qubit register named `name`
      return { name, size: 1 };
    }
    function qubitIndexOf(regName, idx) {
      // qubits are flattened in registration order
      let offset = 0;
      for (const r of qregs) {
        if (r.name === regName) return offset + idx;
        offset += r.size;
      }
      return idx;
    }

    if (!found && !qregs.length) {
      throw new Error("Not a valid OpenQASM file");
    }
    if (!qregs.length) throw new Error("Missing qreg declaration");

    const totalQubits = qregs.reduce((s, r) => s + r.size, 0);
    builder.setQubits(totalQubits, qregs.map((r) => r.name));

    for (const g of gatesApplied) {
      // resolve to flat qubit indices (measure gates already carry flat indexes)
      const targetIdxs = g.targets.map((t) =>
        typeof t === "object" && t !== null ? qubitIndexOf(t.qreg, t.idx) : t
      );
      const paramObj = {};
      const gp = g.gate;
      if (gp === "cx") {
        if (targetIdxs.length !== 2) continue;
        builder.addOp("cx", [targetIdxs[0], targetIdxs[1]], {});
      } else if (gp === "cz" || gp === "ch" || gp === "swap") {
        if (targetIdxs.length !== 2) continue;
        builder.addOp(gp, [targetIdxs[0], targetIdxs[1]], {});
      } else if (gp === "ccx") {
        if (targetIdxs.length !== 3) continue;
        builder.addOp("ccx", targetIdxs, {});
      } else if (["rx", "ry", "rz", "p", "u1"].includes(gp)) {
        builder.addOp(gp === "u1" ? "p" : gp, [targetIdxs[0]], { theta: g.params[0] || 0 });
      } else if (gp === "crz") {
        builder.addOp("crz", [targetIdxs[0], targetIdxs[1]], { theta: g.params[0] || 0 });
      } else if (gp === "cp") {
        builder.addOp("cp", [targetIdxs[0], targetIdxs[1]], { theta: g.params[0] || 0 });
      } else if (gp === "u" || gp === "u3") {
        builder.addOp("u", [targetIdxs[0]], { theta: g.params[0] || 0, phi: g.params[1] || 0, lambda: g.params[2] || 0 });
      } else if (gp === "measure") {
        builder.addOp("measure", [targetIdxs[0]], {});
      } else {
        // single-qubit simple gates
        builder.addOp(gp, [targetIdxs[0]], {});
      }
    }

    const measureOps = gatesApplied.filter((g) => g.gate === "measure");
    const cregSizes = measureOps.length;
    if (cregSizes) builder.setClassics(cregSizes);
    return true;
  }

  // ---- export ----
  function fromCircuit(circuit, gateLabel) {
    const nl = "\n";
    let out = "";
    out += "OPENQASM 2.0;" + nl;
    out += 'include "qelib1.inc";' + nl;
    out += nl;
    out += "qreg q[" + circuit.qubits.length + "];" + nl;
    const measCount = circuit.ops.filter((o) => o.gateKey === "measure").length;
    if (measCount) out += "creg c[" + measCount + "];" + nl + nl;

    const byCol = [];
    for (const op of circuit.ops) {
      if (!byCol[op.col]) byCol[op.col] = [];
      byCol[op.col].push(op);
    }
    let meantest = 0;
    for (let c = 0; c < byCol.length; c++) {
      const group = byCol[c];
      if (!group) continue;
      for (const op of group) {
        const t = op.targets;
        const gateLine = gateOpLine(op);
        if (op.gateKey === "measure") {
          out += "measure q[" + t[0] + "] -> c[" + meantest + "];" + nl;
          meantest++;
        } else {
          out += gateLine + nl;
        }
      }
    }
    return out.trim() + nl;

    function gateOpLine(op) {
      const g = op.gateKey;
      const t = op.targets;
      const p = op.params || {};
      const q = (i) => "q[" + t[i] + "]";
      switch (g) {
        case "cx":
          return "cx " + q(0) + "," + q(1);
        case "cz":
          return "cz " + q(0) + "," + q(1);
        case "ch":
          return "ch " + q(0) + "," + q(1);
        case "crz":
          return "crz(" + fmt(p.theta) + ") " + q(0) + "," + q(1);
        case "cp":
          return "cp(" + fmt(p.theta) + ") " + q(0) + "," + q(1);
        case "ccx":
          return "ccx " + q(0) + "," + q(1) + "," + q(2);
        case "swap":
          return "swap " + q(0) + "," + q(1);
        case "rx":
          return "rx(" + fmt(p.theta) + ") " + q(0);
        case "ry":
          return "ry(" + fmt(p.theta) + ") " + q(0);
        case "rz":
          return "rz(" + fmt(p.theta) + ") " + q(0);
        case "p":
          return "p(" + fmt(p.theta) + ") " + q(0);
        case "u":
          return "u(" + fmt(p.theta) + "," + fmt(p.phi) + "," + fmt(p.lambda) + ") " + q(0);
        case "sdg":
          return "sdg " + q(0);
        case "tdg":
          return "tdg " + q(0);
        case "sxdg":
          return "sxdg " + q(0);
        default:
          return g + " " + q(0);
      }
    }
    function fmt(x) {
      const v = Math.round(x * 100000) / 100000;
      return String(v).replace(/^-0$/, "0");
    }
  }

  return { toCircuit, fromCircuit };
})();