import math
import os
import unittest
from pathlib import Path
from unittest import mock

from pydantic import ValidationError
from fastapi import HTTPException

from backend import app as backend


class BackendRemediationTests(unittest.TestCase):
    database_path = Path(__file__).with_name(".test-platform.db")

    @classmethod
    def setUpClass(cls):
        cls.database_path.unlink(missing_ok=True)
        backend.DB_PATH = cls.database_path
        os.environ["USER_ACCESS_MODE"] = "development"
        os.environ["DEV_USER_IDS"] = "demo-user"

    @classmethod
    def tearDownClass(cls):
        cls.database_path.unlink(missing_ok=True)

    def test_non_finite_gate_parameters_are_rejected(self):
        with self.assertRaises(ValidationError):
            backend.Gate(name="rx", qubits=[0], params=[math.nan])
        with self.assertRaises(ValidationError):
            backend.Gate(name="rz", qubits=[0], params=[math.inf])

    def test_explicit_measurement_uses_stable_classical_output(self):
        circuit = backend.Circuit(
            num_qubits=1,
            shots=16,
            gates=[
                backend.Gate(name="x", qubits=[0]),
                backend.Gate(name="measure", qubits=[0]),
            ],
        )

        self.assertEqual(backend.validate_circuit(circuit), [])
        result = backend.simulate(circuit)

        self.assertEqual(result["counts"], {"1": 16})
        self.assertEqual(result["probabilities"]["1"], 1.0)

    def test_fallback_without_circuit_is_concept_not_simulator_unavailable(self):
        fallback = backend.fallback_tutor([], None, [], has_circuit=False)

        self.assertEqual(fallback.error_category, "concept")
        self.assertNotEqual(fallback.error_category, "simulator_unavailable")
        self.assertIn("conceptual", fallback.explanation.lower())

    def test_fallback_with_failed_simulator_is_still_simulator_unavailable(self):
        fallback = backend.fallback_tutor([], {"engine": "unavailable", "probabilities": None}, [], has_circuit=True)

        self.assertEqual(fallback.error_category, "simulator_unavailable")

    def test_validated_response_repairs_null_error_category(self):
        fallback = backend.fallback_tutor([], None, [], has_circuit=False)
        raw = ('{"explanation": "Superposition means a qubit can be in a mix of states.", '
               '"error_category": null, "hint": "Try an H gate.", '
               '"suggested_fix": null, "next_step": "Build a circuit.", '
               '"teaching_steps": ["Build it."], "sources": ["Superposition"]}')

        repaired = backend._validated_response(raw, fallback)

        self.assertIsNotNone(repaired)
        self.assertIsInstance(repaired.error_category, str)
        self.assertTrue(repaired.error_category)

    def test_validated_response_rejects_garbage(self):
        fallback = backend.fallback_tutor([], None, [], has_circuit=False)

        self.assertIsNone(backend._validated_response("not json at all", fallback))
        self.assertIsNone(backend._validated_response("[1, 2, 3]", fallback))

    def test_validated_response_recovers_truncated_json(self):
        fallback = backend.fallback_tutor([], None, [], has_circuit=False)
        complete = ('{"explanation": "Superposition means a qubit can be in a mix of states.", '
                    '"error_category": "none", "hint": "Try an H gate.", '
                    '"suggested_fix": null, "next_step": "Build a circuit.", '
                    '"teaching_steps": ["Build it."], "sources": ["Superposition"]}')
        truncated = complete[:80]

        repaired = backend._validated_response(truncated, fallback)

        self.assertIsNotNone(repaired)
        self.assertTrue(repaired.explanation)
        self.assertIsInstance(repaired.error_category, str)

    def test_non_terminal_measurements_are_rejected(self):
        circuit = backend.Circuit(
            num_qubits=1,
            gates=[
                backend.Gate(name="measure", qubits=[0]),
                backend.Gate(name="x", qubits=[0]),
            ],
        )

        errors = backend.validate_circuit(circuit)

        self.assertTrue(any("measurements must be terminal" in error for error in errors))

    def test_user_profiles_are_bounded_in_development_mode(self):
        with self.assertRaises(HTTPException) as raised:
            backend.get_user("arbitrary-profile")

        self.assertEqual(raised.exception.status_code, 403)

    def test_health_and_readiness_report_real_dependencies(self):
        health = backend.health()

        self.assertEqual(health["status"], "ok")
        self.assertIn(health["dependencies"]["database"], {"available", "unavailable"})
        if health["dependencies"]["database"] == "available" and health["dependencies"]["simulator"] == "available":
            self.assertEqual(backend.readiness()["status"], "ready")

    def test_registration_login_and_token_ownership(self):
        request = backend.RegistrationRequest(
            user_id="auth-test-user",
            password="a-secure-password-123",
            display_name="Auth Test",
        )
        registered = backend.register(request)
        self.assertEqual(registered["token_type"], "bearer")
        logged_in = backend.login(
            backend.LoginRequest(user_id="auth-test-user", password="a-secure-password-123")
        )
        self.assertEqual(backend.token_user_id(f"Bearer {logged_in['access_token']}"), "auth-test-user")
        with self.assertRaises(HTTPException) as raised:
            backend.authenticated_user("other-user", f"Bearer {logged_in['access_token']}")
        self.assertEqual(raised.exception.status_code, 403)


