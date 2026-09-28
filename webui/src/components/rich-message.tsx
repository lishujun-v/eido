"use client";

import type { ReactNode } from "react";

type RichMessageTone = "agent" | "visitor" | "system";

type RichMessageProps = {
  text: string;
  tone?: RichMessageTone;
};

type InlinePart =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "strikethrough"; value: string }
  | { type: "image"; alt: string; src: string }
  | { type: "link"; label: string; href: string };

type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; depth: number; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "code"; language?: string; code: string }
  | { type: "rule" }
  | {
      type: "table";
      headers: string[];
      alignments: Array<"left" | "center" | "right">;
      rows: string[][];
    };

const inlinePattern =
  /(!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(~~([^~]+)~~)|(\*([^*]+)\*)/g;

export function RichMessage({ text, tone = "agent" }: RichMessageProps) {
  const blocks = parseMarkdownBlocks(text);

  return (
    <div className={richMessageClassName(tone)}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function renderBlock(block: Block, index: number) {
  if (block.type === "rule") {
    return <hr className="border-current/15" key={index} />;
  }

  if (block.type === "table") {
    return (
      <div className="rich-message-table" key={index}>
        <table>
          <thead>
            <tr>
              {block.headers.map((header, columnIndex) => (
                <th
                  className={tableAlignmentClass(block.alignments[columnIndex])}
                  key={`${index}-header-${columnIndex}`}
                >
                  {renderInline(header, `table-${index}-header-${columnIndex}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${index}-row-${rowIndex}`}>
                {block.headers.map((_, columnIndex) => (
                  <td
                    className={tableAlignmentClass(block.alignments[columnIndex])}
                    key={`${index}-cell-${rowIndex}-${columnIndex}`}
                  >
                    {renderInline(
                      row[columnIndex] || "",
                      `table-${index}-${rowIndex}-${columnIndex}`,
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.type === "heading") {
    const HeadingTag = `h${Math.min(block.depth, 3)}` as "h1" | "h2" | "h3";
    return (
      <HeadingTag className="font-semibold leading-snug" key={index}>
        {renderInline(block.text, `heading-${index}`)}
      </HeadingTag>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag
        className={`space-y-1 ${block.ordered ? "list-decimal" : "list-disc"} ps-5`}
        key={index}
      >
        {block.items.map((item, itemIndex) => (
          <li key={`${index}-${itemIndex}`}>
            {renderInline(item, `list-${index}-${itemIndex}`)}
          </li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "quote") {
    return (
      <blockquote
        className="border-l-2 border-current/25 pl-3 opacity-90"
        key={index}
      >
        {block.lines.map((line, lineIndex) => (
          <p key={`${index}-${lineIndex}`}>
            {renderInline(line, `quote-${index}-${lineIndex}`)}
          </p>
        ))}
      </blockquote>
    );
  }

  if (block.type === "code") {
    return (
      <pre
        className="overflow-x-auto rounded-md bg-slate-950/90 px-3 py-2 text-[0.92em] leading-6 text-slate-50"
        key={index}
      >
        <code>{block.code}</code>
      </pre>
    );
  }

  return (
    <p key={index}>
      {block.lines.map((line, lineIndex) => (
        <span key={`${index}-${lineIndex}`}>
          {lineIndex > 0 && <br />}
          {renderInline(line, `paragraph-${index}-${lineIndex}`)}
        </span>
      ))}
    </p>
  );
}

function parseMarkdownBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].match(/^```\s*$/)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({
        type: "code",
        language: fence[1],
        code: codeLines.join("\n"),
      });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        depth: heading[1].length,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const table = parseTable(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteLine = lines[index].match(/^>\s?(.*)$/);
        if (!quoteLine) {
          break;
        }
        quoteLines.push(quoteLine[1]);
        index += 1;
      }
      blocks.push({ type: "quote", lines: quoteLines });
      continue;
    }

    const list = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
    if (list) {
      const ordered = /\d+[.)]/.test(list[2]);
      const items: string[] = [];
      while (index < lines.length) {
        const listLine = lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
        if (!listLine || /\d+[.)]/.test(listLine[2]) !== ordered) {
          break;
        }
        items.push(listLine[3]);
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].match(/^```/) &&
      !lines[index].match(/^(#{1,6})\s+/) &&
      !lines[index].match(/^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/) &&
      !parseTable(lines, index) &&
      !lines[index].match(/^>\s?/) &&
      !lines[index].match(/^(\s*)([-*+]|\d+[.)])\s+/)
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks.length > 0 ? blocks : [{ type: "paragraph", lines: [""] }];
}

function parseTable(
  lines: string[],
  index: number,
): { block: Extract<Block, { type: "table" }>; nextIndex: number } | null {
  const headers = splitTableRow(lines[index] || "");
  const separator = splitTableRow(lines[index + 1] || "");

  if (
    headers.length < 1 ||
    headers.length !== separator.length ||
    !headers.some((header) => header.trim()) ||
    !separator.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
  ) {
    return null;
  }

  const alignments = separator.map((cell) => {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center" as const;
    if (trimmed.endsWith(":")) return "right" as const;
    return "left" as const;
  });
  const rows: string[][] = [];
  let nextIndex = index + 2;

  while (
    nextIndex < lines.length &&
    lines[nextIndex].trim() &&
    /(?<!\\)\|/.test(lines[nextIndex])
  ) {
    const row = splitTableRow(lines[nextIndex]);
    if (!row.length) break;
    rows.push(row.slice(0, headers.length));
    nextIndex += 1;
  }

  return {
    block: { type: "table", headers, alignments, rows },
    nextIndex,
  };
}

function splitTableRow(line: string) {
  const source = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const character of source) {
    if (character === "|" && !escaped) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }
  cells.push(current.trim());
  return cells;
}

function tableAlignmentClass(alignment: "left" | "center" | "right" | undefined) {
  if (alignment === "center") return "text-center";
  if (alignment === "right") return "text-right";
  return "text-left";
}

function renderInline(source: string, keyPrefix: string) {
  const parts = parseInline(source);

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.type === "code") {
      return (
        <code
          className="rounded bg-current/10 px-1.5 py-0.5 font-mono text-[0.92em]"
          key={key}
        >
          {part.value}
        </code>
      );
    }

    if (part.type === "bold") {
      return <strong key={key}>{part.value}</strong>;
    }

    if (part.type === "italic") {
      return <em key={key}>{part.value}</em>;
    }

    if (part.type === "strikethrough") {
      return <del key={key}>{part.value}</del>;
    }

    if (part.type === "link") {
      return (
        <a
          className="font-semibold underline decoration-current/40 underline-offset-4 transition hover:decoration-current"
          href={safeUrl(part.href)}
          key={key}
          rel="noreferrer"
          target="_blank"
        >
          {part.label}
        </a>
      );
    }

    if (part.type === "image") {
      return (
        <span className="my-2 block" key={key}>
          {/* eslint-disable-next-line @next/next/no-img-element -- chat images can come from arbitrary markdown sources */}
          <img
            alt={part.alt}
            className="max-h-72 max-w-full rounded-lg border border-current/10 object-contain"
            src={safeUrl(part.src)}
          />
        </span>
      );
    }

    return part.value;
  }) as ReactNode[];
}

function parseInline(source: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let lastIndex = 0;

  for (const match of source.matchAll(inlinePattern)) {
    if (match.index === undefined) {
      continue;
    }

    if (match.index > lastIndex) {
      parts.push({ type: "text", value: source.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      parts.push({ type: "image", alt: match[2] || "", src: match[3] });
    } else if (match[4]) {
      parts.push({ type: "link", label: match[5], href: match[6] });
    } else if (match[7]) {
      parts.push({ type: "code", value: match[8] });
    } else if (match[9]) {
      parts.push({ type: "bold", value: match[10] });
    } else if (match[11]) {
      parts.push({ type: "strikethrough", value: match[12] });
    } else if (match[13]) {
      parts.push({ type: "italic", value: match[14] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) {
    parts.push({ type: "text", value: source.slice(lastIndex) });
  }

  return parts;
}

function richMessageClassName(tone: RichMessageTone) {
  const base =
    "space-y-2 break-words text-sm leading-6 [&_h1]:text-[1.08em] [&_h2]:text-[1.04em] [&_h3]:text-[1em]";

  if (tone === "visitor") {
    return `${base} text-white [&_pre]:bg-blue-950/60`;
  }

  if (tone === "system") {
    return `${base} text-amber-800`;
  }

  return `${base} text-inherit`;
}

function safeUrl(url: string) {
  const trimmed = url.trim();

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    /^https?:\/\//i.test(trimmed) ||
    /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(trimmed) ||
    /^blob:/i.test(trimmed)
  ) {
    return trimmed;
  }

  return "#";
}
