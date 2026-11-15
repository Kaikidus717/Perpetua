"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { CARD, CARD_MUTED, INPUT, META, PAGE, TD } from "@/lib/ui";
import { useState } from "react";

/// One address for every assistant. The site's own API answers MCP on the same origin as this page,
/// so there is no second service to install, host or pay for — and nothing to run on your machine.
const ENDPOINT = "https://perpetua-meteora.netlify.app/api/mcp";

const CONFIG = `{
  "mcpServers": {
    "perpetua": {
      "url": "${ENDPOINT}"
    }
  }
}`;

const VSCODE_CONFIG = `{
  "servers": {
    "perpetua": {
      "type": "http",
      "url": "${ENDPOINT}"
    }
  }
}`;

const CLIENTS: Array<{ name: string; how: string }> = [
  {
    name: "Claude",
    how: "Settings → Connectors → Add custom connector, then paste the address.",
  },
  {
    name: "Claude Code",
    how: `Run: claude mcp add --transport http perpetua ${ENDPOINT}`,
  },
  {
    name: "Cursor",
    how: "Settings → MCP → Add new MCP server, pick the URL kind, then paste the address.",
  },
  {
    name: "VS Code (Copilot)",
    how: "Command Palette → “MCP: Add Server” → HTTP, then paste the address.",
  },
  {
    name: "Any other assistant",
    how: "If it accepts an MCP address, it works. The address is all it needs.",
  },
];

/// One row per tool the endpoint actually exposes. Keeping the names and the list in one place means
/// the page cannot advertise something the server does not answer.
const TOOLS: Array<{ name: string; what: string }> = [
  {
    name: "where_is_address",
    what: "Which network owns an address, and what it is: pool, wallet, token or vault.",
  },
  {
    name: "list_clusters",
    what: "Which networks this deployment serves, and which one it defaults to.",
  },
  {
    name: "price_position",
    what: "What a locked position, or a whole pool, is worth today as future fees. Includes a value range and the risks.",
  },
  {
    name: "get_report",
    what: "A report card for a pool: its valuation, plus pooled fee and volume history over a window.",
  },
  {
    name: "get_pool_series",
    what: "The raw daily fees, volume and liquidity the valuation was fitted to.",
  },
  {
    name: "find_positions",
    what: "What a wallet holds in Meteora pools, and whether each position can become shares.",
  },
  {
    name: "list_vaults",
    what: "The vaults that hold fee rights, and what they have paid out so far.",
  },
  {
    name: "simulate_preset",
    what: "Try a launch fee split before you commit. You can price it against a live pool.",
  },
  {
    name: "get_sale_plan",
    what: "The sale ladder a share sale would post: every price level, its price, and how many shares sit there.",
  },
  {
    name: "list_sale_presets",
    what: "The bin-step presets a share market can be created at.",
  },
  {
    name: "build_create_mint_tx",
    what: "The transaction that creates the token a launch needs.",
  },
  {
    name: "build_launch_tx",
    what: "The transaction that creates a launch config and its pool with your split, on mainnet or devnet.",
  },
  {
    name: "build_securitize_tx",
    what: "The transaction that turns a locked position into tradeable shares, ready for your wallet to sign.",
  },
  {
    name: "build_stake_tx",
    what: "The transaction that stakes shares in a vault to collect fees.",
  },
  {
    name: "build_unstake_tx",
    what: "The transaction that takes staked shares back out.",
  },
  {
    name: "build_unstake_no_claim_tx",
    what: "The escape hatch: takes shares out without claiming fees, for a fee mint that is paused or blocked.",
  },
  {
    name: "build_harvest_tx",
    what: "The transaction that pulls the pool's earned fees into the vault.",
  },
  {
    name: "build_crank_tx",
    what: "The transaction that claims a vault's fees for its holders. Anyone can send it.",
  },
  {
    name: "build_open_sale_tx",
    what: "The transaction that opens the market shares trade in.",
  },
  {
    name: "build_seed_ladder_tx",
    what: "The transaction that posts your shares for sale as a ladder of asks.",
  },
];

const PROMPTS = [
  "What is this locked position worth as future fees, and what yearly return does that imply?",
  "Which vaults exist, and how much have they paid out?",
  "Give me a report card for this pool over the last 30 days.",
  "Try a launch fee split with 20% permanently locked and tell me if it holds up.",
  "Is this address on mainnet or devnet, and what is it?",
  "What does this wallet own that could be turned into shares?",
  "Build the transaction to turn this locked position into shares.",
  "Walk me through launching a token with half the liquidity locked, and build the transactions.",
  "What would my shares sell for as a sale ladder?",
];

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => setCopied(false),
        );
      }}
      className="rounded-md border border-line bg-canvas px-2.5 py-1 text-[12px] font-medium text-ink hover:border-muted"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <pre className={`${CARD_MUTED} flex-1 overflow-x-auto p-3 font-mono text-[12px] leading-5`}>
        {code}
      </pre>
      <CopyButton text={code} label={label} />
    </div>
  );
}

