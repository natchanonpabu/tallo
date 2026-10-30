import { cloneElement, isValidElement, useId, useState, type ComponentProps, type ReactElement } from "react"
import { format, parseISO } from "date-fns"
import { th } from "react-day-picker/locale"
import { CalendarBlank, WarningCircle, X } from "@phosphor-icons/react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Field as UiField, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
    <Alert variant="destructive">
      <WarningCircle weight="fill" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/**
 * Label + control + hint. The single child control gets the label's id, unless `controlId` is given
 * (for composite controls like Select, put that id on the SelectTrigger).
 */
export function Field({
  label,
  children,
  hint,
  controlId,
}: {
  label: string
  children: ReactElement<{ id?: string }>
  hint?: string
  controlId?: string
}) {
  const generated = useId()
  const id = controlId ?? ((isValidElement(children) && children.props.id) || generated)
  return (
    <UiField>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {controlId ? children : cloneElement(children, { id })}
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </UiField>
  )
}

export function CheckboxField({
  label,
  checked,
  onCheckedChange,
  children,
  className,
}: {
  label: React.ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children?: React.ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <UiField orientation="horizontal" className={className}>
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
      <FieldLabel htmlFor={id} className="flex-1 font-normal">
        {label}
      </FieldLabel>
      {children}
    </UiField>
  )
}

/** Date picker that submits `name` as yyyy-MM-dd (empty when cleared). */
export function DatePicker({
  name,
  defaultValue,
  id,
  placeholder = "เลือกวันที่",
}: {
  name: string
  defaultValue?: string | null
  id?: string
  placeholder?: string
}) {
  const [date, setDate] = useState<Date | undefined>(defaultValue ? parseISO(defaultValue) : undefined)
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={date ? format(date, "yyyy-MM-dd") : ""} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className="flex-1 justify-start font-normal">
            <CalendarBlank weight="light" data-icon="inline-start" />
            {date ? (
              date.toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "long", year: "numeric" })
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={th}
            selected={date}
            defaultMonth={date}
            onSelect={(next) => {
              setDate(next)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {date && (
        <Button type="button" variant="ghost" size="icon" aria-label="ล้างวันที่" onClick={() => setDate(undefined)}>
          <X weight="light" />
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
