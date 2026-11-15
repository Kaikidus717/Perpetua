"use client";

import { PoolPreview } from "@/components/PoolPreview";
import { QUOTE_TOKENS, QuoteTokenSelect } from "@/components/QuoteTokenSelect";
import { Spinner } from "@/components/Spinner";
import { api } from "@/lib/api";
import { explorerUrl, shortAddress, txUrl, usd } from "@/lib/format";
import { humanError, loadError } from "@/lib/messages";
import { useWalletNetwork } from "@/lib/network";
import { openSale, seedLadder } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_MUTED, INPUT, LINK } from "@/lib/ui";
import { SUPPORTED_WALLETS, solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

const VAULT_CLUSTER = "devnet";

export function priceBasis(
  fairValue: number | undefined,
  settled: { isError: boolean; isFetched: boolean },
  typed: string,
): { price: number | undefined; basis: "computed" | "typed" | "reading" } {
  const manual = Number(typed.trim());
  const usable = Number.isFinite(manual) && manual > 0;
  if (typeof fairValue === "number") return { price: fairValue, basis: "computed" };
  /// `isFetched` is true once the request has settled either way, so a failure that carries no value
  /// still counts as answered — the only state that stays "reading" is one that has never come back.
  if (settled.isError || settled.isFetched)
    return { price: usable ? manual : undefined, basis: "typed" };
  return { price: undefined, basis: "reading" };
}

export function SellShares({ shareMint, pool }: { shareMint: string; pool: string }) {
  const wallet = useSolanaWallet();
  const [quoteMint, setQuoteMint] = useState<string>(QUOTE_TOKENS[0].mint);
  const [presetIndex, setPresetIndex] = useState(0);
  const [manualPrice, setManualPrice] = useState("1");
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

  const presets = useQuery({
    queryKey: ["sale-presets", VAULT_CLUSTER],
    queryFn: () => api.salePresets(VAULT_CLUSTER),
  });
  const valuation = useQuery({
    queryKey: ["sale-valuation", pool],
    queryFn: () => api.valuation(pool),
  });
  const fairValue = valuation.data?.valuation.fairValuePerShareUsd;
  const { price, basis } = priceBasis(fairValue, valuation, manualPrice);
  const plan = useQuery({
    queryKey: ["sale-plan", price],
    queryFn: () => api.ladder(price ?? 0),
    enabled: Boolean(price),
  });

  /// The share token these transactions move lives on devnet, so a mainnet wallet cannot sign for it.
  /// Naming the wallet's network is the difference between "nothing to sell" and "wrong network".
  const network = useWalletNetwork(wallet.address);
  const wrongNetwork = network.cluster === "mainnet-beta";

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
    if (!provider || !preset || !price) return;
    const opening = price;
    void run("open the market", async () => {
      const result = await openSale(
        provider,
        {
          shareMint,
          quoteMint,
          presetParameter: preset.address,
          binStep: preset.binStep,
          baseFactor: preset.baseFactor,
          initialPrice: opening,
        },
        VAULT_CLUSTER,
      );
      setMarket(result);
      setMessage(result.created ? "The market is open." : "This market is already open.");
    });
  }

  function listLadder() {
    if (!provider || !preset || !market || !plan.data) return;
    void run("post your shares", async () => {
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
      setMessage("Your shares are listed.");
    });
  }

  return (
    <section className={`${CARD} space-y-4 p-5`}>
      <h2 className="text-base font-semibold text-ink">Sell your shares</h2>
      <p className="text-[13px] text-muted">
        List your shares at a range of prices. Buyers trade against the market at the price you set.
      </p>

      {!ready ? (
        <button type="button" onClick={() => void wallet.connect()} className={BUTTON_PRIMARY}>
          Connect a wallet ({SUPPORTED_WALLETS})
        </button>
      ) : (
        <p className="font-mono text-[12px] text-muted">{shortAddress(wallet.address ?? "")}</p>
      )}

      {ready && wrongNetwork ? (
        <p className="text-[13px] leading-5 text-warn">
          This wallet is on {network.label}. Opening a market and selling shares run on the test
          network. Switch Phantom to Settings → Developer Settings → Change Network → Devnet, then
          reload.
        </p>
      ) : null}
      {ready && network.label && !wrongNetwork ? (
        <p className="text-[12px] text-muted">These shares live on {network.label}.</p>
      ) : null}

      <QuoteTokenSelect value={quoteMint} onChange={setQuoteMint} />

      <label className="block space-y-1 text-[13px]">
        <span className="text-ink">Price step</span>
        <select
          value={presetIndex}
          onChange={(event) => setPresetIndex(Number(event.target.value))}
          className={INPUT}
        >
          {(presets.data?.presets ?? []).map((option, index) => (
            <option key={option.address} value={index}>
              {option.binStep} bps · {shortAddress(option.address)}
            </option>
          ))}
        </select>
        {presets.isError ? (
          <span className="block text-[12px] text-warn">
            {loadError(presets.error, "market settings")}
          </span>
        ) : null}
      </label>

      {basis === "reading" ? (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner label="Reading the pool's fee history" />
          Reading the pool&apos;s fee history…
        </p>
      ) : null}

      {basis === "typed" ? (
        <div className={`${CARD_MUTED} space-y-2 p-3 text-[13px]`}>
          <p className="text-warn">
            We couldn&apos;t use fee history to price this pool. Set an opening price below and the
            market is built around it.
          </p>
          {valuation.isError ? (
            <p className="text-muted">{loadError(valuation.error, "this pool's fee history")}</p>
          ) : null}
          <label className="block space-y-1.5">
            <span className="text-[12px] text-muted">Opening price per share (USD)</span>
            <input
              value={manualPrice}
              onChange={(event) => setManualPrice(event.target.value)}
              inputMode="decimal"
              className={INPUT}
            />
          </label>
        </div>
      ) : null}

      {price ? (
        <div className={`${CARD_MUTED} grid grid-cols-1 gap-3 p-3 text-[13px] sm:grid-cols-3`}>
          <div>
            <div className="text-[12px] text-muted">
              {basis === "computed" ? "Fair value / share" : "Opening price / share"}
            </div>
            <div className="tnum text-ink">{usd(price, 6)}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted">Price range</div>
            <div className="tnum text-ink">
              {plan.data
                ? `${usd(plan.data.plan.rangeLowUsd, 6)} to ${usd(plan.data.plan.rangeHighUsd, 6)}`
                : "…"}
            </div>
          </div>
          <div>
            <div className="text-[12px] text-muted">Shares offered</div>
            <div className="tnum text-ink">{plan.data?.plan.totalOfferShares ?? "…"}</div>
          </div>
        </div>
      ) : null}

      {plan.isError ? (
        <p className="text-[13px] leading-5 text-warn">{loadError(plan.error, "the price plan")}</p>
      ) : null}

      {/* The numbers above, as a shape: where the asks sit, how many shares wait at each price, and
          what the pair actually is. Same `plan` object the listing transaction uses. */}
      {plan.data ? (
        <PoolPreview
          bins={plan.data.plan.bins}
          binStep={preset?.binStep}
          shareLabel="Share token"
          quoteLabel={QUOTE_TOKENS.find((token) => token.mint === quoteMint)?.label ?? "quote"}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={createMarket}
          disabled={!ready || busy !== null || !preset || !price || wrongNetwork}
          className={BUTTON_PRIMARY}
        >
          {busy === "open the market" ? "Waiting for signature…" : "Open the market"}
        </button>
        <button
          type="button"
          onClick={listLadder}
          disabled={!ready || busy !== null || !market || !plan.data || wrongNetwork}
          className={BUTTON_SECONDARY}
        >
          {busy === "post your shares" ? "Waiting for signature…" : "Post shares for sale"}
        </button>
      </div>

      {message ? <p className="text-[13px] leading-5 text-warn">{message}</p> : null}
      {market ? (
        <p className="text-[13px] text-muted">
          Market{" "}
          <a
            href={explorerUrl(market.pool)}
            target="_blank"
            rel="noreferrer"
            className={`font-mono text-[12px] ${LINK}`}
          >
            {shortAddress(market.pool)} ↗
          </a>
        </p>
      ) : null}
      {listing ? (
        <p className="text-[13px] text-muted">
          Listing{" "}
          <a
            href={txUrl(listing.signature)}
            target="_blank"
            rel="noreferrer"
            className={`font-mono text-[12px] ${LINK}`}
          >
            {shortAddress(listing.signature)} ↗
          </a>
        </p>
      ) : null}
    </section>
  );
}
