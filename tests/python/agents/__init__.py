"""Test bootstrap for the canonical Eido Agent Server package."""

import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[3] / "src" / "agents" / "server" / "python"
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))
