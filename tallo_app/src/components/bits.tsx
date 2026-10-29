import type { ComponentProps } from "react"

import { Input } from "@/components/ui/input"
import { formatBaht, satangToInput } from "@/lib/money"
import { cn } from "@/lib/utils"

/** Baht amount input; submit value is parsed with parseBaht(). */
export function MoneyInput({
  defaultSatang,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, "type" | "defaultValue"> & { defaultSatang?: number | null }) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder="0.00"
      defaultValue={satangToInput(defaultSatang)}
      className={cn("text-right tabular-nums", className)}
      {...props}
    />
  )
}

export function Money({ satang, className }: { satang: number | null | undefined; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatBaht(satang)}</span>
}

export function ContactChip({
  name,
  color,
  amount,
  className,
}: {
  name: string
  color: string
  amount?: number
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-[#3a3347]",
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {name}
      {amount != null && <span className="tabular-nums opacity-80">{formatBaht(amount)}</span>}
    </span>
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl bg-danger px-3 py-2 text-sm text-danger-foreground">
      {message}
    </p>
  )
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
