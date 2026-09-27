"""Runs score.py with the eval's own Python environment (eval/.venv), on Windows or macOS/Linux."""
import subprocess
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
venv_python = here / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
python = str(venv_python) if venv_python.exists() else sys.executable
sys.exit(subprocess.call([python, "-W", "ignore", str(here / "score.py")]))
