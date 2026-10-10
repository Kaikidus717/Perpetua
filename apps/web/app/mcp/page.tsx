"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { CARD, CARD_MUTED, PAGE, TD, TH } from "@/lib/ui";
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
    what: "Which network owns an address, and what it is — pool, wallet, mint or vault. The step that stops everything else asking the wrong chain.",
  },
  {
    name: "list_clusters",
    what: "Which networks this deployment serves, and which one it defaults to.",
  },
  {
    name: "price_position",
    what: "What a locked position — or a whole pool — is worth today as a stream of future fees, with a fair-value range and the risks behind it.",
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
    what: "What a wallet actually holds in DAMM v2, and whether each position can be turned into shares.",
  },
  {
    name: "list_vaults",
    what: "The vaults that hold fee rights, and what they have paid out so far.",
  },
  {
    name: "simulate_preset",
    what: "Try a launch fee split before you commit to one — including priced against a live pool.",
  },
  {
    name: "get_sale_plan",
    what: "The ask ladder a share sale would post: every bin, its price, and how many shares sit there.",
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
    what: "The transaction that creates a bonding-curve config and its pool with the split you chose — on mainnet or devnet.",
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
  "What is this locked position worth as a fee stream, and what APR does that imply?",
  "Which vaults exist, and how much have they paid out?",
  "Give me a report card for this pool over the last 30 days.",
  "Try a launch fee split with 20% permanently locked and tell me if it holds up.",
  "Is this address on mainnet or devnet, and what is it?",
  "What does this wallet own that could be turned into shares?",
  "Build the transaction to turn this locked position into shares.",
  "Walk me through launching a token with half the liquidity locked, and build the transactions.",
  "What would my shares sell for as an ask ladder?",
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
      className="rounded-md border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-ink hover:border-muted"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <pre className={`${CARD_MUTED} flex-1 overflow-x-auto p-3 font-mono text-xs leading-5`}>
        {code}
      </pre>
      <CopyButton text={code} label={label} />
    </div>
  );
}

export default function McpPage() {
  return (
    <div className={PAGE}>
      <PageHeader
        title="Use with AI"
        description="Point Claude, Cursor, VS Code or any other AI assistant at Perpetua and it can price what you hold, read how a pool has actually performed and build transactions for you to sign — from the same live data this site uses."
      />

      <Section title="Connect" description="One address. Nothing to install.">
        <div className="space-y-5">
          <div className={`${CARD} flex flex-col gap-3 p-5 sm:flex-row sm:items-center`}>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">
                Your Perpetua address
              </div>
              <div className="mt-1 truncate font-mono text-sm text-ink">{ENDPOINT}</div>
            </div>
            <CopyButton text={ENDPOINT} label="Copy address" />
          </div>

          <ol className={`${CARD_MUTED} space-y-2 p-5 text-sm text-ink`}>
            <li>
              <span className="font-medium">1.</span> Copy the address above.
            </li>
            <li>
              <span className="font-medium">2.</span> Paste it wherever your assistant keeps its
              connections — the table below says where that is — and restart the app if it asks you
              to.
            </li>
            <li>
              <span className="font-medium">3.</span> Ask about a pool, a locked position or a launch.
              It reads Perpetua for the answer.
            </li>
          </ol>

          <div className={`${CARD} overflow-hidden`}>
            <table className="w-full text-left text-sm">
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
            <div className="text-sm text-muted">
              If your assistant takes a config file instead of a menu, paste this in:
            </div>
            <CodeBlock code={CONFIG} label="Copy config" />
            <div className="text-sm text-muted">VS Code wants a slightly different shape:</div>
            <CodeBlock code={VSCODE_CONFIG} label="Copy config" />
          </div>
        </div>
      </Section>

      <Section
        title="What your assistant can ask Perpetua"
        description="Everything this site can do, on request — reading and building, on either network."
      >
        <div className={`${CARD} overflow-hidden`}>
          <table className="w-full text-left text-sm">
            <thead className="bg-panel">
              <tr>
                <th className={TH}>Tool</th>
                <th className={TH}>What it brings back</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((tool) => (
                <tr key={tool.name}>
                  <td className={`${TD} whitespace-nowrap font-mono text-xs`}>{tool.name}</td>
                  <td className={`${TD} text-muted`}>{tool.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Things worth asking" description="Plain language works.">
        <div className={`${CARD} space-y-3 p-5`}>
          <ul className="list-disc space-y-2 pl-5 text-sm text-ink">
            {PROMPTS.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
          <CopyButton text={PROMPTS.join("\n")} label="Copy all prompts" />
        </div>
      </Section>

      <Section title="What you get back">
        <ul className="space-y-3 text-sm text-ink">
          <li className={`${CARD_MUTED} p-4`}>
            <span className="font-medium">Your keys never move.</span> Perpetua never asks for a
            private key. When your assistant builds a transaction it comes back unsigned, for your own
            wallet to sign — or nothing happens.
          </li>
          <li className={`${CARD_MUTED} p-4`}>
            <span className="font-medium">Numbers you can trace.</span> Every answer carries where it
            came from and when it was read, so your assistant can show its working instead of asking
            you to take a figure on faith.
          </li>
          <li className={`${CARD_MUTED} p-4`}>
            <span className="font-medium">One source of truth.</span> Your assistant reads the same
            API this site does, so the number it reports and the number you see here are the same
            calculation.
          </li>
        </ul>
      </Section>

      <Section title="Building something instead?">
        <div className={`${CARD} space-y-3 p-5 text-sm text-ink`}>
          <p>
            Everything your assistant can reach is public, and every answer is available over plain
            HTTP if you would rather fetch it yourself:
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

