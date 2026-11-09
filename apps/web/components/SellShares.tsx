"use client";

import { PoolPreview } from "@/components/PoolPreview";
import { QUOTE_TOKENS, QuoteTokenSelect } from "@/components/QuoteTokenSelect";
import { Spinner } from "@/components/Spinner";
import { api } from "@/lib/api";
import { explorerUrl, shortAddress, txUrl, usd } from "@/lib/format";
import { humanError } from "@/lib/messages";
import { useWalletNetwork } from "@/lib/network";
import { openSale, seedLadder } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_MUTED, INPUT, LINK } from "@/lib/ui";
import { SUPPORTED_WALLETS, solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

const VAULT_CLUSTER = "devnet";

/// The API's own words behind a failed call, when it sent any. Used to show a reason that the card
/// cannot already explain by itself — the fee-history case is explained in full, so it is not echoed.
function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

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
    void run("Create the market", async () => {
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
      <p className="text-[13px] text-muted">
        Offers the shares as a one-sided ask ladder on Meteora DLMM, priced around fair value, so
        buyers trade against a market instead of negotiating off it.
      </p>

      {!ready ? (
        <button type="button" onClick={() => void wallet.connect()} className={BUTTON_PRIMARY}>
          Connect a wallet ({SUPPORTED_WALLETS})
        </button>
      ) : (
        <p className="font-mono text-[12px] text-muted">{shortAddress(wallet.address ?? "")}</p>
      )}

      {ready && wrongNetwork ? (
        <p className="text-[13px] text-warn">
          This wallet is on {network.label}. Creating the market and listing the ladder need the
          vault&apos;s share token, which lives on devnet — switch the wallet to devnet (Phantom:
          Settings → Developer Settings → Change Network → Devnet) and reload to sell these.
        </p>
      ) : null}
      {ready && network.label && !wrongNetwork ? (
        <p className="text-[12px] text-muted">
          This wallet is on {network.label}, where these shares live.
        </p>
      ) : null}

      <QuoteTokenSelect value={quoteMint} onChange={setQuoteMint} />

      <label className="block space-y-1 text-[13px]">
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
          <span className="block text-[12px] text-warn">
            Market presets are unavailable right now. Try again in a moment.
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
            This pool cannot be priced from Meteora&apos;s fee history, because that service covers
            mainnet only — a pool on devnet never has one. Set the opening price per share yourself
            below and the ladder is built around it.
          </p>
          {valuation.isError && !/fee history/i.test(detail(valuation.error)) ? (
            <p className="text-muted">{detail(valuation.error)}</p>
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
        <div className={`${CARD_MUTED} grid grid-cols-3 gap-3 p-3 text-[13px]`}>
          <div>
            <div className="text-[12px] text-muted">
              {basis === "computed" ? "Fair value / share" : "Opening price / share"}
            </div>
            <div className="tnum text-ink">{usd(price, 6)}</div>
          </div>
          <div>
            <div className="text-[12px] text-muted">Ask range</div>
            <div className="tnum text-ink">
              {plan.data
                ? `${usd(plan.data.plan.rangeLowUsd, 6)} – ${usd(plan.data.plan.rangeHighUsd, 6)}`
                : "…"}
            </div>
          </div>
          <div>
            <div className="text-[12px] text-muted">Shares offered</div>
            <div className="tnum text-ink">{plan.data?.plan.totalOfferShares ?? "…"}</div>
          </div>
        </div>
      ) : null}

      {/* The numbers above, as a shape: where the asks sit, how many shares wait at each price, and
          what the pair actually is. Same `plan` object the listing transaction uses. */}
      {plan.data ? (
        <PoolPreview
          bins={plan.data.plan.bins}
          binStep={preset?.binStep}
          shareLabel="pFEE"
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
          {busy === "Create the market" ? "Waiting for signature…" : "Create the market"}
        </button>
        <button
          type="button"
          onClick={listLadder}
          disabled={!ready || busy !== null || !market || !plan.data || wrongNetwork}
          className={BUTTON_SECONDARY}
        >
          {busy === "List the ladder" ? "Waiting for signature…" : "List the ladder"}
        </button>
      </div>

      {message ? <p className="break-all text-[13px] text-ink">{message}</p> : null}
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
          Ladder position{" "}
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
