export const SOLANA_CLUSTER = "devnet" as const;

export const MAX_INSTRUCTION_LENGTH = 2_000;

export type WalletConnectionState =
  | "checking"
  | "unavailable"
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting";

export type SolBalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; sol: string }
  | { status: "error"; message: string };

export type CapturedInstruction = {
  instruction: string;
  capturedAt: string;
};

export type InstructionValidation =
  | { ok: true; instruction: string }
  | { ok: false; error: string };

export type TransactionPhase =
  | "idle"
  | "invalid"
  | "loading"
  | "error"
  | "reviewed"
  | "needs_clarification"
  | "rejected"
  | "stale";

/** Public key material exposed by the Phantom extension. Never a secret key. */
export type PhantomPublicKey = {
  toString: () => string;
};

export type PhantomSignAndSendResult = {
  signature: string | Uint8Array;
};

export type PhantomEvent = "connect" | "disconnect" | "accountChanged";

export type PhantomEventHandler = (publicKey?: PhantomPublicKey | null) => void;

export type PhantomProvider = {
  isPhantom: boolean;
  isConnected: boolean;
  publicKey: PhantomPublicKey | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: PhantomPublicKey;
  }>;
  disconnect: () => Promise<void>;
  on: (event: PhantomEvent, handler: PhantomEventHandler) => void;
  off: (event: PhantomEvent, handler: PhantomEventHandler) => void;
  signAndSendTransaction?: (
    transaction: import("@solana/web3.js").Transaction,
  ) => Promise<PhantomSignAndSendResult>;
};

declare global {
  interface Window {
    phantom?: {
      solana?: PhantomProvider;
    };
  }
}
