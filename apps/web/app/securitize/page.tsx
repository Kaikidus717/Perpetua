"use client";

import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd, explorerUrl, shortAddress, usd } from "@/lib/format";
import { useSolanaWallet } from "@/lib/wallet";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

function eligibility(position: {
  unlockedLiquidity: string;
  vestedLiquidity: string;
  permanentLockedLiquidity: string;
}): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (BigInt(position.unlockedLiquidity) > 0n) reasons.push("has unlocked liquidity");
  if (BigInt(position.vestedLiquidity) > 0n) reasons.push("has vested liquidity");
  if (BigInt(position.permanentLockedLiquidity) <= 0n) {
    reasons.push("no permanent-locked liquidity");
  }
  return { eligible: reasons.length === 0, reasons };
}

export default function SecuritizePage() {
  const wallet = useSolanaWallet();
  const demo = useQuery({ queryKey: ["demo"], queryFn: api.demo });
  const [manual, setManual] = useState("");
  const target = wallet.address ?? (manual.trim() || demo.data?.wallet || null);

  const positions = useQuery({
    queryKey: ["positions", target],
    queryFn: () => (target ? api.positions(target) : Promise.reject(new Error("no wallet"))),
    enabled: Boolean(target),
  });

  const position = positions.data?.positions[0];
  const valuation = useQuery({
    queryKey: ["valuation", position?.pool],
    queryFn: () =>
      position ? api.valuation(position.pool) : Promise.reject(new Error("no position")),
    enabled: Boolean(position),
  });
  const fairValue = valuation.data?.valuation.fairValuePerShareUsd;
  const ladder = useQuery({
    queryKey: ["ladder", fairValue],
    queryFn: () => (fairValue ? api.ladder(fairValue) : Promise.reject(new Error("no price"))),
    enabled: Boolean(fairValue),
  });

  const check = position ? eligibility(position) : null;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Securitize a position</h1>
        <p className="max-w-3xl text-slate-400">
          Hand a permanently locked DAMM v2 position NFT to the vault PDA and mint a fixed supply of
          fee-share tokens against its fee stream.
        </p>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        {wallet.address ? (
          <>
            <span className="font-mono text-sm text-accent">{shortAddress(wallet.address)}</span>
            <button
              type="button"
              onClick={() => void wallet.disconnect()}
              className="rounded-lg border border-edge px-4 py-2 text-sm"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void wallet.connect()}
            className="rounded-lg border border-accent/40 bg-accent/10 px-5 py-2 text-sm font-medium text-accent"
          >
            Connect wallet
          </button>
        )}
        <input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          placeholder="or paste a wallet address to scan"
          className="min-w-[20rem] flex-1 rounded-lg border border-edge bg-panel px-4 py-2 font-mono text-sm outline-none focus:border-accent"
        />
      </section>

      {wallet.error ? <p className="text-sm text-amber-300">{wallet.error}</p> : null}
      {!wallet.available && !manual ? (
        <p className="text-sm text-slate-500">No wallet detected — scanning the demo wallet.</p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Eligible positions</h2>
        {positions.isPending && target ? <p className="text-sm text-slate-400">scanning…</p> : null}
        {positions.data && positions.data.positions.length === 0 ? (
          <p className="text-sm text-slate-400">No DAMM v2 positions found for this wallet.</p>
        ) : null}
        {position ? (
          <div className="space-y-3 rounded-lg border border-edge bg-panel p-5">
            <a
              href={explorerUrl(position.address)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm text-accent"
            >
              {position.address}
            </a>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase text-slate-400">Unlocked</div>
                <div>{position.unlockedLiquidity}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-slate-400">Vested</div>
                <div>{position.vestedLiquidity}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-slate-400">Permanent lock</div>
                <div>{position.permanentLockedLiquidity}</div>
              </div>
            </div>
            <div className="text-sm">
              {check?.eligible ? (
                <span className="text-accent">eligible for securitization</span>
              ) : (
                <span className="text-amber-300">
                  not eligible: {check?.reasons.join(", ")} — split the locked part first
                </span>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {valuation.data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Fair value (base)"
              value={compactUsd(valuation.data.valuation.fairValueUsd)}
            />
            <Stat label="Per share" value={usd(valuation.data.valuation.fairValuePerShareUsd, 6)} />
            <Stat
              label="Ask range"
              value={
                ladder.data
                  ? `${usd(ladder.data.plan.rangeLowUsd, 6)} – ${usd(
                      ladder.data.plan.rangeHighUsd,
                      6,
                    )}`
                  : "…"
              }
            />
          </section>

          <section className="space-y-2 rounded-lg border border-edge bg-panel p-5 text-sm text-slate-300">
            <h2 className="text-lg font-semibold text-slate-100">Next transactions</h2>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                <code className="font-mono text-xs">create_vault</code> — hands the position NFT to
                the vault PDA, mints 1,000,000 fee-share tokens to you, revokes the mint authority.
              </li>
              <li>
                <code className="font-mono text-xs">DLMM pool + one-sided ask ladder</code> — seeds
                the sale around fair value.
              </li>
              <li>
                <code className="font-mono text-xs">stake</code> /{" "}
                <code className="font-mono text-xs">harvest</code> — holders stake shares and pull
                real fees any time.
              </li>
            </ol>
            <p className="text-xs text-slate-500">
              Signing runs through{" "}
              <code className="font-mono">packages/sdk/scripts/create-vault.ts</code> so keys never
              leave the operator machine.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
