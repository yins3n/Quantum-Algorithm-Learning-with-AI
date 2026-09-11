import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function ProbabilityChart({ result }) {
  const data = Object.entries(result?.probabilities || {})
    .map(([state, probability]) => ({ state, probability: Number(probability) * 100 }))
    .filter((item) => item.probability > 0.001)
    .sort((a, b) => b.probability - a.probability);

  if (!data.length) return null;

  return (
    <div className="visualization-card">
      <div className="visualization-heading">
        <div><span className="eyebrow">RESULTS</span><h3>Probability distribution</h3></div>
        <span className="visualization-meta">{result.shots} shots</span>
      </div>
      <div className="probability-chart">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={data} margin={{ top: 12, right: 12, left: -18, bottom: 4 }}>
            <CartesianGrid stroke="#273246" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="state" tick={{ fill: "#8f9db4", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis unit="%" tick={{ fill: "#718099", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Probability"]} contentStyle={{ background: "#101927", border: "1px solid #30415a", borderRadius: 8 }} />
            <Bar dataKey="probability" fill="#42d3b2" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ProbabilityChart;
