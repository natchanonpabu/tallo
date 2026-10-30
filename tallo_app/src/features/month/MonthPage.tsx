import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { toast } from "sonner"
import {
  ArrowLeft,
  CheckSquare,
  DotsThreeVertical,
  LockSimple,
  LockSimpleOpen,
  Play,
  Plus,
  Trash,
  UsersThree,
  Warning,
  X,
} from "@phosphor-icons/react"

import { EmptyState, Money } from "@/components/bits"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { ItemDialog } from "@/features/month/ItemDialog"
import { ItemRow, type ItemRowActions } from "@/features/month/ItemRow"
import { OffsetDialog } from "@/features/month/OffsetDialog"
import { PeopleSection, type PeopleActions } from "@/features/month/PeopleSection"
import { SplitDialog, type SplitTarget } from "@/features/month/SplitDialog"
import { SubItemDialog } from "@/features/month/SubItemDialog"
import { splitKey, useMonthData } from "@/features/month/use-month-data"
import { useAuth } from "@/lib/auth-context"
import { dueState } from "@/lib/due"
import { errorMessage, must } from "@/lib/errors"
import { monthLabel } from "@/lib/labels"
import { formatBaht } from "@/lib/money"
import { supabase } from "@/lib/supabase"
import type { Item, ItemKind, Offset, SubItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const SECTIONS: { kind: ItemKind; title: string }[] = [
  { kind: "card", title: "บัตรเครดิต" },
  { kind: "loan", title: "สินเชื่อ" },
  { kind: "expense", title: "รายจ่าย" },
  { kind: "income", title: "รายรับ" },
]

type DialogState =
  | { type: "item"; kind: ItemKind; item?: Item }
  | { type: "sub"; item: Item; sub?: SubItem }
  | { type: "split"; targets: SplitTarget[] }
  | { type: "offset"; contactId?: string; offset?: Offset }
  | { type: "confirm"; title: string; description: string; action: () => Promise<void> }
  | null

export function MonthPage() {
  const { monthId = "" } = useParams()
  const navigate = useNavigate()
  const { data, derived, loading, error, reload } = useMonthData(monthId)
  const { profile } = useAuth()
  const remindDays = profile?.due_remind_days ?? 3
  const [dialog, setDialog] = useState<DialogState>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Map<string, SplitTarget>>(new Map())

  async function run(task: () => PromiseLike<unknown>, success?: string) {
    try {
      const result = (await task()) as { error?: unknown } | undefined
      if (result && typeof result === "object" && "error" in result && result.error) throw result.error
      if (success) toast.success(success)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (error) return <EmptyState>{errorMessage(error)}</EmptyState>
  if (!data || !derived) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    )
  }

  const { month, summary } = data
  const locked = month.status === "closed"
  const done = summary?.done_count ?? 0
  const total = summary?.total_count ?? 0
  const balance = summary?.balance ?? 0
  const nextPosition = (data.items.at(-1)?.position ?? 0) + 1
  const dues = data.items.map((i) => dueState(i, remindDays))
  const overdueCount = dues.filter((d) => d?.kind === "overdue").length
  const soonCount = dues.filter((d) => d?.kind === "soon").length

  const itemActions: ItemRowActions = {
    onToggleDone: (item) =>
      void run(() =>
        supabase
          .from("items")
          .update(
            item.status === "done"
              ? { status: "pending", done_at: null }
              : { status: "done", done_at: new Date().toISOString() },
          )
          .eq("id", item.id),
      ),
    onEdit: (item) => setDialog({ type: "item", kind: item.kind, item }),
    onDelete: (item) =>
      setDialog({
        type: "confirm",
        title: `ลบ ${item.name}?`,
        description: "รายการย่อยและการแบ่งยอดของรายการนี้จะถูกลบด้วย",
        action: () => run(() => supabase.from("items").delete().eq("id", item.id), "ลบแล้ว"),
      }),
    onAddSub: (item) => setDialog({ type: "sub", item }),
    onEditSub: (item, sub) => setDialog({ type: "sub", item, sub }),
    onDeleteSub: (sub) => void run(() => supabase.from("sub_items").delete().eq("id", sub.id), "ลบรายการย่อยแล้ว"),
    onSplit: (target) => setDialog({ type: "split", targets: [target] }),
    onSelect: (target, on) =>
      setSelected((prev) => {
        const next = new Map(prev)
        const key = splitKey(target.itemId, target.subItemId)
        if (on) next.set(key, target)
        else next.delete(key)
        return next
      }),
  }

  const peopleActions: PeopleActions = {
    onSettle: (contact, net) =>
      void run(
        () => supabase.from("settlements").insert({ month_id: month.id, contact_id: contact.id, amount: net }),
        net > 0 ? `${contact.name} จ่ายแล้ว` : `จ่ายคืน ${contact.name} แล้ว`,
      ),
    onUnsettle: (settlement) => void run(() => supabase.from("settlements").delete().eq("id", settlement.id)),
    onResettle: (settlement, net) =>
      void run(
        () =>
          supabase
            .from("settlements")
            .update({ amount: net, settled_at: new Date().toISOString() })
            .eq("id", settlement.id),
        "อัปเดตยอดแล้ว",
      ),
    onAddOffset: (contactId) => setDialog({ type: "offset", contactId }),
    onEditOffset: (offset) => setDialog({ type: "offset", offset }),
    onDeleteOffset: (offset) => void run(() => supabase.from("offsets").delete().eq("id", offset.id), "ลบแล้ว"),
    onSend: (contact) =>
      void run(
        () => supabase.rpc("send_request", { p_month_id: month.id, p_contact_id: contact.id }),
        `ส่งยอดให้ ${contact.name} แล้ว`,
      ),
    onCancelRequest: (request) =>
      setDialog({
        type: "confirm",
        title: "ยกเลิกการส่งยอดนี้?",
        description: "อีกฝ่ายจะไม่เห็นยอดนี้แล้ว และได้รับแจ้งเตือนว่ายกเลิก",
        action: () => run(() => supabase.rpc("cancel_request", { p_request_id: request.id }), "ยกเลิกการส่งแล้ว"),
      }),
  }

  async function closeMonth() {
    const doClose = () =>
      run(() => supabase.rpc("set_month_status", { p_month_id: month.id, p_status: "closed" }), "ปิดเดือนแล้ว")
    const unsettled = data!.balances.filter(
      (b) => (b.net ?? 0) !== 0 && !data!.settlements.some((s) => s.contact_id === b.contact_id),
    )
    if (unsettled.length > 0) {
      const names = unsettled.map((b) => derived!.contactById.get(b.contact_id ?? "")?.name).join(", ")
      setDialog({
        type: "confirm",
        title: "ยังมีคนที่ยังไม่ได้ติ๊กว่าเคลียร์แล้ว",
        description: `${names} ยังไม่ได้ติ๊ก ปิดเดือนแล้วยังติ๊กต่อได้ แต่ยอดจะไม่ยกไปเดือนหน้า ปิดเลยไหม?`,
        action: doClose,
      })
    } else {
      await doClose()
    }
  }

  const selectedTargets = [...selected.values()]

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="กลับ">
          <Link to="/months">
            <ArrowLeft weight="light" className="size-5" />
          </Link>
        </Button>
        <h1 className="flex-1 text-2xl font-bold">{monthLabel(month.year, month.month)}</h1>
        {locked && (
          <span className="flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-xs text-success-foreground">
            <LockSimple weight="fill" className="size-3.5" /> ปิดแล้ว
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="ตัวเลือกเดือน">
              <DotsThreeVertical weight="bold" className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {month.status === "draft" && (
              <DropdownMenuItem
                onSelect={() =>
                  void run(() => supabase.rpc("set_month_status", { p_month_id: month.id, p_status: "active" }))
                }
              >
                <Play weight="light" /> เริ่มเดือนนี้
              </DropdownMenuItem>
            )}
            {locked ? (
              <DropdownMenuItem
                onSelect={() =>
                  void run(
                    () => supabase.rpc("set_month_status", { p_month_id: month.id, p_status: "active" }),
                    "เปิดเดือนแล้ว",
                  )
                }
              >
                <LockSimpleOpen weight="light" /> เปิดเดือนอีกครั้ง
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => void closeMonth()}>
                <LockSimple weight="light" /> ปิดเดือน
              </DropdownMenuItem>
            )}
            {!locked && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() =>
                    setDialog({
                      type: "confirm",
                      title: `ลบ${monthLabel(month.year, month.month)}?`,
                      description: "ทุกรายการ การแบ่งยอด และยอดเรียกเก็บของเดือนนี้จะถูกลบ",
                      action: async () => {
                        try {
                          must(await supabase.from("months").delete().eq("id", month.id))
                          navigate("/months")
                        } catch (err) {
                          toast.error(errorMessage(err))
                        }
                      },
                    })
                  }
                >
                  <Trash weight="light" /> ลบเดือน
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Summary */}
      <section className={cn("rounded-3xl bg-card p-5 shadow-sm", loading && "opacity-70")}>
        <p className="text-sm text-muted-foreground">คงเหลือ</p>
        <p className={cn("text-4xl font-bold tabular-nums", balance < 0 && "text-destructive")}>
          {formatBaht(balance)}
        </p>
        {(overdueCount > 0 || soonCount > 0) && (
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
            <Warning weight="fill" className="size-4 text-danger-foreground" />
            {overdueCount > 0 && (
              <span className="rounded-full bg-danger px-2 text-danger-foreground">เลยกำหนด {overdueCount} รายการ</span>
            )}
            {soonCount > 0 && (
              <span className="rounded-full bg-warning px-2 text-warning-foreground">
                ใกล้ครบกำหนด {soonCount} รายการ
              </span>
            )}
          </p>
        )}
        {(summary?.missing_count ?? 0) > 0 && (
          <p className="mt-1 flex items-center gap-1 text-sm text-warning-foreground">
            <Warning weight="fill" className="size-4" />
            ยังไม่รวม {summary?.missing_count} รายการที่ยังไม่กรอกยอด
          </p>
        )}
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-2xl bg-info/50 p-3">
            <dt className="text-xs text-info-foreground">รายรับ</dt>
            <dd>
              <Money satang={summary?.income_own} className="font-semibold" />
            </dd>
          </div>
          <div className="rounded-2xl bg-success/50 p-3">
            <dt className="text-xs text-success-foreground">ได้จากคน</dt>
            <dd>
              <Money satang={summary?.from_people} className="font-semibold" />
            </dd>
          </div>
          <div className="rounded-2xl bg-danger/40 p-3">
            <dt className="text-xs text-danger-foreground">รายจ่าย</dt>
            <dd>
              <Money satang={(summary?.expense_total ?? 0) + (summary?.to_people ?? 0)} className="font-semibold" />
            </dd>
          </div>
        </dl>
        <div className="mt-4 grid gap-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>คงเหลือจริง (นับเฉพาะที่จ่าย/ได้รับแล้ว)</span>
            <Money satang={summary?.balance_actual} />
          </div>
          {(summary?.savings_total ?? 0) > 0 && (
            <div className="flex justify-between text-savings-foreground">
              <span>ในนี้เป็นเงินออม/ลงทุน</span>
              <Money satang={summary?.savings_total} />
            </div>
          )}
          <div className="mt-2 flex items-center gap-3">
            <Progress value={total ? (done / total) * 100 : 0} className="flex-1" />
            <span className="text-xs text-muted-foreground">
              จัดการแล้ว {done}/{total}
            </span>
          </div>
        </div>
      </section>

      {/* Bulk split toggle */}
      {!locked && (
        <div className="-mb-3 flex justify-end">
          <Button
            size="sm"
            variant={selecting ? "secondary" : "ghost"}
            onClick={() => {
              setSelecting(!selecting)
              setSelected(new Map())
            }}
          >
            {selecting ? <X weight="bold" data-icon="inline-start" /> : <CheckSquare weight="light" data-icon="inline-start" />}
            {selecting ? "เลิกเลือก" : "เลือกหลายรายการเพื่อแบ่งยอด"}
          </Button>
        </div>
      )}

      {/* Items */}
      {SECTIONS.map(({ kind, title }) => {
        const items = data.items.filter((i) => i.kind === kind)
        const sum = items.reduce((s, i) => s + (i.amount ?? 0), 0)
        return (
          <section key={kind} className="grid gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {title} <Money satang={sum} className="ml-1 text-sm font-normal text-muted-foreground" />
              </h2>
              {!locked && (
                <Button size="sm" variant="ghost" onClick={() => setDialog({ type: "item", kind })}>
                  <Plus weight="bold" data-icon="inline-start" /> เพิ่ม
                </Button>
              )}
            </div>
            {items.length === 0 ? (
              <EmptyState>ยังไม่มี{title}</EmptyState>
            ) : (
              <ul className="grid gap-2">
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    subs={derived.subsByItem.get(item.id) ?? []}
                    splits={derived.splits}
                    contactById={derived.contactById}
                    unallocated={derived.unallocated(item)}
                    locked={locked}
                    due={dueState(item, remindDays)}
                    selecting={selecting}
                    selected={new Set(selected.keys())}
                    actions={itemActions}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}

      <PeopleSection data={data} contactById={derived.contactById} locked={locked} actions={peopleActions} />

      {/* Floating bar for bulk split */}
      {selecting && selectedTargets.length > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-10 flex justify-center px-4">
          <Button size="lg" className="shadow-lg" onClick={() => setDialog({ type: "split", targets: selectedTargets })}>
            <UsersThree weight="light" data-icon="inline-start" />
            แบ่งยอด {selectedTargets.length} รายการ (
            {formatBaht(selectedTargets.reduce((s, t) => s + t.amount, 0))})
          </Button>
        </div>
      )}

      {/* Dialogs */}
      {dialog?.type === "item" && (
        <ItemDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          monthId={month.id}
          kind={dialog.kind}
          item={dialog.item}
          accounts={data.accounts}
          usedAccountIds={new Set(data.items.map((i) => i.debt_account_id).filter((id): id is string => !!id))}
          nextPosition={nextPosition}
          onSaved={reload}
        />
      )}
      {dialog?.type === "sub" && (
        <SubItemDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          item={dialog.item}
          subItem={dialog.sub}
          nextPosition={(derived.subsByItem.get(dialog.item.id)?.at(-1)?.position ?? 0) + 1}
          onSaved={reload}
        />
      )}
      {dialog?.type === "split" && (
        <SplitDialog
          open
          onOpenChange={(o) => {
            if (o) return
            setDialog(null)
          }}
          targets={dialog.targets}
          existing={
            dialog.targets.length === 1
              ? derived.splits.get(splitKey(dialog.targets[0].itemId, dialog.targets[0].subItemId))
              : undefined
          }
          contacts={data.contacts}
          onSaved={() => {
            setSelecting(false)
            setSelected(new Map())
            reload()
          }}
        />
      )}
      {dialog?.type === "offset" && (
        <OffsetDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          monthId={month.id}
          contacts={data.contacts}
          contactId={dialog.contactId}
          offset={dialog.offset}
          onSaved={reload}
        />
      )}
      {dialog?.type === "confirm" && (
        <AlertDialog open onOpenChange={(o) => !o && setDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
              <AlertDialogDescription>{dialog.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction onClick={() => void dialog.action()}>ยืนยัน</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
