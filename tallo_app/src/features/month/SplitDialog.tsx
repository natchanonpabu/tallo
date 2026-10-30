import { useActionState, useMemo, useState } from "react"

import { CheckboxField, ContactChip, FormError, Money, MoneyInput } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SplitInfo } from "@/features/month/use-month-data"
import { errorMessage, must } from "@/lib/errors"
import { parseBaht } from "@/lib/money"
import { supabase } from "@/lib/supabase"
import type { Contact, SplitMode } from "@/lib/types"

export type SplitTarget = { itemId: string; subItemId: string | null; label: string; amount: number }

const MODE_LABELS: Record<SplitMode, string> = { equal: "หารเท่า", ratio: "ตามสัดส่วน", fixed: "กำหนดยอดเอง" }

/** Same rules as recompute_split in the database: everyone else rounds down, I keep the rest. */
function preview(
  target: number,
  mode: SplitMode,
  people: string[],
  includeMe: boolean,
  myWeight: number,
  weights: Record<string, number>,
  amounts: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {}
  if (mode === "equal") {
    const parts = people.length + (includeMe ? 1 : 0)
    for (const id of people) result[id] = parts ? Math.floor(target / parts) : 0
  } else if (mode === "ratio") {
    const total = people.reduce((sum, id) => sum + (weights[id] || 0), 0) + (includeMe ? myWeight : 0)
    for (const id of people) result[id] = total ? Math.floor((target * (weights[id] || 0)) / total) : 0
  } else {
    for (const id of people) result[id] = amounts[id] ?? 0
  }
  return result
}

