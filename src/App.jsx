import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";

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
import Challenges from "./pages/Challenges";
import Tutor from "./pages/Tutor";
import ChallengeDetail from "./pages/ChallengeDetail";
import Registration from "./pages/Registration";
import Progress from "./pages/Progress";
import { getCurrentUserProfile } from "./services/user";
import AIChatDrawer from "./components/AIChatDrawer";
import "./App.css";


function App() {
  const [profile, setProfile] = useState(getCurrentUserProfile);

  useEffect(() => {
    const handleProfileUpdate = () => setProfile(getCurrentUserProfile());
    window.addEventListener("quantum-profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("quantum-profile-updated", handleProfileUpdate);
  }, []);

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

            <NavLink to="/" end className="nav-item">
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </NavLink>

            <NavLink to="/learn" className="nav-item">
              <BookOpen size={20} />
              <span>Learn</span>
            </NavLink>

            <NavLink to="/circuit-lab" className="nav-item">
              <CircuitBoard size={20} />
              <span>Circuit Lab</span>
            </NavLink>

            <NavLink to="/challenges" className="nav-item">
              <Trophy size={20} />
              <span>Challenges</span>
            </NavLink>

            <NavLink to="/ai-tutor" className="nav-item">
              <Bot size={20} />
              <span>AI Tutor</span>
            </NavLink>

            <NavLink to="/progress" className="nav-item">
              <BarChart3 size={20} />
              <span>Progress</span>
            </NavLink>

          </nav>


          {/* BOTTOM */}
          <div className="sidebar-bottom">

            <NavLink to="/register" className="nav-item">
              <Settings size={20} />
              <span>Profile settings</span>
            </NavLink>

            <div className="profile">

              <div className="avatar">
                {profile.displayName.slice(0, 2).toUpperCase()}
              </div>

              <div>
                <strong>{profile.displayName}</strong>
                <span>Quantum learner</span>
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
              element={<Challenges />}
            />
            <Route path="/challenges/:exerciseId" element={<ChallengeDetail />} />
            <Route path="/register" element={<Registration />} />

            <Route
              path="/ai-tutor"
              element={<Tutor />}
            />

            <Route path="/progress" element={<Progress />} />

          </Routes>

        </main>
        <AIChatDrawer />
      </div>

    </BrowserRouter>
  );
}

export default App;