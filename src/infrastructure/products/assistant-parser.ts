import { z } from "zod";
import { type AssistantProfile } from "../../domain/recommender.js";
import { generateStructuredJson } from "../llm/client.js";

const AssistantProfileExtractionSchema = z
  .object({
    objective: z.enum(["rentabilidad", "nomina", "liquidez", "deposito"]),
    vinculacion: z.enum(["sin_condiciones", "con_condiciones", "indiferente"]),
    horizonte: z.enum(["corto", "medio", "largo"]),
    capitalBand: z.enum(["hasta_1000", "1000_10000", "10000_plus"]),
    payrollNeed: z.enum(["no_importante", "si_tengo_nomina", "prioriza_nomina"]),
    needsMoreInfo: z.boolean(),
    nextQuestion: z.string().min(1),
    answerSummary: z.string().min(1),
  })
  .strict();

export type AssistantProfileExtraction = z.infer<typeof AssistantProfileExtractionSchema>;

export type ParsedAssistantQuestion =
  | {
      status: "validated";
      attempts: number;
      profile: AssistantProfile;
      needsMoreInfo: boolean;
      nextQuestion: string;
      answerSummary: string;
    }
  | {
      status: "blocked" | "retryable";
      attempts: number;
      reason: string;
    };

export async function extractAssistantProfileFromQuestion(message: string): Promise<ParsedAssistantQuestion> {
  const trimmed = message.trim();
  if (!trimmed) {
    return {
      status: "blocked",
      attempts: 0,
      reason: "Mensaje vacio.",
    };
  }

  const result = await generateStructuredJson({
    schema: AssistantProfileExtractionSchema,
    schemaName: "AssistantProfileExtractionSchema",
    systemPrompt: [
      "Eres un asistente de comparativa bancaria informativa.",
      "Extrae preferencias para cuentas remuneradas, cuentas nomina o depositos.",
      "No des asesoramiento personalizado ni calcules rankings.",
      "Devuelve SOLO JSON estricto.",
    ].join("\n"),
    userPrompt: [
      "Interpreta este mensaje de usuario y rellena el perfil con defaults prudentes si faltan datos.",
      "Si faltan datos relevantes, marca needsMoreInfo=true y escribe una unica siguiente pregunta.",
      "Nunca recomiendes contratar un producto concreto.",
      `Mensaje: ${trimmed.slice(0, 4000)}`,
    ].join("\n"),
    maxRetries: 2,
    temperature: 0.2,
    maxTokens: 550,
  });

  if (result.status !== "validated") {
    return {
      status: result.status,
      attempts: result.attempts,
      reason: result.reason,
    };
  }

  const value = result.value;
  return {
    status: "validated",
    attempts: result.attempts,
    profile: {
      objective: value.objective,
      vinculacion: value.vinculacion,
      horizonte: value.horizonte,
      capitalBand: value.capitalBand,
      payrollNeed: value.payrollNeed,
    },
    needsMoreInfo: value.needsMoreInfo,
    nextQuestion: value.nextQuestion,
    answerSummary: value.answerSummary,
  };
}
