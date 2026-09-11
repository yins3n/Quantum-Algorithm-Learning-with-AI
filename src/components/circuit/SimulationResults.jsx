import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import "./SimulationResults.css";


function SimulationResults({ result }) {

  if (!result) {
    return (
      <div className="simulation-results empty">

        <h3>
          Simulation Results
        </h3>

        <p>
          Run your circuit to see simulation results here.
        </p>

      </div>
    );
  }


  /* =========================
     CONVERT PROBABILITIES
     INTO CHART DATA
  ========================= */

  const chartData = Object.entries(
    result.probabilities || {}
  ).map(([state, probability]) => ({
    state: state,
    probability: probability * 100,
  }));


  return (
    <div className="simulation-results">

      <h3>
        Simulation Results
      </h3>


      {/* =========================
          PROBABILITY CHART
      ========================= */}

      <div className="result-section">

        <h4>
          Measurement Probabilities
        </h4>

        <div
          className="probability-chart"
          style={{
            width: "100%",
            height: "300px",
          }}
        >

          <ResponsiveContainer
            width="100%"
            height="100%"
          >

            <BarChart
              data={chartData}
              margin={{
                top: 20,
                right: 20,
                left: 10,
                bottom: 20,
              }}
            >

              <CartesianGrid
                strokeDasharray="3 3"
              />

              <XAxis
                dataKey="state"
                label={{
                  value: "Quantum State",
                  position: "insideBottom",
                  offset: -10,
                }}
              />

              <YAxis
                domain={[0, 100]}
                label={{
                  value: "Probability (%)",
                  angle: -90,
                  position: "insideLeft",
                }}
              />

              <Tooltip
                formatter={(value) => [
                  `${Number(value).toFixed(1)}%`,
                  "Probability",
                ]}
              />

              <Bar
                dataKey="probability"
                name="Probability"
                radius={[6, 6, 0, 0]}
              />

            </BarChart>

          </ResponsiveContainer>

        </div>


        {/* =========================
            PROBABILITY VALUES
        ========================= */}

        <div className="probability-list">

          {chartData.map((item) => (

            <div
              className="probability-row"
              key={item.state}
            >

              <span>
                |{item.state}⟩
              </span>


              <div className="probability-bar">

                <div
                  className="probability-fill"
                  style={{
                    width: `${item.probability}%`,
                  }}
                />

              </div>


              <span>
                {item.probability.toFixed(1)}%
              </span>

            </div>

          ))}

        </div>

      </div>


      {/* =========================
          STATEVECTOR
      ========================= */}

      <div className="result-section">

        <h4>
          Statevector
        </h4>

        <pre>
          {JSON.stringify(
            result.statevector || [],
            null,
            2
          )}
        </pre>

      </div>

    </div>
  );
}


export default SimulationResults;