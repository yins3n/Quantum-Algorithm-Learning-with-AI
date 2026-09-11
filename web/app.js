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
    row.innerHTML = `
      <label>Sample ${index + 1} input: <code>${sample.input}</code></label>
      <input data-sample-output="${index}" placeholder="Expected output" />
    `;
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

  data.notebooks.forEach((notebook) => {
    const option = document.createElement("option");
    option.value = notebook.url;
    option.textContent = notebook.title;
    select.appendChild(option);
  });

  document.getElementById("notebookFrame").src = select.value;
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
  document.getElementById("notebookFrame").src = selectedUrl;
});
document.getElementById("askAi").addEventListener("click", () => askAI().catch(alert));

Promise.all([loadComposerTemplates(), loadProblem(), loadNotebooks()]).catch(alert);
