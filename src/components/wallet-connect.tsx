"use client";

import { useEffect, useState } from "react";
import { Copy, Check, LoaderCircle, RefreshCw, Wallet } from "lucide-react";
import {
  fetchSolBalance,
  getPhantomProvider,
  readErrorMessage,
} from "@/lib/solana";
import type {
  PhantomEvent,
  PhantomEventHandler,
  PhantomProvider,
  PhantomPublicKey,
  SolBalanceState,
  WalletConnectionState,
} from "@/types";

const CONNECTION_LABEL: Record<WalletConnectionState, string> = {
  checking: "Checking",
  unavailable: "Not installed",
  disconnected: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
  disconnecting: "Disconnecting",
};

type WalletConnectProps = {
  onAccountChange: (publicKey: string | null) => void;
  refreshToken?: number;
};

function readAddress(publicKey: PhantomPublicKey | null | undefined): string | null {
  const address = publicKey?.toString().trim() ?? "";
  return address.length > 0 ? address : null;
}

export function WalletConnect({
  onAccountChange,
  refreshToken = 0,
}: WalletConnectProps) {
  const [connectionState, setConnectionState] =
    useState<WalletConnectionState>("checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<SolBalanceState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [balanceRequest, setBalanceRequest] = useState(0);

  useEffect(() => {
    onAccountChange(publicKey);
  }, [onAccountChange, publicKey]);

  useEffect(() => {
    const provider = getPhantomProvider();
    if (!provider) {
      return;
    }

    const sync = (next: PhantomPublicKey | null | undefined) => {
      const address = readAddress(next);
      setPublicKey(address);
      setConnectionState(address ? "connected" : "disconnected");
    };

    const handleConnect: PhantomEventHandler = () => {
      sync(provider.publicKey);
    };
    const handleDisconnect: PhantomEventHandler = () => {
      sync(null);
    };
    const handleAccountChanged: PhantomEventHandler = (next) => {
      sync(next ?? null);
      if (!next) {
        setError("Phantom account changed. Connect again to continue.");
      }
    };

    listen(provider, "connect", handleConnect);
    listen(provider, "disconnect", handleDisconnect);
    listen(provider, "accountChanged", handleAccountChanged);

    return () => {
      provider.off("connect", handleConnect);
      provider.off("disconnect", handleDisconnect);
      provider.off("accountChanged", handleAccountChanged);
    };
  }, []);

  useEffect(() => {
    const provider = getPhantomProvider();
    if (!provider) {
      setConnectionState("unavailable");
      setPublicKey(null);
      return;
    }

    if (provider.isConnected && provider.publicKey) {
      setPublicKey(readAddress(provider.publicKey));
      setConnectionState("connected");
      return;
    }

    let active = true;
    provider.connect({ onlyIfTrusted: true }).then(
      (response) => {
        if (!active) return;
        setPublicKey(readAddress(response.publicKey));
        setConnectionState("connected");
      },
      () => {
        if (!active) return;
        setConnectionState("disconnected");
      },
    );

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setBalance({ status: "idle" });
      return;
    }

    let active = true;
    setBalance({ status: "loading" });

    fetchSolBalance(publicKey).then(
      (sol) => {
        if (active) setBalance({ status: "ready", sol });
      },
      (reason: unknown) => {
        if (!active) return;
        setBalance({
          status: "error",
          message: readErrorMessage(reason, "Could not load the SOL balance."),
        });
      },
    );

    return () => {
      active = false;
    };
  }, [publicKey, balanceRequest, refreshToken]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function connect() {
    const provider = getPhantomProvider();
    if (!provider) {
      setConnectionState("unavailable");
      setError("Install Phantom, then refresh this page.");
      return;
    }

    setError(null);
    setConnectionState("connecting");

    try {
      const response = await provider.connect();
      setPublicKey(readAddress(response.publicKey));
      setConnectionState("connected");
    } catch (reason) {
      setConnectionState(provider.isConnected ? "connected" : "disconnected");
      setError(readErrorMessage(reason, "Could not connect to Phantom."));
    }
  }

  async function disconnect() {
    const provider = getPhantomProvider();
    if (!provider) {
      setPublicKey(null);
      setConnectionState("unavailable");
      return;
    }

    setError(null);
    setConnectionState("disconnecting");

    try {
      await provider.disconnect();
      setPublicKey(null);
      setConnectionState("disconnected");
    } catch (reason) {
      setConnectionState(provider.isConnected ? "connected" : "disconnected");
      setError(readErrorMessage(reason, "Could not disconnect Phantom."));
    }
  }

  async function copyAddress() {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
    } catch {
      setError("Could not copy the public key.");
    }
  }

  const busy =
    connectionState === "checking" ||
    connectionState === "connecting" ||
    connectionState === "disconnecting";

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Wallet</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
            ChainGuard reads the public key and SOL balance. The seed phrase
            and private key stay in Phantom.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {connectionState === "unavailable" ? (
            <a
              href="https://phantom.app/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-foreground transition hover:bg-accent-hover"
            >
              Install Phantom
            </a>
          ) : connectionState === "connected" ||
            connectionState === "disconnecting" ? (
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-panel px-3.5 text-sm font-medium text-foreground transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connectionState === "disconnecting" ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Wallet className="h-4 w-4" aria-hidden />
              )}
              {connectionState === "connecting"
                ? "Connecting…"
                : connectionState === "checking"
                  ? "Checking…"
                  : "Connect Phantom"}
            </button>
          )}
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Connection">
          <span className="inline-flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${dotClass(connectionState)}`}
              aria-hidden
            />
            {CONNECTION_LABEL[connectionState]}
          </span>
        </Stat>
        <Stat label="Public key">
          {publicKey ? (
            <span className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs leading-5 break-all text-foreground">
                {publicKey}
              </span>
              <button
                type="button"
                onClick={() => void copyAddress()}
                className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-inset hover:text-foreground"
                aria-label="Copy public key"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </span>
          ) : (
            <span className="text-muted">
              {connectionState === "unavailable"
                ? "Phantom extension not detected"
                : "No wallet connected"}
            </span>
          )}
        </Stat>
        <Stat label="SOL balance">
          <BalanceValue
            balance={balance}
            idleLabel={balanceIdleLabel(connectionState)}
            onRefresh={() => setBalanceRequest((count) => count + 1)}
          />
        </Stat>
      </dl>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function listen(
  provider: PhantomProvider,
  event: PhantomEvent,
  handler: PhantomEventHandler,
) {
  provider.on(event, handler);
}

