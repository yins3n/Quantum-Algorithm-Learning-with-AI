import { useMemo, useState } from "react";

function BlochSphere({ result }) {
  const [qubit, setQubit] = useState(0);
  const vector = useMemo(() => {
    const amplitudes = (result?.statevector || []).map((item) => complex(item.real, item.imag));
    const size = Number(result?.probabilities ? Math.log2(amplitudes.length) : 0);
    if (!amplitudes.length || !Number.isInteger(size) || qubit >= size) return { x: 0, y: 0, z: 1 };
    let x = 0; let y = 0; let z = 0;
    amplitudes.forEach((alpha, index) => {
      const partner = index ^ (1 << qubit);
      if (index > partner) return;
      const beta = amplitudes[partner];
      const cross = multiply(conjugate(alpha), beta);
      x += 2 * cross.real;
      y += 2 * cross.imag;
      z += ((index & (1 << qubit)) ? -1 : 1) * magnitudeSquared(alpha);
      z += ((partner & (1 << qubit)) ? -1 : 1) * magnitudeSquared(beta);
    });
    return { x, y, z };
  }, [qubit, result]);

  if (!result?.statevector) return null;
  const angle = Math.atan2(vector.y, vector.x) * 180 / Math.PI;
  const tilt = Math.max(-48, Math.min(48, vector.z * 42));

  return (
    <div className="visualization-card bloch-card">
      <div className="visualization-heading">
        <div><span className="eyebrow">STATE VECTOR</span><h3>Bloch sphere</h3></div>
        <select value={qubit} onChange={(event) => setQubit(Number(event.target.value))} aria-label="Select qubit">
          {Array.from({ length: Math.log2(result.statevector.length) }, (_, index) => <option key={index} value={index}>q{index}</option>)}
        </select>
      </div>
      <div className="bloch-sphere" style={{ "--bloch-angle": `${angle}deg`, "--bloch-tilt": `${tilt}deg` }}>
        <div className="sphere-grid sphere-latitude" />
        <div className="sphere-grid sphere-longitude" />
        <div className="bloch-vector" />
        <span className="sphere-label sphere-zero">|0⟩</span>
        <span className="sphere-label sphere-one">|1⟩</span>
      </div>
      <div className="bloch-values"><span>X <strong>{vector.x.toFixed(3)}</strong></span><span>Y <strong>{vector.y.toFixed(3)}</strong></span><span>Z <strong>{vector.z.toFixed(3)}</strong></span></div>
    </div>
  );
}

function complex(real = 0, imag = 0) { return { real, imag }; }
function conjugate(value) { return complex(value.real, -value.imag); }
function multiply(a, b) { return complex(a.real * b.real - a.imag * b.imag, a.real * b.imag + a.imag * b.real); }
function magnitudeSquared(value) { return value.real ** 2 + value.imag ** 2; }

export default BlochSphere;
