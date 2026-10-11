import { BorshEventCoder, type Idl } from "@coral-xyz/anchor";
import { PERPETUA_VAULT_IDL } from "@perpetua/sdk";
import type { VaultEvent } from "@perpetua/shared";
import type { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_DATA_MARKER = "Program data: ";
const coder = new BorshEventCoder(PERPETUA_VAULT_IDL as unknown as Idl);

export interface DecodedEvent {
  name: string;
  data: Record<string, string | number>;
}

/// Anchor emits each event as a `Program data: <base64>` log line. Decode every one this program
/// produced, so a vault's history can be rebuilt from a transaction's logs alone.
export function decodeVaultEvents(logs: readonly string[]): DecodedEvent[] {
  const decoded: DecodedEvent[] = [];
  for (const line of logs) {
    const index = line.indexOf(PROGRAM_DATA_MARKER);
    if (index === -1) continue;
    const payload = line.slice(index + PROGRAM_DATA_MARKER.length).trim();
    const event = coder.decode(payload);
    if (!event) continue;
    decoded.push({ name: event.name, data: normalize(event.data) });
  }
  return decoded;
}

function normalize(data: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "number") out[key] = value;
    else if (typeof value === "bigint") out[key] = value.toString();
    else out[key] = String(value);
  }
  return out;
}

/// The vault's recent history, read straight from the chain: list the transactions that touched the
/// vault, decode the Anchor events out of each one's logs, and tag them with where they landed. No
/// indexer required — the chain keeps the receipts, the program just has to be asked to read them.
export async function readVaultEvents(
  connection: Connection,
  vault: PublicKey,
  lookback: number,
): Promise<VaultEvent[]> {
  const signatures = await connection.getSignaturesForAddress(vault, { limit: lookback });
  const events: VaultEvent[] = [];
  for (const entry of signatures) {
    // A failed transaction left no state behind, so it belongs in the history no more than it
    // belongs in the accounting.
    if (entry.err) continue;
    const transaction = await connection.getTransaction(entry.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = transaction?.meta?.logMessages ?? [];
    for (const event of decodeVaultEvents(logs)) {
      events.push({
        signature: entry.signature,
        slot: entry.slot,
        blockTime: transaction?.blockTime ?? entry.blockTime ?? null,
        name: event.name,
        data: event.data,
      });
    }
  }
  return events;
}
