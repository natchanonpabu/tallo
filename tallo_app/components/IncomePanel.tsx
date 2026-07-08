"use client";

import { useState } from "react";
import { api, type Income, type Month } from "@/lib/api";
import { formatSatang, parseBaht, satangToBahtInput } from "@/lib/format";
import { StatusPill } from "./StatusPill";

type Apply = (fn: () => Promise<Month>) => void;

const fieldCls =
  "w-full rounded-input border border-hairline bg-bg px-3 py-2 text-ink outline-none focus:border-grape-ink";

function IncomeRow({ income, apply }: { income: Income; apply: Apply }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(income.name);
  const [amount, setAmount] = useState(satangToBahtInput(income.amount));

  if (editing) {
    return (
      <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3 last:border-b-0">
        <div className="grid grid-cols-2 gap-2">
          <input className={fieldCls} value={name} placeholder="ชื่อรายการ" onChange={(e) => setName(e.target.value)} />
          <input className={`${fieldCls} tabular`} value={amount} placeholder="จำนวน (บาท)" inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 text-sm">
          <button className="rounded-input px-3 py-1.5 text-ink-2 hover:bg-hairline" onClick={() => setEditing(false)}>ยกเลิก</button>
          <button
            className="rounded-input bg-grape-fill px-3 py-1.5 font-medium text-grape-ink"
            onClick={() => {
              apply(() => api.updateIncome(income.id, { name, amount: parseBaht(amount) ?? 0 }));
              setEditing(false);
            }}
          >
            บันทึก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1 text-ink truncate-thai">{income.name || "—"}</div>
      <div className="font-semibold text-ink tabular">{formatSatang(income.amount)}</div>
      <StatusPill
        done={income.status === "received"}
        doneLabel="รับแล้ว"
        pendingLabel="รอรับ"
        onToggle={() =>
          apply(() => api.updateIncome(income.id, { status: income.status === "received" ? "pending" : "received" }))
        }
      />
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button title="แก้ไข" className="rounded-md px-2 py-1 text-ink-2 hover:bg-hairline" onClick={() => setEditing(true)}>✎</button>
        <button title="ลบ" className="rounded-md px-2 py-1 text-ink-2 hover:bg-hairline" onClick={() => apply(() => api.deleteIncome(income.id))}>🗑</button>
      </div>
    </div>
  );
}

function AddIncome({ monthId, apply }: { monthId: string; apply: Apply }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  if (!open) {
    return (
      <button className="w-full px-4 py-3 text-left text-sm font-medium text-grape-ink hover:bg-hairline" onClick={() => setOpen(true)}>
        + เพิ่มรายรับ
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-hairline px-4 py-3">
      <div className="grid grid-cols-2 gap-2">
        <input className={fieldCls} value={name} placeholder="ชื่อรายการ" onChange={(e) => setName(e.target.value)} />
        <input className={`${fieldCls} tabular`} value={amount} placeholder="จำนวน (บาท)" inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 text-sm">
        <button className="rounded-input px-3 py-1.5 text-ink-2 hover:bg-hairline" onClick={() => setOpen(false)}>ยกเลิก</button>
        <button
          className="rounded-input bg-grape-fill px-3 py-1.5 font-medium text-grape-ink"
          onClick={() => {
            apply(() => api.createIncome(monthId, { name, amount: parseBaht(amount) ?? 0 }));
            setName(""); setAmount(""); setOpen(false);
          }}
        >
          เพิ่ม
        </button>
      </div>
    </div>
  );
}

export function IncomePanel({ month, apply }: { month: Month; apply: Apply }) {
  return (
    <section className="overflow-hidden rounded-card border border-hairline bg-surface">
      <header className="flex items-center justify-between px-4 py-3">
        <h2 className="font-semibold text-ink">รายรับ</h2>
        <span className="text-sm text-ink-2 tabular">{formatSatang(month.incomes.reduce((s, i) => s + i.amount, 0))}</span>
      </header>
      <div className="border-t border-hairline">
        {month.incomes.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-ink-muted">ยังไม่มีรายรับ</div>
        ) : (
          month.incomes.map((i) => <IncomeRow key={i.id} income={i} apply={apply} />)
        )}
      </div>
      <AddIncome monthId={month.id} apply={apply} />
    </section>
  );
}
