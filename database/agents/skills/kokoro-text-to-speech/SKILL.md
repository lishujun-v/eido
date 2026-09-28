---
name: kokoro-text-to-speech
description: "Generate WAV speech from text with the local Kokoro-82M model. Use when asked to turn Chinese or English text into spoken audio, make a voiceover, narrate copy, or synthesize speech locally with Kokoro."
---

# Kokoro Text to Speech

Generate 24 kHz WAV audio using the repository-local `data/models/Kokoro-82M` model and the `runtime/workspace/` uv project. Commands run from the Agent workspace, so locate the reusable source package through `../../database/agents/skills`. Do not assume the Python environment or model files are ready.

## Workflow

1. Obtain the text. Use `zf_xiaobei` by default; ask only if the user needs a different voice, speed, or output filename.
2. Run the preflight check first. Agent commands start in `runtime/workspace/`; the reusable source package is two directories above it:

   ```bash
   SKILL_DIR="$(cd ../../database/agents/skills/kokoro-text-to-speech && pwd)"; UV_CACHE_DIR=/tmp/eido-uv-cache uv run --project . python "$SKILL_DIR/scripts/kokoro_tts.py" --check
   ```

3. If dependencies are missing, explain the exact check failure and ask before running `UV_CACHE_DIR=/tmp/eido-uv-cache uv sync --project . --locked`. This can download packages and needs network access. If a model file or requested voice is missing, ask the user to provide its location or approve downloading it; never silently substitute a remote model.
4. After preflight succeeds, invoke the script. Put outputs in the shared workspace unless the user specifies another path:

   ```bash
   SKILL_DIR="$(cd ../../database/agents/skills/kokoro-text-to-speech && pwd)"; UV_CACHE_DIR=/tmp/eido-uv-cache uv run --project . python "$SKILL_DIR/scripts/kokoro_tts.py" \
     --text '你好，欢迎使用 Kokoro。' \
     --output artifacts/kokoro-tts.wav \
     --voice zf_xiaobei
   ```

5. Confirm the reported output path and duration. Return the WAV file as the generated artifact.

## Options

- Use `--voice /absolute/path/to/voice.pt` for a supplied voice pack, or `--voice zf_xiaobei` for the bundled Chinese voice.
- Use `--speed 0.8` to `1.2` for deliberate delivery changes; default is `1.0`.
- Use `--lang z` for Chinese (default), `a` for US English, or another Kokoro language code only when the text and voice support it.
- Pass multiline text directly; the script processes it in natural chunks and concatenates the audio.
