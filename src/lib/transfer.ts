import { Buffer } from "buffer";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionExpiredBlockheightExceededError,
  TransactionExpiredTimeoutError,
  type Blockhash,
} from "@solana/web3.js";
import { getConnection, getPhantomProvider, readErrorMessage } from "@/lib/solana";
import type { SolTransferAnalysis } from "@/lib/analysis";

const LAMPORTS_PER_SOL_BIGINT = BigInt(LAMPORTS_PER_SOL);
const CONFIRMATION_TIMEOUT_MS = 60_000;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export type PreparedTransfer = {
  recipient: string;
  amountSol: number;
  lamports: bigint;
};

export type TransferFailureCode =
  | "validation"
  | "rejected"
  | "insufficient"
  | "rpc"
  | "timeout"
  | "confirmation";

export class TransferError extends Error {
  readonly code: TransferFailureCode;
  readonly signature: string | null;

  constructor(message: string, code: TransferFailureCode, signature: string | null = null) {
    super(message);
    this.name = "TransferError";
    this.code = code;
    this.signature = signature;
  }
}

export function validateSolTransfer(input: {
  intent: SolTransferAnalysis["intent"];
  recipient: string;
  amountSol: number;
  requiresClarification: boolean;
}): { ok: true; transfer: PreparedTransfer } | { ok: false; error: string } {
  if (input.intent !== "transfer" || input.requiresClarification) {
    return {
      ok: false,
      error: "Send is available only after a clear native SOL transfer review.",
    };
  }

  const recipient = input.recipient.trim();
  try {
    if (new PublicKey(recipient).toBase58() !== recipient) {
      return { ok: false, error: "The recipient is not a canonical Solana public key." };
    }
  } catch {
    return { ok: false, error: "The recipient is not a valid Solana public key." };
  }

  try {
    const lamports = solToLamports(input.amountSol);
    return {
      ok: true,
      transfer: { recipient, amountSol: input.amountSol, lamports },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The SOL amount is not valid.",
    };
  }
}

export function solToLamports(amountSol: number): bigint {
  if (typeof amountSol !== "number" || !Number.isFinite(amountSol) || amountSol <= 0) {
    throw new TransferError(
      "The SOL amount must be a finite number greater than zero.",
      "validation",
    );
  }
  if (amountSol > Number.MAX_SAFE_INTEGER) {
    throw new TransferError("The SOL amount is too large to convert exactly.", "validation");
  }

  const decimal = amountSol.toFixed(9);
  const rounded = Number(decimal);
  if (!Number.isFinite(rounded) || Math.abs(rounded - amountSol) > 5e-10) {
    throw new TransferError("Use at most 9 decimal places for the SOL amount.", "validation");
  }

  const [whole, fraction] = decimal.split(".");
  if (!whole || fraction?.length !== 9 || !/^\d+$/.test(whole) || !/^\d{9}$/.test(fraction)) {
    throw new TransferError("The SOL amount could not be converted to lamports.", "validation");
  }

  const lamports = BigInt(whole) * LAMPORTS_PER_SOL_BIGINT + BigInt(fraction);
  if (lamports <= BigInt(0)) {
    throw new TransferError("The SOL amount must be greater than zero.", "validation");
  }
  return lamports;
}

