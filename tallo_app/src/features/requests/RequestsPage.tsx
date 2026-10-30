import { useActionState, useEffect, useState } from "react"
import { toast } from "sonner"
import { ChatCircle } from "@phosphor-icons/react"

import { CheckboxField, EmptyState, FormError, Money } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth-context"
import { errorMessage, must } from "@/lib/errors"
import { REQUEST_STATUS_CLASSES, REQUEST_STATUS_LABELS, monthLabel } from "@/lib/labels"
import { supabase } from "@/lib/supabase"
import type { PaymentRequest, RequestEvent, RequestLine } from "@/lib/types"
import { useAsync } from "@/lib/use-async"
import { cn } from "@/lib/utils"

type Loaded = {
  requests: PaymentRequest[]
  lines: RequestLine[]
  events: RequestEvent[]
  names: Record<string, string>
}

async function loadRequests(): Promise<Loaded> {
  const requests = must(
    await supabase.from("payment_requests").select("*").neq("status", "cancelled").order("sent_at", { ascending: false }),
  )
  const ids = requests.map((r) => r.id)
  if (!ids.length) return { requests, lines: [], events: [], names: {} }
  const [lines, events] = await Promise.all([
    supabase.from("request_lines").select("*").in("request_id", ids).order("position").then(must),
    supabase.from("request_events").select("*").in("request_id", ids).order("created_at").then(must),
  ])
  const people = [...new Set(requests.flatMap((r) => [r.sender_id, r.recipient_id]))]
  const profiles = must(await supabase.from("public_profiles").select("id, display_name").in("id", people))
  const names = Object.fromEntries(profiles.map((p) => [p.id ?? "", p.display_name ?? ""]))
  return { requests, lines, events, names }
}

/** total is from the sender's side: + the recipient owes the sender, − the sender owes the recipient. */
function direction(total: number, incoming: boolean, other: string): string {
  if (incoming) return total >= 0 ? `คุณต้องจ่าย ${other}` : `${other} จะจ่ายให้คุณ`
  return total >= 0 ? `${other} ต้องจ่ายเรา` : `เราจะจ่ายให้ ${other}`
}
const ALL_LINES = "all"

export function RequestsPage() {
  const { session } = useAuth()
  const me = session?.user.id
  const [tab, setTab] = useState<"in" | "out">("in")
  const { data, loading, reload } = useAsync(loadRequests, [])

  // Live status changes from the other side.
  useEffect(() => {
    const channel = supabase
      .channel("payment_requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_requests" }, () => reload())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [reload])

  async function act(rpc: () => PromiseLike<{ data: unknown; error: unknown }>, success: string) {
    try {
      must(await rpc())
      toast.success(success)
      reload()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const list = (data?.requests ?? []).filter((r) => (tab === "in" ? r.recipient_id === me : r.sender_id === me))

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-bold">ยอดเรียกเก็บ</h1>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "in" | "out")}>
        <TabsList className="w-full">
          <TabsTrigger value="in">ได้รับ</TabsTrigger>
          <TabsTrigger value="out">ที่ส่งไป</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading && !data ? (
        <Skeleton className="h-40 rounded-3xl" />
      ) : list.length === 0 ? (
        <EmptyState>
          {tab === "in" ? "ยังไม่มีใครส่งยอดมาให้ดู" : "ยังไม่ได้ส่งยอดให้ใคร ส่งได้จากส่วน \"คน\" ในหน้าเดือน"}
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {list.map((r) => {
            const incoming = r.recipient_id === me
            const other = data?.names[incoming ? r.sender_id : r.recipient_id] ?? "?"
            const lines = (data?.lines ?? []).filter((l) => l.request_id === r.id && l.version === r.version)
            const events = (data?.events ?? []).filter((e) => e.request_id === r.id && e.message)
            return (
              <li key={r.id} className="rounded-3xl bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {incoming ? `จาก ${other}` : `ถึง ${other}`} · {monthLabel(r.year, r.month)}
                      {r.version > 1 && ` · แก้ครั้งที่ ${r.version - 1}`}
                    </p>
                    <p className="mt-1 text-sm font-medium">{direction(r.total, incoming, other)}</p>
                    <Money satang={Math.abs(r.total)} className="text-3xl font-bold" />
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", REQUEST_STATUS_CLASSES[r.status])}>
                    {REQUEST_STATUS_LABELS[r.status]}
                  </span>
                </div>

                <ul className="mt-3 grid gap-1 text-sm">
                  {lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span className="truncate text-muted-foreground">
                        {l.kind === "offset" && (incoming ? `หักกลบ (${other} ติดคุณ): ` : "หักกลบ: ")}
                        {l.group_label && `${l.group_label} › `}
                        {l.label}
                      </span>
                      <Money satang={l.amount} className={l.amount < 0 ? "text-destructive" : ""} />
                    </li>
                  ))}
                </ul>

                {events.length > 0 && (
                  <ul className="mt-3 grid gap-2 border-t pt-3">
                    {events.map((e) => (
                      <li key={e.id} className="text-sm">
                        <span className="font-medium">{e.actor_id === me ? "เรา" : other}</span>
                        {e.type === "questioned" && <span className="text-warning-foreground"> ถาม</span>}
                        {e.line_id && (
                          <span className="text-muted-foreground">
                            {" "}
                            เรื่อง {lines.find((l) => l.id === e.line_id)?.label ?? "บรรทัดเดิม"}
                          </span>
                        )}
                        : {e.message}
                      </li>
                    ))}
                  </ul>
                )}

                {!incoming && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void act(() => supabase.rpc("cancel_request", { p_request_id: r.id }), "ยกเลิกการส่งแล้ว")
                      }
                    >
                      ยกเลิกการส่ง
                    </Button>
                  </div>
                )}

                <CommentForm requestId={r.id} lines={lines} canAsk={incoming} onSent={reload} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CommentForm({
  requestId,
  lines,
  canAsk,
  onSent,
}: {
  requestId: string
  lines: RequestLine[]
  canAsk: boolean
  onSent: () => void
}) {
  const [open, setOpen] = useState(false)
  const [lineId, setLineId] = useState(ALL_LINES)
  const [question, setQuestion] = useState(canAsk)

  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(async (_prev, formData) => {
    try {
      must(
        await supabase.rpc("comment_request", {
          p_request_id: requestId,
          p_message: String(formData.get("message") ?? ""),
          p_line_id: lineId === ALL_LINES ? undefined : lineId,
          p_is_question: canAsk && question,
        }),
      )
      setOpen(false)
      onSent()
      return {}
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }, {})

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
        <ChatCircle weight="light" data-icon="inline-start" />
        {canAsk ? "ถาม / คอมเมนต์" : "คอมเมนต์"}
      </Button>
    )
  }

  return (
    <form action={formAction} className="mt-3 grid gap-2">
      <Select value={lineId} onValueChange={setLineId}>
        <SelectTrigger className="w-full" aria-label="เกี่ยวกับบรรทัด">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_LINES}>ทั้งยอด</SelectItem>
          {lines.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.group_label ? `${l.group_label} › ` : ""}
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea name="message" required rows={2} placeholder="พิมพ์ข้อความ" aria-label="ข้อความ" />
      {canAsk && (
        <CheckboxField label='เป็นคำถาม (เปลี่ยนสถานะเป็น "มีคำถาม")' checked={question} onCheckedChange={setQuestion} />
      )}
      <FormError message={state.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          ยกเลิก
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          ส่ง
        </Button>
      </div>
    </form>
  )
}
