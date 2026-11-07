"use client";

import { useCallback, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { RiskExplanation } from "@/components/risk-explanation";
import { ThemeToggle } from "@/components/theme-toggle";
import { TransactionForm } from "@/components/transaction-form";
import { TransactionPreview } from "@/components/transaction-preview";
import { TransactionStatus } from "@/components/transaction-receipt";
import { WalletConnect } from "@/components/wallet-connect";
import { TransferConfirm } from "@/components/transfer-confirm";
import { readAnalyzePayload, type SolTransferAnalysis } from "@/lib/analysis";
import { getRpcEndpointLabel } from "@/lib/solana";
import { sendNativeSolTransfer, TransferError, validateSolTransfer } from "@/lib/transfer";
import { validateInstruction } from "@/lib/validation";
import { SOLANA_CLUSTER, type TransactionPhase } from "@/types";

type Review = {
  instruction: string;
  capturedAt: string;
  analysis: SolTransferAnalysis;
};

type SendState = {
  status: "idle" | "sending" | "confirmed" | "failed";
  message: string | null;
  signature: string | null;
};

export function Dashboard() {
  const [instruction, setInstruction] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [sendState, setSendState] = useState<SendState>({
    status: "idle",
    message: null,
    signature: null,
  });
  const [balanceRefresh, setBalanceRefresh] = useState(0);
  const requestSeq = useRef(0);
  const sendingRef = useRef(false);
  const endpointLabel = getRpcEndpointLabel();

  const handleAccountChange = useCallback((publicKey: string | null) => {
    setAccount(publicKey);
  }, []);

  async function handleAnalyze() {
    const result = validateInstruction(instruction);
    if (!result.ok) {
      setFieldError(result.error);
      setRequestError(null);
      return;
    }

    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setFieldError(null);
    setRequestError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: result.instruction }),
      });
      const payload = readAnalyzePayload(await response.json().catch(() => null));
      if (seq !== requestSeq.current) return;

      if (!payload) {
        setRequestError("The analysis service returned an unexpected response.");
        return;
      }
      if (!payload.ok) {
        setRequestError(payload.error);
        return;
      }

      setReview({
        instruction: result.instruction,
        capturedAt: new Date().toISOString(),
        analysis: payload.analysis,
      });
      setSendState({ status: "idle", message: null, signature: null });
    } catch {
      if (seq !== requestSeq.current) return;
      setRequestError("Could not reach the analysis service.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  const stale = review !== null && review.instruction !== instruction.trim();
  const validated =
    review &&
    !stale &&
    !loading &&
    review.analysis.intent === "transfer" &&
    !review.analysis.requiresClarification
      ? validateSolTransfer(review.analysis)
      : null;

  async function handleSend() {
    if (sendingRef.current || !review || stale || !account || !validated?.ok) return;
    sendingRef.current = true;
    setSendState({ status: "sending", message: null, signature: null });

    try {
      const signature = await sendNativeSolTransfer({
        payerAddress: account,
        intent: review.analysis.intent,
        recipient: review.analysis.recipient,
        amountSol: review.analysis.amountSol,
        requiresClarification: review.analysis.requiresClarification,
      });
      setSendState({ status: "confirmed", message: null, signature });
      setBalanceRefresh((count) => count + 1);
    } catch (error) {
      const failure =
        error instanceof TransferError
          ? error
          : new TransferError("The transfer could not be sent.", "rpc");
      setSendState({
        status: "failed",
        message: failure.message,
        signature: failure.signature,
      });
      if (failure.signature) setBalanceRefresh((count) => count + 1);
    } finally {
      sendingRef.current = false;
    }
  }
  const phase: TransactionPhase = loading
    ? "loading"
    : fieldError
      ? "invalid"
      : requestError
        ? "error"
        : !review
          ? "idle"
          : stale
            ? "stale"
            : review.analysis.intent === "unsupported"
              ? "rejected"
              : review.analysis.requiresClarification
                ? "needs_clarification"
                : "reviewed";
  const statusMessage = statusCopy(phase, fieldError, requestError, review?.analysis);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-line bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h1 className="text-base font-semibold tracking-tight text-foreground">
                  ChainGuard AI
                </h1>
                <p className="text-sm text-muted">Safety copilot for Devnet SOL</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                <span className="capitalize">{SOLANA_CLUSTER}</span>
              </span>
              <span className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-xs text-muted">
                {endpointLabel}
              </span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <p className="max-w-3xl text-sm leading-6 text-muted">
          Describe a native SOL payment. ChainGuard reads the instruction,
          shows the recipient and the risk, and waits. The model never signs.
          Only Phantom can approve a Devnet transfer.
        </p>
        <WalletConnect
          onAccountChange={handleAccountChange}
          refreshToken={balanceRefresh}
        />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <TransactionForm
            instruction={instruction}
            error={fieldError ?? requestError}
            pending={loading}
            onInstructionChange={(value) => {
              setInstruction(value);
              if (fieldError) setFieldError(null);
              if (requestError) setRequestError(null);
            }}
            onAnalyze={() => void handleAnalyze()}
          />
          <div className="grid gap-5">
            <RiskExplanation
              analysis={review?.analysis ?? null}
              stale={stale}
              loading={loading}
            />
            <TransactionPreview
              instruction={review?.instruction ?? null}
              capturedAt={review?.capturedAt ?? null}
              analysis={review?.analysis ?? null}
              signer={account}
              stale={stale}
              loading={loading}
              endpointLabel={endpointLabel}
            />
            {validated?.ok ? (
              <TransferConfirm
                transfer={validated.transfer}
                payer={account}
                sending={sendState.status === "sending"}
                signature={sendState.signature}
                error={sendState.status === "failed" ? sendState.message : null}
                onConfirm={() => void handleSend()}
              />
            ) : null}
            <TransactionStatus
              phase={phase}
              message={sendMessage(sendState) ?? statusMessage}
              walletConnected={account !== null}
              signature={sendState.signature}
              signatureLabel={signatureLabel(sendState)}
              submissionLabel={submissionLabel(sendState)}
              danger={sendState.status === "failed"}
              receipt={sendState.status === "confirmed"}
            />
          </div>
        </div>
        <footer className="border-t border-line pt-4 text-xs leading-5 text-muted">
          ChainGuard AI supports native SOL transfers on Solana Devnet only.
          AI analysis does not sign, submit, or authorize a transaction.
        </footer>
      </main>
    </div>
  );
}

