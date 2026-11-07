import { AlertTriangle, LoaderCircle } from "lucide-react";
import type { SolTransferAnalysis } from "@/lib/analysis";

type RiskExplanationProps = {
  analysis: SolTransferAnalysis | null;
  stale: boolean;
  loading: boolean;
};

const INTENT_STYLE: Record<
  SolTransferAnalysis["intent"],
  { label: string; className: string }
> = {
  transfer: {
    label: "SOL transfer",
    className: "bg-success-bg text-success",
  },
  unsupported: {
    label: "Rejected",
    className: "bg-danger-bg text-danger",
  },
  unclear: {
    label: "Needs clarification",
    className: "bg-warning-bg text-warning",
  },
};

export function RiskExplanation({ analysis, stale, loading }: RiskExplanationProps) {
  const intent = analysis ? INTENT_STYLE[analysis.intent] : null;

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Analysis</h2>
        {intent ? (
          <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${intent.className}`}>
            {intent.label}
          </span>
        ) : null}
      </div>
      {analysis ? (
        <div className="mt-5 space-y-4">
          {stale ? (
            <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-foreground">
              This explanation describes the previous instruction.
            </p>
          ) : null}
          {loading ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              Updating the review…
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-inset px-4 py-3">
              <p className="text-xs font-medium text-muted">Amount</p>
              <p className="mt-1.5 font-mono text-lg font-medium tracking-tight">
                {formatSolAmount(analysis.amountSol)}
              </p>
            </div>
            <div className="min-w-0 rounded-lg bg-inset px-4 py-3">
              <p className="text-xs font-medium text-muted">Recipient</p>
              <p
                className={`mt-1.5 text-sm leading-6 ${analysis.recipient ? "font-mono text-xs break-all" : "text-muted"}`}
              >
                {analysis.recipient || "Not provided"}
              </p>
            </div>
          </div>
          <p className="text-sm leading-6 text-foreground">{analysis.explanation}</p>
          <ul className="space-y-2">
            {analysis.warnings.map((warning) => (
              <li
                key={warning}
                className="flex gap-3 rounded-lg bg-warning-bg px-3 py-2.5 text-sm leading-6 text-foreground"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted">
          {loading
            ? "Reading the payment and preparing the risk notes…"
            : "Recipient, amount, explanation, and warnings appear here after Analyze."}
        </p>
      )}
    </section>
  );
}

function formatSolAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "0 SOL";
  const text = amount.toFixed(9).replace(/\.?0+$/, "");
  return `${text} SOL`;
}
