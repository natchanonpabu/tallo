import { Bell, CalendarBlank, CheckCircle, Plus } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"

const chips = [
  { label: "จ่ายแล้ว", className: "bg-success text-success-foreground" },
  { label: "ใกล้ครบกำหนด", className: "bg-warning text-warning-foreground" },
  { label: "เลยกำหนด", className: "bg-danger text-danger-foreground" },
  { label: "รายรับ", className: "bg-info text-info-foreground" },
  { label: "ออม/ลงทุน", className: "bg-savings text-savings-foreground" },
]

// Placeholder screen to preview the pastel theme until real pages exist.
function App() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tallo</h1>
        <Button variant="ghost" size="icon" aria-label="แจ้งเตือน">
          <Bell weight="light" className="size-6" />
        </Button>
      </header>

      <section className="rounded-3xl bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarBlank weight="light" className="size-5" />
          <span>ตุลาคม 2026</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">คงเหลือ (แผน)</p>
        <p className="text-3xl font-bold tabular-nums">35,368.52</p>
        <div className="mt-4 flex items-center gap-2 text-sm text-success-foreground">
          <CheckCircle weight="fill" className="size-5" />
          จัดการแล้ว 12 จาก 18 รายการ
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className={`rounded-full px-3 py-1 text-sm font-medium ${chip.className}`}
          >
            {chip.label}
          </span>
        ))}
      </div>

      <Button size="lg">
        <Plus weight="bold" data-icon="inline-start" />
        สร้างเดือนใหม่
      </Button>
    </main>
  )
}

export default App