export function SplitDialog({
  open,
  onOpenChange,
  targets,
  existing,
  contacts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targets: SplitTarget[]
  existing?: SplitInfo
  contacts: Contact[]
  onSaved: () => void
}) {
  const active = contacts.filter((c) => !c.archived_at)
  const single = targets.length === 1 ? targets[0] : null
  const itemLevel = single ? single.subItemId == null : false

  const [mode, setMode] = useState<SplitMode>(existing?.rule.mode ?? "equal")
  const [people, setPeople] = useState<string[]>(existing?.shares.map((s) => s.contact_id) ?? [])
  const [includeMe, setIncludeMe] = useState(existing?.rule.include_me ?? true)
  const [myWeight, setMyWeight] = useState(Number(existing?.rule.my_weight ?? 1))
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(existing?.shares.map((s) => [s.contact_id, Number(s.weight ?? 1)]) ?? []),
  )
  const [amounts, setAmounts] = useState<Record<string, number>>(
    Object.fromEntries(existing?.shares.map((s) => [s.contact_id, s.fixed_amount ?? s.amount]) ?? []),
  )
  const [recurring, setRecurring] = useState(existing?.rule.recurring ?? false)

  const totalTarget = targets.reduce((sum, t) => sum + t.amount, 0)
  const shares = useMemo(
    () => (single ? preview(single.amount, mode, people, includeMe, myWeight, weights, amounts) : null),
    [single, mode, people, includeMe, myWeight, weights, amounts],
  )
  const mine = single && shares ? single.amount - Object.values(shares).reduce((a, b) => a + b, 0) : null

  const toggle = (id: string, on: boolean) =>
    setPeople((prev) => (on ? [...prev, id] : prev.filter((p) => p !== id)))

  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async () => {
    if (people.length === 0) return { error: "เลือกคนที่จะแบ่งอย่างน้อย 1 คน" }
    const parts = people.map((id) =>
      mode === "ratio"
        ? { contact_id: id, weight: weights[id] || 1 }
        : mode === "fixed"
          ? { contact_id: id, amount: amounts[id] ?? 0 }
          : { contact_id: id },
    )
    const args = {
      p_mode: mode,
      p_parts: parts,
      p_include_me: mode === "fixed" ? true : includeMe,
      p_my_weight: mode === "ratio" && includeMe ? myWeight : undefined,
      p_recurring: itemLevel && recurring,
    }
    try {
      if (single) {
        must(
          await supabase.rpc("set_split", {
            ...args,
            p_item_id: single.itemId,
            // null = item-level rule; the generated type does not model nullable RPC args.
            p_sub_item_id: single.subItemId as string,
          }),
        )
      } else {
        must(
          await supabase.rpc("apply_split", {
            ...args,
            p_targets: targets.map((t) => ({ item_id: t.itemId, sub_item_id: t.subItemId })),
          }),
        )
      }
      onSaved()
      onOpenChange(false)
      return {}
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }, {})

  async function clear() {
    if (!single) return
    must(
      await supabase.rpc("clear_split", { p_item_id: single.itemId, p_sub_item_id: single.subItemId ?? undefined }),
    )
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>แบ่งยอด</DialogTitle>
          <DialogDescription>
            {single ? (
              <>
                {single.label} · <Money satang={single.amount} /> บาท
              </>
            ) : (
              <>
                {targets.length} รายการ · รวม <Money satang={totalTarget} /> บาท (แบ่งทีละรายการ)
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as SplitMode)}>
            <TabsList className="w-full">
              {(Object.keys(MODE_LABELS) as SplitMode[]).map((m) => (
                <TabsTrigger key={m} value={m}>
                  {MODE_LABELS[m]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีผู้ติดต่อ เพิ่มได้ที่เมนู "คน"</p>
          ) : (
            <ul className="grid gap-1 rounded-2xl border p-2">
              {active.map((c) => {
                const on = people.includes(c.id)
                return (
                  <li key={c.id}>
                    <CheckboxField
                      className="min-h-9 rounded-xl px-2 py-1"
                      checked={on}
                      onCheckedChange={(v) => toggle(c.id, v)}
                      label={<ContactChip name={c.name} color={c.color} />}
                    >
                    {on && mode === "ratio" && (
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        value={weights[c.id] ?? 1}
                        onChange={(e) => setWeights({ ...weights, [c.id]: Number(e.target.value) })}
                        className="w-20 text-right"
                        aria-label={`สัดส่วนของ ${c.name}`}
                      />
                    )}
                    {on && mode === "fixed" && (
                      <MoneyInput
                        defaultSatang={amounts[c.id]}
                        onChange={(e) => setAmounts({ ...amounts, [c.id]: parseBaht(e.target.value) ?? 0 })}
                        className="w-28"
                        aria-label={`ยอดของ ${c.name}`}
                      />
                    )}
                    {on && shares && mode !== "fixed" && (
                      <Money satang={shares[c.id]} className="w-24 text-right text-sm" />
                    )}
                    </CheckboxField>
                  </li>
                )
              })}
            </ul>
          )}

          {mode !== "fixed" && (
            <CheckboxField label="นับเราเป็น 1 ส่วนด้วย" checked={includeMe} onCheckedChange={setIncludeMe}>
              {mode === "ratio" && includeMe && (
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={myWeight}
                  onChange={(e) => setMyWeight(Number(e.target.value))}
                  className="w-20 text-right"
                  aria-label="สัดส่วนของเรา"
                />
              )}
            </CheckboxField>
          )}

          {mine != null && (
            <p className="flex justify-between rounded-xl bg-muted px-3 py-2 text-sm">
              <span>ส่วนของเรา (รวมเศษสตางค์)</span>
              <Money satang={mine} className={mine < 0 ? "text-destructive" : ""} />
            </p>
          )}

          {itemLevel && (
            <CheckboxField
              label="แบ่งแบบนี้ทุกเดือน (คัดลอกไปเดือนหน้า)"
              checked={recurring}
              onCheckedChange={setRecurring}
            />
          )}

          <FormError message={state.error} />
          <DialogFooter>
            {existing && single && (
              <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => void clear()}>
                ยกเลิกการแบ่ง
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
