"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Spinner } from "@/components/Spinner";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd, explorerUrl, shortAddress, txUrl, usd } from "@/lib/format";
import { humanError } from "@/lib/messages";
import { type SecuritizeResult, securitize } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, CARD_MUTED, INPUT_MONO, LINK, PAGE } from "@/lib/ui";
import { SUPPORTED_WALLETS, solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

export default function SecuritizePage() {
  const wallet = useSolanaWallet();
  const [manual, setManual] = useState("");
  const target = wallet.address ?? (manual.trim() || null);

  /// Which cluster the wallet lives on, and then its positions *there*. A wallet exists on one cluster
  /// only, so scanning the other would always come back empty — which reads as "you own nothing"
  /// rather than "wrong network".
  const location = useQuery({
    queryKey: ["where", target],
    queryFn: () => (target ? api.where(target) : Promise.reject(new Error("no wallet"))),
    enabled: Boolean(target),
  });
  const cluster = location.data?.cluster ?? undefined;

  const positions = useQuery({
    queryKey: ["positions", target, cluster],
    queryFn: () =>
      target ? api.positionsOnchain(target, cluster) : Promise.reject(new Error("no wallet")),
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
        await securitize(
          detected,
          {
            pool: position.pool,
            position: position.address,
            positionNftMint: position.nftMint,
            positionNftAccount: position.nftAccount,
            positionNftProgram: position.positionNftProgram,
            tokenAMint: position.tokenAMint,
            tokenBMint: position.tokenBMint,
            tokenAProgram: position.tokenAProgram,
            tokenBProgram: position.tokenBProgram,
          },
          /// The vault program is deployed on devnet, so this is a devnet transaction whatever the
          /// deploy's default cluster is. A mainnet wallet is told why it cannot take this step,
          /// rather than being handed a transaction that cannot succeed.
          cluster ?? "devnet",
        ),
      );
    } catch (cause) {
      setTxError(humanError(cause, "Creating the shares"));
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
            {cluster ? (
              <span className="rounded-sm border border-line bg-panel px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted">
                {cluster === "mainnet-beta" ? "mainnet" : cluster}
              </span>
            ) : null}
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

      {/* A mainnet wallet is a real, supported case — this app serves both networks — so instead of
          offering a button that cannot work, say which half works where and how to get to the other. */}
      {cluster === "mainnet-beta" ? (
        <div className={`${CARD_MUTED} space-y-3 p-5 text-sm`}>
          <p className="font-medium text-ink">
            This wallet is on mainnet, and the share program is not deployed there yet.
          </p>
          <p className="text-muted">
            <span className="text-ink">On mainnet you can launch.</span> The{" "}
            <Link href="/launch" className={LINK}>
              Launch plan
            </Link>{" "}
            page mints a token and opens its bonding-curve pool on mainnet, using the same wallet you
            have connected now. Mainnet pools can also be priced on the{" "}
            <Link href="/terminal" className={LINK}>
              Pricing
            </Link>{" "}
            page.
          </p>
          <p className="text-muted">
            <span className="text-ink">Turning a position into shares needs devnet</span>, because
            that is where the vault program lives today: creating shares, staking them, harvesting
            fees, cranking claims and selling shares into a market all run there. Deploying the
            program to mainnet is the next step, and until then the app says so rather than handing
            you a transaction that cannot succeed.
          </p>
          <p className="text-muted">
            <span className="text-ink">To do that half now:</span> switch this wallet to devnet —
            Phantom: Settings → Developer Settings → Change Network → Devnet, Solflare: Settings →
            Network — reload this page, and connect. Everything on this page works there with the
            same wallet software, and your mainnet funds are untouched by a devnet transaction.
          </p>
        </div>
      ) : null}

      <Section
        title="Positions found"
        description="Only a position that is permanently locked can back shares."
      >
        {positions.isPending && target ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner label="Scanning this wallet" />
            Scanning this wallet for locked positions…
          </p>
        ) : null}
        {positions.data && positions.data.positions.length === 0 ? (
          <p className="text-sm text-muted">No locked positions found for this wallet.</p>
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
            {cluster === "mainnet-beta" ? (
              <p className="text-sm text-warn">
                This wallet is on mainnet. Positions here cannot be turned into shares yet — the
                vault program is on devnet. Launching a token on mainnet does work, and so does
                pricing.
              </p>
            ) : null}
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
            disabled={busy || !check?.eligible || cluster === "mainnet-beta"}
            className={BUTTON_PRIMARY}
          >
            {busy ? "Waiting for signature…" : "Create shares"}
          </button>
          {cluster === "mainnet-beta" ? (
            <p className="text-sm text-muted">
              Creating shares needs the vault program, which is deployed on devnet only — so this
              button waits until this wallet is on devnet. Launching on mainnet is unaffected.
            </p>
          ) : null}
          {txError ? <p className="text-sm text-warn">{txError}</p> : null}
          {result ? (
            <div className={`${CARD_MUTED} space-y-1 p-4 text-sm`}>
              <p className="text-ink">Vault created.</p>
              <p className="text-ink">Your share token</p>
              <a
                href={explorerUrl(result.shareMint)}
                target="_blank"
                rel="noreferrer"
                className={`break-all font-mono text-xs ${LINK}`}
              >
                {result.shareMint} ↗
              </a>
              <p className="text-ink">
                Transaction{" "}
                <a
                  href={txUrl(result.signature)}
                  target="_blank"
                  rel="noreferrer"
                  className={`font-mono text-xs ${LINK}`}
                >
                  {shortAddress(result.signature)} ↗
                </a>
              </p>
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
