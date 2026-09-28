#!/usr/bin/env python3
"""One-shot, offline embedding runner for BAAI/bge-small-zh-v1.5."""

import argparse
import json
import sys

import torch
from transformers import AutoModel, AutoTokenizer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    args = parser.parse_args()
    payload = json.load(sys.stdin)
    texts = payload.get("texts", [])
    if not isinstance(texts, list) or not all(isinstance(text, str) for text in texts):
        raise ValueError("texts must be a string array")

    tokenizer = AutoTokenizer.from_pretrained(args.model_dir, local_files_only=True)
    model = AutoModel.from_pretrained(args.model_dir, local_files_only=True)
    model.eval()
    with torch.inference_mode():
        encoded = tokenizer(texts, padding=True, truncation=True, max_length=512, return_tensors="pt")
        # BGE uses its CLS representation; normalisation enables cosine dot products.
        vectors = model(**encoded).last_hidden_state[:, 0]
        vectors = torch.nn.functional.normalize(vectors, p=2, dim=1)

    print(json.dumps({
        "model": "BAAI/bge-small-zh-v1.5",
        "dimensions": int(vectors.shape[1]),
        "vectors": vectors.cpu().tolist(),
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise
