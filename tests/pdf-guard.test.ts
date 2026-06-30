import { describe, expect, it } from "vitest";
import { evaluatePdfUpload, type PdfGuardInput } from "../src/domain/pdf-guard";

describe("pdf guard", () => {
  it("allows standard banking PDF with multiple keywords", () => {
    const input: PdfGuardInput = {
      fileName: "condiciones-cuenta.pdf",
      fileSizeBytes: 100_000,
      mimeType: "application/pdf",
      textSnippet: "Cuenta remunerada con TAE interes y comisiones 0 euros.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("allow_llm_processing");
    expect(result.reasons).toContain("File appears relevant and within safe limits.");
    expect(result.estimatedLlmRisk).toBe("low");
  });

  it("allows banking PDF with 4 keywords and .pdf extension", () => {
    const input: PdfGuardInput = {
      fileName: "condiciones-cuenta.pdf",
      fileSizeBytes: 100_000,
      mimeType: "application/pdf",
      textSnippet: "Cuenta remunerada con TAE interes y comisiones 0 euros.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("allow_llm_processing");
    expect(result.estimatedLlmRisk).toBe("low");
  });

  it("allows banking PDF with 3 keywords but not .pdf extension", () => {
    const input: PdfGuardInput = {
      fileName: "condiciones-cuenta",
      fileSizeBytes: 100_000,
      mimeType: "application/pdf",
      textSnippet: "Cuenta con TAE y comisiones.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("allow_llm_processing");
  });

  it("blocks non-PDF MIME types", () => {
    const input: PdfGuardInput = {
      fileName: "documento.docx",
      fileSizeBytes: 100_000,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      textSnippet: "algún texto",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("reject_upload");
  });

  it("blocks oversized files over 20MB", () => {
    const input: PdfGuardInput = {
      fileName: "grande.pdf",
      fileSizeBytes: 25 * 1024 * 1024,
      mimeType: "application/pdf",
      textSnippet: "contenido con TAE",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("reject_upload");
  });

  it("blocks zero-size files", () => {
    const input: PdfGuardInput = {
      fileName: "vacío.pdf",
      fileSizeBytes: 0,
      mimeType: "application/pdf",
      textSnippet: "contenido",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("reject_upload");
  });

  it("rejects when text has no banking keywords", () => {
    const input: PdfGuardInput = {
      fileName: "inversiones.pdf",
      fileSizeBytes: 10000,
      mimeType: "application/pdf",
      textSnippet: "Este documento trata sobre estrategia de inversión en mercados emergentes.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("reject_upload");
    expect(result.reasons[0]).toContain("banking signals");
  });

  it("blocks investment-related PDFs with no banking keywords", () => {
    const input: PdfGuardInput = {
      fileName: "fondos.pdf",
      fileSizeBytes: 50000,
      mimeType: "application/pdf",
      textSnippet: "Fondos de inversión con rentabilidad histórica del 8% anual y riesgo alto.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("reject_upload");
  });

  it("rejects when text is mostly binary", () => {
    const input: PdfGuardInput = {
      fileName: "binario.pdf",
      fileSizeBytes: 1000,
      mimeType: "application/pdf",
      textSnippet: "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("reject_upload");
  });

  it("allows deposit PDF with banking keywords", () => {
    const input: PdfGuardInput = {
      fileName: "deposito",
      fileSizeBytes: 25000,
      mimeType: "application/pdf",
      textSnippet: "Deposito a plazo fijo con TAE 2,80% y comisiones bajas.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("allow_llm_processing");
  });

  it("allows payroll account PDF", () => {
    const input: PdfGuardInput = {
      fileName: "nomina.pdf",
      fileSizeBytes: 30000,
      mimeType: "application/pdf",
      textSnippet: "Cuenta de nomina sin comisiones y con interes remunerado.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("allow_llm_processing");
  });

  it("queues for review when only one keyword matches", () => {
    const input: PdfGuardInput = {
      fileName: "solo-tae.pdf",
      fileSizeBytes: 25000,
      mimeType: "application/pdf",
      textSnippet: "TAE 3,50% anual.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("queue_review_only");
  });

  it("blocks files over 50 pages", () => {
    const input: PdfGuardInput = {
      fileName: "extenso.pdf",
      fileSizeBytes: 10000,
      mimeType: "application/pdf",
      pageCount: 55,
      textSnippet: "Cuenta con TAE y comisiones.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("reject_upload");
  });

  it("queues for review when text snippet is very large", () => {
    const input: PdfGuardInput = {
      fileName: "extenso.pdf",
      fileSizeBytes: 10000,
      mimeType: "application/pdf",
      textSnippet: "Cuenta con TAE y comisiones.".repeat(10000),
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("queue_review_only");
  });

  it("allows PDF with high relevance score (4+ keywords)", () => {
    const input: PdfGuardInput = {
      fileName: "completo.pdf",
      fileSizeBytes: 25000,
      mimeType: "application/pdf",
      textSnippet: "Cuenta remunerada con TAE interes comisiones nomina depositom.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("allow_llm_processing");
  });

  it("rejects negative file sizes", () => {
    const input: PdfGuardInput = {
      fileName: "negativo.pdf",
      fileSizeBytes: -100,
      mimeType: "application/pdf",
      textSnippet: "TAE",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("reject_upload");
  });

  it("returns correct estimatedLlmRisk for allowed PDFs", () => {
    const input: PdfGuardInput = {
      fileName: "seguro.pdf",
      fileSizeBytes: 25000,
      mimeType: "application/pdf",
      textSnippet: "Cuenta con TAE interes y comisiones.",
    };
    const result = evaluatePdfUpload(input);
    expect(result.action).toBe("allow_llm_processing");
    expect(result.estimatedLlmRisk).toBe("low");
  });
});
