async function getJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

let currentProblemId = null;
const allowedNotebookUrls = new Set();

async function loadComposerTemplates() {
  const data = await getJSON("/api/composer/templates");
  const select = document.getElementById("templateSelect");
  select.innerHTML = "";

  Object.entries(data.templates).forEach(([id, info]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = info.name;
    select.appendChild(option);
  });

  document.getElementById("qasmEditor").value = data.templates[select.value].qasm;
}

async function runSimulation() {
  const shots = Number(document.getElementById("shots").value || "1024");
  const qasm = document.getElementById("qasmEditor").value;
  const data = await getJSON("/api/simulator/run", {
    method: "POST",
    body: JSON.stringify({ qasm, shots }),
  });
  document.getElementById("simulationOutput").textContent = JSON.stringify(data.counts, null, 2);
}

async function loadProblem() {
  const data = await getJSON("/api/evaluator/problems");
  const [problemId, problem] = Object.entries(data.problems)[0];
  currentProblemId = problemId;

  document.getElementById("problemTitle").textContent = `Problem: ${problem.title}`;
  document.getElementById("problemDescription").textContent = problem.description;

  const sampleInputs = document.getElementById("sampleInputs");
  sampleInputs.innerHTML = "";
  problem.samples.forEach((sample, index) => {
    const row = document.createElement("div");

    const label = document.createElement("label");
    label.textContent = `Sample ${index + 1} input: `;
    const code = document.createElement("code");
    code.textContent = sample.input;
    label.appendChild(code);

    const input = document.createElement("input");
    input.setAttribute("data-sample-output", String(index));
    input.setAttribute("placeholder", "Expected output");

    row.appendChild(label);
    row.appendChild(input);
    sampleInputs.appendChild(row);
  });
}

async function submitEvaluation() {
  const code = document.getElementById("codeEditor").value;
  const outputInputs = Array.from(document.querySelectorAll("[data-sample-output]"));
  const submitted_outputs = outputInputs.map((input) => input.value);

  const data = await getJSON("/api/evaluator/submit", {
    method: "POST",
    body: JSON.stringify({ problem_id: currentProblemId, submitted_outputs, code }),
  });

  document.getElementById("evaluationOutput").textContent = JSON.stringify(data, null, 2);
}

async function loadNotebooks() {
  const data = await getJSON("/api/notebooks");
  const select = document.getElementById("notebookSelect");
  select.innerHTML = "";
  allowedNotebookUrls.clear();

  data.notebooks.forEach((notebook) => {
    const option = document.createElement("option");
    option.value = notebook.url;
    option.textContent = notebook.title;
    allowedNotebookUrls.add(notebook.url);
    select.appendChild(option);
  });

  setNotebookFrame(select.value);
}

function setNotebookFrame(selectedUrl) {
  if (!allowedNotebookUrls.has(selectedUrl)) {
    throw new Error("Notebook URL is not in the allowed list.");
  }
  const parsed = new URL(selectedUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS notebook URLs are allowed.");
  }
  document.getElementById("notebookFrame").src = parsed.toString();
}

async function askAI() {
  const query = document.getElementById("aiQuery").value;
  const data = await getJSON("/api/ai-help", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  document.getElementById("aiOutput").textContent = `${data.model}\n\nQ: ${data.query}\nA: ${data.answer}`;
}

document.getElementById("loadTemplate").addEventListener("click", async () => {
  const templates = await getJSON("/api/composer/templates");
  const selected = document.getElementById("templateSelect").value;
  document.getElementById("qasmEditor").value = templates.templates[selected].qasm;
});

document.getElementById("runSimulation").addEventListener("click", () => runSimulation().catch(alert));
document.getElementById("submitEvaluation").addEventListener("click", () => submitEvaluation().catch(alert));
document.getElementById("openNotebook").addEventListener("click", () => {
  const selectedUrl = document.getElementById("notebookSelect").value;
  setNotebookFrame(selectedUrl);
});
document.getElementById("askAi").addEventListener("click", () => askAI().catch(alert));

Promise.all([loadComposerTemplates(), loadProblem(), loadNotebooks()]).catch(alert);
