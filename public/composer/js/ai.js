(function () {
  "use strict";

  var ENGINE_BASE = (function () {
    try {
      return localStorage.getItem("quantum_engine_base") || "http://localhost:8000";
    } catch {
      return "http://localhost:8000";
    }
  })();
  var USER_ID = (function () {
    try {
      return localStorage.getItem("quantum_user_id") || "demo-user";
    } catch {
      return "demo-user";
    }
  })();
  function authToken() {
    try {
      return localStorage.getItem("quantum_access_token") || "";
    } catch {
      return "";
    }
  }
  function round5(v) {
    var r = Math.round(v * 1e5) / 1e5;
    return Object.is(r, -0) ? 0 : r;
  }

  var panel = document.getElementById("ai-panel");
  var messages = document.getElementById("ai-messages");
  var input = document.getElementById("ai-input");
  var sendBtn = document.getElementById("ai-send");
  if (!panel || !messages || !input || !sendBtn) return;

  var COMPOSER_TO_ENGINE = { id: "i", p: "u1" };
  var ONE_PARAM_KEYS = {
    rx: "theta", ry: "theta", rz: "theta", u1: "theta", crz: "theta", cp: "theta",
  };
  var U_KEYS = ["theta", "phi", "lambda"];

  function currentCircuit() {
    var gates = state.ops.map(function (op) {
      var gate = { name: COMPOSER_TO_ENGINE[op.gateKey] || op.gateKey, qubits: op.targets.slice() };
      var prm = op.params || {};
      if (op.gateKey === "u") {
        gate.params = U_KEYS.map(function (k) { return round5(prm[k] || 0); });
      } else if (ONE_PARAM_KEYS[op.gateKey] !== undefined) {
        gate.params = [round5(prm[ONE_PARAM_KEYS[op.gateKey]] || 0)];
      } else {
        gate.params = [];
      }
      return gate;
    });
    return { num_qubits: state.qubits.length, gates: gates };
  }

  function qasmFromCanonical(circ) {
    var lines = ["OPENQASM 2.0;", 'include "qelib1.inc";', "", "qreg q[" + (circ.num_qubits || 0) + "];"];
    var gates = Array.isArray(circ.gates) ? circ.gates : [];
    var measureCount = gates.filter(function (g) { return g.name === "measure"; }).length;
    if (measureCount) lines.push("creg c[" + measureCount + "];", "");
    var measured = 0;
    gates.forEach(function (g) {
      var name = g.name;
      var qubits = (g.qubits || []).map(function (i) { return "q[" + i + "]"; }).join(",");
      if (name === "measure") {
        lines.push("measure q[" + g.qubits[0] + "] -> c[" + measured + "];");
        measured += 1;
        return;
      }
      var params = (g.params || []).map(round5).join(",");
      if (name === "i") lines.push("id " + qubits + ";");
      else if (name === "u1") lines.push("p(" + (params || "0") + ") " + qubits + ";");
      else if (name === "u") lines.push("u(" + (params || "0,0,0") + ") " + qubits + ";");
      else if (ONE_PARAM_KEYS[name] !== undefined && params) lines.push(name + "(" + params + ") " + qubits + ";");
      else lines.push(name + " " + qubits + ";");
    });
    return lines.join("\n");
  }

  function applyCanonical(circ) {
    var qasm = circ.qasm || qasmFromCanonical(circ.circuit ? circ.circuit : circ);
    pushHistory();
    importFromText(qasm, { pushHistory: false });
    afterCircuitChange({ code: true, vis: true, select: true });
  }

  function appendBubble(text, kind, meta) {
    var wrap = document.createElement("div");
    wrap.className = "ai-msg ai-msg-" + (kind || "ai");
    var para = document.createElement("p");
    para.textContent = text;
    wrap.appendChild(para);
    if (meta) {
      var tag = document.createElement("span");
      tag.className = "ai-meta";
      tag.textContent = meta;
      wrap.appendChild(tag);
    }
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
    return wrap;
  }

  function sendingStatus() {
    var wrap = document.createElement("div");
    wrap.className = "ai-msg ai-msg-ai streaming";
    var para = document.createElement("p");
    wrap.appendChild(para);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
    return { wrap: wrap, para: para, chars: 0 };
  }

  function streamError(friendly) {
    var error = new Error(friendly || "The tutor returned an error. No changes were applied.");
    error.friendly = true;
    return error;
  }

  async function streamAssist(payload, pending) {
    var token = authToken();
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;

    var response;
    try {
      response = await fetch(ENGINE_BASE + "/composer/assist/stream", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
      });
    } catch {
      throw streamError("Could not reach the tutor service at " + ENGINE_BASE + ". Is the backend running?");
    }
    if (!response.ok) {
      var detail = "The tutor returned an error (" + response.status + "). No changes were applied.";
      try {
        var errorBody = await response.json();
        if (errorBody && errorBody.detail) detail = String(errorBody.detail);
      } catch {}
      throw streamError(detail);
    }
    if (!response.body) return null;

    var reader = response.body.getReader();
    var decoder = new TextDecoder("utf-8");
    var buffer = "";
    var result = null;
    for (;;) {
      var step;
      try {
        step = await reader.read();
      } catch {
        break;
      }
      buffer += decoder.decode(step.value, { stream: true });
      var splitAt;
      while ((splitAt = buffer.indexOf("\n\n")) >= 0) {
        var block = buffer.slice(0, splitAt);
        buffer = buffer.slice(splitAt + 2);
        var dataLine = null;
        var lines = block.split("\n");
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].indexOf("data:") === 0) dataLine = lines[i].slice(5).trim();
        }
        if (!dataLine) continue;
        var event;
        try {
          event = JSON.parse(dataLine);
        } catch {
          continue;
        }
        if (event.type === "delta" && typeof event.text === "string" && event.text.length > 0) {
          pending.para.textContent += event.text;
          pending.chars += 1;
          messages.scrollTop = messages.scrollHeight;
        } else if (event.type === "result" && event.result) {
          result = event.result;
        }
      }
      if (step.done) break;
    }
    return result;
  }

  function applyResultToCircuit(pending, result) {
    pending.wrap.classList.remove("streaming");
    if (!result) {
      pending.wrap.remove();
      appendBubble("The tutor returned an empty response.", "error");
      return;
    }
    if (pending.chars === 0 && result.message) {
      pending.para.textContent = result.message;
      pending.chars = 1;
    }
    var meta = null;
    if (result.applied) {
      try {
        applyCanonical(result);
        var gateCount = result.circuit ? result.circuit.gates.length : 0;
        meta = "Change applied \u2014 the circuit now has " + gateCount + " gate" + (gateCount === 1 ? "" : "s") + ".";
      } catch (applyError) {
        meta = "The tutor suggested a change, but the composer could not render it (" + applyError.message + ").";
      }
    } else if (result.reason) {
      meta = String(result.reason);
    }
    if (meta) {
      var tag = document.createElement("span");
      tag.className = "ai-meta";
      tag.textContent = meta;
      pending.wrap.appendChild(tag);
    }
  }

  async function send() {
    var text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    sendBtn.disabled = true;
    appendBubble(text, "user");
    input.value = "";
    input.style.height = "auto";
    var pending = sendingStatus();

    var payload = {
      user_id: USER_ID,
      message: text,
      circuit: currentCircuit(),
    };

    try {
      var result = await streamAssist(payload, pending);
      if (result && !result.applied && result.message && pending.chars > 1 && result.message !== pending.para.textContent) {
        pending.para.textContent = result.message;
      }
      applyResultToCircuit(pending, result);
    } catch (err) {
      pending.wrap.remove();
      appendBubble(err && err.friendly ? err.message : "Something went wrong while talking to the tutor. No changes were applied.", "error");
    } finally {
      sendBtn.disabled = false;
    }
  }

  document.getElementById("ai-tutor-btn").addEventListener("click", function () {
    panel.classList.add("open");
    input.focus();
  });
  document.getElementById("ai-panel-close").addEventListener("click", function () {
    panel.classList.remove("open");
  });
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && (ev.shiftKey || ev.ctrlKey || ev.metaKey || !input.value.includes("\n"))) {
      if (ev.shiftKey) return;
      ev.preventDefault();
      send();
    }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });
})();