/// Loads `@meteora-ag/dlmm` through CommonJS.
///
/// The package's ESM build imports a CJS directory (`@coral-xyz/anchor/dist/cjs/utils/bytes`), which
/// Node's ESM resolver rejects, so it has to be required rather than imported. It is required *here*,
/// in a `.cts` module, instead of through `createRequire(import.meta.url)` in the ESM adapter,
/// because bundlers only rewrite plain `require()` calls made from CommonJS modules. That rewrite is
/// what lets esbuild inline the package into the serverless bundle; a `createRequire` call is left
/// untouched and then has nothing to resolve against at runtime.
///
/// The `@types` for the package describe its default export, so the adapter casts this to the shape
/// it actually uses.
module.exports = require("@meteora-ag/dlmm");
