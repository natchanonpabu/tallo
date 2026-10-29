// Money is always an integer number of satang (1 baht = 100 satang). Never use floats for math.

const bahtFormat = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** 2693848 → "26,938.48". null/undefined → "—". */
export function formatBaht(satang: number | null | undefined): string {
  if (satang == null) return "—"
  return bahtFormat.format(satang / 100)
}

/** "26,938.48" → 2693848. Returns null for empty or invalid input. */
export function parseBaht(input: string): number | null {
  const clean = input.replace(/[,\s฿]/g, "")
  if (!/^-?\d+(\.\d{0,2})?$/.test(clean)) return null
  const negative = clean.startsWith("-")
  const [whole, fraction = ""] = clean.replace("-", "").split(".")
  const satang = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  return negative ? -satang : satang
}

/** 2693848 → "26938.48" for prefilling inputs. */
export function satangToInput(satang: number | null | undefined): string {
  if (satang == null) return ""
  const sign = satang < 0 ? "-" : ""
  const abs = Math.abs(satang)
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}
