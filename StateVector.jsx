function StateVector({ alpha = 1, beta = 0 }) {
  return (
    <div className="state-vector">
      <h2>State Vector</h2>

      <p>
        |ψ⟩ = {alpha.toFixed(2)}|0⟩ + {beta.toFixed(2)}|1⟩
      </p>
    </div>
  );
}

export default StateVector;