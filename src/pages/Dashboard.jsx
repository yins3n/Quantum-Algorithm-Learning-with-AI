import {
  Atom,
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  CircuitBoard,
  Play,
  Sparkles,
} from "lucide-react";

function Dashboard() {
  return (
    <>
      {/* TOP BAR */}
      <header className="topbar">
        <div>
          <p className="page-label">DASHBOARD</p>
          <h1>Welcome back 👋</h1>
        </div>

        <button className="run-button">
          <Play size={17} />
          Open Circuit Lab
        </button>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-content">

          <div className="hero-badge">
            <Sparkles size={15} />
            AI-powered quantum learning
          </div>

          <h2>
            Explore the world of
            <span> Quantum Computing</span>
          </h2>

          <p>
            Learn quantum concepts, build circuits, run simulations,
            and understand the results with your AI tutor.
          </p>

          <button className="primary-button">
            Start Learning
            <ArrowRight size={18} />
          </button>

        </div>

        <div className="hero-atom">
          <Atom size={150} strokeWidth={1} />
        </div>
      </section>

      {/* QUICK ACTIONS */}
      <section className="section">

        <div className="section-heading">
          <div>
            <h2>Quick Actions</h2>
            <p>Jump directly into your quantum workspace.</p>
          </div>
        </div>

        <div className="quick-grid">

          <div className="action-card">

            <div className="action-icon circuit-icon">
              <CircuitBoard size={25} />
            </div>

            <h3>Circuit Lab</h3>

            <p>
              Build quantum circuits using an interactive
              drag-and-drop canvas.
            </p>

            <button>
              Build Circuit
              <ArrowRight size={16} />
            </button>

          </div>

          <div className="action-card">

            <div className="action-icon learn-icon">
              <BookOpen size={25} />
            </div>

            <h3>Continue Learning</h3>

            <p>
              Continue your quantum computing lessons
              and strengthen your concepts.
            </p>

            <button>
              Continue
              <ArrowRight size={16} />
            </button>

          </div>

          <div className="action-card">

            <div className="action-icon ai-icon">
              <Bot size={25} />
            </div>

            <h3>Ask AI Tutor</h3>

            <p>
              Ask questions, generate circuits,
              debug code, and understand quantum concepts.
            </p>

            <button>
              Ask Tutor
              <ArrowRight size={16} />
            </button>

          </div>

        </div>
      </section>

      {/* PROGRESS */}
      <section className="section">

        <div className="section-heading">

          <div>
            <h2>Your Progress</h2>
            <p>Keep building your quantum knowledge.</p>
          </div>

          <button className="view-button">
            View Progress
            <ArrowRight size={16} />
          </button>

        </div>

        <div className="progress-card">

          <div className="progress-info">

            <div className="progress-icon">
              <BarChart3 size={25} />
            </div>

            <div>
              <h3>Quantum Fundamentals</h3>
              <p>8 of 12 lessons completed</p>
            </div>

          </div>

          <div className="progress-bar-container">

            <div className="progress-bar">
              <div className="progress-fill"></div>
            </div>

            <strong>67%</strong>

          </div>

        </div>

      </section>
    </>
  );
}

export default Dashboard;