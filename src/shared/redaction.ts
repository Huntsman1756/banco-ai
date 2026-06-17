const IBAN_RE = /\b(?:ES\d{2}\d{20}|[A-Z]{2}\d{20,30})\b/gi;
const DNI_RE = /\b\d{8}[A-Z]\b/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\b\+?\d[\d\-\s]{7,}\d\b/g;

export function redactPersonalData(input: string): string {
  return input
    .replace(IBAN_RE, "[REDACTED_IBAN]")
    .replace(DNI_RE, "[REDACTED_DNI]")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(PHONE_RE, "[REDACTED_PHONE]");
}

export function redactObject<T>(obj: T): T {
  if (typeof obj === "string") {
    return redactPersonalData(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((value) => redactObject(value)) as unknown as T;
  }

  if (obj && typeof obj === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      clone[key] = redactObject(value);
    }
    return clone as T;
  }

  return obj;
}
