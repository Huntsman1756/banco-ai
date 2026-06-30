import { describe, expect, it } from "vitest";
import { extractPdfTextFallback } from "../src/infrastructure/pdf/extract-text";

describe("extractPdfTextFallback", () => {
  it("returns structured PDF text when readable text operators are present", () => {
    const readablePdf = Buffer.from(
      `%PDF-1.4
1 0 obj
stream
BT
(Cuenta remunerada sin condiciones con 2,00% TAE y saldo maximo 50000 euros. ) Tj
(El producto no exige nomina, recibos ni tarjeta para mantener la remuneracion. ) Tj
(Intereses abonados mensualmente y liquidez diaria para transferencias ordinarias.) Tj
ET
endstream
endobj
%%EOF`,
      "latin1",
    );

    const text = extractPdfTextFallback(readablePdf);

    expect(text).toContain("Cuenta remunerada sin condiciones");
    expect(text).toContain("2,00% TAE");
  });

  it("does not treat compressed or binary PDF bytes as extracted text", () => {
    const unreadablePdf = Buffer.from(
      `%PDF-1.7
1 0 obj
<< /Filter /FlateDecode /Length 180 >>
stream
\x00\x01\x02\x03\x04\x05\x06\x07\x08\xff\xfe\xfd\xfc\xfb\xfa\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19
endstream
endobj
%%EOF`,
      "latin1",
    );

    expect(extractPdfTextFallback(unreadablePdf)).toBe("");
  });

  it("rejects decoded PDF tokens that are mostly binary mojibake", () => {
    const mojibake = "ÆÊÀÂÀ±Ã1 ¡g O Pëæ=@ f$e mStú{ {ÝúÁÑæ¢úqÊË {K­S¬ ÀÀ`ìÞ Jê Ú¸ D1 1² ".repeat(4);
    const unreadablePdf = Buffer.from(
      `%PDF-1.7
1 0 obj
stream
BT
(${mojibake}) Tj
ET
endstream
endobj
%%EOF`,
      "latin1",
    );

    expect(extractPdfTextFallback(unreadablePdf)).toBe("");
  });
});
