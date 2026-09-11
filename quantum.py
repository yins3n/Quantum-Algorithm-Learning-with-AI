from qiskit import QuantumCircuit


def generate_bell_state():
    # 1. Create a 2-qubit quantum circuit
    qc = QuantumCircuit(2)

    # 2. Apply a Hadamard gate to qubit 0
    qc.h(0)

    # 3. Apply a CNOT gate from qubit 0 (control) to qubit 1 (target)
    qc.cx(0, 1)

    # 4. Return the circuit as text
    return str(qc.draw(output="text"))
