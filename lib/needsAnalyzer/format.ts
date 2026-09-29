// Formatting shared by the admin screens and the public proposal page. Fixed
// locale/time zone so server and browser render the same text.
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "America/New_York" }) : "";

export function money(currency: string | undefined, n: number) {
  return (currency || "$") + Math.round(Number(n) || 0).toLocaleString("en-US");
}
