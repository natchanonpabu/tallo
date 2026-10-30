import { useActionState, useState } from "react"
import { toast } from "sonner"
import { CheckCircle, Copy, LinkBreak, PencilSimple, Plus } from "@phosphor-icons/react"

import { ContactChip, EmptyState, Field, FormError } from "@/components/bits"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { errorMessage, must } from "@/lib/errors"
import { CONTACT_COLORS } from "@/lib/labels"
import { supabase } from "@/lib/supabase"
import type { Contact } from "@/lib/types"
import { useAsync } from "@/lib/use-async"
import { cn } from "@/lib/utils"

type Loaded = { contacts: Contact[]; linkedNames: Record<string, string> }

async function loadContacts(): Promise<Loaded> {
  const contacts = must(await supabase.from("contacts").select("*").order("created_at"))
  const linkedIds = contacts.map((c) => c.linked_user_id).filter((id): id is string => !!id)
  const profiles = linkedIds.length
    ? must(await supabase.from("public_profiles").select("id, display_name").in("id", linkedIds))
    : []
  return { contacts, linkedNames: Object.fromEntries(profiles.map((p) => [p.id ?? "", p.display_name ?? ""])) }
}

export function PeoplePage() {
  const [editing, setEditing] = useState<Contact | "new" | null>(null)
  const { data, loading, reload } = useAsync(loadContacts, [])
  const contacts = data?.contacts ?? []

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">คน</h1>

      <JoinWithCode contacts={contacts} onJoined={reload} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">รายชื่อของเรา</h2>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus weight="bold" data-icon="inline-start" /> เพิ่มคน
        </Button>
      </div>

      {loading && !data ? (
        <Skeleton className="h-24 rounded-3xl" />
      ) : contacts.length === 0 ? (
        <EmptyState>ยังไม่มีรายชื่อ เพิ่มคนที่หารบิลด้วย เช่น P'Ball, Chompoo</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {contacts.map((c) => {
            const linkedName = c.linked_user_id ? data?.linkedNames[c.linked_user_id] : null
            return (
              <li
                key={c.id}
                className={cn("flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm", c.archived_at && "opacity-60")}
              >
                <ContactChip name={c.name} color={c.color} className="text-sm" />
                <span className="flex flex-1 items-center gap-1 text-xs text-muted-foreground">
                  {c.linked_user_id ? (
                    <>
                      <CheckCircle weight="fill" className="size-4 text-success-foreground" />
                      ผูกกับบัญชี <span className="font-medium text-foreground">{linkedName ?? "…"}</span>
                    </>
                  ) : c.archived_at ? (
                    "เก็บแล้ว"
                  ) : (
                    "ยังไม่ผูกบัญชี"
                  )}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                  <PencilSimple weight="light" data-icon="inline-start" /> แก้ไข
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <ContactDialog
          contact={editing === "new" ? undefined : editing}
          linkedName={editing !== "new" && editing.linked_user_id ? data?.linkedNames[editing.linked_user_id] : undefined}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}

const NEW_CONTACT = "__new__"

/** The invited side: enter the code someone sent us. */
function JoinWithCode({ contacts, onJoined }: { contacts: Contact[]; onJoined: () => void }) {
  const unlinked = contacts.filter((c) => !c.linked_user_id && !c.archived_at)
  const [asContact, setAsContact] = useState(NEW_CONTACT)

  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async (_prev, formData) => {
    try {
      const mine = must(
        await supabase.rpc("accept_contact_invite", {
          p_code: String(formData.get("code") ?? ""),
          p_my_contact_id: asContact === NEW_CONTACT ? undefined : asContact,
        }),
      )
      toast.success(`ผูกบัญชีกับ ${mine.name} แล้ว`)
      setAsContact(NEW_CONTACT)
      onJoined()
      return {}
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }, {})

  return (
    <section className="rounded-3xl bg-secondary p-5 text-secondary-foreground">
      <p className="font-semibold">มีโค้ดจากเพื่อนไหม?</p>
      <p className="text-sm">ใส่โค้ด 8 ตัวที่เพื่อนส่งมา เพื่อผูกบัญชีกัน แล้วจะส่งยอดให้กันดูในแอปได้</p>
      <form action={formAction} className="mt-3 grid gap-3">
        <div className="flex gap-2">
          <Input
            name="code"
            required
            maxLength={8}
            placeholder="ABCD2345"
            aria-label="โค้ดจากเพื่อน"
            className="bg-card text-center font-mono tracking-widest uppercase"
          />
          <Button type="submit" disabled={pending}>
            ผูกบัญชี
          </Button>
        </div>
        {unlinked.length > 0 && (
          <Field label="คนนี้คือใครในรายชื่อของเรา" controlId="join-as">
            <Select value={asContact} onValueChange={setAsContact}>
              <SelectTrigger id="join-as" className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_CONTACT}>เพิ่มเป็นคนใหม่</SelectItem>
                {unlinked.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <FormError message={state.error} />
      </form>
    </section>
  )
}

function ContactDialog({
  contact,
  linkedName,
  onClose,
  onSaved,
}: {
  contact?: Contact
  linkedName?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [color, setColor] = useState(contact?.color ?? CONTACT_COLORS[0])
  const [inviteCode, setInviteCode] = useState<string | null>(contact?.invite_code ?? null)
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async (_prev, formData) => {
    const name = String(formData.get("name") ?? "").trim()
    if (!name) return { error: "ใส่ชื่อ" }
    try {
      if (contact) {
        must(await supabase.from("contacts").update({ name, color }).eq("id", contact.id))
      } else {
        must(await supabase.from("contacts").insert({ name, color }))
      }
      onSaved()
      onClose()
      return {}
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }, {})

  async function act(task: () => PromiseLike<{ data: unknown; error: unknown }>, success?: string) {
    try {
      const result = must(await task())
      if (success) toast.success(success)
      onSaved()
      return result
    } catch (error) {
      toast.error(errorMessage(error))
      return null
    }
  }

  async function createCode() {
    if (!contact) return
    const code = await act(() => supabase.rpc("contact_invite_code", { p_contact_id: contact.id }))
    if (typeof code === "string") setInviteCode(code)
  }

  async function copyCode() {
    if (!inviteCode) return
    await navigator.clipboard.writeText(inviteCode)
    toast.success("คัดลอกโค้ดแล้ว")
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{contact ? `แก้ไข ${contact.name}` : "เพิ่มคน"}</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="grid gap-4">
            <Field label="ชื่อที่เราเรียก">
              <Input name="name" defaultValue={contact?.name} required autoFocus placeholder="เช่น P'Ball" />
            </Field>
            <div className="grid gap-2 text-sm">
              <span className="font-medium">สี</span>
              <ToggleGroup type="single" value={color} onValueChange={(v) => v && setColor(v)} className="justify-start">
                {CONTACT_COLORS.map((c) => (
                  <ToggleGroupItem
                    key={c}
                    value={c}
                    aria-label={`สี ${c}`}
                    className="size-9 rounded-full p-0 data-[state=on]:ring-2 data-[state=on]:ring-ring data-[state=on]:ring-offset-2"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </ToggleGroup>
            </div>
            <FormError message={state.error} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                บันทึก
              </Button>
            </DialogFooter>
          </form>

          {contact && (
            <>
              <Separator />
              <section className="grid gap-2 text-sm">
                <p className="font-medium">การผูกบัญชี</p>
                {contact.linked_user_id ? (
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-success/40 p-3">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle weight="fill" className="size-4 text-success-foreground" />
                      ผูกกับบัญชี <span className="font-semibold">{linkedName ?? "…"}</span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmUnlink(true)}>
                      <LinkBreak weight="light" data-icon="inline-start" /> ยกเลิกการผูก
                    </Button>
                  </div>
                ) : inviteCode ? (
                  <div className="grid gap-2 rounded-2xl bg-secondary p-3 text-secondary-foreground">
                    <p>ส่งโค้ดนี้ให้ {contact.name} ไปใส่ในแอปของเขา ที่หน้า "คน" → "มีโค้ดจากเพื่อนไหม?"</p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-2xl font-bold tracking-widest">{inviteCode}</span>
                      <Button variant="ghost" size="icon-sm" aria-label="คัดลอกโค้ด" onClick={() => void copyCode()}>
                        <Copy weight="light" />
                      </Button>
                    </div>
                    <p className="text-xs">ใช้ได้ครั้งเดียว ผูกเสร็จแล้วจะเห็นชื่อบัญชีของเขาตรงนี้</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-muted p-3">
                    <span className="text-muted-foreground">ยังไม่ผูกบัญชี</span>
                    <Button size="sm" variant="secondary" onClick={() => void createCode()}>
                      สร้างโค้ดผูกบัญชี
                    </Button>
                  </div>
                )}
              </section>

              <Button
                variant="ghost"
                className="justify-self-start text-muted-foreground"
                onClick={async () => {
                  await act(
                    () =>
                      supabase
                        .from("contacts")
                        .update({ archived_at: contact.archived_at ? null : new Date().toISOString() })
                        .eq("id", contact.id),
                    contact.archived_at ? "กู้คืนแล้ว" : "เก็บแล้ว",
                  )
                  onClose()
                }}
              >
                {contact.archived_at ? "กู้คืนคนนี้" : "เก็บคนนี้ (ซ่อนจากการแบ่งยอด)"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {contact && confirmUnlink && (
        <AlertDialog open onOpenChange={setConfirmUnlink}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ยกเลิกการผูกกับ {linkedName}?</AlertDialogTitle>
              <AlertDialogDescription>
                {contact.name} จะกลับเป็นรายชื่อที่ไม่ได้ผูกบัญชี ส่งยอดให้ดูในแอปไม่ได้จนกว่าจะผูกใหม่ ข้อมูลการแบ่งยอดยังอยู่ครบ
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ไม่ใช่</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  await act(() => supabase.rpc("unlink_contact", { p_contact_id: contact.id }), "ยกเลิกการผูกแล้ว")
                  onClose()
                }}
              >
                ยกเลิกการผูก
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
