import { serve } from "@hono/node-server";
import { StaticDataApi } from "@perpetua/sdk";
import { createApp } from "./app.js";
import { createDb } from "./db/client.js";
import { DrizzleStore } from "./db/store.js";
import { DEMO_POOL, DEMO_WALLET, demoPools, demoPositions } from "./demo.js";
import { InMemoryStore } from "./store/memory.js";

const port = Number(process.env.PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;

const store = databaseUrl ? new DrizzleStore(createDb(databaseUrl).db) : new InMemoryStore();
const dataApi = new StaticDataApi(demoPools(), demoPositions());
const app = createApp({ store, dataApi, demoPool: DEMO_POOL, demoWallet: DEMO_WALLET });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`perpetua api listening on http://localhost:${info.port}`);
});
