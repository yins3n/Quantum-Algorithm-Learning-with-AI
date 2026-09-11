import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";

function ProbabilityChart({
  probability0 = 1,
  probability1 = 0
}) {
  const data = [
    {
      state: "|0⟩",
      probability: probability0
    },
    {
      state: "|1⟩",
      probability: probability1
    }
  ];

  return (
    <div>
      <h2>Measurement Probability</h2>

      <BarChart
        width={400}
        height={250}
        data={data}
      >
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis dataKey="state" />

        <YAxis domain={[0, 1]} />

        <Tooltip />

        <Bar dataKey="probability" />
      </BarChart>
    </div>
  );
}

export default ProbabilityChart;