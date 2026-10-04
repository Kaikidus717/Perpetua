import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "..", "programs", "perpetua_vault", "idl");
mkdirSync(outDir, { recursive: true });

const targets = [
  { pkg: "@meteora-ag/cp-amm-sdk", name: "cp_amm", idlExports: ["CpAmmIdl", "cp_amm"] },
  { pkg: "@meteora-ag/dlmm", name: "lb_clmm", idlExports: ["LbClmm", "lb_clmm", "IDL"] },
  {
    pkg: "@meteora-ag/dynamic-bonding-curve-sdk",
    name: "dynamic_bonding_curve",
    idlExports: ["DynamicBondingCurve", "dynamic_bonding_curve", "IDL", "DbcIdl"],
  },
];

for (const target of targets) {
  let mod;
  try {
    mod = await import(target.pkg);
  } catch (error) {
    console.log(`${target.name}: import failed (${error.message})`);
    continue;
  }

  const idl = target.idlExports.map((key) => mod[key]).find((value) => value?.instructions);
  if (!idl) {
    console.log(`${target.name}: no IDL export found. keys=${Object.keys(mod).length}`);
    continue;
  }

  const path = join(outDir, `${target.name}.json`);
  writeFileSync(path, `${JSON.stringify(idl, null, 2)}\n`, "utf8");
  console.log(`${target.name}: wrote ${idl.instructions.length} instructions -> ${path}`);

  if (target.name === "cp_amm") {
    const claim = idl.instructions.find((ix) => ix.name === "claimPositionFee");
    console.log("claimPositionFee accounts:", JSON.stringify(claim?.accounts, null, 2));
    const position = idl.types?.find((type) => type.name === "Position");
    console.log("Position type:", JSON.stringify(position, null, 2));
  }
}
