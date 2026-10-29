import { useActionState, useState } from "react"
import { toast } from "sonner"
import { Copy, Link as LinkIcon, Plus } from "@phosphor-icons/react"

import { ContactChip, EmptyState, Field, FormError } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth-context"
import { errorMessage, must } from "@/lib/errors"
import { CONTACT_COLORS } from "@/lib/labels"
import { supabase } from "@/lib/supabase"
import type { Contact } from "@/lib/types"
import { useAsync } from "@/lib/use-async"
import { cn } from "@/lib/utils"

export function PeoplePage() {
  const { profile } = useAuth()
  const [adding, setAdding] = useState(false)
  const [linking, setLinking] = useState<Contact | null>(null)
  const { data: contacts, loading, reload } = useAsync(
    async () => must(await supabase.from("contacts").select("*").order("created_at")),
    [],
  )

  async function copyCode() {
    if (!profile) return
    await navigator.clipboard.writeText(profile.friend_code)
    toast.success("คัดลอกโค้ดแล้ว")
  }

  async function setArchived(contact: Contact, archived: boolean) {
    try {
      must(
        await supabase
          .from("contacts")
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq("id", contact.id),
      )
      reload()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">คน</h1>

      <section className="rounded-3xl bg-secondary p-5 text-secondary-foreground">
        <p className="text-sm">โค้ดของเรา ให้คนอื่นใช้ผูกบัญชี เพื่อส่งยอดหากันได้</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-2xl font-bold tracking-widest">{profile?.friend_code}</span>
          <Button variant="ghost" size="icon-sm" aria-label="คัดลอกโค้ด" onClick={() => void copyCode()}>
            <Copy weight="light" />
          </Button>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">ผู้ติดต่อ</h2>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus weight="bold" data-icon="inline-start" /> เพิ่มคน
        </Button>
      </div>

      {loading && !contacts ? (
        <Skeleton className="h-24 rounded-3xl" />
      ) : contacts?.length === 0 ? (
        <EmptyState>ยังไม่มีผู้ติดต่อ เพิ่มคนที่หารบิลด้วย เช่น P'Ball, Chompoo</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {contacts?.map((c) => (
            <li
              key={c.id}
              className={cn("flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm", c.archived_at && "opacity-60")}
            >
              <ContactChip name={c.name} color={c.color} className="text-sm" />
              <span className="flex-1 text-xs text-muted-foreground">
                {c.linked_user_id ? "ผูกบัญชีแล้ว ส่งยอดในแอปได้" : "ยังไม่ผูกบัญชี"}
              </span>
              {!c.linked_user_id && !c.archived_at && (
                <Button size="sm" variant="secondary" onClick={() => setLinking(c)}>
                  <LinkIcon weight="light" data-icon="inline-start" /> ผูกบัญชี
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void setArchived(c, !c.archived_at)}>
                {c.archived_at ? "กู้คืน" : "เก็บ"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding && <AddContactDialog onClose={() => setAdding(false)} onSaved={reload} />}
      {linking && <LinkContactDialog contact={linking} onClose={() => setLinking(null)} onSaved={reload} />}
    </div>
  )
}

function AddContactDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [color, setColor] = useState(CONTACT_COLORS[0])
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async (_prev, formData) => {
    const name = String(formData.get("name") ?? "").trim()
    if (!name) return { error: "ใส่ชื่อ" }
    try {
      must(await supabase.from("contacts").insert({ name, color }))
      onSaved()
      onClose()
      return {}
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }, {})

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เพิ่มคน</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <Field label="ชื่อที่เราเรียก">
            <Input name="name" required autoFocus placeholder="เช่น P'Ball" />
          </Field>
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">สี</span>
            <div className="flex gap-2">
              {CONTACT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`สี ${c}`}
                  className={cn("size-8 rounded-full ring-offset-2", color === c && "ring-2 ring-ring")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <FormError message={state.error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              เพิ่ม
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LinkContactDialog({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: () => void }) {
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async (_prev, formData) => {
    try {
      must(
        await supabase.rpc("link_contact", {
          p_contact_id: contact.id,
          p_friend_code: String(formData.get("code") ?? ""),
        }),
      )
      toast.success(`ผูกบัญชี ${contact.name} แล้ว`)
      onSaved()
      onClose()
      return {}
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }, {})

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ผูกบัญชี {contact.name}</DialogTitle>
          <DialogDescription>ขอโค้ด 8 ตัวจาก {contact.name} (อยู่ที่เมนู "คน" ของเขา)</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <Input
            name="code"
            required
            autoFocus
            maxLength={8}
            placeholder="เช่น ABCD2345"
            className="text-center font-mono text-lg tracking-widest uppercase"
          />
          <FormError message={state.error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              ผูกบัญชี
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
