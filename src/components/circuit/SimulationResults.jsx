import NotebookCard from "../NotebookCard";
import "./SimulationResults.css";

function SimulationResults({ result }) {
  if (!result) {
    return (
      <div className="simulation-results empty">
        <div className="simulation-empty-icon">∿</div>
        <h3>Simulation notebook</h3>
        <p>Run your circuit to create a readable measurement output.</p>
      </div>
    );
  }

  const probabilities = Object.entries(result.probabilities || {})
    .map(([state, probability]) => ({ state, probability: Number(probability) * 100 }))
    .sort((a, b) => b.probability - a.probability);
  const counts = Object.entries(result.counts || {}).sort(([, a], [, b]) => b - a);

  if (!result.probabilities && result.message) {
    return (
      <div className="simulation-results">
        <NotebookCard label="OUTPUT" title="Simulation unavailable" meta={result.engine}>
          <p>{result.message}</p>
        </NotebookCard>
      </div>
    );
  }

  return (
    <div className="simulation-results">
      <div className="simulation-heading">
        <div>
          <p className="page-label">NOTEBOOK / OUTPUT</p>
          <h2>Simulation results</h2>
        </div>
        <span className="engine-pill">{result.engine || "simulator"}</span>
      </div>

      <div className="simulation-notebook-grid">
        <NotebookCard label="SUMMARY" title="Run overview" meta={`${result.shots ?? "—"} shots`}>
          <div className="result-metrics">
            <span><strong>{result.shots ?? "—"}</strong> total shots</span>
            <span><strong>{counts.length}</strong> measured states</span>
          </div>
          <p className="notebook-muted">The bars below show the ideal state probabilities returned by the simulator.</p>
        </NotebookCard>

        <NotebookCard label="MEASUREMENTS" title="Observed counts">
          {counts.length ? (
            <div className="counts-grid">
              {counts.map(([state, count]) => (
                <div className="count-chip" key={state}>
                  <span>|{state}⟩</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          ) : <p className="notebook-muted">No measurement counts were returned.</p>}
        </NotebookCard>
      </div>

      <NotebookCard label="STATE PROBABILITIES" title="Probability distribution">
        {probabilities.length ? (
          <div className="probability-list">
            {probabilities.map((item) => (
              <div className="probability-row" key={item.state}>
                <span>|{item.state}⟩</span>
                <div className="probability-bar" aria-label={`${item.state}: ${item.probability.toFixed(1)} percent`}>
                  <div className="probability-fill" style={{ width: `${Math.min(item.probability, 100)}%` }} />
                </div>
                <strong>{item.probability.toFixed(1)}%</strong>
              </div>
            ))}
          </div>
        ) : <p className="notebook-muted">Probability data was not returned by this engine.</p>}
      </NotebookCard>
    </div>
  );
}

export default SimulationResults;
