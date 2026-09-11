"""Small dependency-free retrieval layer for trusted quantum teaching notes."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class KnowledgeChunk:
    id: str
    title: str
    text: str
    source: str
    concepts: tuple[str, ...]


KNOWLEDGE = (
    KnowledgeChunk(
        "gate-h",
        "Hadamard gate",
        "The H gate changes a computational-basis state into an equal superposition. Applied to |0>, ideal probabilities are 0.5 for 0 and 0.5 for 1.",
        "core quantum notes",
        ("h", "hadamard", "superposition"),
    ),
    KnowledgeChunk(
        "gate-cx",
        "Controlled-X gate",
        "CX has a control and a target. It flips the target when the control is 1. H followed by CX can create a Bell state and entanglement.",
        "core quantum notes",
        ("cx", "cnot", "entanglement", "bell"),
    ),
    KnowledgeChunk(
        "measurement",
        "Measurement",
        "Measurement converts a quantum state into classical outcomes. Counts vary with finite shots; statevector probabilities are the ideal reference.",
        "core quantum notes",
        ("measure", "measurement", "shots", "probability"),
    ),
    KnowledgeChunk(
        "validation",
        "Deterministic validation",
        "The circuit validator and Qiskit Aer are authoritative for gate errors, probabilities, counts, and exercise scores. The tutor explains these facts and must not replace them.",
        "platform design notes",
        ("validation", "evaluator", "aer", "score", "hallucination"),
    ),
)


def _tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9_+-]+", value.lower()))


def retrieve(query: str, limit: int = 3) -> list[KnowledgeChunk]:
    query_tokens = _tokens(query)
    scored = []
    for chunk in KNOWLEDGE:
        searchable = _tokens(f"{chunk.title} {chunk.text} {' '.join(chunk.concepts)}")
        score = len(query_tokens & searchable)
        if score:
            scored.append((score, chunk))
    scored.sort(key=lambda item: (-item[0], item[1].id))
    return [chunk for _, chunk in scored[:limit]]
