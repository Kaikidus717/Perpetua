"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd, explorerUrl, shortAddress, usd } from "@/lib/format";
import { type SecuritizeResult, securitize } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, CARD_MUTED, INPUT_MONO, LINK, PAGE } from "@/lib/ui";
import { SUPPORTED_WALLETS, solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export default function SecuritizePage() {
  const wallet = useSolanaWallet();
  const [manual, setManual] = useState("");
  const target = wallet.address ?? (manual.trim() || null);

  const positions = useQuery({
    queryKey: ["positions", target],
    queryFn: () => (target ? api.positionsOnchain(target) : Promise.reject(new Error("no wallet"))),
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

  const check = position?.eligibility ?? null;
  const [busy, setBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<SecuritizeResult | null>(null);

  async function runSecuritize() {
    const detected = solanaProvider();
    if (!detected || !position) {
      setTxError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setTxError(null);
    try {
      setResult(
        await securitize(detected, {
          pool: position.pool,
          position: position.address,
          positionNftMint: position.nftMint,
          positionNftAccount: position.nftAccount,
          positionNftProgram: position.positionNftProgram,
          tokenAMint: position.tokenAMint,
          tokenBMint: position.tokenBMint,
          tokenAProgram: position.tokenAProgram,
          tokenBProgram: position.tokenBProgram,
        }),
      );
    } catch (cause) {
      setTxError(cause instanceof Error ? cause.message : "transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={PAGE}>
      <PageHeader
        title="Create shares"
        description="Turn a locked pool position into 1,000,000 tradable shares. A vault takes custody of the position so it can never be pulled out, the shares land in your wallet, and every fee the pool keeps earning then belongs to whoever holds them."
      />

      <section className="flex flex-wrap items-center gap-3">
        {wallet.address ? (
          <>
            <span className="font-mono text-sm text-ink">{shortAddress(wallet.address)}</span>
            <button type="button" onClick={() => void wallet.disconnect()} className={BUTTON}>
              Disconnect
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void wallet.connect()} className={BUTTON_PRIMARY}>
            Connect wallet
          </button>
        )}
        <input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          aria-label="Wallet address to scan for positions"
          placeholder="or paste a wallet address to scan"
          className={`${INPUT_MONO} min-w-[20rem] flex-1`}
        />
      </section>

      {wallet.error ? <p className="text-sm text-warn">{wallet.error}</p> : null}
      {!wallet.available && !manual ? (
        <p className="text-sm text-muted">
          No wallet found. Paste an address above, or install {SUPPORTED_WALLETS}.
        </p>
      ) : null}

      <Section
        title="Positions found"
        description="Only a position that is permanently locked can back shares."
      >
        {positions.isPending && target ? <p className="text-sm text-muted">Scanning…</p> : null}
        {positions.data && positions.data.positions.length === 0 ? (
          <p className="text-sm text-muted">No DAMM v2 positions found for this wallet.</p>
        ) : null}
        {position ? (
          <div className={`${CARD} space-y-4 p-5`}>
            <a
              href={explorerUrl(position.address)}
              target="_blank"
              rel="noreferrer"
              className={`break-all font-mono text-sm ${LINK}`}
            >
              {position.address}
            </a>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted">Unlocked</div>
                <div className="tnum mt-0.5 text-ink">{position.unlockedLiquidity}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Vested</div>
                <div className="tnum mt-0.5 text-ink">{position.vestedLiquidity}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Permanent lock</div>
                <div className="tnum mt-0.5 text-ink">{position.permanentLockedLiquidity}</div>
              </div>
            </div>
            {check?.eligible ? (
              <p className="text-sm text-ink">Eligible for securitization.</p>
            ) : (
              <p className="text-sm text-warn">
                Not eligible: {check?.reasons.join(", ")} — split the locked part first.
              </p>
            )}
          </div>
        ) : null}
      </Section>

      {position ? (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => void runSecuritize()}
            disabled={busy || !check?.eligible}
            className={BUTTON_PRIMARY}
          >
            {busy ? "Waiting for signature…" : "Create shares"}
          </button>
          {txError ? <p className="text-sm text-warn">{txError}</p> : null}
          {result ? (
            <div className={`${CARD_MUTED} space-y-1 p-4 text-sm`}>
              <p className="text-ink">Vault created.</p>
              <p className="text-ink">Your share token</p>
              <p className="font-mono text-xs text-muted">{result.shareMint}</p>
              <a
                href={`https://solscan.io/tx/${result.signature}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className={`font-mono text-xs ${LINK}`}
              >
                {shortAddress(result.signature)} ↗
              </a>
            </div>
          ) : null}
        </section>
      ) : null}

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

          <Section title="What happens next">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
              <li>
                Your locked position is handed to a vault — a contract that holds it and can never
                give it back, not even to you. That is what stops the fees from being taken away.
              </li>
              <li>
                1,000,000 shares are created and sent to your wallet. Keep them, or sell them on.
              </li>
              <li>
                Whoever holds a share collects that share's slice of the fees, for as long as the
                position keeps earning. Claim whenever you like.
              </li>
            </ol>
          </Section>
        </>
      ) : null}
    </div>
  );
}
