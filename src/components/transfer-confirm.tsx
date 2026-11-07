"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import {
  devnetExplorerUrl,
  estimateTransferFee,
  formatLamportsExact,
  type PreparedTransfer,
} from "@/lib/transfer";
import { SOLANA_CLUSTER } from "@/types";

type FeeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lamports: bigint }
  | { status: "unavailable" };

type TransferConfirmProps = {
  transfer: PreparedTransfer;
  payer: string | null;
  sending: boolean;
  signature: string | null;
  error: string | null;
  onConfirm: () => void;
};

export function TransferConfirm({
  transfer,
  payer,
  sending,
  signature,
  error,
  onConfirm,
}: TransferConfirmProps) {
  const [fee, setFee] = useState<FeeState>({ status: "idle" });

  useEffect(() => {
    if (!payer) {
      setFee({ status: "unavailable" });
      return;
    }

    let active = true;
    setFee({ status: "loading" });
    estimateTransferFee({
      payerAddress: payer,
      recipient: transfer.recipient,
      lamports: transfer.lamports,
    }).then(
      (lamports) => {
        if (!active) return;
        setFee(lamports === null ? { status: "unavailable" } : { status: "ready", lamports });
      },
      () => {
        if (active) setFee({ status: "unavailable" });
      },
    );

    return () => {
      active = false;
    };
  }, [payer, transfer.recipient, transfer.lamports]);

  const feeSettled = !payer || fee.status === "ready" || fee.status === "unavailable";
  const alreadySent = Boolean(signature);
  const explorer = signature ? devnetExplorerUrl(signature) : null;

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-card sm:p-6">
      <h2 className="text-base font-semibold text-foreground">Confirm and send</h2>
      <p className="mt-3 rounded-lg bg-warning-bg px-3 py-3 text-sm leading-6 text-foreground">
        This native SOL transfer is generally irreversible. AI will not sign
        it. Phantom must show you the transaction before it can be sent.
      </p>
      <dl className="mt-4 space-y-3 text-sm">
        <Row label="Recipient" value={transfer.recipient} mono />
        <Row label="Amount" value={`${formatLamportsExact(transfer.lamports)} SOL`} />
        <Row label="Network fee" value={feeLabel(fee, payer)} />
        <Row label="Network" value={`${SOLANA_CLUSTER} · Devnet`} />
        <Row
          label="Fee payer"
          value={payer ?? "Connect Phantom to choose the fee payer"}
          mono={Boolean(payer)}
        />
      </dl>
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-sm leading-6 text-danger">
          {error}
        </p>
      ) : null}
      {explorer ? (
        <a
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          View on Solana Explorer
        </a>
      ) : null}
      <button
        type="button"
        onClick={onConfirm}
        disabled={!payer || sending || !feeSettled || alreadySent}
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Send className="h-4 w-4" aria-hidden />
        )}
        {sending ? "Waiting for Phantom…" : alreadySent ? "Sent" : "Confirm and Send"}
      </button>
    </section>
  );
}

function feeLabel(fee: FeeState, payer: string | null): string {
  if (!payer) return "Connect Phantom to estimate";
  if (fee.status === "loading" || fee.status === "idle") return "Estimating…";
  if (fee.status === "ready") return `${formatLamportsExact(fee.lamports)} SOL`;
  return "Unavailable";
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono text-xs leading-5 break-all" : "break-words"}>
        {value}
      </dd>
    </div>
  );
}
