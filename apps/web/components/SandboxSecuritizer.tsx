"use client";

import { CreateLockedPosition } from "@/components/CreateLockedPosition";
import { Spinner } from "@/components/Spinner";
import { VaultActions } from "@/components/VaultActions";
import { type OnchainPosition, api } from "@/lib/api";
import { explorerUrl, shortAddress, txUrl } from "@/lib/format";
import { humanError } from "@/lib/messages";
import { useWalletNetwork } from "@/lib/network";
import { type SecuritizeResult, securitize } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, CARD_MUTED, CHIP, CHIP_WARN, LINK, META } from "@/lib/ui";
import { SUPPORTED_WALLETS, solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { PublicKey } from "@solana/web3.js";
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
      setMessage(humanError(cause, "Creating the shares"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`${CARD} space-y-4 p-4 sm:p-5`}>
      <div className="space-y-1">
        <h2 className="text-[13px] font-semibold text-ink">2 · Securitize a position</h2>
        <p className={`${META} max-w-xl leading-5`}>
          The sandbox scans this wallet itself. Create a locked position if it has none, check the
          three locks, then create shares — all on this page.
        </p>
      </div>

      {!ready ? (
        <button type="button" onClick={() => void wallet.connect()} className={BUTTON_PRIMARY}>
          Connect a wallet ({SUPPORTED_WALLETS})
        </button>
      ) : null}

      {ready && wrongNetwork ? (
        <p className="text-[13px] leading-5 text-warn">
          This wallet is on mainnet. The vault program is devnet-only, so the scan and the
          securitizer wait for a devnet wallet.
        </p>
      ) : null}

      {ready && !wrongNetwork ? (
        <>
          {positions.isPending ? (
            <p className={`${META} flex items-center gap-2`}>
              <Spinner label="Scanning this wallet" />
              Scanning this wallet for permanently locked positions…
            </p>
          ) : null}

          {positions.isError ? (
            <p className="text-[13px] leading-5 text-warn">
              The scan failed:{" "}
              {positions.error instanceof Error
                ? positions.error.message
                : "the API did not answer"}
              . Try again in a moment.
            </p>
          ) : null}

          {positions.data && positions.data.positions.length === 0 ? (
            <>
              <p className="text-[13px] leading-5 text-muted">
                No locked positions in this wallet. Create one here; it is a fresh DAMM v2 pool
                whose liquidity is locked forever and owned by this wallet.
              </p>
              <CreateLockedPosition
                cluster={DEVNET}
                onCreated={async () => {
                  const scanned = await positions.refetch();
                  return (scanned.data?.positions.length ?? 0) > 0;
                }}
              />
            </>
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
                        {eligible ? "eligible" : "not eligible"}
                      </span>
                    </div>

                    <div className="grid gap-2 text-[12px] sm:grid-cols-3">
                      <div>
                        <div className="text-muted">Unlocked</div>
                        <div className="tnum text-ink">{position.unlockedLiquidity}</div>
                      </div>
                      <div>
                        <div className="text-muted">Vested</div>
                        <div className="tnum text-ink">{position.vestedLiquidity}</div>
                      </div>
                      <div>
                        <div className="text-muted">Permanent lock</div>
                        <div className="tnum text-ink">{position.permanentLockedLiquidity}</div>
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
                        {busy === position.address ? "Waiting for signature…" : "Create shares"}
                      </button>
                      <span className={META}>pool {shortAddress(position.pool)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      ) : null}

      {message ? <p className="text-[13px] leading-5 text-warn">{message}</p> : null}

      {result ? (
        <div className={`${CARD_MUTED} space-y-2 p-3 text-[13px] leading-5`}>
          <p className="font-medium text-ink">Vault created.</p>
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
            Share mint{" "}
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
            The position NFT now belongs to the vault. Stake, crank and harvest below without
            leaving the sandbox.
          </p>
        </div>
      ) : null}

      {result?.vault ? <VaultActions vault={result.vault} /> : null}
    </section>
  );
}
