#!/usr/bin/env python3
"""Download the pinned local embedding model into the platform data directory."""

import argparse

from huggingface_hub import snapshot_download


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    snapshot_download(repo_id="BAAI/bge-small-zh-v1.5", local_dir=args.output)


if __name__ == "__main__":
    main()
