"""Regression coverage for provider-key compatibility and authentication."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from eido_agent.config import AgentConfig
from eido_agent.llm import _headers


class ProviderConfigurationTests(unittest.TestCase):
    def test_legacy_alphanumeric_key_is_not_treated_as_an_env_var(self):
        key = "alphanumeric-key".replace("-", "")
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(AgentConfig._resolve_api_key_env(key), key)

    def test_environment_variable_name_is_resolved(self):
        with patch.dict("os.environ", {"LENOVO_API_KEY": "resolved-key"}, clear=True):
            self.assertEqual(AgentConfig._resolve_api_key_env("LENOVO_API_KEY"), "resolved-key")

    def test_anthropic_bearer_configuration_adds_authorization_header(self):
        config = AgentConfig(api_key="secret", auth_header="authorization_bearer")
        self.assertEqual(_headers(config), {"authorization": "Bearer secret"})


if __name__ == "__main__":
    unittest.main()
