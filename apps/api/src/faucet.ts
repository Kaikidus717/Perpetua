import { type Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

/// What the sandbox asks for: a small, fixed devnet drip to one wallet. Deliberately not a general
/// transfer service — it tops up a wallet that has none, and refuses one that already has enough.
export interface FaucetResult {
  signature: string | null;
  amountLamports: number;
  skipped: boolean;
  reason?: string;
}

export interface FaucetPort {
  drip(wallet: string): Promise<FaucetResult>;
}

export interface FaucetOptions {
  connection: Connection;
  /// A 64-byte Solana keypair as a JSON array, kept in `SANDBOX_FAUCET_SECRET`. Devnet only.
  secret: string;
  amountLamports?: number;
  minBalanceLamports?: number;
  cooldownMs?: number;
}

/// A devnet-only hot wallet. It exists so a first-time visitor can try the sandbox without the
/// public faucet's IP rate limit. It sends a fixed small amount, only to a wallet below the floor,
/// and at most once per cooldown window per wallet.
export function createFaucet(options: FaucetOptions): FaucetPort {
  const secret = JSON.parse(options.secret) as unknown;
  if (!Array.isArray(secret) || secret.length !== 64 || !secret.every((n) => Number.isInteger(n))) {
    throw new Error("SANDBOX_FAUCET_SECRET must be a 64-byte Solana keypair as a JSON array");
  }
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret as number[]));
  /// 0.1 SOL covers a locked position plus its vault with room for a few transactions.
  const amountLamports = options.amountLamports ?? 100_000_000;
  const minBalanceLamports = options.minBalanceLamports ?? 200_000_000;
  const cooldownMs = options.cooldownMs ?? 60 * 60 * 1000;
  const lastDrip = new Map<string, number>();

  return {
    async drip(wallet: string): Promise<FaucetResult> {
      const target = new PublicKey(wallet);
      const key = target.toBase58();
      const previous = lastDrip.get(key);
      if (previous !== undefined && Date.now() - previous < cooldownMs) {
        return {
          signature: null,
          amountLamports: 0,
          skipped: true,
          reason: "this wallet was already topped up recently",
        };
      }

      const balance = await options.connection.getBalance(target, "confirmed");
      if (balance >= minBalanceLamports) {
        return {
          signature: null,
          amountLamports: 0,
          skipped: true,
          reason: "this wallet already has enough devnet SOL",
        };
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: target,
          lamports: amountLamports,
        }),
      );
      /// Preflight the transfer, then return the signature without waiting for confirmation. A
      /// serverless function has a short budget; the sandbox page refreshes the balance after a
      /// beat, and the explorer link shows the receipt either way.
      const signature = await options.connection.sendTransaction(transaction, [payer], {
        preflightCommitment: "confirmed",
      });
      lastDrip.set(key, Date.now());
      return { signature, amountLamports, skipped: false };
    },
  };
}
