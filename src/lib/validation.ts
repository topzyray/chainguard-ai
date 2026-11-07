import {
  MAX_INSTRUCTION_LENGTH,
  type InstructionValidation,
} from "@/types";

export function validateInstruction(value: string): InstructionValidation {
  const instruction = value.trim();

  if (instruction.length === 0) {
    return {
      ok: false,
      error: "Describe the transaction you want ChainGuard to review.",
    };
  }

  if (instruction.length > MAX_INSTRUCTION_LENGTH) {
    return {
      ok: false,
      error: `Keep the instruction under ${MAX_INSTRUCTION_LENGTH.toLocaleString()} characters.`,
    };
  }

  return { ok: true, instruction };
}
