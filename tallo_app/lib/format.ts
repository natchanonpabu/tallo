// Money is int64 satang everywhere except the display edge (design.md #2,
// frontend-design.md #4). Format here, never divide/round in a component.

/** `฿1,272.90` — always two decimals, th-TH grouping. */
export function formatSatang(satang: number): string {
  return `฿${(satang / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Signed form for person nets: `+฿6,010.00` / `−฿560.00` / `฿0.00`. */
export function formatSignedSatang(satang: number): string {
  if (satang === 0) return formatSatang(0);
  const sign = satang > 0 ? "+" : "−"; // U+2212 minus, not hyphen
  return `${sign}${formatSatang(Math.abs(satang))}`;
}

/** Thai direction word for a signed net (business.md #7). */
export function netWord(net: number, status: "pending" | "settled"): string {
  if (net > 0) return status === "settled" ? "รับแล้ว" : "รอรับ";
  if (net < 0) return status === "settled" ? "จ่ายแล้ว" : "รอจ่าย";
  return "—";
}

/** Parse a baht text field into satang. Returns null on empty/invalid input. */
export function parseBaht(input: string): number | null {
  const cleaned = input.replace(/[,\s฿]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "−") return null;
  const baht = Number(cleaned.replace("−", "-"));
  if (!Number.isFinite(baht)) return null;
  return Math.round(baht * 100);
}

/** Satang → a plain baht string for editing (no ฿, no grouping). */
export function satangToBahtInput(satang: number): string {
  return (satang / 100).toFixed(2);
}

export function formatMonthDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
