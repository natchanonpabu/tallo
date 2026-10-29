import { useState } from "react"
import {
  CaretDown,
  CheckCircle,
  Circle,
  DotsThreeVertical,
  PencilSimple,
  Plus,
  Repeat,
  Trash,
  UsersThree,
  Warning,
} from "@phosphor-icons/react"

import { ContactChip, Money } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { SplitTarget } from "@/features/month/SplitDialog"
import { splitKey, type SplitInfo } from "@/features/month/use-month-data"
import { CATEGORY_LABELS } from "@/lib/labels"
import type { Contact, Item, SubItem } from "@/lib/types"
import { cn } from "@/lib/utils"

export type ItemRowActions = {
  onToggleDone: (item: Item) => void
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
  onAddSub: (item: Item) => void
  onEditSub: (item: Item, sub: SubItem) => void
  onDeleteSub: (sub: SubItem) => void
  onSplit: (target: SplitTarget) => void
  onSelect: (target: SplitTarget, on: boolean) => void
}

function SplitChips({ split, contactById }: { split?: SplitInfo; contactById: Map<string, Contact> }) {
  if (!split) return null
  return (
    <span className="flex flex-wrap gap-1">
      {split.shares.map((s) => {
        const c = contactById.get(s.contact_id)
        return c ? <ContactChip key={s.id} name={c.name} color={c.color} amount={s.amount} /> : null
      })}
    </span>
  )
}

export function ItemRow({
  item,
  subs,
  splits,
  contactById,
  unallocated,
  locked,
  selecting,
  selected,
  actions,
}: {
  item: Item
  subs: SubItem[]
  splits: Map<string, SplitInfo>
  contactById: Map<string, Contact>
  unallocated: number
  locked: boolean
  selecting: boolean
  selected: Set<string>
  actions: ItemRowActions
}) {
  const [open, setOpen] = useState(false)
  const done = item.status === "done"
  const splittable = item.kind !== "income"
  const itemSplit = splits.get(splitKey(item.id, null))
  const itemTarget: SplitTarget = {
    itemId: item.id,
    subItemId: null,
    label: subs.length ? `${item.name} (ส่วนที่ยังไม่แจกแจง)` : item.name,
    amount: Math.max(0, subs.length ? unallocated : (item.amount ?? 0)),
  }

  return (
    <li className={cn("rounded-2xl bg-card shadow-sm", done && "opacity-75")}>
      <div className="flex items-center gap-2 p-3">
        {selecting && splittable ? (
          <Checkbox
            checked={selected.has(splitKey(item.id, null))}
            onCheckedChange={(v) => actions.onSelect(itemTarget, v === true)}
            aria-label={`เลือก ${item.name}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => actions.onToggleDone(item)}
            aria-label={done ? "ทำเครื่องหมายว่ายังไม่เสร็จ" : "ทำเครื่องหมายว่าเสร็จแล้ว"}
            className="text-muted-foreground hover:text-success-foreground"
          >
            {done ? (
              <CheckCircle weight="fill" className="size-7 text-success-foreground" />
            ) : (
              <Circle weight="light" className="size-7" />
            )}
          </button>
        )}

        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 flex-col text-left">
          <span className="flex items-center gap-1.5">
            <span className={cn("truncate font-medium", done && "line-through decoration-1")}>{item.name}</span>
            {item.recurring && <Repeat weight="light" className="size-3.5 shrink-0 text-muted-foreground" />}
            {subs.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{subs.length}</span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {item.category && item.category !== "spending" && <span>{CATEGORY_LABELS[item.category]}</span>}
            {item.due_date && (
              <span>ครบ {new Date(item.due_date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span>
            )}
            <SplitChips split={itemSplit} contactById={contactById} />
            {subs.some((s) => splits.has(splitKey(item.id, s.id))) && (
              <span className="inline-flex items-center gap-0.5">
                <UsersThree weight="light" className="size-3.5" />
                แบ่งในรายการย่อย
              </span>
            )}
          </span>
        </button>

        <div className="text-right">
          {item.amount == null ? (
            <span className="rounded-full bg-warning px-2 py-0.5 text-xs text-warning-foreground">ยังไม่กรอก</span>
          ) : (
            <Money satang={item.amount} className="font-semibold" />
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "ย่อ" : "ขยาย"}
          className="text-muted-foreground"
        >
          <CaretDown weight="light" className={cn("size-4 transition", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="grid gap-2 border-t px-3 pt-2 pb-3">
          {item.note && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{item.note}</p>}

          {subs.length > 0 && (
            <ul className="grid gap-1">
              {subs.map((s) => {
                const target: SplitTarget = { itemId: item.id, subItemId: s.id, label: `${item.name} › ${s.name}`, amount: s.amount }
                return (
                  <li key={s.id} className="flex items-center gap-2 rounded-xl bg-muted/60 px-2 py-1.5 text-sm">
                    {selecting && (
                      <Checkbox
                        checked={selected.has(splitKey(item.id, s.id))}
                        onCheckedChange={(v) => actions.onSelect(target, v === true)}
                        aria-label={`เลือก ${s.name}`}
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{s.name}</span>
                      <SplitChips split={splits.get(splitKey(item.id, s.id))} contactById={contactById} />
                    </span>
                    <Money satang={s.amount} />
                    {!locked && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs" aria-label={`ตัวเลือกของ ${s.name}`}>
                            <DotsThreeVertical weight="bold" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => actions.onSplit(target)}>
                            <UsersThree weight="light" /> แบ่งยอด
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => actions.onEditSub(item, s)}>
                            <PencilSimple weight="light" /> แก้ไข
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => actions.onDeleteSub(s)}>
                            <Trash weight="light" /> ลบ
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                )
              })}
              <li
                className={cn(
                  "flex justify-between px-2 text-xs",
                  unallocated < 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {unallocated < 0 && <Warning weight="fill" className="size-3.5" />}
                  {unallocated < 0 ? "รายการย่อยรวมเกินยอด" : "ยังไม่แจกแจง"}
                </span>
                <Money satang={unallocated} />
              </li>
            </ul>
          )}

          {!locked && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => actions.onAddSub(item)}>
                <Plus weight="bold" data-icon="inline-start" /> รายการย่อย
              </Button>
              {splittable && (
                <Button size="sm" variant="secondary" onClick={() => actions.onSplit(itemTarget)}>
                  <UsersThree weight="light" data-icon="inline-start" />
                  {itemSplit ? "แก้การแบ่ง" : subs.length ? "แบ่งส่วนที่เหลือ" : "แบ่งยอด"}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" aria-label={`ตัวเลือกของ ${item.name}`}>
                    <DotsThreeVertical weight="bold" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => actions.onEdit(item)}>
                    <PencilSimple weight="light" /> แก้ไข
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(item)}>
                    <Trash weight="light" /> ลบรายการ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
