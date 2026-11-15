/** Integer-cent money helpers. All financial arithmetic uses integer cents. */

export function parseMoneyToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  // Treat commas as thousands separators ("1,600" / "1,600.00").
  const normalized = cleaned.replace(/,(?=\d{3}(\D|$))/g, "").replace(/,/g, "");
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return null;
  return Math.round(value * 100);
}

export function formatCents(cents: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  const dollars = cents / 100;
  return dollars.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: opts.decimals || cents % 100 !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

export function dollarsToCents(d: number | null | undefined): number | null {
  if (d === null || d === undefined || !Number.isFinite(d)) return null;
  return Math.round(d * 100);
}

/** Half of the monthly rent, rounded down to the cent (deposit maximum basis in NS). */
export function halfMonthCents(monthlyRentCents: number): number {
  return Math.floor(monthlyRentCents / 2);
}

export function percentChange(fromCents: number, toCents: number): number {
  if (fromCents <= 0) return 0;
  return ((toCents - fromCents) / fromCents) * 100;
}
