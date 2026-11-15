import { describe, expect, it } from "vitest";
import { PerpetuaApiError, createHttpApi } from "../src/httpApi.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createHttpApi", () => {
  it("joins the base url and encodes the query, skipping undefined values", async () => {
    const seen: string[] = [];
    const api = createHttpApi({
      baseUrl: "http://api.test:8787/",
      fetchImpl: async (input) => {
        seen.push(String(input));
        return json({ ok: true });
      },
    });

    const result = await api.get("/v1/vaults", { limit: 5, cursor: undefined });

    expect(result).toEqual({ ok: true });
    expect(seen[0]).toBe("http://api.test:8787/v1/vaults?limit=5");
  });

  it("posts a json body with the right content type", async () => {
    let captured: RequestInit | undefined;
    const api = createHttpApi({
      baseUrl: "http://api.test:8787",
      fetchImpl: async (_input, init) => {
        captured = init;
        return json({ transaction: "AQ==" });
      },
    });

    const result = await api.post("/v1/tx/stake", { amount: "5" });

    expect(result).toEqual({ transaction: "AQ==" });
    expect(captured?.method).toBe("POST");
    expect(captured?.headers).toMatchObject({ "content-type": "application/json" });
    expect(captured?.body).toBe('{"amount":"5"}');
  });

  it("sends no content type on a get", async () => {
    let captured: RequestInit | undefined;
    const api = createHttpApi({
      baseUrl: "http://api.test",
      fetchImpl: async (_input, init) => {
        captured = init;
        return json({ vaults: [] });
      },
    });

    await api.get("/v1/vaults");

    expect(captured?.body).toBeUndefined();
    expect(captured?.headers).not.toMatchObject({ "content-type": "application/json" });
  });

  it("throws a typed error carrying the status and a body excerpt", async () => {
    const api = createHttpApi({
      baseUrl: "http://api.test",
      fetchImpl: async () => json({ error: "bad request" }, 400),
    });

    const error = await api.get("/v1/vaults").catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PerpetuaApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as PerpetuaApiError).status).toBe(400);
    expect((error as PerpetuaApiError).path).toBe("/v1/vaults");
    expect((error as Error).message).toContain("bad request");
  });

  it("returns null for an empty body", async () => {
    const api = createHttpApi({
      baseUrl: "http://api.test",
      fetchImpl: async () => new Response(null, { status: 204 }),
    });

    expect(await api.get("/health")).toBeNull();
  });

  it("falls back to the global fetch and rejects a non-function override", () => {
    expect(() => createHttpApi({ baseUrl: "http://api.test" })).not.toThrow();
    expect(() =>
      createHttpApi({ baseUrl: "http://api.test", fetchImpl: 42 as unknown as typeof fetch }),
    ).toThrow(/no fetch/i);
  });
});
