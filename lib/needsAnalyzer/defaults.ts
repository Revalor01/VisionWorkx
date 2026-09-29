import catalogDefault from "./catalog.default.json";
import ecosystemDefault from "./ecosystem.default.json";
import type { Catalog, Ecosystem } from "./types";

// Built-in catalog and ecosystem, copied from the offline app's catalog.default.json /
// ecosystem.default.json. Used until the operator saves their own in Catalog & pricing /
// Ecosystem (a vw_na_settings row), and by "Reset to defaults".
export const DEFAULT_CATALOG = catalogDefault as unknown as Catalog;
export const DEFAULT_ECOSYSTEM = ecosystemDefault as unknown as Ecosystem;
