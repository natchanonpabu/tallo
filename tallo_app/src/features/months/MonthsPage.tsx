import { useState } from "react"
import { Link } from "react-router"
import { CaretRight, Plus, Warning } from "@phosphor-icons/react"

import { EmptyState, Money } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { CreateMonthDialog } from "@/features/months/CreateMonthDialog"
import { must } from "@/lib/errors"
import { monthLabel } from "@/lib/labels"
import { supabase } from "@/lib/supabase"
import { useAsync } from "@/lib/use-async"
import { cn } from "@/lib/utils"

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "ร่าง", className: "bg-muted text-muted-foreground" },
  active: { label: "กำลังดำเนินการ", className: "bg-info text-info-foreground" },
  closed: { label: "ปิดแล้ว", className: "bg-success text-success-foreground" },
}

export function MonthsPage() {
  const [creating, setCreating] = useState(false)
  const { data: months, loading, reload } = useAsync(
    async () =>
      must(
        await supabase
          .from("month_summaries")
          .select("*")
          .order("year", { ascending: false })
          .order("month", { ascending: false }),
      ),
    [],
  )

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">เดือน</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus weight="bold" data-icon="inline-start" />
          สร้างเดือนใหม่
        </Button>
      </div>

      {loading && !months ? (
        <div className="grid gap-3">
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-28 rounded-3xl" />
        </div>
      ) : months?.length === 0 ? (
        <EmptyState>ยังไม่มีเดือน กด "สร้างเดือนใหม่" เพื่อเริ่ม</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {months?.map((m) => {
            const status = STATUS[m.status ?? "draft"]
            const done = m.done_count ?? 0
            const total = m.total_count ?? 0
            return (
              <li key={m.month_id}>
                <Link
                  to={`/months/${m.month_id}`}
                  className="block rounded-3xl bg-card p-5 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold">{monthLabel(m.year ?? 0, m.month ?? 1)}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.className)}>
                        {status.label}
                      </span>
                    </div>
                    <CaretRight weight="light" className="size-5 text-muted-foreground" />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">คงเหลือ</p>
                      <Money
                        satang={m.balance}
                        className={cn("text-2xl font-bold", (m.balance ?? 0) < 0 && "text-destructive")}
                      />
                      {(m.missing_count ?? 0) > 0 && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-warning-foreground">
                          <Warning weight="fill" className="size-3.5" />
                          ยังไม่กรอกยอด {m.missing_count} รายการ
                        </p>
                      )}
                    </div>
                    <div className="w-32 text-right text-xs text-muted-foreground">
                      จัดการแล้ว {done}/{total}
                      <Progress value={total ? (done / total) * 100 : 0} className="mt-1" />
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {creating && (
        <CreateMonthDialog
        open
        onOpenChange={setCreating}
        months={(months ?? []).map((m) => ({ id: m.month_id ?? "", year: m.year ?? 0, month: m.month ?? 1 }))}
        onCreated={reload}
        />
      )}
    </div>
  )
}
