"""Browser tool policy and schema checks without launching Chromium in CI."""

import asyncio
import unittest
from unittest.mock import patch

from eido_agent.tools.browser import BrowserTool, _public_url


class BrowserToolTests(unittest.TestCase):
    def test_rejects_local_and_non_http_urls(self):
        for url in ("file:///etc/passwd", "http://127.0.0.1:8000", "http://localhost:3000", "https://user:pass@example.com"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                asyncio.run(_public_url(url))

    def test_accepts_public_host(self):
        async def public_dns(*_args, **_kwargs):
            return [(2, 1, 6, "", ("93.184.215.14", 443))]

        with patch("asyncio.base_events.BaseEventLoop.getaddrinfo", public_dns):
            self.assertEqual(asyncio.run(_public_url("https://example.com/")), "https://example.com/")

    def test_actions_are_bounded(self):
        schema = BrowserTool(None).parameters
        self.assertEqual(schema["properties"]["action"]["enum"],
                         ["navigate", "inspect", "click", "fill", "scroll", "press", "screenshot"])
        self.assertFalse(schema["additionalProperties"])