export function formatLamportsExact(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL_BIGINT;
  const fraction = (lamports % LAMPORTS_PER_SOL_BIGINT)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function devnetExplorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

export async function estimateTransferFee(input: {
  payerAddress: string;
  recipient: string;
  lamports: bigint;
}): Promise<bigint | null> {
  const payer = new PublicKey(input.payerAddress);
  const recipient = new PublicKey(input.recipient);
  const connection = getConnection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const transaction = nativeTransfer({
    payer,
    recipient,
    lamports: input.lamports,
    blockhash,
    lastValidBlockHeight,
  });
  return asLamports(await transaction.getEstimatedFee(connection));
}

export async function sendNativeSolTransfer(input: {
  payerAddress: string;
  intent: SolTransferAnalysis["intent"];
  recipient: string;
  amountSol: number;
  requiresClarification: boolean;
}): Promise<string> {
  const validated = validateSolTransfer(input);
  if (!validated.ok) {
    throw new TransferError(validated.error, "validation");
  }

  const provider = getPhantomProvider();
  if (!provider?.isConnected || !provider.signAndSendTransaction) {
    throw new TransferError("Connect Phantom before sending a transfer.", "validation");
  }

  const connected = provider.publicKey?.toString() ?? "";
  if (connected !== input.payerAddress) {
    throw new TransferError(
      "The connected wallet changed. Connect the fee payer again before sending.",
      "validation",
    );
  }

  const payer = new PublicKey(connected);
  const recipient = new PublicKey(validated.transfer.recipient);
  const connection = getConnection();

  let blockhash: Blockhash;
  let lastValidBlockHeight: bigint;
  try {
    const latest = await connection.getLatestBlockhash("confirmed");
    blockhash = latest.blockhash;
    lastValidBlockHeight = latest.lastValidBlockHeight;
  } catch (error) {
    throw new TransferError(
      shorten(readErrorMessage(error, "Could not fetch a recent blockhash.")),
      "rpc",
    );
  }

  const transaction = nativeTransfer({
    payer,
    recipient,
    lamports: validated.transfer.lamports,
    blockhash,
    lastValidBlockHeight,
  });

  let fee: bigint | null = null;
  try {
    fee = asLamports(await transaction.getEstimatedFee(connection));
  } catch {
    fee = null;
  }

  try {
    const balance = BigInt(await connection.getBalance(payer, "confirmed"));
    const required = fee === null ? validated.transfer.lamports : validated.transfer.lamports + fee;
    if (balance < required) {
      throw new TransferError(
        "The connected wallet does not have enough SOL for this transfer and the network fee.",
        "insufficient",
      );
    }
  } catch (error) {
    if (error instanceof TransferError) throw error;
    throw new TransferError(
      shorten(readErrorMessage(error, "Could not check the wallet balance.")),
      "rpc",
    );
  }

  let signature: string;
  try {
    await presentTransactionToPhantom(transaction);
    const result = await provider.signAndSendTransaction(transaction);
    signature = readSignature(result);
  } catch (error) {
    if (isWalletRejection(error)) {
      throw new TransferError("The transfer was declined in Phantom.", "rejected");
    }
    if (isInsufficientFunds(error)) {
      throw new TransferError(
        "The connected wallet does not have enough SOL for this transfer.",
        "insufficient",
      );
    }
    throw new TransferError(
      shorten(readErrorMessage(error, "Phantom could not send the transaction.")),
      "rpc",
    );
  }

  try {
    const confirmation = await withTimeout(
      connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      ),
      CONFIRMATION_TIMEOUT_MS,
    );
    if (confirmation.value.err) {
      throw new TransferError("The transaction was confirmed with an error.", "confirmation", signature);
    }
  } catch (error) {
    if (error instanceof TransferError) throw error;
    if (
      error instanceof ConfirmationTimeout ||
      error instanceof TransactionExpiredTimeoutError ||
      error instanceof TransactionExpiredBlockheightExceededError
    ) {
      throw new TransferError(
        "Confirmation timed out. The transfer may still confirm on Devnet.",
        "timeout",
        signature,
      );
    }
    throw new TransferError(
      shorten(readErrorMessage(error, "Could not confirm the transaction.")),
      "confirmation",
      signature,
    );
  }

  return signature;
}

function nativeTransfer(input: {
  payer: PublicKey;
  recipient: PublicKey;
  lamports: bigint;
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
}): Transaction {
  const transaction = new Transaction({
    feePayer: input.payer,
    blockhash: input.blockhash,
    lastValidBlockHeight: input.lastValidBlockHeight,
  }).add(
    SystemProgram.transfer({
      fromPubkey: input.payer,
      toPubkey: input.recipient,
      lamports: input.lamports,
    }),
  );
  transaction.feePayer = input.payer;
  transaction.recentBlockhash = input.blockhash;

  const instruction = transaction.instructions[0];
  if (
    transaction.instructions.length !== 1 ||
    !instruction ||
    !instruction.programId.equals(SystemProgram.programId)
  ) {
    throw new TransferError("Only a native SOL transfer can be sent.", "validation");
  }

  return transaction;
}

// Phantom calls serialize() itself and passes the result to a base58 encoder
// that rejects anything except a Buffer. web3.js v3 makes serialize() async and
// returns a Uint8Array, which surfaces as "Expected Buffer".
async function presentTransactionToPhantom(transaction: Transaction): Promise<void> {
  const bytes = await transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  const wire = Buffer.from(bytes);
  transaction.serialize = (() => wire) as unknown as Transaction["serialize"];
}

function asLamports(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return BigInt(Math.round(value));
  }
  return null;
}

function readSignature(result: { signature: string | Uint8Array }): string {
  if (typeof result.signature === "string" && result.signature.trim()) {
    return result.signature.trim();
  }
  if (result.signature instanceof Uint8Array && result.signature.length > 0) {
    return encodeBase58(result.signature);
  }
  throw new TransferError("Phantom did not return a transaction signature.", "rpc");
}

function encodeBase58(bytes: Uint8Array): string {
  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] === 0) zeroes += 1;

  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const current = digits[index] ?? 0;
      carry += current * 256;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let encoded = "1".repeat(zeroes);
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    encoded += BASE58[digits[index] ?? 0];
  }
  return encoded;
}

function isWalletRejection(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 4001;
}

function isInsufficientFunds(error: unknown): boolean {
  return /insufficient|debit an account|no record of a prior credit|custom program error: 0x1/i.test(
    readErrorMessage(error, ""),
  );
}

function shorten(message: string): string {
  const trimmed = message.trim();
  return trimmed.length > 240 ? `${trimmed.slice(0, 239)}…` : trimmed;
}

class ConfirmationTimeout extends Error {
  constructor() {
    super("Confirmation timed out.");
    this.name = "ConfirmationTimeout";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ConfirmationTimeout()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
