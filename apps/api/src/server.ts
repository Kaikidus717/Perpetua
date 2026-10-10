import { serve } from "@hono/node-server";
import { createConnection } from "@perpetua/sdk";
import { MeteoraDataApi } from "@perpetua/sdk/data";
import { resolveNetwork } from "@perpetua/shared";
import { type Connection } from "@solana/web3.js";
import { type ClusterName, createApp } from "./app.js";
import { InMemoryStore } from "./store/memory.js";
import type { Store } from "./store/types.js";

const port = Number(process.env.PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;
const network = resolveNetwork(process.env.CLUSTER);

/// Both clusters are wired up, because this app serves both: a devnet wallet securitizes against the
/// vault program that lives there, while a mainnet holder launches tokens against Meteora's mainnet
/// deployment. Which one a request means is decided per request, from the address it names.
const connections: Record<ClusterName, Connection> = {
  devnet: createConnection({ cluster: "devnet" }),
  "mainnet-beta": createConnection({ cluster: "mainnet-beta" }),
};
const defaultCluster: ClusterName = network.cluster === "devnet" ? "devnet" : "mainnet-beta";

// The Postgres driver is only loaded when a database is configured, so the default
// in-memory mode starts without pulling drizzle-orm into the process.
async function resolveStore(): Promise<Store> {
  if (!databaseUrl) return new InMemoryStore();
  const [{ createDb }, { DrizzleStore }] = await Promise.all([
    import("./db/client.js"),
    import("./db/store.js"),
  ]);
  return new DrizzleStore(createDb(databaseUrl).db);
}

const store = await resolveStore();
// Fee history comes from Meteora's data API and nowhere else. There is no bundled or generated
// series behind it: if this endpoint is unreachable the request errors and the UI shows the error,
// rather than a chart that looks live and is not.
const dataApiUrl = process.env.METEORA_DATA_API ?? network.dammV2DataApi;
const app = createApp({
  store,
  dataApi: new MeteoraDataApi({ baseUrl: dataApiUrl }),
  connections,
  defaultCluster,
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`perpetua api listening on http://localhost:${info.port}`);
  console.log(
    `clusters ${Object.keys(connections).join(", ")} (default ${defaultCluster}) via ${connections[defaultCluster].rpcEndpoint}`,
  );
  console.log(`fee history from ${dataApiUrl}`);
});
