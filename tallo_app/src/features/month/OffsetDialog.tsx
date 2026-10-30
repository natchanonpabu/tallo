import { useActionState, useState } from "react"

import { Field, FormError, MoneyInput } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage, must } from "@/lib/errors"
import { parseBaht } from "@/lib/money"
import { supabase } from "@/lib/supabase"
import type { Contact, Offset } from "@/lib/types"

export function OffsetDialog({
  open,
  onOpenChange,
  monthId,
  contacts,
  contactId,
  offset,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  monthId: string
  contacts: Contact[]
  contactId?: string
  offset?: Offset
  onSaved: () => void
}) {
  const active = contacts.filter((c) => !c.archived_at)
  const [who, setWho] = useState(offset?.contact_id ?? contactId ?? active[0]?.id ?? "")

  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async (_prev, formData) => {
    const name = String(formData.get("name") ?? "").trim()
    const amount = parseBaht(String(formData.get("amount") ?? ""))
    if (!who) return { error: "เลือกคน" }
    if (!name) return { error: "ใส่ชื่อรายการ" }
    if (amount == null || amount <= 0) return { error: "ยอดต้องมากกว่า 0" }
    const note = String(formData.get("note") ?? "").trim() || null
    try {
      if (offset) {
        must(await supabase.from("offsets").update({ contact_id: who, name, amount, note }).eq("id", offset.id))
      } else {
        must(await supabase.from("offsets").insert({ month_id: monthId, contact_id: who, name, amount, note }))
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
          <DialogTitle>{offset ? "แก้ไขหักกลบ" : "เพิ่มหักกลบ"}</DialogTitle>
          <DialogDescription>ยอดที่เราติดเขาอยู่แล้ว (เช่น เขาจ่ายแทนเรา) จะถูกหักออกจากยอดที่เขาต้องจ่ายเรา</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <Field label="คน" controlId="offset-contact">
            <Select value={who} onValueChange={setWho}>
              <SelectTrigger id="offset-contact" className="w-full">
                <SelectValue placeholder="เลือกคน" />
              </SelectTrigger>
              <SelectContent>
                {active.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="รายการ">
            <Input name="name" defaultValue={offset?.name} required autoFocus placeholder="เช่น Dad Insurance" />
          </Field>
          <Field label="ยอด (บาท)">
            <MoneyInput name="amount" defaultSatang={offset?.amount} required />
          </Field>
          <Field label="โน้ต">
            <Textarea name="note" defaultValue={offset?.note ?? ""} rows={2} />
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
