import { resolveNetwork, rpcEndpoints } from "@perpetua/shared";
import { createConnection } from "../src/rpc.js";

/// Pings every configured endpoint and reports latency, so a demo can tell "is the RPC up?" in one
/// command instead of debugging a hanging page.
async function main(): Promise<void> {
  const cluster = process.env.CLUSTER ?? "devnet";
  const network = resolveNetwork(cluster);
  const endpoints = rpcEndpoints(network.cluster);

  console.log(`cluster ${network.cluster}`);
  console.log(`RPC_URLS in use: ${endpoints.join(", ")}`);
  console.log();

  let healthy = 0;
  for (const endpoint of endpoints) {
    const started = Date.now();
    try {
      const connection = createConnection({ cluster, attempts: 2 });
      // A trivial call that still proves the endpoint answers.
      const slot = await connection.getSlot();
      const ms = Date.now() - started;
      healthy += 1;
      console.log(`  OK    ${endpoint}  slot ${slot}  ${ms}ms`);
    } catch (error) {
      console.log(`  FAIL  ${endpoint}  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log();
  if (healthy === 0) {
    console.error("no endpoint answered - set RPC_URLS to a private RPC");
    process.exit(1);
  }
  console.log(`${healthy}/${endpoints.length} endpoint(s) healthy`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