export default function McpPage() {
  /// The tool list is the longest thing on this page, so it is the one thing worth filtering.
  const [needle, setNeedle] = useState("");
  const query = needle.trim().toLowerCase();
  const shown = query
    ? TOOLS.filter(
        (tool) =>
          tool.name.toLowerCase().includes(query) || tool.what.toLowerCase().includes(query),
      )
    : TOOLS;

  return (
    <div className={PAGE}>
      <PageHeader
        title="Use with AI"
        description="Connect an assistant to Perpetua through the Model Context Protocol. It can price a pool, read its fee history, and prepare transactions for you to sign."
      />

      <Section title="Connect" description="One address. Nothing to install.">
        <div className="space-y-5">
          <div className={`${CARD} flex flex-col gap-3 p-5 sm:flex-row sm:items-center`}>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium uppercase tracking-wide text-muted">
                Your Perpetua address
              </div>
              <div className="mt-1 truncate font-mono text-[13px] text-ink">{ENDPOINT}</div>
            </div>
            <CopyButton text={ENDPOINT} label="Copy address" />
          </div>

          <ol className={`${CARD_MUTED} space-y-2 p-5 text-[13px] text-ink`}>
            <li>
              <span className="font-medium">1.</span> Copy the address above.
            </li>
            <li>
              <span className="font-medium">2.</span> Paste it wherever your assistant keeps its
              connections. The table below says where that is. Restart the app if it asks you to.
            </li>
            <li>
              <span className="font-medium">3.</span> Ask about a pool, a locked position or a
              launch. It reads Perpetua for the answer.
            </li>
          </ol>

          <div className={`${CARD} overflow-hidden`}>
            <table className="w-full text-left text-[13px]">
              <tbody>
                {CLIENTS.map((client) => (
                  <tr key={client.name} className="border-b border-line last:border-0">
                    <td className={`${TD} w-48 font-medium`}>{client.name}</td>
                    <td className={`${TD} text-muted`}>{client.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3">
            {/* Folded away: two blocks of JSON are reference material, not the first thing a reader
                should meet on a page about using the product with an assistant. */}
            <details className="rounded-lg border border-line bg-panel/60 p-3">
              <summary className="w-fit cursor-pointer text-[12px] text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
                If your assistant takes a config file
              </summary>
              <div className="mt-3 space-y-3">
                <div className="text-[12px] text-muted">
                  Paste this into the client&apos;s config:
                </div>
                <CodeBlock code={CONFIG} label="Copy config" />
                <div className="text-[12px] text-muted">
                  VS Code wants a slightly different shape:
                </div>
                <CodeBlock code={VSCODE_CONFIG} label="Copy config" />
              </div>
            </details>
          </div>
        </div>
      </Section>

      <Section
        title="What your assistant can ask Perpetua"
        description="Reading and building, on either network."
      >
        <label className="block">
          <span className="sr-only">Filter tools</span>
          <input
            value={needle}
            onChange={(event) => setNeedle(event.target.value)}
            placeholder="Filter tools…"
            type="search"
            className={INPUT}
          />
        </label>
        <ul className="max-h-[420px] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-panel">
          {shown.map((tool) => (
            <li
              key={tool.name}
              className="flex flex-col gap-1 p-3 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="shrink-0 font-mono text-[12px] text-ink sm:w-56">{tool.name}</span>
              <span className="text-[12px] leading-5 text-muted">{tool.what}</span>
            </li>
          ))}
        </ul>
        {shown.length === 0 ? (
          <p className={META}>No tool matches &ldquo;{needle}&rdquo;.</p>
        ) : null}
      </Section>

      {/* Folded away: these are examples to reach for once someone has a question, not the shape of
          the page. The count tells them there is something worth opening. */}
      <details className={`${CARD} p-4`}>
        <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[13px] font-semibold text-ink">Things worth asking</span>
          <span className={META}>plain language works · {PROMPTS.length} examples</span>
        </summary>
        <div className="mt-3 space-y-3">
          <ul className="list-disc space-y-2 pl-5 text-[13px] text-ink">
            {PROMPTS.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
          <CopyButton text={PROMPTS.join("\n")} label="Copy all prompts" />
        </div>
      </details>

      <Section title="How it stays safe">
        <ul className="space-y-3 text-[13px] leading-5 text-ink">
          <li className={`${CARD_MUTED} p-4`}>
            <span className="font-medium">Perpetua never asks for a private key.</span> Transactions
            come back unsigned, for your wallet to sign.
          </li>
          <li className={`${CARD_MUTED} p-4`}>
            <span className="font-medium">Every answer says when it was read.</span> The envelope
            also names the endpoints used, so an assistant can show its source.
          </li>
          <li className={`${CARD_MUTED} p-4`}>
            <span className="font-medium">It reads the same API as this site.</span> The number an
            assistant reports and the number here come from the same calculation.
          </li>
        </ul>
      </Section>

      <Section title="Use the API directly">
        <div className={`${CARD} space-y-3 p-5 text-[13px] text-ink`}>
          <p>
            Every answer is also available over plain HTTP if you would rather fetch it yourself:
          </p>
          <CodeBlock
            code={`curl -s "${ENDPOINT.replace("/mcp", "/v1/pools/<pool>/yield")}" | jq .valuation`}
            label="Copy example"
          />
          <p className="text-muted">
            Swap in a pool address. Valuation, fee history, vaults, launch presets and the unsigned
            transaction builders all answer without a key.
          </p>
        </div>
      </Section>
    </div>
  );
}
