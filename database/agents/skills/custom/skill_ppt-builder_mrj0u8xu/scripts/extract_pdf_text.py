import argparse
import os


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True, help="Input PDF path")
    ap.add_argument("--out", required=True, help="Output .txt path (utf-8)")
    ap.add_argument("--max-pages", type=int, default=0, help="0 means all pages")
    args = ap.parse_args()

    try:
        import fitz  # PyMuPDF
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            "Missing dependency PyMuPDF. Install with: python -m pip install pymupdf\n"
            f"Original error: {e}"
        )

    doc = fitz.open(args.pdf)
    max_pages = args.max_pages if args.max_pages and args.max_pages > 0 else doc.page_count

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(f"FILE: {args.pdf}\n")
        f.write(f"PAGES: {doc.page_count}\n\n")
        for i in range(min(doc.page_count, max_pages)):
            page = doc.load_page(i)
            text = page.get_text("text")
            f.write(f"\n\n===== PAGE {i+1} =====\n")
            f.write(text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

