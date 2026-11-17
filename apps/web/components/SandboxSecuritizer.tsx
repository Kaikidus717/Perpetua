"use client";

import { Spinner } from "@/components/Spinner";
import { VaultActions } from "@/components/VaultActions";
import { type OnchainPosition, api } from "@/lib/api";
import { explorerUrl, shortAddress, txUrl } from "@/lib/format";
import { humanError, loadError } from "@/lib/messages";
import { useWalletNetwork } from "@/lib/network";
import { RPC_URL, type SecuritizeResult, createLockedPosition, securitize } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, CARD_MUTED, CHIP, CHIP_WARN, LINK, META } from "@/lib/ui";
import { solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { Connection, PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

const VAULT_PROGRAM = new PublicKey("G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2");
const DEVNET = "devnet";

/// The vault PDA for a position. Mirrors `findVaultPda` in the SDK; web3.js is already in the
/// browser bundle, so the sandbox can show the new vault address without another import.
function findVault(position: string): string | null {
  try {
    const [vault] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("vault"), new PublicKey(position).toBytes()],
      VAULT_PROGRAM,
    );
    return vault.toBase58();
  } catch {
    return null;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/// The pool transaction is confirmed before this runs, but the RPC index can lag a beat. Poll the
/// same scan the page uses until the new position is visible.
async function waitForPosition(owner: string, position: string): Promise<OnchainPosition | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const { positions: rows } = await api.positionsOnchain(owner, DEVNET);
      const found = rows.find((row) => row.address === position);
      if (found) return found;
    } catch {
      // Keep polling; the next attempt may land after the RPC catches up.
    }
    await sleep(1500);
  }
  return null;
}

/// Setup errors are the ones a first-time wallet hits, so they get sentences rather than RPC logs.
function setupProblem(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  if (/IncorrectProgramId|incorrect program id/i.test(detail)) {
    return "The second transaction was sent before the first one finished. Try again. The app now waits for each step.";
  }
  if (/insufficient|no record of a prior credit|debit/i.test(detail)) {
    return "This wallet needs a little test SOL first. Use the funding card above, then try again.";
  }
  if (/rejected|declined|cancel/i.test(detail)) {
    return "You declined a wallet prompt. Nothing was sent.";
  }
  return humanError(cause, "set up the test vault");
}

