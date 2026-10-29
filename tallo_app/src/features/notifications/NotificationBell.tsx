import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { Bell } from "@phosphor-icons/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAuth } from "@/lib/auth-context"
import { monthLabel } from "@/lib/labels"
import { formatBaht } from "@/lib/money"
import { supabase } from "@/lib/supabase"
import type { Notification } from "@/lib/types"
import { cn } from "@/lib/utils"

type Data = { total?: number; paid_amount?: number; year?: number; month?: number; name?: string; days_left?: number }

function describe(n: Notification, actor: string): string {
  const d = (n.data ?? {}) as Data
  const when = d.year && d.month ? ` (${monthLabel(d.year, d.month)})` : ""
  switch (n.type) {
    case "request_received":
      return `${actor} ส่งยอด ${formatBaht(d.total)} บาท${when}`
    case "request_updated":
      return `${actor} แก้ยอดเป็น ${formatBaht(d.total)} บาท${when}`
    case "request_questioned":
      return `${actor} มีคำถามเกี่ยวกับยอดที่ส่งไป`
    case "request_comment":
      return `${actor} คอมเมนต์ในยอดเรียกเก็บ`
    case "request_accepted":
      return `${actor} ยืนยันยอด ${formatBaht(d.total)} บาทแล้ว`
    case "request_paid":
      return `${actor} จ่ายแล้ว ${formatBaht(d.paid_amount ?? d.total)} บาท`
    case "request_received_confirmed":
      return `${actor} ยืนยันว่าได้รับเงินแล้ว`
    case "request_cancelled":
      return `${actor} ยกเลิกยอดเรียกเก็บ`
    case "due_soon":
      return d.days_left === 0
        ? `${d.name} ครบกำหนดวันนี้`
        : `${d.name} ครบกำหนดในอีก ${d.days_left} วัน`
    default:
      return n.type
  }
}

export function NotificationBell() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<Notification[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const userId = session?.user.id

  const load = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30)
    const list = data ?? []
    setItems(list)
    const actorIds = [...new Set(list.map((n) => n.actor_id).filter((id): id is string => !!id))]
    if (actorIds.length) {
      const { data: profiles } = await supabase.from("public_profiles").select("id, display_name").in("id", actorIds)
      setNames(Object.fromEntries((profiles ?? []).map((p) => [p.id ?? "", p.display_name ?? ""])))
    }
  }, [userId])

  useEffect(() => {
    void load()
    if (!userId) return
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          toast("มีแจ้งเตือนใหม่", { icon: <Bell weight="light" className="size-4" /> })
          void load()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, load])

  const unread = items.filter((n) => !n.read_at).length

  async function markAllRead() {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id)
    if (!ids.length) return
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids)
    void load()
  }

  async function open(n: Notification) {
    if (n.request_id) {
      navigate("/requests")
    } else if (n.item_id) {
      const { data } = await supabase.from("items").select("month_id").eq("id", n.item_id).single()
      navigate(data ? `/months/${data.month_id}` : "/months")
    }
  }

  return (
    <Popover onOpenChange={(isOpen) => !isOpen && void markAllRead()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="แจ้งเตือน" className="relative">
          <Bell weight="light" className="size-6" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-danger-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="px-2 py-1.5 text-sm font-semibold">แจ้งเตือน</p>
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">ยังไม่มีแจ้งเตือน</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void open(n)}
                  className={cn(
                    "w-full rounded-xl px-2 py-2 text-left text-sm hover:bg-muted",
                    !n.read_at && "bg-secondary/60",
                  )}
                >
                  <span className="block">{describe(n, names[n.actor_id ?? ""] ?? "มีคน")}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
