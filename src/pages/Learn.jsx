import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2 } from "lucide-react";

const lessons = [
  {
    title: "Qubits and measurement",
    level: "Start here",
    summary: "Learn how |0>, |1>, probabilities, and measurement fit together.",
    outcomes: ["Read a single-qubit probability distribution", "Explain measurement as sampling"],
  },
  {
    title: "Superposition with H",
    level: "Beginner",
    summary: "Use the Hadamard gate to create and inspect an equal superposition.",
    outcomes: ["Place an H gate", "Verify 0 and 1 occur with equal probability"],
  },
  {
    title: "Entanglement with CX",
    level: "Beginner",
    summary: "Build a Bell state and connect circuit structure to correlated outcomes.",
    outcomes: ["Connect H and CX", "Submit a verified Bell-state solution"],
  },
];

const resources = [
  ["Qiskit Learning Platform", "Structured courses, tutorials, and hands-on quantum learning from the Qiskit community.", "https://quantum.cloud.ibm.com/learning"],
  ["Quantum Composer", "Experiment visually with gates and compare your circuit intuition with a professional composer.", "https://quantum.cloud.ibm.com/composer"],
  ["Qiskit documentation", "Use the official API reference and guides while you build runnable circuits.", "https://quantum.cloud.ibm.com/docs"],
  ["Qiskit Textbook archive", "Review the classic explanations of states, gates, algorithms, and applications.", "https://github.com/Qiskit/textbook"],
];

function Learn() {
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="page-label">FOUNDATIONS</p>
          <h1>Learn quantum computing</h1>
          <p>Short, runnable lessons that pair one concept with one experiment.</p>
        </div>
        <BookOpen size={32} />
      </div>
      <div className="lesson-grid">
        {lessons.map((lesson, index) => (
          <article className="card lesson-card" key={lesson.title}>
            <span className="eyebrow">{String(index + 1).padStart(2, "0")} · {lesson.level}</span>
            <h2>{lesson.title}</h2>
            <p>{lesson.summary}</p>
            <ul>
              {lesson.outcomes.map((outcome) => <li key={outcome}><CheckCircle2 size={15} />{outcome}</li>)}
            </ul>
            {index === 1 ? (
              <a className="text-link" href="/composer/index.html">
                Open lab <ArrowRight size={15} />
              </a>
            ) : (
              <Link className="text-link" to="/challenges">
                Open lab <ArrowRight size={15} />
              </Link>
            )}
          </article>
        ))}
      </div>
      <section className="resources-section">
        <div className="section-heading">
          <div><h2>Official Qiskit resources</h2><p>Continue with the source material behind the tools in this lab.</p></div>
        </div>
        <div className="resource-grid">
          {resources.map(([title, summary, url]) => (
            <a className="resource-card" href={url} target="_blank" rel="noreferrer" key={title}>
              <span className="resource-mark">Q</span>
              <div><h3>{title}</h3><p>{summary}</p><span className="resource-link">Open resource <ArrowRight size={14} /></span></div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Learn;
