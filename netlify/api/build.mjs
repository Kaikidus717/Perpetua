// Bundles the API into a single self-contained CommonJS file at `netlify/functions/api.js`.
//
// Netlify's own bundler cannot ship this API as-is. `@netlify/zip-it-and-ship-it` runs esbuild with a
// plugin that marks every package with a native binding as *external*, and the function archive it
// produces contains no `node_modules` for those packages to be found in. The deployed function then
// dies at load time with `Cannot find module 'bigint-buffer'`, because
// `@solana/buffer-layout-utils` requires it eagerly.
//
// Bundling here instead — with esbuild configured to inline *everything* — leaves Node builtins as
// the only runtime `require()` calls. `bigint-buffer` falls back to its pure-JS implementation, which
// is what the local harness and the deployed function both exercise.
//
// The output is CommonJS because the dependency graph requires it: packages such as
// `@coral-xyz/anchor` call `require()` with a non-literal argument, and esbuild's ES module output
// cannot express that ("Dynamic require of ... is not supported").
//
// Netlify bundles the result once more, but that pass has nothing left to resolve and nothing to
// leave external, so it only re-emits the module. It is deliberately *not* the function entry:
// esbuild round trips its own CommonJS output badly, and re-bundling a CommonJS file that exports
// through `__toCommonJS` nests `handler` one level too deep in the result. `netlify/functions/api.ts`
// imports this file instead, and esbuild's CommonJS-to-entry interop handles that properly.
//
// See `netlify/api/handler.ts` for why the handler lives outside the functions directory.
import { build } from "esbuild";

const outfile = "netlify/api/api.bundle.cjs";

await build({
  bundle: true,
  entryPoints: ["netlify/api/handler.ts"],
  format: "cjs",
  logLevel: "info",
  outfile,
  platform: "node",
  target: "node22",
});

console.log(`bundled netlify/api/handler.ts -> ${outfile}`);
