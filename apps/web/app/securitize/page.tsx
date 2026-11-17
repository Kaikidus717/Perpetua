"use client";

import { CreateLockedPosition } from "@/components/CreateLockedPosition";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Spinner } from "@/components/Spinner";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd, explorerCluster, explorerUrl, shortAddress, txUrl, usd } from "@/lib/format";
import { humanError, loadError } from "@/lib/messages";
import { networkLabel } from "@/lib/network";
import { type SecuritizeResult, securitize } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, CARD_MUTED, INPUT_MONO, LINK, META, PAGE } from "@/lib/ui";
import { solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { SHARE_SUPPLY } from "@perpetua/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

export default function SecuritizePage() {
  const wallet = useSolanaWallet();
  const [manual, setManual] = useState("");
  const target = wallet.address ?? (manual.trim() || null);

  const isOwner = Boolean(wallet.address) && target === wallet.address;

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

  const vaults = useQuery({ queryKey: ["vaults"], queryFn: () => api.vaults() });
  const mine = (vaults.data?.vaults ?? []).filter(
    (entry) => Boolean(wallet.address) && entry.creator === wallet.address,
  );

  /// Base units to whole shares. The vault mints `SHARE_SUPPLY` = 1,000,000 × 10^6, so the staked
  /// amount and the supply are both in those 6-decimal units.
  function wholeShares(base: string): number {
    try {
      return Number((BigInt(base) * 1_000_000n) / SHARE_SUPPLY);
    } catch {
      return 0;
    }
  }

  /// What this vault has paid out across both fee tokens, as one number answering "has anything
  /// happened here yet?" — zero means the pool has not traded since the last claim.
  function harvestedTotal(baseA: string, baseB: string): bigint {
    try {
      return BigInt(baseA) + BigInt(baseB);
    } catch {
      return 0n;
    }
  }
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
      setTxError("Connect your wallet in the header first.");
      return;
    }
    setBusy(true);
    setTxError(null);
    try {
      const created = await securitize(
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
        cluster ?? "devnet",
      );
      setResult(created);
      /// That position has just left this wallet and joined a vault, so both lists below are stale:
      /// the scan no longer contains it, and the vault list does not have it yet.
      void positions.refetch();
      void vaults.refetch();
    } catch (cause) {
      setTxError(humanError(cause, "turn this position into shares"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={PAGE}>
      <PageHeader
        title="Turn a locked position into 1,000,000 shares"
        description="A vault holds the locked position so it cannot be pulled out. The shares go to your wallet, and their holders earn the fees the pool keeps collecting."
      />

      <section className="space-y-1.5">
        <label htmlFor="scan-wallet" className="block text-[12px] text-muted">
          Scan a wallet
        </label>
        <input
          id="scan-wallet"
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          aria-label="Wallet address to scan for positions"
          placeholder="Paste a wallet address"
          className={INPUT_MONO}
        />
      </section>

      {/* A mainnet wallet is a real, supported case — this app serves both networks — so instead of
          offering a button that cannot work, say which half works where and how to get to the other. */}
      {cluster === "mainnet-beta" ? (
        <div className={`${CARD_MUTED} space-y-3 p-5 text-[13px] leading-5`}>
          <p className="font-medium text-ink">
            This wallet is on mainnet. The share flow runs on devnet for now.
          </p>
          <p className="text-muted">
            You can still{" "}
            <Link href="/launch" className={LINK}>
              launch a token
            </Link>{" "}
            and{" "}
            <Link href="/terminal" className={LINK}>
              price pools
            </Link>{" "}
            on mainnet.
          </p>
          <p className="text-muted">
            Switch to devnet to create, stake, and sell shares. Your mainnet funds are not touched.
          </p>
        </div>
      ) : null}

      {mine.length > 0 ? (
        <Section
          title="Already turned into shares"
          description="A position turned into shares belongs to its vault, not the wallet. That is why it no longer shows in the scan below."
        >
          <div className={`${CARD} divide-y divide-line`}>
            {mine.map((entry) => (
              <div key={entry.address} className="space-y-1 p-4 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/vault/${entry.address}`}
                    className={`font-mono text-[12px] ${LINK}`}
                  >
                    {shortAddress(entry.address)} ↗
                  </Link>
                  <span className="text-muted">
                    {wholeShares(entry.totalStaked)} of 1,000,000 shares staked
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
                  <a
                    href={explorerUrl(entry.position, explorerCluster(cluster))}
                    target="_blank"
                    rel="noreferrer"
                    className={`font-mono ${LINK}`}
                  >
                    position {shortAddress(entry.position)} ↗
                  </a>
                  <span>
                    {harvestedTotal(entry.totalClaimedA, entry.totalClaimedB) === 0n
                      ? "No fees collected yet. Trade on the pool, then collect pool fees."
                      : `Collected so far: ${entry.totalClaimedA} + ${entry.totalClaimedB} in each token's smallest unit`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title="Your locked positions"
        description="Only a position locked forever can back shares. Once it becomes shares, its vault holds it."
      >
        {!target ? (
          <p className="text-[13px] text-muted">
            Connect your wallet in the header, or paste an address above, to see what it holds.
          </p>
        ) : null}
        {location.isError ? (
          <div className={`${CARD_MUTED} space-y-2 p-4`}>
            <p className="text-[13px] text-ink">
              We couldn&apos;t check this wallet&apos;s network.
            </p>
            <p className={`${META} leading-5`}>{loadError(location.error, "this wallet")}</p>
            <button type="button" onClick={() => void location.refetch()} className={BUTTON}>
              Try again
            </button>
          </div>
        ) : null}
        {positions.isPending && target ? (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner label="Scanning this wallet" />
            Scanning this wallet for locked positions…
          </p>
        ) : null}
        {positions.isError ? (
          <div className={`${CARD_MUTED} space-y-2 p-4`}>
            <p className="text-[13px] text-ink">We couldn&apos;t scan this wallet.</p>
            <p className={`${META} leading-5`}>
              {loadError(positions.error, "this wallet's positions")}
            </p>
            <button type="button" onClick={() => void positions.refetch()} className={BUTTON}>
              Try again
            </button>
          </div>
        ) : null}
        {positions.data && positions.data.positions.length === 0 ? (
          <p className="text-[13px] leading-5 text-muted">
            {mine.length > 0
              ? `No positions left in this wallet. The ${mine.length === 1 ? "one you turned into shares is" : "ones you turned into shares are"} held by ${mine.length === 1 ? "its vault" : "their vaults"} above. Create another test pool below if you want a second one.`
              : "No locked positions in this wallet."}
          </p>
        ) : null}
        {position ? (
          <div className={`${CARD} space-y-4 p-5`}>
            <a
              href={explorerUrl(position.address)}
              target="_blank"
              rel="noreferrer"
              className={`break-all font-mono text-[13px] ${LINK}`}
            >
              {position.address}
            </a>
            <div className="grid gap-3 text-[13px] sm:grid-cols-3">
              <div>
                <div className="text-[12px] text-muted">Can be withdrawn</div>
                <div className="mt-0.5 text-ink">
                  {position.unlockedLiquidity === "0" ? "No" : "Yes"}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-muted">Unlocks over time</div>
                <div className="mt-0.5 text-ink">
                  {position.vestedLiquidity === "0" ? "No" : "Yes"}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-muted">Locked forever</div>
                <div className="mt-0.5 text-ink">
                  {position.permanentLockedLiquidity === "0" ? "No" : "Yes"}
                </div>
              </div>
            </div>
            {cluster === "mainnet-beta" ? (
              <p className="text-[13px] leading-5 text-warn">
                This wallet is on mainnet. The share flow runs on devnet for now. You can still
                launch a token and price pools.
              </p>
            ) : null}
            {check?.eligible ? (
              <p className="text-[13px] text-ink">Ready for shares.</p>
            ) : (
              <p className="text-[13px] leading-5 text-warn">
                Not ready: {check?.reasons.join(", ")}. Split off the locked part first.
              </p>
            )}
          </div>
        ) : null}
      </Section>

      {!position && cluster ? (
        <CreateLockedPosition
          cluster={cluster}
          onCreated={async () => {
            const scanned = await positions.refetch();
            return (scanned.data?.positions.length ?? 0) > 0;
          }}
        />
      ) : null}

      {position ? (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => void runSecuritize()}
            disabled={busy || !check?.eligible || cluster === "mainnet-beta" || !isOwner}
            className={BUTTON_PRIMARY}
          >
            {busy ? "Waiting for signature…" : "Turn into shares"}
          </button>
          {!isOwner ? (
            <p className="text-[13px] leading-5 text-muted">
              Only the wallet that owns this position can turn it into shares. Connect that wallet
              to continue.
            </p>
          ) : null}
          {cluster ? (
            <p className="text-[13px] leading-5 text-muted">
              {cluster === "mainnet-beta"
                ? "This wallet is on mainnet. Creating shares runs on devnet, so this button waits for a devnet wallet."
                : `This wallet is on ${networkLabel(cluster)}. Creating shares is a ${networkLabel(cluster)} transaction.`}
            </p>
          ) : null}
          {txError ? <p className="text-[13px] text-warn">{txError}</p> : null}
          {result ? (
            <div className={`${CARD_MUTED} space-y-1 p-4 text-[13px]`}>
              <p className="text-ink">Shares created.</p>
              <p className="text-ink">Your share token</p>
              <a
                href={explorerUrl(result.shareMint)}
                target="_blank"
                rel="noreferrer"
                className={`break-all font-mono text-[12px] ${LINK}`}
              >
                {result.shareMint} ↗
              </a>
              <p className="text-ink">
                Transaction{" "}
                <a
                  href={txUrl(result.signature)}
                  target="_blank"
                  rel="noreferrer"
                  className={`font-mono text-[12px] ${LINK}`}
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
            <Stat label="Fair value" value={compactUsd(valuation.data.valuation.fairValueUsd)} />
            <Stat label="Per share" value={usd(valuation.data.valuation.fairValuePerShareUsd, 6)} />
            <Stat
              label="Price range"
              value={
                ladder.data
                  ? `${usd(ladder.data.plan.rangeLowUsd, 6)} to ${usd(
                      ladder.data.plan.rangeHighUsd,
                      6,
                    )}`
                  : "…"
              }
            />
          </section>

          <Section title="What happens next">
            <ol className="list-decimal space-y-2 pl-5 text-[13px] text-ink">
              <li>
                A vault holds your locked position. It can never give it back, not even to you. That
                protects the fees.
              </li>
              <li>1,000,000 shares go to your wallet. Keep them or sell them.</li>
              <li>
                Whoever holds a share earns that share of the fees, for as long as the pool keeps
                earning. Collect whenever you like.
              </li>
            </ol>
          </Section>
        </>
      ) : null}
    </div>
  );
}
