import { LoaderCircle, ShieldCheck } from "lucide-react";
import { MAX_INSTRUCTION_LENGTH } from "@/types";

type TransactionFormProps = {
  instruction: string;
  error: string | null;
  pending: boolean;
  onInstructionChange: (value: string) => void;
  onAnalyze: () => void;
};

export function TransactionForm({
  instruction,
  error,
  pending,
  onInstructionChange,
  onAnalyze,
}: TransactionFormProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onAnalyze();
      }}
      className="rounded-xl border border-line bg-panel p-5 shadow-card sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Payment</h2>
        </div>
        <p className="font-mono text-xs text-muted">
          {instruction.length}/{MAX_INSTRUCTION_LENGTH}
        </p>
      </div>
      <p id="instruction-hint" className="mt-1 text-sm leading-6 text-muted">
        Write one native SOL transfer on Devnet. Analyze sends the text for
        review only. It does not sign or submit.
      </p>
      <label htmlFor="transaction-instruction" className="sr-only">
        Natural-language transaction
      </label>
      <textarea
        id="transaction-instruction"
        value={instruction}
        onChange={(event) => onInstructionChange(event.target.value)}
        maxLength={MAX_INSTRUCTION_LENGTH}
        rows={7}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "instruction-error instruction-hint" : "instruction-hint"}
        placeholder="Send 0.25 SOL on Devnet to 7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs"
        className="mt-4 min-h-48 w-full resize-y rounded-lg border border-line bg-inset px-3.5 py-3 text-sm leading-6 text-foreground transition placeholder:text-muted/70"
      />
      {error ? (
        <p id="instruction-error" role="alert" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted">
          Review only. Nothing is signed or sent.
        </p>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-50 sm:w-auto"
        >
          {pending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden />
          )}
          {pending ? "Analyzing…" : "Analyze"}
        </button>
      </div>
    </form>
  );
}
