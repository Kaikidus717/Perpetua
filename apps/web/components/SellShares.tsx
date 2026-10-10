"use client";

import { api } from "@/lib/api";
import { QuoteTokenSelect, QUOTE_TOKENS } from "@/components/QuoteTokenSelect";
import { Spinner } from "@/components/Spinner";
import { explorerUrl, shortAddress, txUrl, usd } from "@/lib/format";
import { humanError } from "@/lib/messages";
import { openSale, seedLadder } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, CARD_MUTED, INPUT, LINK } from "@/lib/ui";
import { SUPPORTED_WALLETS, solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

/// Sells the vault's shares into an open DLMM market instead of an OTC sale: it creates the
/// pFEE/quote pair (if needed) and seeds a one-sided ask ladder around fair value. Both steps are
/// signed by the holder's wallet. Vaults live on devnet, so both transactions are devnet ones —
/// named explicitly so they stay correct when the deploy's default cluster is mainnet.
const VAULT_CLUSTER = "devnet";

export function SellShares({ shareMint, pool }: { shareMint: string; pool: string }) {
  const wallet = useSolanaWallet();
  const [quoteMint, setQuoteMint] = useState<string>(QUOTE_TOKENS[0].mint);
  const [presetIndex, setPresetIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [market, setMarket] = useState<{
    pool: string;
    created: boolean;
    signature: string | null;
  } | null>(null);
  const [listing, setListing] = useState<{ positionAddress: string; signature: string } | null>(
    null,
  );

  const presets = useQuery({ queryKey: ["sale-presets"], queryFn: () => api.salePresets() });
  const valuation = useQuery({
    queryKey: ["sale-valuation", pool],
    queryFn: () => api.valuation(pool),
  });
  const fairValue = valuation.data?.valuation.fairValuePerShareUsd;
  const plan = useQuery({
    queryKey: ["sale-plan", fairValue],
    queryFn: () => api.ladder(fairValue ?? 0),
    enabled: Boolean(fairValue),
  });

  const preset = presets.data?.presets[presetIndex];
  const provider = solanaProvider();
  const ready = Boolean(wallet.address && provider);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setMessage(null);
    try {
      await action();
    } catch (cause) {
      setMessage(humanError(cause, label));
    } finally {
      setBusy(null);
    }
  }

  function createMarket() {
    if (!provider || !preset || !fairValue) return;
    void run("Create the market", async () => {
      const result = await openSale(
        provider,
        {
          shareMint,
          quoteMint,
          presetParameter: preset.address,
          binStep: preset.binStep,
          baseFactor: preset.baseFactor,
          initialPrice: fairValue,
        },
        VAULT_CLUSTER,
      );
      setMarket(result);
      setMessage(
        result.created ? `Market created: ${result.pool}` : `Market already exists: ${result.pool}`,
      );
    });
  }

  function listLadder() {
    if (!provider || !preset || !market || !plan.data) return;
    void run("List the ladder", async () => {
      const result = await seedLadder(
        provider,
        {
          poolAddress: market.pool,
          shareMint,
          quoteMint,
          binStep: preset.binStep,
          plan: plan.data.plan,
        },
        VAULT_CLUSTER,
      );
      setListing(result);
      setMessage(`Ladder listed in position ${result.positionAddress}`);
    });
  }

  return (
    <section className={`${CARD} space-y-4 p-5`}>
      <h2 className="text-base font-semibold text-ink">Sell shares on the open market</h2>
      <p className="text-sm text-muted">
        Offers the shares as a one-sided ask ladder on Meteora DLMM, priced around fair value, so
        buyers trade against a market instead of negotiating off it.
      </p>

      {!ready ? (
        <button type="button" onClick={() => void wallet.connect()} className={BUTTON_PRIMARY}>
          Connect a wallet ({SUPPORTED_WALLETS})
        </button>
      ) : (
        <p className="font-mono text-xs text-muted">{shortAddress(wallet.address ?? "")}</p>
      )}

      <QuoteTokenSelect value={quoteMint} onChange={setQuoteMint} />

      <label className="block space-y-1 text-sm">
        <span className="text-ink">Bin step</span>
        <select
          value={presetIndex}
          onChange={(event) => setPresetIndex(Number(event.target.value))}
          className={INPUT}
        >
          {(presets.data?.presets ?? []).map((option, index) => (
            <option key={option.address} value={index}>
              {option.binStep} bps — {shortAddress(option.address)}
            </option>
          ))}
        </select>
        {presets.isError ? (
          <span className="block text-xs text-warn">
            Market presets are unavailable right now. Try again in a moment.
          </span>
        ) : null}
      </label>

      {valuation.data ? (
        <div className={`${CARD_MUTED} grid grid-cols-3 gap-3 p-3 text-sm`}>
          <div>
            <div className="text-xs text-muted">Fair value / share</div>
            <div className="tnum text-ink">{usd(fairValue, 6)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Ask range</div>
            <div className="tnum text-ink">
              {plan.data
                ? `${usd(plan.data.plan.rangeLowUsd, 6)} – ${usd(plan.data.plan.rangeHighUsd, 6)}`
                : "…"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Shares offered</div>
            <div className="tnum text-ink">{plan.data?.plan.totalOfferShares ?? "…"}</div>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner label="Reading the pool's fee history" />
          Reading the pool&apos;s fee history…
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={createMarket}
          disabled={!ready || busy !== null || !preset || !fairValue}
          className={BUTTON_PRIMARY}
        >
          {busy === "Create the market" ? "Waiting for signature…" : "Create the market"}
        </button>
        <button
          type="button"
          onClick={listLadder}
          disabled={!ready || busy !== null || !market || !plan.data}
          className={BUTTON}
        >
          {busy === "List the ladder" ? "Waiting for signature…" : "List the ladder"}
        </button>
      </div>

      {message ? <p className="break-all text-sm text-ink">{message}</p> : null}
      {market ? (
        <p className="text-sm text-muted">
          Market{" "}
          <a
            href={explorerUrl(market.pool)}
            target="_blank"
            rel="noreferrer"
            className={`font-mono text-xs ${LINK}`}
          >
            {shortAddress(market.pool)} ↗
          </a>
        </p>
      ) : null}
      {listing ? (
        <p className="text-sm text-muted">
          Ladder position{" "}
          <a
            href={txUrl(listing.signature)}
            target="_blank"
            rel="noreferrer"
            className={`font-mono text-xs ${LINK}`}
          >
            {shortAddress(listing.signature)} ↗
          </a>
        </p>
      ) : null}
    </section>
  );
}
