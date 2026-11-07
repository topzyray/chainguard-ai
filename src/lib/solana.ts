import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { SOLANA_CLUSTER, type PhantomProvider } from "@/types";

const LAMPORTS_PER_SOL = BigInt(1_000_000_000);
const DEFAULT_DEVNET_RPC = clusterApiUrl(SOLANA_CLUSTER);

let connection: Connection | null = null;

/** Public Devnet RPC. Signing keys are never read or stored here. */
export function getRpcUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
  return configured ? configured : DEFAULT_DEVNET_RPC;
}

export function getRpcEndpointLabel(): string {
  try {
    return new URL(getRpcUrl()).host;
  } catch {
    return "Devnet RPC";
  }
}

export function getConnection(): Connection {
  connection ??= new Connection(getRpcUrl(), "confirmed");
  return connection;
}

export function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.phantom?.solana;
  if (!provider?.isPhantom) return null;
  return provider;
}

export async function fetchSolBalance(address: string): Promise<string> {
  const lamports = await getConnection().getBalance(
    new PublicKey(address),
    "confirmed",
  );
  return formatLamports(lamports);
}

export function formatLamports(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL)
    .toString()
    .padStart(9, "0")
    .slice(0, 4);
  return `${whole.toString()}.${fraction}`;
}

export function readErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 4001
  ) {
    return "The request was declined in Phantom.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return fallback;
}
