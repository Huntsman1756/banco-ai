import { Buffer } from "node:buffer";

const MIN_EXTRACTED_LEN = 150;

type PdfDecodedToken = {
  kind: "text";
  value: string;
};

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]+/g, " ")
    .trim();
}

function normalizeForSignals(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isAcceptedTextChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if (/[A-Za-z0-9\s]/.test(char)) {
    return true;
  }
  if (".,:;!?%()[]{}+-_/\\'\"".includes(char)) {
    return true;
  }
  return (
    code === 0x00A0 ||
    code === 0x00AA ||
    code === 0x00BA ||
    code === 0x20AC ||
    code === 0x00C1 ||
    code === 0x00C9 ||
    code === 0x00CD ||
    code === 0x00D3 ||
    code === 0x00DA ||
    code === 0x00DC ||
    code === 0x00D1 ||
    code === 0x00E1 ||
    code === 0x00E9 ||
    code === 0x00ED ||
    code === 0x00F3 ||
    code === 0x00FA ||
    code === 0x00FC ||
    code === 0x00F1
  );
}

function hasUsableExtractedText(value: string): boolean {
  if (value.length < MIN_EXTRACTED_LEN) {
    return false;
  }

  let accepted = 0;
  for (const char of value) {
    if (isAcceptedTextChar(char)) {
      accepted += 1;
    }
  }

  const acceptedRatio = accepted / value.length;
  if (acceptedRatio < 0.78) {
    return false;
  }

  const normalized = normalizeForSignals(value);
  return /\b(cuenta|remunerada|deposito|interes|intereses|tae|tin|saldo|nomina|comision|comisiones|banco|contrato)\b/u.test(
    normalized,
  );
}

function decodePdfLiteral(token: string): string {
  let i = 0;
  let out = "";
  while (i < token.length) {
    const current = token[i];
    if (current !== "\\") {
      out += current;
      i += 1;
      continue;
    }

    const next = token[i + 1];
    if (next === undefined) {
      i += 1;
      continue;
    }

    if (next === "n") {
      out += "\n";
      i += 2;
      continue;
    }
    if (next === "r") {
      out += "\r";
      i += 2;
      continue;
    }
    if (next === "t") {
      out += "\t";
      i += 2;
      continue;
    }
    if (next === "b") {
      out += "\b";
      i += 2;
      continue;
    }
    if (next === "f") {
      out += "\f";
      i += 2;
      continue;
    }
    if (next === "\\") {
      out += "\\";
      i += 2;
      continue;
    }
    if (next === "(") {
      out += "(";
      i += 2;
      continue;
    }
    if (next === ")") {
      out += ")";
      i += 2;
      continue;
    }

    if (/[0-7]/.test(next)) {
      const octal = token.slice(i + 1, i + 4).replace(/[^0-7].*$/, "");
      const code = Number.parseInt(octal, 8);
      if (Number.isFinite(code)) {
        out += String.fromCharCode(code);
      }
      i += 1 + octal.length;
      continue;
    }

    out += next;
    i += 2;
  }

  return out;
}

function decodePdfHex(token: string): string {
  const cleaned = token.replace(/\s+/g, "").toUpperCase();
  if (cleaned.length % 2 === 1) {
    return "";
  }
  const bytes = Buffer.from(cleaned, "hex");
  if (bytes.length === 0) {
    return "";
  }

  const utf16 = bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF;
  if (utf16 && bytes.length > 2) {
    return bytes.slice(2).toString("utf16le");
  }

  return bytes.toString("latin1");
}

function extractPdfTokens(section: string): PdfDecodedToken[] {
  const rawTokens = section.match(/\((?:\\.|[^\\)])*\)|<[^>]*>/g) ?? [];
  const tokens: PdfDecodedToken[] = [];
  for (const token of rawTokens) {
    if (token.length < 3) {
      continue;
    }
    if (token.startsWith("<") && token.endsWith(">")) {
      const decoded = decodePdfHex(token.slice(1, -1));
      if (decoded) {
        tokens.push({ kind: "text", value: decoded });
      }
      continue;
    }
    if (token.startsWith("(") && token.endsWith(")")) {
      const decoded = decodePdfLiteral(token.slice(1, -1));
      if (decoded) {
        tokens.push({ kind: "text", value: decoded });
      }
    }
  }
  return tokens;
}

function extractPdfTextFromSection(section: string): string {
  const tokens = extractPdfTokens(section);
  const lines = tokens
    .map((entry) => normalizeExtractedText(entry.value))
    .filter((entry) => entry.length > 0);
  return normalizeExtractedText(lines.join(" "));
}

function extractFromBinaryPdf(raw: string): string {
  const streamMatches = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  const btMatches = [...raw.matchAll(/BT([\s\S]*?)ET/g)];
  const fragments: string[] = [];

  for (const match of streamMatches) {
    const streamBody = match[1] ?? "";
    const streamText = extractPdfTextFromSection(streamBody);
    if (streamText) {
      fragments.push(streamText);
    }
  }

  for (const match of btMatches) {
    const body = match[1] ?? "";
    const text = extractPdfTextFromSection(body);
    if (text) {
      fragments.push(text);
    }
  }

  if (fragments.length === 0) {
    return "";
  }
  return normalizeExtractedText(fragments.join(" "));
}

export function extractPdfTextFallback(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) {
    return "";
  }

  const raw = buffer.toString("utf8");
  const pdfMarker = raw.includes("%PDF-");
  const rawBinary = buffer.toString("latin1");

  if (!pdfMarker) {
    const fallback = raw
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\uFFFF]/g, " ")
      .replace(/\\([rnt])/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const finalFallback = fallback.length >= MIN_EXTRACTED_LEN ? fallback : "";
    if (finalFallback.length >= MIN_EXTRACTED_LEN) {
      return finalFallback;
    }
    return "";
  }

  const structured = extractFromBinaryPdf(rawBinary);
  if (hasUsableExtractedText(structured)) {
    return structured;
  }

  return "";
}
