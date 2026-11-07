import { NextResponse } from "next/server";
import { AnalysisError, analyzeInstruction } from "@/lib/ai";
import { validateInstruction } from "@/lib/validation";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Send a JSON object with an instruction." },
      { status: 400 },
    );
  }

  const instruction =
    body &&
    typeof body === "object" &&
    "instruction" in body &&
    typeof body.instruction === "string"
      ? body.instruction
      : null;

  if (instruction === null) {
    return NextResponse.json(
      { ok: false, error: "Send a JSON object with an instruction." },
      { status: 400 },
    );
  }

  const validated = validateInstruction(instruction);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
  }

  try {
    const analysis = await analyzeInstruction(validated.instruction);
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    if (error instanceof AnalysisError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    console.error("Unhandled analysis error");
    return NextResponse.json(
      { ok: false, error: "The analysis service could not complete the request." },
      { status: 502 },
    );
  }
}
