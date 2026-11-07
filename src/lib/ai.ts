import { PublicKey } from "@solana/web3.js";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  solTransferAnalysisSchema,
  type SolTransferAnalysis,
} from "@/lib/analysis";

const SAFETY_WARNINGS = [
  "A syntactically valid Solana address does not show who controls it or whether the recipient is trustworthy.",
  "Blockchain transfers are generally irreversible. This analysis does not sign, submit, or authorize a transaction.",
];

const UNSUPPORTED_REQUEST =
  /\b(swap|swapping|stake|staking|unstake|mint|airdrop|delegate|delegating|vote|voting|nft|usdc|usdt|spl token)\b/i;

const INSTRUCTIONS = `You are ChainGuard, a read-only interpreter of one Solana wallet instruction.
You never sign, submit, or authorize a transaction. You only classify the words the user wrote.

Return:
- intent "transfer" only when the user explicitly asks to send native SOL, with one recipient address and one positive SOL amount written in the text.
- intent "unsupported" for swaps, other tokens, NFTs, staking, program calls, or any action that is not a native SOL transfer.
- intent "unclear" when a SOL transfer may be intended but the recipient or amount is missing or ambiguous.
- recipient: copy one base58 address exactly from the user text, or "" when no address is written. Never guess, complete, or replace an address.
- amountSol: the explicit positive SOL amount as a number, or 0 when no numeric SOL amount is written. Never turn words like "some" into a number. Do not use lamports.
- explanation: one or two sentences about what the user asked. Do not claim the address is known, safe, or owned by a named person.
- warnings: short risks that follow from the text itself.
- requiresClarification: true when the address or amount is missing, more than one address or amount is present, or the request is ambiguous. False only for one explicit native SOL transfer.

If the text contains a seed phrase or private key, use intent "unsupported", recipient "", and amountSol 0. Do not repeat the secret.`;

export class AnalysisError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AnalysisError";
    this.status = status;
  }
}

export async function analyzeInstruction(
  instruction: string,
): Promise<SolTransferAnalysis> {
  const client = new OpenAI({ apiKey: requiredEnv("OPENAI_API_KEY") });
  const model = requiredEnv("OPENAI_MODEL");

  let response: Awaited<ReturnType<typeof client.responses.parse>>;
  try {
    response = await client.responses.parse({
      model,
      store: false,
      instructions: INSTRUCTIONS,
      input: instruction,
      text: {
        format: zodTextFormat(solTransferAnalysisSchema, "sol_transfer_analysis"),
      },
    });
  } catch (error) {
    throw mapOpenAiError(error);
  }

  if (
    response.status === "failed" ||
    response.status === "incomplete" ||
    response.status === "cancelled" ||
    response.status === "queued"
  ) {
    throw new AnalysisError(refusalOrUnusable(response.output), 422);
  }

  const refusal = findRefusal(response.output);
  if (refusal) {
    console.error("Model refused analysis", redact(refusal).slice(0, 200));
    throw new AnalysisError("The model declined to analyze this instruction.", 422);
  }

  const parsed = solTransferAnalysisSchema.safeParse(response.output_parsed);
  if (!parsed.success) {
    throw new AnalysisError("The model did not return a usable analysis.", 422);
  }

  return reviewAnalysis(instruction, parsed.data);
}

function requiredEnv(name: "OPENAI_API_KEY" | "OPENAI_MODEL"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AnalysisError(
      "Analysis is not configured. Set OPENAI_API_KEY and OPENAI_MODEL on the server.",
      500,
    );
  }
  return value;
}

function mapOpenAiError(error: unknown): AnalysisError {
  console.error("OpenAI analysis failed", redact(error instanceof Error ? error.message : "unknown error"));

  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      return new AnalysisError("The analysis service rejected the server credentials.", 500);
    }
    if (error.status === 429) {
      return new AnalysisError("The analysis service is busy. Try again in a moment.", 429);
    }
  }

  if (error instanceof AnalysisError) return error;
  return new AnalysisError("The analysis service could not complete the request.", 502);
}

