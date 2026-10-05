export type Query = Record<string, string | number | undefined>;

/**
 * Everything the MCP tools need from the Perpetua REST API. Kept to two verbs so tools
 * stay testable against a fake and never reach for the network directly.
 */
export interface PerpetuaApiPort {
  get(path: string, query?: Query): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
}

export interface ToolEnvelope {
  as_of: string;
  source: string;
  endpoints: string[];
  model_version: string | null;
  unsigned: boolean;
}

export interface ToolOutcome {
  envelope: ToolEnvelope;
  data: unknown;
}
