/// The Netlify Function entry. `netlify/api/build.mjs` bundles `netlify/api/handler.ts` — the whole
/// API, dependencies included — into `netlify/api/api.bundle.cjs`, and this file re-exports it.
///
/// The indirection exists because Netlify's own bundler cannot ship this API as-is. Its native
/// modules plugin marks every package with a native binding as external and then does not include
/// those packages in the function archive, so a function entry that imports the API graph directly
/// dies at load time with `Cannot find module 'bigint-buffer'` — `@solana/buffer-layout-utils`
/// requires that package eagerly. The prebundled file inlines everything, so the only `require()`
/// calls left in it are Node builtins.
///
/// This is a **Functions v1** handler on purpose. Node File Trace backs Functions v2, and it cannot
/// follow the bare `@perpetua/*` specifiers that the compiled packages emit, because pnpm does not
/// link workspace packages into the root `node_modules`; every dependency is then left as a runtime
/// `require()`, the zip ships without `node_modules` at all, and the function dies with
/// `Cannot find module '@perpetua/sdk/adapters/damm-v2'`. Functions v1 honour
/// `node_bundler = "esbuild"` from `netlify.toml`, and esbuild inlines this bundle.
///
/// Importing the bundle rather than pointing the function at it matters: esbuild re-emits a CommonJS
/// *entry* through its own `__toCommonJS` helper and the handler ends up nested one level too deep
/// (`handler is not a function`), while a CommonJS *import* is interop'd correctly.
///
/// The import is named, not default, for a related reason: the bundle is esbuild output and therefore
/// carries `__esModule`, so esbuild reads it as a transpiled namespace and resolves a default import
/// to a `default` key the bundle does not have (`Cannot read properties of undefined`).
import { handler as apiHandler } from "../api/api.bundle.cjs";

export const handler = apiHandler;
