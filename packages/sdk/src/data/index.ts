/// `MeteoraDataApi` is the live source: pool fee history straight from Meteora's DAMM v2 data API.
export {
  MeteoraDataApi,
  normalizePoolDaily,
  type MeteoraDataApiConfig,
  type NormalizeOptions,
  type PoolResponse,
  type VolumeHistoryResponse,
} from "./meteoraDataApi.js";
/// `StaticDataApi` reads from a map. It exists for tests that need a fixed series without a network
/// call, and it is never wired into a running server.
export { StaticDataApi } from "./staticDataApi.js";
