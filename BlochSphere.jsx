function BlochSphere() {
  return (
    <div>
      <h2>Bloch Sphere</h2>

      <div className="bloch-sphere">
        <div className="vertical-line"></div>
        <div className="horizontal-line"></div>

        <span className="zero">|0⟩</span>
        <span className="one">|1⟩</span>
      </div>
    </div>
  );
}

export default BlochSphere;