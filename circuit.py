from qiskit import QuantumCircuit

def create_bell_state():
    qc = QuantumCircuit(2, 2)

    qc.h(0)
    qc.cx(0, 1)
    qc.measure([0, 1], [0, 1])

    return {
        "algorithm": "Bell State",
        "circuit": qc.draw(output="text")
    }


def create_superposition():
    qc = QuantumCircuit(1, 1)

    qc.h(0)
    qc.measure(0, 0)

    return {
        "algorithm": "Superposition",
        "circuit": qc.draw(output="text")
    }


def create_quantum_teleportation():
    qc = QuantumCircuit(3, 3)

    # 1. Prepare state to be teleported on qubit 0
    qc.h(0)

    # 2. Create entanglement between qubits 1 and 2
    qc.h(1)
    qc.cx(1, 2)

    # 3. Apply CNOT from qubit 0 to qubit 1
    qc.cx(0, 1)

    # 4. Apply H to qubit 0
    qc.h(0)

    # 5. Measure the first two qubits
    qc.measure(0, 0)
    qc.measure(1, 1)

    # 6. Apply classically controlled X and Z corrections to target qubit 2
    with qc.if_test((qc.clbits[1], 1)):
        qc.x(2)
    with qc.if_test((qc.clbits[0], 1)):
        qc.z(2)

    # 7. Measure the target qubit
    qc.measure(2, 2)

    return {
        "algorithm": "Quantum Teleportation",
        "circuit": qc.draw(output="text")
    }


def create_ghz_state():
    qc = QuantumCircuit(3, 3)

    qc.h(0)
    qc.cx(0, 1)
    qc.cx(1, 2)
    qc.measure([0, 1, 2], [0, 1, 2])

    return {
        "algorithm": "GHZ State",
        "circuit": qc.draw(output="text")
    }
