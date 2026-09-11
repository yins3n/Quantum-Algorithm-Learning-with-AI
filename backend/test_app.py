import math
import os
import unittest
from pathlib import Path

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

    def test_empty_expected_checks_are_not_a_success(self):
        request = backend.EvaluateRequest(
            user_id="demo-user",
            circuit=backend.Circuit(num_qubits=1, shots=8),
        )

        result = backend.evaluate(request)

        self.assertFalse(result["passed"])
        self.assertEqual(result["score"], 0)
        self.assertIn("at least one expected check is required.", result["feedback"])

    def test_non_finite_gate_parameters_are_rejected(self):
        with self.assertRaises(ValidationError):
            backend.Gate(name="rx", qubits=[0], params=[math.nan])
        with self.assertRaises(ValidationError):
            backend.Gate(name="rz", qubits=[0], params=[math.inf])

    def test_non_finite_expected_values_are_rejected(self):
        for expected in (
            {"probabilities": {"0": math.inf}},
            {"probabilities": {"0": 0.5}, "tolerance": math.inf},
        ):
            with self.subTest(expected=expected):
                request = backend.EvaluateRequest(
                    user_id="demo-user",
                    circuit=backend.Circuit(num_qubits=1),
                    expected=expected,
                )

                with self.assertRaises(HTTPException) as raised:
                    backend.evaluate(request)

                self.assertEqual(raised.exception.status_code, 422)

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


if __name__ == "__main__":
    unittest.main()