function statusCopy(
  phase: TransactionPhase,
  fieldError: string | null,
  requestError: string | null,
  analysis: SolTransferAnalysis | undefined,
): string {
  if (phase === "loading") {
    return "Reviewing the instruction. Nothing is being signed or submitted.";
  }
  if (phase === "invalid") return fieldError ?? "The instruction needs a correction.";
  if (phase === "error") return requestError ?? "Analysis failed.";
  if (phase === "idle") {
    return "Waiting for an instruction. Nothing has been signed or submitted.";
  }
  if (phase === "stale") {
    return "The instruction changed after the last review. Analyze again before relying on it. Nothing has been signed or submitted.";
  }
  if (phase === "rejected") {
    return analysis?.explanation ?? "Only native SOL transfers can be reviewed.";
  }
  if (phase === "needs_clarification") {
    return "Clarification is required. The recipient or amount is missing, or the request is ambiguous. Nothing has been signed or submitted.";
  }
  return "Parsed as a native SOL transfer. Confirm the recipient and amount, then approve it in Phantom.";
}

function sendMessage(send: SendState): string | null {
  if (send.status === "sending") {
    return "Waiting for approval in Phantom. ChainGuard cannot sign this transfer.";
  }
  if (send.status === "confirmed") {
    return "Transfer confirmed on Devnet.";
  }
  if (send.status === "failed") return send.message;
  return null;
}

function signatureLabel(send: SendState): string {
  if (send.status === "sending") return "Waiting for Phantom";
  if (send.signature) return "Signed in Phantom";
  if (send.status === "failed") return "Not completed";
  return "Not requested";
}

function submissionLabel(send: SendState): string {
  if (send.status === "sending") return "Waiting for Phantom";
  if (send.status === "confirmed") return "Confirmed";
  if (send.status === "failed" && send.signature) return "Submitted, not confirmed";
  if (send.status === "failed") return "Not sent";
  return "Not sent";
}
