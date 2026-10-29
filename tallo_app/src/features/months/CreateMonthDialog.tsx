import { useActionState, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"

import { Field, FormError, Money } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorMessage, must } from "@/lib/errors"
import { KIND_LABELS, TH_MONTHS, monthLabel } from "@/lib/labels"
import { supabase } from "@/lib/supabase"
import type { Item } from "@/lib/types"

type MonthRef = { id: string; year: number; month: number }
type Candidate = Item & { suggested: boolean }

function nextMonth(months: MonthRef[]): { year: number; month: number } {
  const latest = months[0]
  if (!latest) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
  return latest.month === 12 ? { year: latest.year + 1, month: 1 } : { year: latest.year, month: latest.month + 1 }
}

export function CreateMonthDialog({
  open,
  onOpenChange,
  months,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  months: MonthRef[]
  onCreated: () => void
}) {
  const navigate = useNavigate()
  const initial = useMemo(() => nextMonth(months), [months])
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [copyFrom, setCopyFrom] = useState<string>(months[0]?.id ?? "none")
  const [loaded, setLoaded] = useState<Candidate[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const candidates = copyFrom === "none" ? [] : loaded

  useEffect(() => {
    if (copyFrom === "none") return
    let active = true
    void (async () => {
      const flags = must(await supabase.rpc("month_copy_candidates", { p_month_id: copyFrom }))
      const ids = flags.map((f) => f.item_id)
      const items = ids.length ? must(await supabase.from("items").select("*").in("id", ids)) : []
      const byId = new Map(items.map((i) => [i.id, i]))
      const list = flags.flatMap((f) => {
        const item = byId.get(f.item_id)
        return item ? [{ ...item, suggested: f.suggested }] : []
      })
      if (!active) return
      setLoaded(list)
      setPicked(new Set(list.filter((c) => c.suggested).map((c) => c.id)))
    })()
    return () => {
      active = false
    }
  }, [copyFrom])

  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async () => {
    try {
      const created = must(
        await supabase.rpc("create_month", {
          p_year: year,
          p_month: month,
          p_copy_from: copyFrom === "none" ? undefined : copyFrom,
          p_copy_item_ids: copyFrom === "none" ? undefined : [...picked],
        }),
      )
      onCreated()
      onOpenChange(false)
      navigate(`/months/${created.id}`)
      return {}
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }, {})

  const years = [initial.year - 1, initial.year, initial.year + 1]
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>สร้างเดือนใหม่</DialogTitle>
          <DialogDescription>เลือกเดือน แล้วเลือกรายการที่จะคัดลอกจากเดือนก่อน</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="เดือน">
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TH_MONTHS.map((name, i) => (
                    <SelectItem key={name} value={String(i + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ปี">
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="คัดลอกจาก">
            <Select value={copyFrom} onValueChange={setCopyFrom}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">เริ่มว่าง</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {monthLabel(m.year, m.month)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {candidates.length > 0 && (
            <div className="grid gap-1">
              <p className="text-sm font-medium">
                รายการที่จะคัดลอก ({picked.size}/{candidates.length})
              </p>
              <p className="text-xs text-muted-foreground">
                บัตรจะถูกล้างยอดเป็นว่าง สินเชื่อนับงวดต่อ รายการประจำคัดลอกยอดไปด้วย
              </p>
              <ul className="mt-1 grid max-h-64 gap-1 overflow-y-auto rounded-2xl border p-2">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-muted">
                      <Checkbox checked={picked.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
                      <span className="flex-1">
                        {c.name}
                        <span className="ml-2 text-xs text-muted-foreground">{KIND_LABELS[c.kind]}</span>
                      </span>
                      <Money satang={c.kind === "card" ? null : c.amount} className="text-muted-foreground" />
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <FormError message={state.error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังสร้าง…" : `สร้าง ${monthLabel(year, month)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
