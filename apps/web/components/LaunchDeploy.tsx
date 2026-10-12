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

/// The launch carries the whole metadata link inside the transaction, and a Solana transaction can
/// hold 1232 bytes in total. Measured against the real builder, the launch's own instructions cost
/// about 1064 bytes before the link and the link is stored byte for byte, so the ceiling is roughly
/// 165 characters for a short name and ticker — less once both are filled in. 140 is the honest limit
/// that still leaves room for both, and it leaves the whole description-and-image budget of a normal
/// launch. Anything longer has to be hosted by the creator and pasted into the "own metadata link" box
/// below, which the form says.
const URI_LIMIT = 140;

export interface LaunchDeployProps {
  creatorTradingFeePct: number;
  creatorLiquidityPct: number;
  partnerLiquidityPct: number;
  lockedPct: number;
  /// The network the token and its pool are created on. Meteora's DBC and DAMM v2 programs run on
  /// devnet and mainnet both, so a creator with a mainnet wallet launches on mainnet.
  cluster: string;
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

  /// Which network the connected wallet is on. A launch only lands where the wallet signs, so a wallet
  /// on one network and a choice of the other is worth saying out loud before anyone signs anything.
  /// Shared with the header badge through `lib/network`, so the two cannot contradict each other.
  const network = useWalletNetwork(wallet.address);
  const mismatched = Boolean(network.cluster && network.cluster !== cluster);

  /// The metadata document is built here and served by this app: the fields above become a URL, and
  /// that URL is what the pool stores on-chain. Nobody has to go and publish a JSON file first. A
  /// creator who already hosts one can paste it under the advanced line, and then that wins.
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
    if (!provider || uriTooLong || !filled) return;
    void run("Deploy the launch", async () => {
      /// The token is created *by* this transaction, not before it. DBC's pool-creation instruction
      /// allocates the base mint account itself, so a mint that already exists makes the launch fail
      /// on-chain with "Allocate … already in use". A fresh keypair here signs alongside the wallet.
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
        cluster,
        mintKeypair,
      );
      setMint(mintKeypair.publicKey.toBase58());
      setLaunch(result);
      setMessage(
        `Launched on ${networkLabel(cluster)}: the token, its metadata and the pool were created in one transaction.`,
      );
    });
  }

  return (
    <section className={`${CARD} space-y-4 p-5`}>
      <h2 className="text-base font-semibold text-ink">
        Deploy this launch on {networkLabel(cluster)}
      </h2>

      {mismatched ? (
        <p className="text-xs text-warn">
          Your wallet is on {networkLabel(network.cluster)}, and this launch is set to{" "}
          {networkLabel(cluster)}. A wallet signs on whichever network it is switched to, so change
          the wallet&apos;s network or the choice above before signing.
        </p>
      ) : null}
      <p className="text-sm text-muted">
        Creates the token, then the DBC config and its pool, using exactly the split planned above.
        Graduation to DAMM v2 happens on the curve&apos;s own schedule; the migrated position is
        what Create shares securitizes.
      </p>

      {!ready ? (
        <button type="button" onClick={() => void wallet.connect()} className={BUTTON_PRIMARY}>
          Connect a wallet ({SUPPORTED_WALLETS})
        </button>
      ) : (
        <p className="font-mono text-xs text-muted">{shortAddress(wallet.address ?? "")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-ink">Token name</span>
          <input
            value={name}
            onChange={(event) => onName(event.target.value)}
            placeholder="e.g. Jak"
            className={INPUT}
          />
          <span className="block text-xs text-muted">The full name people will see.</span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-ink">Ticker</span>
          <input
            value={symbol}
            onChange={(event) => onSymbol(event.target.value)}
            placeholder="JAK"
            className={INPUT}
          />
          <span className="block text-xs text-muted">
            The short symbol, like SOL or USDC. We fill it in from the name — change it if you like.
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-ink">Total supply</span>
          <input
            type="number"
            value={supply}
            onChange={(event) => setSupply(Number(event.target.value))}
            className={`${INPUT} tnum`}
          />
          <span className="block text-xs text-muted">How many tokens will ever exist.</span>
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-ink">Description</span>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="One line about what this token is for"
          className={INPUT}
        />
        <span className="block text-xs text-muted">
          Wallets and explorers show this under the ticker. It travels inside the metadata link
          below, so keep it short.
        </span>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-ink">Image link (optional)</span>
        <input
          value={image}
          onChange={(event) => setImage(event.target.value)}
          placeholder="https://…/logo.png"
          className={INPUT_MONO}
        />
        <span className="block text-xs text-muted">
          Leave this blank and the token is created with a default logo. Otherwise a direct link to
          an image file — <span className="text-ink">.png, .jpg or .gif</span> — ending in the file
          name, for example https://…/logo.png. Host it anywhere public: your own site, IPFS or
          Arweave.
        </span>
      </label>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Use your own metadata link instead</summary>
        <input
          value={customUri}
          onChange={(event) => setCustomUri(event.target.value)}
          placeholder="https://…/token.json"
          className={`${INPUT_MONO} mt-2`}
        />
      </details>

      <p className="break-all font-mono text-[11px] text-muted">
        Metadata link ({uri.length}/{URI_LIMIT}): {uri}
      </p>
      {uriTooLong ? (
        <p className="text-xs text-warn">
          That metadata link is {uri.length - URI_LIMIT} characters too long for the launch. Shorten
          the description or the image link, or host the JSON yourself and paste that link above.
        </p>
      ) : null}

      <QuoteTokenSelect value={quoteMint} onChange={setQuoteMint} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={deploy}
          disabled={!ready || busy !== null || !filled || uriTooLong}
          className={BUTTON_PRIMARY}
        >
          {busy === "Deploy the launch" ? "Waiting for signature…" : "Deploy the launch"}
        </button>
      </div>

      <p className="text-xs text-muted">
        One signature creates the token, its metadata and the bonding-curve pool together. Meteora
        charges a pool-creation fee of about 1 SOL for that, which the fee claimer (you) can claim
        back later, so this wallet needs a little over 1 SOL before the launch will go through.
      </p>

      {!filled && !launch ? (
        <p className="text-xs text-muted">
          Fill in a name, ticker and description to enable the deploy.
        </p>
      ) : null}

      {message ? <p className="break-all text-sm text-ink">{message}</p> : null}

      {mint || launch ? (
        <div className={`${CARD_MUTED} space-y-1 p-4 text-sm`}>
          {mint ? (
            <p className="text-muted">
              Token{" "}
              <a
                href={explorerUrl(mint, explorerCluster(cluster))}
                target="_blank"
                rel="noreferrer"
                className={`font-mono text-xs ${LINK}`}
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
                  className={`font-mono text-xs ${LINK}`}
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
                  className={`font-mono text-xs ${LINK}`}
                >
                  {shortAddress(launch.signature)} ↗
                </a>
              </p>
              <p className="text-muted">
                Config <span className="font-mono text-xs">{shortAddress(launch.config)}</span>
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