function dotClass(state: WalletConnectionState): string {
  if (state === "connected") return "bg-success";
  if (state === "unavailable") return "bg-danger";
  if (state === "connecting" || state === "checking" || state === "disconnecting") {
    return "bg-warning";
  }
  return "bg-muted";
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-inset px-4 py-3">
      <dt className="text-xs font-medium text-muted">
        {label}
      </dt>
      <dd className="mt-2 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function balanceIdleLabel(state: WalletConnectionState): string {
  if (state === "connected" || state === "disconnecting") return "—";
  if (state === "unavailable") return "Unavailable";
  if (state === "checking" || state === "connecting") return "Checking…";
  return "Connect a wallet";
}

function BalanceValue({
  balance,
  idleLabel,
  onRefresh,
}: {
  balance: SolBalanceState;
  idleLabel: string;
  onRefresh: () => void;
}) {
  if (balance.status === "loading") {
    return (
      <span className="inline-flex items-center gap-2 text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        Loading balance…
      </span>
    );
  }

  if (balance.status === "ready") {
    return (
      <span className="flex items-center justify-between gap-3">
        <span className="font-mono text-base font-medium tracking-tight">{balance.sol} SOL</span>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-panel hover:text-foreground"
          aria-label="Refresh SOL balance"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
    );
  }

  if (balance.status === "error") {
    return (
      <span className="flex items-start justify-between gap-3">
        <span className="text-danger">{balance.message}</span>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-7 shrink-0 items-center rounded-md px-2 text-xs text-muted transition hover:bg-panel hover:text-foreground"
        >
          Retry
        </button>
      </span>
    );
  }

  return <span className="text-muted">{idleLabel}</span>;
}
