export const NUMBER_OF_QUBITS = 3;
export const NUMBER_OF_COLUMNS = 8;

export const TWO_QUBIT_GATES = new Set(["cx", "cy", "cz", "swap", "ch", "cp", "crx", "cry", "crz", "ecr", "csx"]);
export const THREE_QUBIT_GATES = new Set(["ccx", "cswap"]);
export const PARAMETRIC_GATES = new Set([
  "rx", "ry", "rz", "u", "u1", "u2", "u3", "r", "cp", "crx", "cry", "crz",
]);
export const GATE_PARAM_COUNTS = {
  rx: 1, ry: 1, rz: 1, u: 3, u1: 1, u2: 2, u3: 3, r: 2, cp: 1, crx: 1, cry: 1, crz: 1,
};

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
    const expectedQubits = group.name === "barrier"
      ? null
      : THREE_QUBIT_GATES.has(group.name)
        ? 3
        : TWO_QUBIT_GATES.has(group.name)
          ? 2
          : 1;
    const expectedParams = GATE_PARAM_COUNTS[group.name] || 0;
    const memberCount = group.members.length;

    if (expectedQubits !== null && memberCount !== expectedQubits) {
      return {
        valid: false,
        message: `${group.name.toUpperCase()} needs ${expectedQubits} qubit(s). Finish placing the gate or remove it.`,
      };
    }
    if (expectedQubits === null && (memberCount < 1 || memberCount > 3)) {
      return {
        valid: false,
        message: `${group.name.toUpperCase()} spans between 1 and 3 qubits.`,
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
