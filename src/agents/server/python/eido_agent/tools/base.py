"""Small, provider-neutral tool contract used by the Eido runtime."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class Tool(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        ...

    @property
    @abstractmethod
    def parameters(self) -> dict[str, Any]:
        ...

    @abstractmethod
    async def execute(self, **kwargs: Any) -> Any:
        ...

    async def preflight(self, **kwargs: Any) -> None:
        """Validate authorization before any tool in the batch starts.

        Tools with policy-controlled side effects should override this method
        and repeat the same check inside ``execute`` before touching state.
        """

    def schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }
