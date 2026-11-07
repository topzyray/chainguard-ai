import { LoaderCircle } from "lucide-react";
import type { SolTransferAnalysis } from "@/lib/analysis";
import { SOLANA_CLUSTER } from "@/types";

type TransactionPreviewProps = {
  instruction: string | null;
  capturedAt: string | null;
  analysis: SolTransferAnalysis | null;
  signer: string | null;
  stale: boolean;
  loading: boolean;
  endpointLabel: string;
};

const INTENT_LABEL: Record<SolTransferAnalysis["intent"], string> = {
  transfer: "Native SOL transfer",
  unsupported: "Unsupported",
  unclear: "Unclear",
};

export function TransactionPreview({
  instruction,
  capturedAt,
  analysis,
  signer,
  stale,
  loading,
  endpointLabel,
}: TransactionPreviewProps) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-card sm:p-6">
      <h2 className="text-base font-semibold text-foreground">Transaction preview</h2>
      {analysis && instruction ? (
        <div className="mt-5 space-y-4">
          {stale ? (
            <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-foreground">
              The instruction changed after this preview. Analyze again to
              refresh it.
            </p>
          ) : null}
          {loading ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              Reviewing the latest instruction…
            </p>
          ) : null}
          <dl className="space-y-3 text-sm">
            <PreviewRow label="Intent" value={INTENT_LABEL[analysis.intent]} />
            <PreviewRow
              label="Recipient"
              value={analysis.recipient || "Not provided"}
              mono={analysis.recipient.length > 0}
            />
            <PreviewRow label="Amount" value={formatSolAmount(analysis.amountSol)} />
            <PreviewRow
              label="Clarification"
              value={
                analysis.requiresClarification
                  ? "Needed before this can be treated as a transfer"
                  : "Not needed"
              }
            />
            <PreviewRow label="Network" value="Solana Devnet" />
            <PreviewRow label="Cluster" value={SOLANA_CLUSTER} />
            <PreviewRow label="RPC" value={endpointLabel} mono />
            <PreviewRow
              label="Fee payer"
              value={signer ?? "Connect Phantom to attach a public key"}
              mono={Boolean(signer)}
            />
            <PreviewRow label="Built transaction" value="Not created" />
          </dl>
          <div>
            <p className="text-xs font-medium text-muted">Instruction</p>
            <p className="mt-2 rounded-lg bg-inset px-3 py-3 text-sm leading-6 whitespace-pre-wrap text-foreground">
              {instruction}
            </p>
            {capturedAt ? (
              <p className="mt-2 text-xs text-muted">
                Reviewed {new Date(capturedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted">
          {loading
            ? "Reviewing the instruction. Recipient and amount will appear here."
            : "The transaction preview appears after Analyze. Nothing is signed until you confirm."}
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

function PreviewRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b border-line pb-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono text-xs leading-5 break-all" : "break-words"}>
        {value}
      </dd>
    </div>
  );
}
