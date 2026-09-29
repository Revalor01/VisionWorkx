import products from "./products.json";

// Products under test live in products.json (also read by sync-catalog.mjs).
// To add one: add it there and create qa/products/<slug>/. The catalog sync
// registers it in /admin/qa automatically on the next run.
export const PRODUCTS: Record<string, { name: string; url: string }> = products;

/** The URL a product is tested at in this run: QA_TARGET_URL when the run is for that product, else production. */
export function targetFor(product: string): string {
  const only = process.env.QA_PRODUCT || "";
  return ((only === product && process.env.QA_TARGET_URL) || PRODUCTS[product].url).replace(/\/$/, "");
}
