export const NUMBER_OF_QUBITS = 3;
export const NUMBER_OF_COLUMNS = 8;

export const TWO_QUBIT_GATES = new Set(["cx", "cy", "cz", "swap", "ch"]);
export const THREE_QUBIT_GATES = new Set(["ccx"]);
export const PARAMETRIC_GATES = new Set(["rx", "ry", "rz", "u"]);

export function createEmptyCircuit(
  numQubits = NUMBER_OF_QUBITS,
  columns = NUMBER_OF_COLUMNS,
) {
  return Array.from({ length: numQubits }, () => Array(columns).fill(null));
}

function groupKey(cell, qubit, column) {
  return cell.id || `${cell.name}:${column}:${qubit}`;
}

export function getCircuitGroups(circuit) {
  const groups = new Map();

  circuit.forEach((row, qubit) => {
    row.forEach((cell, column) => {
      if (!cell) return;

      const stringName = typeof cell === "string" ? cell.toLowerCase() : null;
      const normalized = typeof cell === "string"
        ? {
          id: stringName === "cnot" || stringName === "cx"
            ? `cx:${column}`
            : `${cell}:${column}:${qubit}`,
          name: stringName === "cnot" ? "cx" : stringName,
          params: [],
          order: qubit,
        }
        : cell;
      const key = groupKey(normalized, qubit, column);
      const group = groups.get(key) || {
        id: key,
        name: normalized.name.toLowerCase(),
        params: normalized.params || [],
        column,
        members: [],
      };
      group.members.push({
        qubit,
        order: normalized.order ?? group.members.length,
        role: normalized.role,
        pending: normalized.pending,
      });
      if (!group.params.length && normalized.params?.length) {
        group.params = normalized.params;
      }
      groups.set(key, group);
    });
  });

  return [...groups.values()].sort((a, b) => a.column - b.column);
}

export function createCircuitJSON(circuit, shots = 1024) {
  const gates = getCircuitGroups(circuit).map((group) => ({
    name: group.name,
    qubits: group.members
      .sort((a, b) => a.order - b.order)
      .map((member) => member.qubit),
    params: group.params || [],
  }));

  return { num_qubits: circuit.length, shots, gates };
}

export function validateCircuit(circuit) {
  if (!Array.isArray(circuit) || circuit.length === 0) {
    return { valid: false, message: "Circuit is empty." };
  }
  if (circuit.some((row) => !Array.isArray(row))) {
    return { valid: false, message: "Invalid circuit rows." };
  }

  const groups = getCircuitGroups(circuit);
  for (const group of groups) {
    const expectedQubits = group.name === "ccx"
      ? 3
      : TWO_QUBIT_GATES.has(group.name)
        ? 2
        : 1;
    const expectedParams = group.name === "u"
      ? 3
      : PARAMETRIC_GATES.has(group.name)
        ? 1
        : 0;

    if (group.members.length !== expectedQubits) {
      return {
        valid: false,
        message: `${group.name.toUpperCase()} needs ${expectedQubits} qubit(s). Finish placing the gate or remove it.`,
      };
    }
    if ((group.params || []).length !== expectedParams) {
      return {
        valid: false,
        message: `${group.name.toUpperCase()} needs ${expectedParams} parameter(s).`,
      };
    }
  }

  return { valid: true, message: "Circuit is valid." };
}
