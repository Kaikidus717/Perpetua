import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });

const kp = Keypair.generate();
const id = kp.publicKey.toBase58();
writeFileSync(join(outDir, "program-id.txt"), `${id}\n`, "utf8");
writeFileSync(
  join(outDir, "program-keypair.json"),
  JSON.stringify(Array.from(kp.secretKey)),
  "utf8",
);
console.log(id);
