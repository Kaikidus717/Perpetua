import { shouldCrank } from "./decide.js";
import type { CrankPort } from "./ports.js";

export interface KeeperOptions {
  /// Minimum claimable fees, in base units, before a vault is cranked. 0 cranks every tick.
  thresholdBaseUnits: bigint;
  intervalMs: number;
}

export interface CrankSummary {
  considered: number;
  cranked: string[];
}

export class Keeper {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly port: CrankPort,
    private readonly options: KeeperOptions,
  ) {}

  async runOnce(): Promise<CrankSummary> {
    const refs = await this.port.listVaultRefs();
    const cranked: string[] = [];
    for (const ref of refs) {
      const claimable = await this.port.claimableBaseUnits(ref.address);
      if (shouldCrank(claimable, this.options.thresholdBaseUnits).crank) {
        cranked.push(await this.port.crank(ref.address));
      }
    }
    return { considered: refs.length, cranked };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((error: unknown) => console.error("keeper tick failed", error));
    }, this.options.intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
