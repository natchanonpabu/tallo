import { useActionState } from "react"

import { DatePicker, Field, FormError, MoneyInput } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage, must } from "@/lib/errors"
import { parseBaht } from "@/lib/money"
import { supabase } from "@/lib/supabase"
import type { Item, SubItem } from "@/lib/types"

export function SubItemDialog({
  open,
  onOpenChange,
  item,
  subItem,
  nextPosition,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Item
  subItem?: SubItem
  nextPosition: number
  onSaved: () => void
}) {
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async (_prev, formData) => {
    const name = String(formData.get("name") ?? "").trim()
    const amount = parseBaht(String(formData.get("amount") ?? ""))
    if (!name) return { error: "ใส่ชื่อรายการย่อย" }
    if (amount == null || amount < 0) return { error: "ยอดเงินไม่ถูกต้อง" }
    const fields = {
      name,
      amount,
      occurred_on: String(formData.get("occurred_on") ?? "") || null,
      note: String(formData.get("note") ?? "").trim() || null,
    }
    try {
      if (subItem) {
        must(await supabase.from("sub_items").update(fields).eq("id", subItem.id))
      } else {
        must(await supabase.from("sub_items").insert({ ...fields, item_id: item.id, position: nextPosition }))
      }
      onSaved()
      onOpenChange(false)
      return {}
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }, {})

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{subItem ? "แก้ไขรายการย่อย" : "เพิ่มรายการย่อย"}</DialogTitle>
          <DialogDescription>ใน {item.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <Field label="ชื่อ">
            <Input name="name" defaultValue={subItem?.name} required autoFocus placeholder="เช่น Food, Fortuner" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ยอด (บาท)">
              <MoneyInput name="amount" defaultSatang={subItem?.amount} required />
            </Field>
            <Field label="วันที่">
              <DatePicker name="occurred_on" defaultValue={subItem?.occurred_on} />
            </Field>
          </div>
          <Field label="โน้ต">
            <Textarea name="note" defaultValue={subItem?.note ?? ""} rows={2} />
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
