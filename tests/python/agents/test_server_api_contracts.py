from __future__ import annotations

import tempfile
import unittest
import warnings
from pathlib import Path

warnings.filterwarnings(
    "ignore",
    message="Using `httpx` with `starlette.testclient` is deprecated.*",
)

from fastapi.testclient import TestClient

from eido_agent.config import AgentConfig
from eido_agent.runtime import AgentRuntime
from eido_agent.server import create_app


class AgentServerApiContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        root = Path(self.temp_directory.name)
        runtime = AgentRuntime(
            AgentConfig(
                data_dir=root / "database",
                skills_dir=root / "skills",
            )
        )
        self.client = TestClient(create_app(runtime))

    def tearDown(self) -> None:
        self.client.close()
        self.temp_directory.cleanup()

    def test_health_contract(self) -> None:
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ok")
        self.assertIsInstance(body["provider"], str)
        self.assertIsInstance(body["model"], str)
        self.assertIsInstance(body["mock"], bool)

    def test_empty_collection_contracts(self) -> None:
        agents = self.client.get("/agents")
        skills = self.client.get("/skills")

        self.assertEqual(agents.status_code, 200)
        self.assertEqual(agents.json(), {"agents": []})
        self.assertEqual(skills.status_code, 200)
        self.assertEqual(skills.json(), {"skills": []})

    def test_missing_resources_use_the_detail_error_contract(self) -> None:
        response = self.client.get("/agents/missing-agent")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Agent not found"})

    def test_request_validation_uses_fastapi_error_contract(self) -> None:
        response = self.client.post("/chat", json={"message": "hello"})

        self.assertEqual(response.status_code, 422)
        detail = response.json().get("detail")
        self.assertIsInstance(detail, list)
        self.assertTrue(detail)

    def test_agent_response_excludes_private_facts(self) -> None:
        response = self.client.post(
            "/agents",
            json={
                "id": "contract-agent",
                "name": "Contract Agent",
                "owner_user_id": "contract-user",
                "private_facts": {"secret": "must-not-leak"},
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("agent", body)
        self.assertEqual(body["agent"]["id"], "contract-agent")
        self.assertNotIn("private_facts", body["agent"])


if __name__ == "__main__":
    unittest.main()
