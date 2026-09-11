import unittest

from fastapi.testclient import TestClient

from app.main import app


class APITestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_composer_templates(self):
        response = self.client.get("/api/composer/templates")
        self.assertEqual(response.status_code, 200)
        self.assertIn("bell_state", response.json()["templates"])

    def test_simulator(self):
        response = self.client.post("/api/simulator/run", json={"template_id": "bell_state", "shots": 100})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["shots"], 100)
        self.assertIn("counts", payload)

    def test_evaluator_submit(self):
        response = self.client.post(
            "/api/evaluator/submit",
            json={
                "problem_id": "sum_two_numbers",
                "submitted_outputs": ["5", "6", "0"],
                "code": "def solve(): pass",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["passed"], 3)

    def test_ai_help(self):
        response = self.client.post("/api/ai-help", json={"query": "How do I make a Bell state?"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["model"], "Granite 3.2 8B Instruct")


if __name__ == "__main__":
    unittest.main()