class ComposerTutorTests(unittest.TestCase):
    database_path = Path(__file__).with_name(".test-platform.db")

    @classmethod
    def setUpClass(cls):
        cls.database_path.unlink(missing_ok=True)
        backend.DB_PATH = cls.database_path
        os.environ["USER_ACCESS_MODE"] = "development"
        os.environ["DEV_USER_IDS"] = "demo-user"

    @classmethod
    def tearDownClass(cls):
        cls.database_path.unlink(missing_ok=True)

    def _assist(self, raw, message="add an h gate to qubit 0", gates=()):
        circuit = backend.Circuit(num_qubits=1, gates=list(gates))
        request = backend.ComposerAssistRequest(user_id="demo-user", message=message, circuit=circuit)
        with mock.patch.object(backend, "_ollama_json", return_value=raw):
            return backend.composer_assist(request, authorization=None)

    def test_assist_applies_valid_edit(self):
        raw = ('{"edited": true, "explanation": "Added an H gate to qubit 0.", '
               '"circuit": {"num_qubits": 1, "gates": [{"name": "h", "qubits": [0], "params": []}]}}')
        recorded = []

        with mock.patch.object(backend, "record_tutor_interaction", side_effect=lambda *a, **k: recorded.append(a[1])):
            result = self._assist(raw)

        self.assertTrue(result["applied"])
        self.assertTrue(result["edited"])
        self.assertEqual(result["circuit"]["gates"], [{"name": "h", "qubits": [0], "params": []}])
        self.assertIn("qreg q[1]", result["qasm"])
        self.assertIn("h q[0];", result["qasm"])
        self.assertIsNotNone(result["simulation"]["probabilities"]["1"])
        self.assertEqual(recorded, ["add an h gate to qubit 0"])
        self.assertIsNone(result["reason"])

    def test_assist_question_leaves_circuit_untouched(self):
        raw = ('{"edited": false, "explanation": "Superposition lets a qubit represent 0 and 1 at once.", '
               '"circuit": {"num_qubits": 1, "gates": []}}')

        result = self._assist(raw, message="what is superposition?")

        self.assertFalse(result["applied"])
        self.assertFalse(result["edited"])
        self.assertIsNone(result["circuit"])
        self.assertEqual(result["message"], "Superposition lets a qubit represent 0 and 1 at once.")

    def test_assist_rejects_invalid_proposed_edit(self):
        raw = ('{"edited": true, "explanation": "Add a terminal region then an x.", '
               '"circuit": {"num_qubits": 1, "gates": ['
               '{"name": "measure", "qubits": [0], "params": []}, '
               '{"name": "x", "qubits": [0], "params": []}]}}')

        result = self._assist(raw)

        self.assertFalse(result["applied"])
        self.assertTrue(result["edited"])
        self.assertIn("measurements must be terminal", result["reason"])
        self.assertIsNone(result["circuit"])

    def test_assist_service_down_changes_nothing(self):
        result = self._assist(None)

        self.assertFalse(result["applied"])
        self.assertFalse(result["edited"])
        self.assertIsNone(result["circuit"])
        self.assertIn("unavailable", result["message"])

    def test_assist_unparseable_response_uses_fallback_explanation(self):
        with mock.patch.object(backend, "_composer_explain", return_value="fallback explanation"):
            result = self._assist("not json at all")

        self.assertFalse(result["applied"])
        self.assertEqual(result["message"], "fallback explanation")

    def test_qasm_emitter_maps_engine_names_for_composer(self):
        circuit = backend.Circuit(
            num_qubits=2,
            gates=[
                backend.Gate(name="i", qubits=[0]),
                backend.Gate(name="u1", qubits=[0], params=[1.5707963]),
                backend.Gate(name="u", qubits=[0], params=[0.5, 0.25, 0.1]),
                backend.Gate(name="measure", qubits=[0]),
                backend.Gate(name="measure", qubits=[1]),
            ],
        )

        qasm = backend._qasm_from_canonical_circuit(circuit)

        self.assertIn("id q[0];", qasm)
        self.assertIn("p(1.5708) q[0];", qasm)
        self.assertIn("u(0.5, 0.25, 0.1) q[0];", qasm)
        self.assertEqual(qasm.count("measure"), 2)


if __name__ == "__main__":
    unittest.main()
