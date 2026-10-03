import { BorshEventCoder, type Idl } from "@coral-xyz/anchor";
import { PERPETUA_VAULT_IDL } from "@perpetua/sdk";
import type { VaultEvent } from "@perpetua/shared";

const PROGRAM_DATA_MARKER = "Program data: ";

export interface DecodedEvent {
  name: string;
  data: Record<string, string | number>;
}

const coder = new BorshEventCoder(PERPETUA_VAULT_IDL as unknown as Idl);

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

export function toVaultEvents(
  decoded: DecodedEvent[],
  meta: { signature: string; slot: number; blockTime: number | null },
): VaultEvent[] {
  return decoded.map((event) => ({
    signature: meta.signature,
    slot: meta.slot,
    blockTime: meta.blockTime,
    name: event.name,
    data: event.data,
  }));
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
