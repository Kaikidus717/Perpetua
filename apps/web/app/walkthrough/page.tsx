import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { BUTTON, CARD, CHIP, LINK, META, PAGE } from "@/lib/ui";
import Link from "next/link";

/// The tour is a normal page. It no longer stands between a visitor and the app.
export default function WalkthroughPage() {
  return (
    <div className={PAGE}>
      <PageHeader
        title="How Perpetua works"
        description="Perpetua turns the fees from a locked Meteora pool into shares. You can buy them, hold them, or sell them. This page shows what you can do and what we check before you sign."
      />

      <p className={`${CARD} p-4 text-[13px] leading-6 text-muted`}>
        A locked pool keeps earning trading fees. Perpetua puts the locked position in a vault and
        groups its future fees into one million shares. Each share is a small claim on the fees the
        pool earns.
      </p>

      <Section
        title="1 · Where you can use it"
        description="Start on devnet with test money. Mainnet is for real pools and real launches."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <article className={`${CARD} space-y-2 p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold text-ink">Mainnet</h2>
              <span className={CHIP}>real money</span>
            </div>
            <p className="text-[13px] leading-6 text-muted">
              Look up a Meteora pool and see what its future fees could be worth. You can also
              launch a token. Share trading is not on mainnet yet.
            </p>
          </article>
          <article className={`${CARD} space-y-2 p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold text-ink">Devnet</h2>
              <span className={CHIP}>test money</span>
            </div>
            <p className="text-[13px] leading-6 text-muted">
              Try the full flow with free test SOL. Create a locked position, turn it into shares,
              stake them, and collect fees. Nothing here touches real money.
            </p>
          </article>
        </div>
      </Section>

      <Section
        title="2 · What we check before you sign"
        description="These checks happen before we build a transaction. If one fails, we tell you why."
      >
        <ol className="space-y-3">
          <li className={`${CARD} space-y-2 p-4`}>
            <h3 className="text-[13px] font-semibold text-ink">1 · Is the pool locked for good?</h3>
            <p className="text-[13px] leading-6 text-muted">
              We only turn a position into shares when its money is locked forever. If any part can
              still be taken out, we stop. That protects the people who buy the shares.
            </p>
          </li>
          <li className={`${CARD} space-y-2 p-4`}>
            <h3 className="text-[13px] font-semibold text-ink">
              2 · Can the fees be switched off?
            </h3>
            <p className="text-[13px] leading-6 text-muted">
              We look at the pool&apos;s tokens. If a token can block transfers or charge extra, we
              refuse it or warn you. If a token is paused later, you can still take your shares out.
            </p>
          </li>
          <li className={`${CARD} space-y-2 p-4`}>
            <h3 className="text-[13px] font-semibold text-ink">
              3 · Is there enough history to price it?
            </h3>
            <p className="text-[13px] leading-6 text-muted">
              We need at least one full day of trading fees. New or quiet pools get a warning. If we
              cannot estimate a value, we say so instead of showing a number we do not trust.
            </p>
          </li>
        </ol>
      </Section>

      <Section
        title="3 · You approve every transaction"
        description="Perpetua never holds your keys. Your wallet shows each transaction before it is sent."
      >
        <div className={`${CARD} space-y-3 p-4 text-[13px] leading-6 text-muted`}>
          <p>We prepare the transaction. Your wallet shows it. You sign.</p>
          <p>
            Before your wallet opens, we test the transaction. If it would fail, or your wallet is
            on the wrong network, we tell you.
          </p>
          <p>
            Perpetua checks the important details again before the transaction runs. If someone
            changes it, it will not work.
          </p>
        </div>
      </Section>

      <Section
        title="4 · Why a changed transaction cannot sneak through"
        description="Some scams change a transaction after you approve it. Perpetua checks the transaction again before it runs."
      >
        <div className={`${CARD} space-y-3 p-4 text-[13px] leading-6 text-muted`}>
          <p>
            If someone changes the transaction, Perpetua rejects it. If they try to send the shares
            or money somewhere else, that fails too. We test both cases, and both fail.
          </p>
          <p>
            Your wallet is still the last line of defence. Read what it shows before you sign,
            especially if you share the wallet with other people.
          </p>
          <Link href="/sandbox" className={BUTTON}>
            Try it with test SOL
          </Link>
        </div>
      </Section>

      <section className={`${CARD} space-y-3 p-4 text-[13px] leading-6 text-muted`}>
        <p>
          <span className="text-ink">What is not ready yet.</span> This is a test version on devnet.
          The program has not been audited, so do not put real money in it.
        </p>
        <p>
          Only positions locked forever can become shares. If a position is mixed, split the locked
          part first.
        </p>
        <p>The team still runs the test deployment. Mainnet share trading is not live yet.</p>
      </section>

      <details className={`${CARD} p-4 text-[13px]`}>
        <summary className="w-fit cursor-pointer text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
          Technical details
        </summary>
        <p className={`${META} mt-2 leading-5`}>
          Read{" "}
          <a
            href="https://github.com/Kaikidus717/Perpetua/blob/main/WALKTHROUGH.md"
            target="_blank"
            rel="noreferrer"
            className={LINK}
          >
            WALKTHROUGH.md
          </a>{" "}
          and{" "}
          <a
            href="https://github.com/Kaikidus717/Perpetua/blob/main/docs/SECURITY.md"
            target="_blank"
            rel="noreferrer"
            className={LINK}
          >
            docs/SECURITY.md
          </a>{" "}
          in the repository.
        </p>
      </details>

      <p className={`${META} flex flex-wrap items-center gap-2`}>
        <Link href="/" className={LINK}>
          Back to vaults
        </Link>
      </p>
    </div>
  );
}
