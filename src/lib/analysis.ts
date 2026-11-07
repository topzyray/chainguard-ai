import { z } from "zod";

export const solTransferAnalysisSchema = z.object({
  intent: z.enum(["transfer", "unsupported", "unclear"]),
  recipient: z.string(),
  amountSol: z.number(),
  explanation: z.string(),
  warnings: z.array(z.string()),
  requiresClarification: z.boolean(),
});

export type SolTransferAnalysis = z.infer<typeof solTransferAnalysisSchema>;

export const analyzeSuccessSchema = z.object({
  ok: z.literal(true),
  analysis: solTransferAnalysisSchema,
});

export const analyzeFailureSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export type AnalyzeResponse =
  | z.infer<typeof analyzeSuccessSchema>
  | z.infer<typeof analyzeFailureSchema>;

export function readAnalyzePayload(value: unknown): AnalyzeResponse | null {
  const success = analyzeSuccessSchema.safeParse(value);
  if (success.success) return success.data;
  const failure = analyzeFailureSchema.safeParse(value);
  if (failure.success) return failure.data;
  return null;
}
