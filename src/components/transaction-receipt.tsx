"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { devnetExplorerUrl } from "@/lib/transfer";
import type { TransactionPhase } from "@/types";

type TransactionStatusProps = {
  phase: TransactionPhase;
  message: string;
  walletConnected: boolean;
  signature: string | null;
  signatureLabel: string;
  submissionLabel: string;
  danger?: boolean;
  receipt?: boolean;
};

const PHASE_LABEL: Record<TransactionPhase, string> = {
  idle: "Waiting",
  invalid: "Needs a valid instruction",
  loading: "Analyzing",
  error: "Analysis failed",
  reviewed: "Reviewed",
  needs_clarification: "Needs clarification",
  rejected: "Rejected",
  stale: "Out of date",
};

export function TransactionStatus({
  phase,
  message,
  walletConnected,
  signature,
  signatureLabel,
  submissionLabel,
  danger = false,
  receipt = false,
}: TransactionStatusProps) {
  const alert =
    danger || phase === "invalid" || phase === "error" || phase === "rejected";
  const pending = phase === "loading" || signatureLabel === "Waiting for Phantom";
  const steps = [
    {
      label: "Wallet",
      value: walletConnected ? "Public key connected" : "Not connected",
    },
    {
      label: "Review",
      value: PHASE_LABEL[phase],
    },
    {
      label: "Signature",
      value: signatureLabel,
    },
    {
      label: "Submission",
      value: submissionLabel,
    },
  ];
  const explorer = signature ? devnetExplorerUrl(signature) : null;
  const tone = receipt
    ? "border-success"
    : alert
      ? "border-danger"
      : pending
        ? "border-warning"
        : "border-line";

  return (
    <section
      className={`rounded-xl border bg-panel p-5 shadow-card sm:p-6 ${tone}`}
      aria-live="polite"
    >
      <h2 className="text-base font-semibold text-foreground">
        {receipt ? "Transaction receipt" : "Transaction status"}
      </h2>
      <p
        role={alert ? "alert" : "status"}
        className={`mt-3 text-sm leading-6 ${alert ? "text-danger" : receipt ? "text-foreground" : "text-muted"}`}
      >
        {message}
      </p>
      {signature ? <SignatureField signature={signature} /> : null}
      {explorer ? (
        <a
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          View on Solana Explorer
        </a>
      ) : null}
      <ol className="mt-4 divide-y divide-line border-y border-line">
        {steps.map((step) => (
          <li
            key={step.label}
            className="flex items-center justify-between gap-3 py-2.5 text-sm"
          >
            <span className="text-muted">{step.label}</span>
            <span className="text-right text-foreground">{step.value}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SignatureField({ signature }: { signature: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copySignature() {
    try {
      await navigator.clipboard.writeText(signature);
      setCopied(true);
      setCopyError(null);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyError("Could not copy the signature.");
    }
  }

  return (
    <div className="mt-4 rounded-lg bg-inset px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted">Signature</p>
        <button
          type="button"
          onClick={() => void copySignature()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted transition hover:bg-panel hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 font-mono text-xs leading-5 break-all text-foreground">
        {signature}
      </p>
      {copyError ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {copyError}
        </p>
      ) : null}
    </div>
  );
}
