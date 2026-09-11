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
            <Link className="text-link" to={index === 1 ? "/circuit-lab" : "/challenges"}>
              Open lab <ArrowRight size={15} />
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}

export default Learn;
