import { useActionState, useState } from "react"

import { Field, FormError, MoneyInput } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage, must } from "@/lib/errors"
import { CATEGORY_LABELS, KIND_LABELS } from "@/lib/labels"
import { parseBaht } from "@/lib/money"
import { supabase } from "@/lib/supabase"
import type { DebtAccount, ExpenseCategory, Item, ItemKind } from "@/lib/types"

const NEW_ACCOUNT = "__new__"

export function ItemDialog({
  open,
  onOpenChange,
  monthId,
  kind,
  item,
  accounts,
  usedAccountIds,
  nextPosition,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  monthId: string
  kind: ItemKind
  item?: Item
  accounts: DebtAccount[]
  usedAccountIds: Set<string>
  nextPosition: number
  onSaved: () => void
}) {
  const isDebt = kind === "card" || kind === "loan"
  const available = accounts.filter((a) => a.kind === kind && !a.archived_at && !usedAccountIds.has(a.id))
  const [accountId, setAccountId] = useState<string>(available[0]?.id ?? NEW_ACCOUNT)
  const [category, setCategory] = useState<ExpenseCategory>(item?.category ?? "spending")
  const [recurring, setRecurring] = useState(item?.recurring ?? kind === "income")

  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async (_prev, formData) => {
    const rawAmount = String(formData.get("amount") ?? "").trim()
    const amount = rawAmount === "" ? null : parseBaht(rawAmount)
    if (rawAmount !== "" && amount == null) return { error: "ยอดเงินไม่ถูกต้อง" }
    if (amount != null && amount < 0) return { error: "ยอดเงินต้องไม่ติดลบ" }

    const fields = {
      amount,
      due_date: String(formData.get("due_date") ?? "") || null,
      note: String(formData.get("note") ?? "").trim() || null,
      recurring,
      category: kind === "expense" ? category : null,
    }

    try {
      if (item) {
        const name = String(formData.get("name") ?? "").trim()
        must(await supabase.from("items").update({ ...fields, name }).eq("id", item.id))
      } else {
        let name = String(formData.get("name") ?? "").trim()
        let debtAccountId: string | null = null
        if (isDebt) {
          if (accountId === NEW_ACCOUNT) {
            if (!name) return { error: `ใส่ชื่อ${KIND_LABELS[kind]}` }
            const created = must(
              await supabase
                .from("debt_accounts")
                .insert({ kind, name, installment_amount: kind === "loan" ? amount : null })
                .select()
                .single(),
            )
            debtAccountId = created.id
          } else {
            debtAccountId = accountId
            name = accounts.find((a) => a.id === accountId)?.name ?? name
          }
        }
        if (!name) return { error: "ใส่ชื่อรายการ" }
        must(
          await supabase.from("items").insert({
            ...fields,
            month_id: monthId,
            kind,
            name,
            debt_account_id: debtAccountId,
            position: nextPosition,
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

  const showNameInput = !!item || !isDebt || accountId === NEW_ACCOUNT

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item ? `แก้ไข ${item.name}` : `เพิ่ม${KIND_LABELS[kind]}`}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {!item && isDebt && (
            <Field label={KIND_LABELS[kind]}>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {available.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_ACCOUNT}>+ {KIND_LABELS[kind]}ใหม่</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          {showNameInput && (
            <Field label={isDebt && !item ? `ชื่อ${KIND_LABELS[kind]}ใหม่` : "ชื่อรายการ"}>
              <Input name="name" defaultValue={item?.name} required autoFocus placeholder="เช่น KTC, Shopee" />
            </Field>
          )}

          <Field
            label={kind === "loan" ? "ยอดผ่อนงวดนี้ (บาท)" : "ยอด (บาท)"}
            hint={kind === "card" ? "ปล่อยว่างได้ถ้ายังไม่รู้ยอดบิล" : undefined}
          >
            <MoneyInput name="amount" defaultSatang={item?.amount} />
          </Field>

          {kind === "expense" && (
            <Field label="หมวด">
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {kind !== "income" && (
            <Field label="วันครบกำหนด">
              <Input name="due_date" type="date" defaultValue={item?.due_date ?? ""} />
            </Field>
          )}

          {(kind === "expense" || kind === "income") && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={recurring} onCheckedChange={(v) => setRecurring(v === true)} />
              รายการประจำ (คัดลอกยอดไปเดือนหน้า)
            </label>
          )}

          <Field label="โน้ต">
            <Textarea name="note" defaultValue={item?.note ?? ""} rows={2} />
          </Field>

          <FormError message={state.error} />
          <DialogFooter>
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
