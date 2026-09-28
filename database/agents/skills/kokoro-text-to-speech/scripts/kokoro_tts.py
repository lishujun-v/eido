#!/usr/bin/env python3
"""Generate local Kokoro WAV audio without downloading a model at runtime."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SAMPLE_RATE = 24_000
DEFAULT_MODEL_DIR = Path("data/models/Kokoro-82M")
DEFAULT_VOICE = "zf_xiaobei"

def find_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "data" / "models").is_dir() and (candidate / "runtime" / "workspace" / "pyproject.toml").is_file():
            return candidate
    raise RuntimeError("Cannot locate repository root containing data/models/ and runtime/workspace/pyproject.toml")

ROOT = find_root()
MODEL_DIR = ROOT / DEFAULT_MODEL_DIR

def model_files() -> tuple[Path, Path]:
    return MODEL_DIR / "config.json", MODEL_DIR / "kokoro-v1_0.pth"

def resolve_voice(value: str) -> Path:
    supplied = Path(value).expanduser()
    if supplied.is_file():
        return supplied.resolve()
    candidate = MODEL_DIR / "voices" / (value if value.endswith(".pt") else f"{value}.pt")
    if candidate.is_file():
        return candidate
    raise FileNotFoundError(f"Voice pack not found: {value}. Expected {candidate}")

def check_environment(voice: str | None = None) -> list[str]:
    errors: list[str] = []
    config, weights = model_files()
    for path in (config, weights):
        if not path.is_file():
            errors.append(f"Missing local model file: {path}")
    try:
        import kokoro  # noqa: F401
        import soundfile  # noqa: F401
        import torch  # noqa: F401
    except ImportError as error:
        errors.append(f"Missing Python dependency: {error.name}")
    if voice:
        try:
            resolve_voice(voice)
        except FileNotFoundError as error:
            errors.append(str(error))
    return errors

def generate(text: str, output: Path, voice: str, lang: str, speed: float) -> float:
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline
    from kokoro.model import KModel

    config_path, weights_path = model_files()
    model = KModel(repo_id="hexgrad/Kokoro-82M", config=str(config_path), model=str(weights_path))
    pipeline = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M", model=model, device="cpu")
    chunks = [result.audio for result in pipeline(text, voice=str(resolve_voice(voice)), speed=speed)]
    if not chunks:
        raise ValueError("Kokoro did not produce audio; provide non-empty, speakable text.")
    audio = np.concatenate(chunks)
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, audio, SAMPLE_RATE)
    return len(audio) / SAMPLE_RATE

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check dependencies, local model, and optional voice only")
    parser.add_argument("--text", help="Text to synthesize")
    parser.add_argument("--output", type=Path, help="Output WAV path")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="Bundled voice name or .pt voice-pack path")
    parser.add_argument("--lang", default="z", help="Kokoro language code; z is Chinese")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed multiplier")
    return parser.parse_args()

def main() -> int:
    args = parse_args()
    errors = check_environment(args.voice)
    if args.check:
        if errors:
            print(json.dumps({"ready": False, "errors": errors}, ensure_ascii=False))
            return 1
        print(json.dumps({"ready": True, "model_dir": str(MODEL_DIR), "voice": str(resolve_voice(args.voice))}, ensure_ascii=False))
        return 0
    if errors:
        raise RuntimeError("Preflight failed:\n- " + "\n- ".join(errors))
    if not args.text or not args.text.strip():
        raise ValueError("--text is required and cannot be empty")
    if args.output is None:
        raise ValueError("--output is required")
    if args.output.suffix.lower() != ".wav":
        raise ValueError("Output must use the .wav extension")
    if not 0.25 <= args.speed <= 4.0:
        raise ValueError("--speed must be between 0.25 and 4.0")
    duration = generate(args.text, args.output.resolve(), args.voice, args.lang, args.speed)
    print(json.dumps({"output": str(args.output.resolve()), "sample_rate": SAMPLE_RATE, "duration_seconds": round(duration, 3)}, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
