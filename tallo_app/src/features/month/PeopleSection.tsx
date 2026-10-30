import { CheckCircle, Circle, PaperPlaneTilt, PencilSimple, Plus, Trash, Warning } from "@phosphor-icons/react"

import { ContactChip, EmptyState, Money } from "@/components/bits"
import { Button } from "@/components/ui/button"
import type { MonthData } from "@/features/month/use-month-data"
import { REQUEST_STATUS_CLASSES, REQUEST_STATUS_LABELS } from "@/lib/labels"
import type { Contact, Offset, PaymentRequest, Settlement } from "@/lib/types"
import { cn } from "@/lib/utils"

export type PeopleActions = {
  onSettle: (contact: Contact, net: number) => void
  onUnsettle: (settlement: Settlement) => void
  onResettle: (settlement: Settlement, net: number) => void
  onAddOffset: (contactId?: string) => void
  onEditOffset: (offset: Offset) => void
  onDeleteOffset: (offset: Offset) => void
  onSend: (contact: Contact) => void
  onConfirmReceived: (request: PaymentRequest) => void
  onCancelRequest: (request: PaymentRequest) => void
}

export function PeopleSection({
  data,
  contactById,
  locked,
  actions,
}: {
  data: MonthData
  contactById: Map<string, Contact>
  locked: boolean
  actions: PeopleActions
}) {
  const itemById = new Map(data.items.map((i) => [i.id, i]))
  const subById = new Map(data.subItems.map((s) => [s.id, s]))
  const ruleById = new Map(data.rules.map((r) => [r.id, r]))

  const people = data.balances
    .map((b) => ({ balance: b, contact: contactById.get(b.contact_id ?? "") }))
    .filter((p): p is { balance: (typeof data.balances)[number]; contact: Contact } => !!p.contact)

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">คน</h2>
        {!locked && (
          <Button size="sm" variant="ghost" onClick={() => actions.onAddOffset()}>
            <Plus weight="bold" data-icon="inline-start" /> หักกลบ
          </Button>
        )}
      </div>

      {people.length === 0 ? (
        <EmptyState>ยังไม่มีใครต้องจ่ายหรือรับเงินในเดือนนี้ ลองกด "แบ่งยอด" ที่รายการ</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {people.map(({ balance, contact }) => {
            const net = balance.net ?? 0
            const shares = data.shares.filter((s) => s.contact_id === contact.id && s.amount > 0)
            const offsets = data.offsets.filter((o) => o.contact_id === contact.id)
            const request = data.requests.find((r) => r.sender_contact_id === contact.id)
            const settlement = data.settlements.find((s) => s.contact_id === contact.id)
            const settledChanged = settlement && settlement.amount !== net
            const changed =
              request && ["sent", "questioned", "accepted"].includes(request.status) && request.total !== net
            const canSend =
              !locked &&
              !settlement &&
              !!contact.linked_user_id &&
              net > 0 &&
              (!request || ["sent", "questioned", "accepted"].includes(request.status))

            return (
              <li key={contact.id} className="rounded-3xl bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {net !== 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          !settlement
                            ? actions.onSettle(contact, net)
                            : settledChanged
                              ? actions.onResettle(settlement, net)
                              : actions.onUnsettle(settlement)
                        }
                        aria-label={settlement ? "ยกเลิกการติ๊ก" : net > 0 ? "ได้รับเงินแล้ว" : "จ่ายคืนแล้ว"}
                        className="text-muted-foreground hover:text-success-foreground"
                      >
                        {settlement ? (
                          <CheckCircle weight="fill" className="size-7 text-success-foreground" />
                        ) : (
                          <Circle weight="light" className="size-7" />
                        )}
                      </button>
                    )}
                    <ContactChip name={contact.name} color={contact.color} className="text-sm" />
                  </div>
                  {request && (
                    <span
                      className={cn("rounded-full px-2 py-0.5 text-xs font-medium", REQUEST_STATUS_CLASSES[request.status])}
                    >
                      {REQUEST_STATUS_LABELS[request.status]}
                    </span>
                  )}
                </div>

                <ul className="mt-3 grid gap-1 text-sm">
                  {shares.map((s) => {
                    const rule = ruleById.get(s.rule_id)
                    const item = rule ? itemById.get(rule.item_id) : undefined
                    const sub = rule?.sub_item_id ? subById.get(rule.sub_item_id) : undefined
                    return (
                      <li key={s.id} className="flex justify-between gap-2">
                        <span className="truncate text-muted-foreground">
                          {item?.name}
                          {sub && ` › ${sub.name}`}
                        </span>
                        <Money satang={s.amount} />
                      </li>
                    )
                  })}
                  {offsets.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-muted-foreground">หักกลบ: {o.name}</span>
                      <span className="flex items-center gap-1">
                        <Money satang={-o.amount} className="text-destructive" />
                        {!locked && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`แก้ไข ${o.name}`}
                            onClick={() => actions.onEditOffset(o)}
                          >
                            <PencilSimple weight="light" />
                          </Button>
                        )}
                        {!locked && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`ลบ ${o.name}`}
                            onClick={() => actions.onDeleteOffset(o)}
                          >
                            <Trash weight="light" />
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                  <li className="mt-1 flex justify-between border-t pt-2 font-semibold">
                    <span>{net >= 0 ? `${contact.name} ต้องจ่ายเรา` : `เราต้องจ่าย ${contact.name}`}</span>
                    <Money satang={Math.abs(net)} />
                  </li>
                </ul>

                {settlement && (
                  <p className="mt-2 rounded-xl bg-success/50 px-3 py-1.5 text-xs text-success-foreground">
                    {settlement.amount >= 0 ? "ได้รับเงินแล้ว" : "จ่ายคืนแล้ว"} <Money satang={Math.abs(settlement.amount)} />{" "}
                    บาท · {new Date(settlement.settled_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                    {settledChanged && " — ยอดเปลี่ยนหลังติ๊ก กดวงกลมเพื่ออัปเดตเป็นยอดใหม่"}
                  </p>
                )}
                {changed && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-warning-foreground">
                    <Warning weight="fill" className="size-3.5" />
                    ยอดเปลี่ยนจากที่ส่งไป (<Money satang={request.total} />) — ส่งใหม่ได้
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {canSend && (
                    <Button size="sm" variant="secondary" onClick={() => actions.onSend(contact)}>
                      <PaperPlaneTilt weight="light" data-icon="inline-start" />
                      {request ? "ส่งยอดใหม่" : "ส่งยอดให้ดูในแอป"}
                    </Button>
                  )}
                  {request?.status === "paid" && (
                    <Button size="sm" onClick={() => actions.onConfirmReceived(request)}>
                      ได้รับเงินแล้ว
                    </Button>
                  )}
                  {request && ["sent", "questioned", "accepted"].includes(request.status) && (
                    <Button size="sm" variant="ghost" onClick={() => actions.onCancelRequest(request)}>
                      ยกเลิกยอด
                    </Button>
                  )}
                  {!locked && (
                    <Button size="sm" variant="secondary" onClick={() => actions.onAddOffset(contact.id)}>
                      <Plus weight="bold" data-icon="inline-start" /> หักกลบ
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
