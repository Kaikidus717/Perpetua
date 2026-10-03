import { serve } from "@hono/node-server";
import { StaticDataApi } from "@perpetua/sdk/data";
import { createApp } from "./app.js";
import { DEMO_POOL, DEMO_WALLET, demoPools, demoPositions } from "./demo.js";
import { InMemoryStore } from "./store/memory.js";
import type { Store } from "./store/types.js";

const port = Number(process.env.PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;

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
const dataApi = new StaticDataApi(demoPools(), demoPositions());
const app = createApp({ store, dataApi, demoPool: DEMO_POOL, demoWallet: DEMO_WALLET });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`perpetua api listening on http://localhost:${info.port}`);
});
