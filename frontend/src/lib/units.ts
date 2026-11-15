// What `spread_rate_mm_s` means depends on the data (R-05, R-39, data/SOURCES.md):
// in the real NASA FLEX data, droplet rows hold the droplet *burning-rate constant* in mm²/s, not a flame-spread
// speed. Mock data and solid fuels use flame spread in mm/s. This is the one place the UI decides the label.
import type { DataSource, FuelType } from "../types";

export interface RateLabel { name: string; short: string; unit: string }

export function rateLabel(source: DataSource | undefined, fuel: FuelType | undefined): RateLabel {
  if (source === "nasa" && fuel === "droplet") return { name: "Burning rate", short: "burn rate", unit: "mm²/s" };
  return { name: "Spread rate", short: "spread", unit: "mm/s" };
}
