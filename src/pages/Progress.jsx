import { useEffect, useState } from "react";
import NotebookCard from "../components/NotebookCard";
import { api } from "../services/api";
import { getCurrentUserId } from "../services/user";

function Progress() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.user(getCurrentUserId()).then(setProfile).catch((requestError) => setError(requestError.message));
  }, []);
  const attempts = profile?.skills?.attempts || 0;
  const passed = profile?.skills?.passed || 0;
  return <div className="page-content">
    <header className="page-hero"><p className="page-label">NOTEBOOK / PROGRESS</p><h1>Your progress</h1><p>Progress is based on evaluator-backed exercise attempts.</p></header>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <NotebookCard label="SUMMARY" title="Learner profile" meta={getCurrentUserId()}>
      <div className="result-metrics"><span><strong>{attempts}</strong> attempts</span><span><strong>{passed}</strong> passed</span><span><strong>{attempts ? Math.round((passed / attempts) * 100) : 0}%</strong> pass rate</span></div>
    </NotebookCard>
  </div>;
}

export default Progress;
