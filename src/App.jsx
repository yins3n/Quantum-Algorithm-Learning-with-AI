import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import {
  LayoutDashboard,
  BookOpen,
  CircuitBoard,
  Trophy,
  Bot,
  BarChart3,
  Settings,
  Atom,
} from "lucide-react";

import Dashboard from "./pages/Dashboard";
import Learn from "./pages/Learn";
import CircuitLab from "./pages/CircuitLab";
import "./App.css";


function App() {
  return (
    <BrowserRouter>

      <div className="app">

        {/* SIDEBAR */}
        <aside className="sidebar">

          <div className="logo">

            <div className="logo-icon">
              <Atom size={24} />
            </div>

            <div>
              <h2>QuantumLearn</h2>
              <span>Interactive Quantum Lab</span>
            </div>

          </div>


          {/* NAVIGATION */}
          <nav className="nav">

            <Link to="/" className="nav-item">
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </Link>

            <Link to="/learn" className="nav-item">
              <BookOpen size={20} />
              <span>Learn</span>
            </Link>

            <Link to="/circuit-lab" className="nav-item">
              <CircuitBoard size={20} />
              <span>Circuit Lab</span>
            </Link>

            <Link to="/challenges" className="nav-item">
              <Trophy size={20} />
              <span>Challenges</span>
            </Link>

            <Link to="/ai-tutor" className="nav-item">
              <Bot size={20} />
              <span>AI Tutor</span>
            </Link>

            <Link to="/progress" className="nav-item">
              <BarChart3 size={20} />
              <span>Progress</span>
            </Link>

          </nav>


          {/* BOTTOM */}
          <div className="sidebar-bottom">

            <div className="nav-item">
              <Settings size={20} />
              <span>Settings</span>
            </div>

            <div className="profile">

              <div className="avatar">
                SH
              </div>

              <div>
                <strong>Sri Harsha</strong>
                <span>Quantum Learner</span>
              </div>

            </div>

          </div>

        </aside>


        {/* MAIN CONTENT */}
        <main className="main">

          <Routes>

            <Route
              path="/"
              element={<Dashboard />}
            />

            <Route
              path="/learn"
              element={<Learn />}
            />

            <Route
  path="/circuit-lab"
  element={<CircuitLab />}
/>

            <Route
              path="/challenges"
              element={
                <div>
                  <h1>Challenges</h1>
                  <p>Quantum challenges will be here.</p>
                </div>
              }
            />

            <Route
              path="/ai-tutor"
              element={
                <div>
                  <h1>AI Tutor</h1>
                  <p>Your AI quantum tutor will be here.</p>
                </div>
              }
            />

            <Route
              path="/progress"
              element={
                <div>
                  <h1>Progress</h1>
                  <p>Your learning progress will be shown here.</p>
                </div>
              }
            />

          </Routes>

        </main>

      </div>

    </BrowserRouter>
  );
}

export default App;