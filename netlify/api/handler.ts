/// The API entry point. `netlify/api/build.mjs` bundles this file into `netlify/api/api.bundle.cjs`,
/// which the Netlify Function at `netlify/functions/api.ts` re-exports as its handler.
///
/// It lives outside the functions directory because the file Netlify sees has to be a single
/// self-contained artifact. `@netlify/zip-it-and-ship-it` marks packages with native bindings as
/// external and then does not ship them, so a function entry that imports the API graph directly dies
/// at load time with `Cannot find module 'bigint-buffer'` — `@solana/buffer-layout-utils` requires
/// that package eagerly. `build.mjs` inlines the whole graph instead, which leaves Node builtins as
/// the only runtime `require()` calls in the archive.
///
/// The web app calls `/api/*` same-origin, so there is no CORS to configure and no second host to
/// keep alive.
///
/// This is a **Functions v1** handler on purpose. Node File Trace backs Functions v2, and it cannot
/// follow the bare `@perpetua/*` specifiers that the compiled packages emit, because pnpm does not
/// link workspace packages into the root `node_modules`; every dependency is left as a runtime
/// `require()`, the zip ships without `node_modules` at all, and the function dies with
/// `Cannot find module '@perpetua/sdk/adapters/damm-v2'`.
///
/// The imports below are relative for a different reason: this file lives at the repository root,
/// which is outside the pnpm workspace packages that declare `@perpetua/*` as dependencies, so pnpm
/// never links them into the root `node_modules` either.
import { createApp } from "../../apps/api/dist/app.js";
import { InMemoryStore } from "../../apps/api/dist/store/memory.js";
import { MeteoraDataApi } from "../../packages/sdk/dist/data/meteoraDataApi.js";
import { createConnection } from "../../packages/sdk/dist/rpc.js";

/// Both clusters are reachable, because the app serves both: devnet for the vault program, mainnet
/// for launches and for anything a mainnet wallet owns. A request names the cluster it means, and
/// `CLUSTER` decides what happens when it does not name one.
const connections = {
  devnet: createConnection({ cluster: "devnet" }),
  "mainnet-beta": createConnection({ cluster: "mainnet-beta" }),
};

const app = createApp({
  store: new InMemoryStore(),
  dataApi: new MeteoraDataApi({
    baseUrl: process.env.METEORA_DATA_API ?? "https://damm-v2.datapi.meteora.ag",
  }),
  connections,
  defaultCluster: process.env.CLUSTER === "devnet" ? "devnet" : "mainnet-beta",
});

/// The subset of the Functions v1 event we read. Declared inline because the repository does not
/// depend on `@netlify/functions` — this is the only place that needs the shape.
interface NetlifyEvent {
  body?: string | null;
  headers: Record<string, string | undefined>;
  httpMethod: string;
  isBase64Encoded?: boolean;
  path?: string;
  rawUrl?: string;
}

/// `netlify.toml` rewrites `/api/*` to `/.netlify/functions/api/:splat`, so the path we see is
/// either the public one or the rewritten one depending on what Netlify forwards. Strip both.
const stripPrefixes = (pathname: string): string =>
  pathname.replace(/^\/\.netlify\/functions\/api/, "").replace(/^\/api/, "");

export const handler = async (event: NetlifyEvent) => {
  const url = new URL(event.rawUrl ?? `https://perpetua.invalid${event.path ?? "/"}`);
  url.pathname = stripPrefixes(url.pathname) || "/";

  const body =
    event.body == null || event.body === ""
      ? undefined
      : event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : event.body;

  const response = await app.fetch(
    new Request(url.toString(), {
      method: event.httpMethod,
      headers: event.headers as HeadersInit,
      body,
    }),
  );

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: Buffer.from(await response.arrayBuffer()).toString("base64"),
    isBase64Encoded: true,
  };
};
