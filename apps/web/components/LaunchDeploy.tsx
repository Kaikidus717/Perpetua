"use client";

import { QUOTE_TOKENS, QuoteTokenSelect } from "@/components/QuoteTokenSelect";
import { metadataUri } from "@/lib/api";
import { explorerCluster, explorerUrl, shortAddress, txUrl } from "@/lib/format";
import { humanError } from "@/lib/messages";
import { networkLabel, useWalletNetwork } from "@/lib/network";
import { deployLaunch } from "@/lib/tx";
import { BUTTON_PRIMARY, CARD, CARD_MUTED, INPUT, INPUT_MONO, LINK } from "@/lib/ui";
import { SUPPORTED_WALLETS, solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { Keypair } from "@solana/web3.js";
import { useState } from "react";

const URI_LIMIT = 140;

export interface LaunchDeployProps {
  creatorTradingFeePct: number;
  creatorLiquidityPct: number;
  partnerLiquidityPct: number;
  lockedPct: number;
  cluster: string | null;
}

/// A ticker guess from the name, so nobody has to type one.
function deriveSymbol(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
}

/// Deploys the plan above: creates the base token, then the DBC config and its pool in one
/// transaction. Both steps are signed by the creator's wallet.
export function LaunchDeploy({
  creatorTradingFeePct,
  creatorLiquidityPct,
  partnerLiquidityPct,
  lockedPct,
  cluster,
}: LaunchDeployProps) {
  const wallet = useSolanaWallet();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [symbolEdited, setSymbolEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [customUri, setCustomUri] = useState("");
  const [supply, setSupply] = useState(1_000_000_000);
  const [quoteMint, setQuoteMint] = useState<string>(QUOTE_TOKENS[0].mint);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mint, setMint] = useState<string | null>(null);
  const [launch, setLaunch] = useState<{ config: string; pool: string; signature: string } | null>(
    null,
  );

  const provider = solanaProvider();
  const ready = Boolean(wallet.address && provider);

  const network = useWalletNetwork(wallet.address);
  const mismatched = Boolean(network.cluster && cluster && network.cluster !== cluster);
  /// The wallet's network is not known yet — nothing here can be signed until it is.
  const unresolved = !cluster;

  const generated = metadataUri({
    name: name.trim(),
    symbol: symbol.trim(),
    description: description.trim(),
    image: image.trim(),
  });
  const uri = customUri.trim() || generated;
  const uriTooLong = uri.length > URI_LIMIT;
  const described = Boolean(customUri.trim() || description.trim());
  const filled = Boolean(name.trim() && symbol.trim() && described);

  /// The ticker follows the name until the creator edits it themselves.
  function onName(value: string) {
    setName(value);
    if (!symbolEdited) setSymbol(deriveSymbol(value));
  }

  function onSymbol(value: string) {
    setSymbolEdited(true);
    setSymbol(
      value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 10),
    );
  }

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

  function deploy() {
    if (!provider || !cluster || uriTooLong || !filled) return;
    const target = cluster;
    void run("Deploy the launch", async () => {
      const mintKeypair = Keypair.generate();
      const result = await deployLaunch(
        provider,
        {
          baseMint: mintKeypair.publicKey.toBase58(),
          quoteMint,
          name,
          symbol,
          uri,
          totalTokenSupply: supply,
          creatorTradingFeePercentage: creatorTradingFeePct,
          creatorLiquidityPercentage: creatorLiquidityPct,
          partnerLiquidityPercentage: partnerLiquidityPct,
          creatorPermanentLockedLiquidityPercentage: lockedPct,
          partnerPermanentLockedLiquidityPercentage: 0,
        },
        target,
        mintKeypair,
      );
      setMint(mintKeypair.publicKey.toBase58());
      setLaunch(result);
      setMessage(
        `Launched on ${networkLabel(target)}: the token, its metadata and the pool were created in one transaction.`,
      );
    });
  }

  return (
    <section className={`${CARD} space-y-4 p-5`}>
      <h2 className="text-base font-semibold text-ink">
        {cluster ? `Deploy this launch on ${networkLabel(cluster)}` : "Deploy this launch"}
      </h2>

      {unresolved ? (
        <p className="text-[12px] text-muted">
          Reading which network your wallet is on. A launch is built for one network and can only be
          signed by a wallet switched to it, so this waits for the answer rather than guessing.
        </p>
      ) : null}

      {mismatched ? (
        <p className="text-[12px] text-warn">
          Your wallet is on {networkLabel(network.cluster)}, and this launch is set to{" "}
          {networkLabel(cluster)}. A wallet signs on whichever network it is switched to, so change
          the wallet&apos;s network or the choice above before signing.
        </p>
      ) : null}
      <p className="text-[13px] text-muted">
        Creates the token, then the DBC config and its pool, using exactly the split planned above.
        Graduation to DAMM v2 happens on the curve&apos;s own schedule; the migrated position is
        what Create shares securitizes.
      </p>

      {!ready ? (
        <button type="button" onClick={() => void wallet.connect()} className={BUTTON_PRIMARY}>
          Connect a wallet ({SUPPORTED_WALLETS})
        </button>
      ) : (
        <p className="font-mono text-[12px] text-muted">{shortAddress(wallet.address ?? "")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 text-[13px]">
          <span className="text-ink">Token name</span>
          <input
            value={name}
            onChange={(event) => onName(event.target.value)}
            placeholder="e.g. Jak"
            className={INPUT}
          />
          <span className="block text-[12px] text-muted">The full name people will see.</span>
        </label>
        <label className="space-y-1 text-[13px]">
          <span className="text-ink">Ticker</span>
          <input
            value={symbol}
            onChange={(event) => onSymbol(event.target.value)}
            placeholder="JAK"
            className={INPUT}
          />
          <span className="block text-[12px] text-muted">
            The short symbol, like SOL or USDC. We fill it in from the name — change it if you like.
          </span>
        </label>
        <label className="space-y-1 text-[13px]">
          <span className="text-ink">Total supply</span>
          <input
            type="number"
            value={supply}
            onChange={(event) => setSupply(Number(event.target.value))}
            className={`${INPUT} tnum`}
          />
          <span className="block text-[12px] text-muted">How many tokens will ever exist.</span>
        </label>
      </div>

      <label className="block space-y-1 text-[13px]">
        <span className="text-ink">Description</span>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="One line about what this token is for"
          className={INPUT}
        />
        <span className="block text-[12px] text-muted">
          Wallets and explorers show this under the ticker. It travels inside the metadata link
          below, so keep it short.
        </span>
      </label>

      <label className="block space-y-1 text-[13px]">
        <span className="text-ink">Image link (optional)</span>
        <input
          value={image}
          onChange={(event) => setImage(event.target.value)}
          placeholder="https://…/logo.png"
          className={INPUT_MONO}
        />
        <span className="block text-[12px] text-muted">
          Leave this blank and the token is created with a default logo. Otherwise a direct link to
          an image file — <span className="text-ink">.png, .jpg or .gif</span> — ending in the file
          name, for example https://…/logo.png. Host it anywhere public: your own site, IPFS or
          Arweave.
        </span>
      </label>

      <details className="text-[13px]">
        <summary className="cursor-pointer text-muted">Use your own metadata link instead</summary>
        <input
          value={customUri}
          onChange={(event) => setCustomUri(event.target.value)}
          placeholder="https://…/token.json"
          className={`${INPUT_MONO} mt-2`}
        />
      </details>

      {/* The link itself is an implementation detail — the launch transaction carries it, and its
          length is the only thing a creator needs to care about. Folded away, with that count. */}
      <details className="text-[12px]">
        <summary className="w-fit cursor-pointer text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
          Metadata link · {uri.length}/{URI_LIMIT} characters
        </summary>
        <p className="mt-1 break-all font-mono text-[11px] text-muted">{uri}</p>
      </details>
      {uriTooLong ? (
        <p className="text-[12px] text-warn">
          That metadata link is {uri.length - URI_LIMIT} characters too long for the launch. Shorten
          the description or the image link, or host the JSON yourself and paste that link above.
        </p>
      ) : null}

      <QuoteTokenSelect value={quoteMint} onChange={setQuoteMint} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={deploy}
          disabled={!ready || busy !== null || !filled || uriTooLong || unresolved || mismatched}
          className={BUTTON_PRIMARY}
        >
          {busy === "Deploy the launch" ? "Waiting for signature…" : "Deploy the launch"}
        </button>
      </div>

      <p className="text-[12px] text-muted">
        One signature creates the token, its metadata and the bonding-curve pool together. Meteora
        charges a pool-creation fee of about 1 SOL for that, which the fee claimer (you) can claim
        back later, so this wallet needs a little over 1 SOL before the launch will go through.
      </p>

      {!filled && !launch ? (
        <p className="text-[12px] text-muted">
          Fill in a name, ticker and description to enable the deploy.
        </p>
      ) : null}

      {message ? <p className="break-all text-[13px] text-ink">{message}</p> : null}

      {mint || launch ? (
        <div className={`${CARD_MUTED} space-y-1 p-4 text-[13px]`}>
          {mint ? (
            <p className="text-muted">
              Token{" "}
              <a
                href={explorerUrl(mint, explorerCluster(cluster))}
                target="_blank"
                rel="noreferrer"
                className={`font-mono text-[12px] ${LINK}`}
              >
                {shortAddress(mint)} ↗
              </a>
            </p>
          ) : null}
          {launch ? (
            <>
              <p className="text-muted">
                Pool{" "}
                <a
                  href={explorerUrl(launch.pool, explorerCluster(cluster))}
                  target="_blank"
                  rel="noreferrer"
                  className={`font-mono text-[12px] ${LINK}`}
                >
                  {shortAddress(launch.pool)} ↗
                </a>
              </p>
              <p className="text-muted">
                Transaction{" "}
                <a
                  href={txUrl(launch.signature, explorerCluster(cluster))}
                  target="_blank"
                  rel="noreferrer"
                  className={`font-mono text-[12px] ${LINK}`}
                >
                  {shortAddress(launch.signature)} ↗
                </a>
              </p>
              <p className="text-muted">
                Config <span className="font-mono text-[12px]">{shortAddress(launch.config)}</span>
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