/// The sandbox's own securitizer: scan this wallet, show the eligibility verdict, create shares,
/// then hand the new vault to the same stake/harvest/crank actions the main app uses. No trip to
/// `/securitize` is required.
export function SandboxSecuritizer() {
  const wallet = useSolanaWallet();
  const network = useWalletNetwork(wallet.address);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<
    (SecuritizeResult & { position: string; vault: string | null }) | null
  >(null);

  const provider = solanaProvider();
  const ready = Boolean(wallet.address && provider);
  const wrongNetwork = network.cluster === "mainnet-beta";

  const positions = useQuery({
    queryKey: ["sandbox-positions", wallet.address],
    queryFn: () => api.positionsOnchain(wallet.address as string, DEVNET),
    enabled: Boolean(wallet.address),
  });
  const hasEligible = positions.data?.positions.some((position) => position.eligibility.eligible);

  async function run(position: OnchainPosition): Promise<void> {
    if (!provider) return;
    setBusy(position.address);
    setMessage(null);
    setResult(null);
    try {
      const created = await securitize(
        provider,
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
        DEVNET,
      );
      setResult({ ...created, position: position.address, vault: findVault(position.address) });
      void positions.refetch();
    } catch (cause) {
      setMessage(humanError(cause, "turn this position into shares"));
    } finally {
      setBusy(null);
    }
  }

  /// One action for a fresh wallet: create a permanently locked position, wait for the scan to see
  /// it, then securitize it. The wallet still signs every transaction — the sandbox just removes the
  /// step-by-step work.
  async function provision(): Promise<void> {
    if (!provider || !wallet.address) return;
    setBusy("provisioning");
    setMessage(null);
    setResult(null);
    let createdPosition: string | null = null;
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      const balance = await connection.getBalance(new PublicKey(wallet.address));
      if (balance < 50_000_000) {
        setMessage("Add a little devnet SOL first using the funding card above, then try again.");
        return;
      }

      const locked = await createLockedPosition(provider, DEVNET);
      createdPosition = locked.position;
      const detail = await waitForPosition(wallet.address, locked.position);
      if (!detail) {
        setMessage(
          "The locked position was created, but the scan has not caught up yet. It will appear above. Press Turn into shares on it.",
        );
        void positions.refetch();
        return;
      }

      const created = await securitize(
        provider,
        {
          pool: detail.pool,
          position: detail.address,
          positionNftMint: detail.nftMint,
          positionNftAccount: detail.nftAccount,
          positionNftProgram: detail.positionNftProgram,
          tokenAMint: detail.tokenAMint,
          tokenBMint: detail.tokenBMint,
          tokenAProgram: detail.tokenAProgram,
          tokenBProgram: detail.tokenBProgram,
        },
        DEVNET,
      );
      setResult({ ...created, position: detail.address, vault: findVault(detail.address) });
      void positions.refetch();
    } catch (cause) {
      const hint = createdPosition
        ? " The locked position exists. Press Turn into shares on it once the scan shows it."
        : "";
      setMessage(`${setupProblem(cause)}${hint}`);
      if (createdPosition) void positions.refetch();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`${CARD} space-y-4 p-4 sm:p-5`}>
      <div className="space-y-1">
        <h2 className="text-[13px] font-semibold text-ink">2 · Your test vault</h2>
        <p className={`${META} max-w-xl leading-5`}>
          The sandbox creates the locked position and the vault for you. Approve the wallet prompts;
          everything else happens here.
        </p>
      </div>

      {!ready ? (
        <p className="text-[12px] leading-5 text-muted">
          Connect your wallet in the header to build a test vault.
        </p>
      ) : null}

      {ready && wrongNetwork ? (
        <p className="text-[13px] leading-5 text-warn">
          This wallet is on mainnet. The share flow runs on devnet for now, so this section waits
          for a devnet wallet.
        </p>
      ) : null}

      {ready && !wrongNetwork ? (
        <>
          {busy === "provisioning" ? (
            <p className={`${META} flex items-center gap-2`}>
              <Spinner label="Creating your test vault" />
              Creating the locked position and vault. Approve each wallet prompt.
            </p>
          ) : null}

          {positions.isPending ? (
            <p className={`${META} flex items-center gap-2`}>
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
            <div className={`${CARD_MUTED} space-y-3 p-4`}>
              <p className="text-[13px] font-semibold text-ink">No test pool yet? Build one.</p>
              <p className="text-[12px] leading-5 text-muted">
                One click creates a fresh Meteora pool with money locked forever, then turns it into
                a vault with 1,000,000 shares. You will approve three wallet prompts.
              </p>
              <button
                type="button"
                onClick={() => void provision()}
                disabled={busy !== null}
                className={BUTTON_PRIMARY}
              >
                {busy === "provisioning" ? "Building your vault…" : "Create my test vault"}
              </button>
            </div>
          ) : null}

          {positions.data && positions.data.positions.length > 0 ? (
            <ul className="space-y-2">
              {positions.data.positions.map((position) => {
                const eligible = position.eligibility.eligible;
                return (
                  <li key={position.address} className={`${CARD_MUTED} space-y-2 p-3`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <a
                        href={explorerUrl(position.address, "devnet")}
                        target="_blank"
                        rel="noreferrer"
                        className={`break-all font-mono text-[12px] ${LINK}`}
                      >
                        {shortAddress(position.address)} ↗
                      </a>
                      <span className={eligible ? CHIP : CHIP_WARN}>
                        {eligible ? "ready" : "needs a split"}
                      </span>
                    </div>

                    <div className="grid gap-2 text-[12px] sm:grid-cols-3">
                      <div>
                        <div className="text-muted">Can be withdrawn</div>
                        <div className="text-ink">
                          {position.unlockedLiquidity === "0" ? "No" : "Yes"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted">Unlocks over time</div>
                        <div className="text-ink">
                          {position.vestedLiquidity === "0" ? "No" : "Yes"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted">Locked forever</div>
                        <div className="text-ink">
                          {position.permanentLockedLiquidity === "0" ? "No" : "Yes"}
                        </div>
                      </div>
                    </div>

                    {!eligible ? (
                      <p className="text-[12px] leading-5 text-warn">
                        {position.eligibility.reasons.join(" · ")}. Split the locked part first.
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void run(position)}
                        disabled={!eligible || busy !== null}
                        className={BUTTON_PRIMARY}
                      >
                        {busy === position.address ? "Waiting for signature…" : "Turn into shares"}
                      </button>
                      <span className={META}>pool {shortAddress(position.pool)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {positions.data && positions.data.positions.length > 0 && !hasEligible ? (
            <div className={`${CARD_MUTED} space-y-3 p-4`}>
              <p className="text-[13px] font-semibold text-ink">Need a clean test position?</p>
              <p className="text-[12px] leading-5 text-muted">
                None of the positions above can back shares. Create a fresh locked position and
                vault in one action.
              </p>
              <button
                type="button"
                onClick={() => void provision()}
                disabled={busy !== null}
                className={BUTTON}
              >
                {busy === "provisioning" ? "Building your vault…" : "Create my test vault"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {message ? <p className="text-[13px] leading-5 text-warn">{message}</p> : null}

      {result ? (
        <div className={`${CARD_MUTED} space-y-2 p-3 text-[13px] leading-5`}>
          <p className="font-medium text-ink">Your shares are ready.</p>
          <p className="text-muted">
            Position{" "}
            <a
              href={explorerUrl(result.position, "devnet")}
              target="_blank"
              rel="noreferrer"
              className={`break-all font-mono text-[12px] ${LINK}`}
            >
              {shortAddress(result.position)} ↗
            </a>
          </p>
          <p className="text-muted">
            Share token{" "}
            <a
              href={explorerUrl(result.shareMint, "devnet")}
              target="_blank"
              rel="noreferrer"
              className={`break-all font-mono text-[12px] ${LINK}`}
            >
              {result.shareMint} ↗
            </a>
          </p>
          {result.vault ? (
            <p className="text-muted">
              Vault{" "}
              <a
                href={explorerUrl(result.vault, "devnet")}
                target="_blank"
                rel="noreferrer"
                className={`break-all font-mono text-[12px] ${LINK}`}
              >
                {shortAddress(result.vault)} ↗
              </a>
            </p>
          ) : null}
          <p className="text-muted">
            Transaction{" "}
            <a
              href={txUrl(result.signature, "devnet")}
              target="_blank"
              rel="noreferrer"
              className={`font-mono text-[12px] ${LINK}`}
            >
              {shortAddress(result.signature)} ↗
            </a>
          </p>
          <p className="text-muted">
            The position is now held by the vault. You can stake, collect fees, and exit below
            without leaving the sandbox.
          </p>
        </div>
      ) : null}

      {result?.vault ? <VaultActions vault={result.vault} /> : null}
    </section>
  );
}
