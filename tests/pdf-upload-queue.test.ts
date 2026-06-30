import { describe, expect, it } from "vitest";
import { dequeueNextPdf, queuePdfForProcessing } from "../src/infrastructure/pdf/upload-queue";

describe("pdf upload queue", () => {
  it("does not retain extracted PDF text snippets in queued requests", () => {
    const decision = queuePdfForProcessing(
      {
        fileName: "condiciones.pdf",
        fileSizeBytes: 1000,
        mimeType: "application/pdf",
        textSnippet: "Cuenta remunerada con TAE, TIN, intereses, comisiones y nomina.",
      },
      {
        userId: "privacy-test",
        config: {
          globalQueueMax: 10,
          perUserQueueMax: 10,
          perUserBurstLimit: 10,
          maxQueueAgeMs: 60_000,
        },
      },
    );

    expect(decision.accepted).toBe(true);
    const queued = dequeueNextPdf();
    expect(queued?.input.textSnippet).toBeUndefined();
  });
});
