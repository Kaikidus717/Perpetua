import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { UnderstandButton } from "@/components/UnderstandButton";
import { BUTTON, CARD, CARD_MUTED, CHIP, LINK, META, PAGE } from "@/lib/ui";
import { WALKTHROUGH_COOKIE, walkthroughSeen } from "@/lib/walkthrough";
import { cookies } from "next/headers";
import Link from "next/link";

/// The first-visit gate sends people here with `?welcome=1`. The button is rendered only for that
/// arrival and only while the cookie is missing; the navigation link opens the same page without it.
export default async function WalkthroughPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const [params, store] = await Promise.all([searchParams, cookies()]);
  const seen = walkthroughSeen(store.get(WALKTHROUGH_COOKIE)?.value);
  const firstVisit = params.welcome === "1" && !seen;

  return (
    <div className={PAGE}>
      <PageHeader
        title="What Perpetua does, and what it refuses to do"
        description="A two-minute walkthrough for a DAO or multisig treasury: where the program runs, the three checks before a transaction is built, and why a payload swapped after approval cannot land."
      />

      {firstVisit ? (
        <output className={`${CARD_MUTED} block px-4 py-3 text-[13px] leading-5 text-muted`}>
          <span className="text-ink">First visit.</span> Read the four sections below, then press{" "}
          <span className="text-ink">I understand</span> to continue to the app.
        </output>
      ) : null}

      <Section
        title="1 · Network status"
        description="One deployment serves both clusters, and each screen says which one it is using."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <article className={`${CARD} space-y-2 p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold text-ink">Mainnet</h2>
              <span className={CHIP}>pricing · launches</span>
            </div>
            <p className="text-[13px] leading-6 text-muted">
              The Pricing Terminal is live. Paste any DAMM v2 pool to see its fair value, the
              bear/base/bull range and its risk flags. A creator can also launch a token through the
              financeable DBC preset. Vaults and share trading are not deployed on mainnet yet.
            </p>
          </article>
          <article className={`${CARD} space-y-2 p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold text-ink">Devnet</h2>
              <span className={CHIP}>vault program</span>
            </div>
            <p className="text-[13px] leading-6 text-muted">
              The full securitization flow is live: create a locked position, turn it into shares,
              stake, crank, harvest, and build the payload-swap test. The vault program address is{" "}
              <span className="break-all font-mono text-[11px] text-ink">
                G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2
              </span>
              .
            </p>
          </article>
        </div>
      </Section>

      <Section
        title="2 · The three checks before any transaction is built"
        description="The API and MCP server run these first. They are not a promise in the UI; each one is code with a test."
      >
        <ol className="space-y-3">
          <li className={`${CARD} space-y-2 p-4`}>
            <h3 className="text-[13px] font-semibold text-ink">
              1 · Position eligibility — is the principal actually locked?
            </h3>
            <p className="text-[13px] leading-6 text-muted">
              The DAMM v2 position must have <span className="text-ink">unlocked == 0</span> and{" "}
              <span className="text-ink">vested == 0</span>, with a positive permanent lock. A mixed
              position is refused: the withdrawable part could otherwise be pulled out after shares
              were sold against it. Split the permanently locked part first with DAMM v2{" "}
              <span className="font-mono text-[12px] text-ink">split_position</span>.
            </p>
          </li>
          <li className={`${CARD} space-y-2 p-4`}>
            <h3 className="text-[13px] font-semibold text-ink">
              2 · Token safety — can the fee stream be frozen?
            </h3>
            <p className="text-[13px] leading-6 text-muted">
              <span className="text-ink">create_vault</span> walks the fee mints&apos; Token-2022
              extension TLV. A <span className="text-ink">TransferHook</span> mint is refused
              outright. A pausable/default-frozen mint, a permanent delegate or a transfer fee is
              recorded in the vault&apos;s risk flags, so the valuation can discount it. If a fee
              mint is paused or blocked later,{" "}
              <span className="text-ink">Force exit / unstake_no_claim</span> still releases the
              shares without claiming; fees stay in the position and are credited at the next
              successful touch.
            </p>
          </li>
          <li className={`${CARD} space-y-2 p-4`}>
            <h3 className="text-[13px] font-semibold text-ink">
              3 · Valuation sanity — is there enough history to price?
            </h3>
            <p className="text-[13px] leading-6 text-muted">
              Fee history comes from Meteora&apos;s DAMM v2 data API, which covers mainnet only. A
              pool with no complete day of history is refused with a sentence rather than priced at
              zero. The model fits a weighted log-linear decay over 7–30 days, blends a cohort prior
              for young pools, and returns risk flags such as{" "}
              <span className="text-ink">pool_too_young</span>,{" "}
              <span className="text-ink">low_liquidity</span> and{" "}
              <span className="text-ink">volume_concentration</span>. Every result carries a model
              version and an inputs hash so a published number can be reproduced.
            </p>
          </li>
        </ol>
      </Section>

      <Section
        title="3 · The unsigned transaction flow"
        description="Perpetua never holds a private key. It builds; your wallet or multisig signs."
      >
        <div className={`${CARD} space-y-3 p-4 text-[13px] leading-6 text-muted`}>
          <p>
            Every <span className="font-mono text-[12px] text-ink">/v1/tx/*</span> route and every
            MCP transaction tool returns a base64{" "}
            <span className="text-ink">unsigned transaction</span>. The API refuses anything over
            the 1232-byte legacy limit and returns a sentence naming the field to shorten. The
            browser simulates the transaction before asking the wallet to sign, refuses a wallet
            that is on the wrong cluster, and retries a stale blockhash only when nothing was
            signed.
          </p>
          <p>
            The wallet — or a Squads multisig — reviews exactly what it is asked to sign. The
            program then re-validates its own accounts: the vault is a PDA seeded by the position,
            the pool is pinned with <span className="font-mono text-[12px] text-ink">has_one</span>,
            the share mint is pinned by address, and the cp-amm program id is asserted. A swapped
            account cannot resolve.
          </p>
        </div>
      </Section>

      <Section
        title="4 · The multisig payload-swap test (for DAOs)"
        description="Most losses in this category come from the interface, not the contract: a transaction approved in one form and executed in another."
      >
        <div className="space-y-3">
          <div className={`${CARD} space-y-3 p-4 text-[13px] leading-6 text-muted`}>
            <p>
              <span className="text-ink">After it is signed, the program is the defence.</span> A
              changed instruction discriminator no longer names an instruction, and a substituted
              vault account fails Anchor&apos;s seeds constraint. Both cases are asserted in{" "}
              <span className="break-all font-mono text-[12px] text-ink">
                tests/litesvm/tests/payload_swap_rejection.rs
              </span>
              , and both pass. On real devnet, a mutated discriminator is rejected at dispatch with{" "}
              <span className="font-mono text-[12px] text-ink">
                InstructionFallbackNotFound (101)
              </span>
              , before an account is touched.
            </p>
            <p>
              <span className="text-ink">Before it is signed, no program can help.</span> If a
              wallet or dApp shows one thing and hands the signer another, the chain executes what
              was signed. The mitigations are trustworthy interfaces, hardware wallets and the
              multisig&apos;s own review screen. That is the part a treasury has to own.
            </p>
          </div>

          <div className={`${CARD} space-y-3 p-4`}>
            <h3 className="text-[13px] font-semibold text-ink">Test it with Squads on devnet</h3>
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-6 text-muted">
              <li>Propose a transaction in Squads that calls create_vault.</li>
              <li>
                Before the final signature, alter the payload — point the position or pool account
                somewhere else.
              </li>
              <li>
                Attempt to execute. The program rejects the altered payload with a constraint error,
                not a silent success. The treasury is unchanged.
              </li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Link href="/sandbox" className={BUTTON}>
                Open the sandbox
              </Link>
              <a
                href="https://devnet.squads.so"
                target="_blank"
                rel="noreferrer"
                className={BUTTON}
              >
                Open devnet Squads ↗
              </a>
            </div>
          </div>
        </div>
      </Section>

      <section className={`${CARD} space-y-3 p-4 text-[13px] leading-6 text-muted`}>
        <p>
          <span className="text-ink">The honest limitations.</span> The program is unaudited and
          devnet-only. The devnet upgrade authority is a keypair in the repository, so it must be
          rotated and handed to a multisig before any mainnet deployment. Only fully permanently
          locked positions are accepted. The hosted API keeps vaults in memory; run the indexer
          locally for a database-backed registry.
        </p>
        <p className={META}>
          Full detail: <span className="text-ink">WALKTHROUGH.md</span>,{" "}
          <span className="text-ink">docs/SECURITY.md</span> and{" "}
          <span className="text-ink">SELF-AUDIT.md</span> in the repository.
        </p>
      </section>

      {firstVisit ? (
        <section className={`${CARD} flex flex-wrap items-center justify-between gap-4 p-4`}>
          <div className="space-y-1">
            <h2 className="text-[14px] font-semibold text-ink">Ready to look around?</h2>
            <p className="text-[13px] text-muted">
              Continue to the vaults home. This page stays in the navigation for the details.
            </p>
          </div>
          <UnderstandButton />
        </section>
      ) : (
        <p className={`${META} flex flex-wrap items-center gap-2`}>
          <span>Information only.</span>
          <Link href="/" className={LINK}>
            Back to vaults
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/sandbox" className={LINK}>
            Try the devnet sandbox
          </Link>
        </p>
      )}
    </div>
  );
}