export function reviewAnalysis(
  instruction: string,
  model: SolTransferAnalysis,
): SolTransferAnalysis {
  const unsupported =
    model.intent === "unsupported" || UNSUPPORTED_REQUEST.test(instruction);
  const addresses = explicitAddresses(instruction);
  const amounts = explicitPositiveAmounts(instruction);
  const warnings = model.warnings
    .filter((warning) => warning.trim().length > 0)
    .map((warning) => clamp(warning, 280))
    .slice(0, 4);

  const recipient = !unsupported && addresses.length === 1 ? addresses[0] : "";
  const amountSol = !unsupported && amounts.length === 1 ? amounts[0] : 0;

  if (!unsupported && model.recipient.trim() && model.recipient.trim() !== recipient) {
    warnings.push("A recipient that was not written in the instruction was ignored.");
  }

  if (
    !unsupported &&
    Number.isFinite(model.amountSol) &&
    model.amountSol > 0 &&
    !sameAmount(model.amountSol, amountSol)
  ) {
    warnings.push("An amount that was not an explicit positive SOL figure was ignored.");
  }

  if (addresses.length > 1) {
    warnings.push("More than one address was found, so no recipient was selected.");
  }
  if (amounts.length > 1) {
    warnings.push("More than one SOL amount was found, so the amount was left at 0.");
  }

  if (unsupported) {
    warnings.push("Only native SOL transfers can be reviewed.");
  }

  const fieldsComplete = recipient.length > 0 && amountSol > 0;
  const requiresClarification =
    !unsupported &&
    (!fieldsComplete || model.requiresClarification || model.intent !== "transfer");

  const intent: SolTransferAnalysis["intent"] = unsupported
    ? "unsupported"
    : requiresClarification
      ? "unclear"
      : "transfer";

  const explanation = clamp(
    unsupported && model.intent !== "unsupported"
      ? "Only a native SOL transfer can be reviewed. This request is outside that scope."
      : model.explanation,
    800,
  );

  return solTransferAnalysisSchema.parse({
    intent,
    recipient,
    amountSol,
    explanation:
      explanation ||
      (intent === "transfer"
        ? "The instruction asks for a native SOL transfer."
        : "ChainGuard could not confirm a single native SOL transfer."),
    warnings: unique([...warnings.slice(0, 6), ...SAFETY_WARNINGS]),
    requiresClarification,
  });
}

function explicitAddresses(instruction: string): string[] {
  const found = new Set<string>();
  const pattern =
    /(?:^|[^1-9A-HJ-NP-Za-km-z])([1-9A-HJ-NP-Za-km-z]{32,44})(?=$|[^1-9A-HJ-NP-Za-km-z])/g;

  for (const match of instruction.matchAll(pattern)) {
    const address = match[1];
    if (address && isValidSolanaAddress(address)) found.add(address);
  }

  return [...found];
}

function explicitPositiveAmounts(instruction: string): number[] {
  const source = instruction.replace(/(\d),(?=\d)/g, "$1");
  const found = new Set<number>();
  const pattern =
    /(?:^|[^1-9A-HJ-NP-Za-km-z])(\d+(?:\.\d+)?)(?=$|[^1-9A-HJ-NP-Za-km-z]|sol\b)/gi;

  for (const match of source.matchAll(pattern)) {
    const token = match[1];
    if (!token || token.length > 12 || isValidSolanaAddress(token)) continue;
    const amount = roundSol(Number(token));
    if (Number.isFinite(amount) && amount > 0) found.add(amount);
  }

  return [...found];
}

function isValidSolanaAddress(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

function roundSol(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function sameAmount(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9;
}

function clamp(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function refusalOrUnusable(output: unknown): string {
  return findRefusal(output)
    ? "The model declined to analyze this instruction."
    : "The model did not return a usable analysis.";
}

function findRefusal(output: unknown): string | null {
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    const refusal = refusalText(item);
    if (refusal) return refusal;
    if (!item || typeof item !== "object" || !("content" in item)) continue;
    if (!Array.isArray(item.content)) continue;
    for (const part of item.content) {
      const nested = refusalText(part);
      if (nested) return nested;
    }
  }

  return null;
}

function refusalText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (!("type" in value) || value.type !== "refusal") return null;
  if (!("refusal" in value) || typeof value.refusal !== "string") return null;
  return value.refusal;
}

function redact(value: string): string {
  return value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]");
}
