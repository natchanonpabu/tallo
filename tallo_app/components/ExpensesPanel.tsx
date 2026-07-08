"use client";

import { useState } from "react";
import { api, type Expense, type Month } from "@/lib/api";
import { formatSatang, parseBaht, satangToBahtInput } from "@/lib/format";
import { StatusPill } from "./StatusPill";

type Apply = (fn: () => Promise<Month>) => void;

const fieldCls =
  "w-full rounded-input border border-hairline bg-bg px-3 py-2 text-ink outline-none focus:border-grape-ink";

function ExpenseRow({
  expense,
  apply,
  onSplit,
}: {
  expense: Expense;
  apply: Apply;
  onSplit: (e: Expense) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [group, setGroup] = useState(expense.group);
  const [name, setName] = useState(expense.name);
  const [minimum, setMinimum] = useState(satangToBahtInput(expense.minimum));
  const [custom, setCustom] = useState(satangToBahtInput(expense.custom));

  function save() {
    apply(() =>
      api.updateExpense(expense.id, {
        group,
        name,
        minimum: parseBaht(minimum) ?? 0,
        custom: parseBaht(custom) ?? 0,
      }),
    );
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3 last:border-b-0">
        <div className="grid grid-cols-2 gap-2">
          <input className={fieldCls} value={group} placeholder="กลุ่ม" onChange={(e) => setGroup(e.target.value)} />
          <input className={fieldCls} value={name} placeholder="ชื่อรายการ" onChange={(e) => setName(e.target.value)} />
          <input className={`${fieldCls} tabular`} value={minimum} placeholder="ขั้นต่ำ" inputMode="decimal" onChange={(e) => setMinimum(e.target.value)} />
          <input className={`${fieldCls} tabular`} value={custom} placeholder="จ่ายจริง" inputMode="decimal" onChange={(e) => setCustom(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 text-sm">
          <button className="rounded-input px-3 py-1.5 text-ink-2 hover:bg-hairline" onClick={() => setEditing(false)}>ยกเลิก</button>
          <button className="rounded-input bg-grape-fill px-3 py-1.5 font-medium text-grape-ink" onClick={save}>บันทึก</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        {expense.group && <div className="text-xs text-ink-muted truncate-thai">{expense.group}</div>}
        <div className="text-ink truncate-thai">{expense.name || "—"}</div>
        {expense.minimum > 0 && (
          <div className="text-xs text-ink-muted tabular">ขั้นต่ำ {formatSatang(expense.minimum)}</div>
        )}
      </div>
      <div className="text-right">
        <div className="font-semibold text-ink tabular">{formatSatang(expense.custom)}</div>
      </div>
      <StatusPill
        done={expense.status === "paid"}
        doneLabel="จ่ายแล้ว"
        pendingLabel="รอจ่าย"
        onToggle={() =>
          apply(() => api.updateExpense(expense.id, { status: expense.status === "paid" ? "pending" : "paid" }))
        }
      />
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button title="แยกบิล" className="rounded-md px-2 py-1 text-ink-2 hover:bg-hairline" onClick={() => onSplit(expense)}>⑃</button>
        <button title="แก้ไข" className="rounded-md px-2 py-1 text-ink-2 hover:bg-hairline" onClick={() => setEditing(true)}>✎</button>
        <button title="ลบ" className="rounded-md px-2 py-1 text-ink-2 hover:bg-hairline" onClick={() => apply(() => api.deleteExpense(expense.id))}>🗑</button>
      </div>
    </div>
  );
}

function AddExpense({ monthId, apply }: { monthId: string; apply: Apply }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState("");
  const [name, setName] = useState("");
  const [custom, setCustom] = useState("");

  if (!open) {
    return (
      <button className="w-full px-4 py-3 text-left text-sm font-medium text-grape-ink hover:bg-hairline" onClick={() => setOpen(true)}>
        + เพิ่มรายจ่าย
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-hairline px-4 py-3">
      <div className="grid grid-cols-3 gap-2">
        <input className={fieldCls} value={group} placeholder="กลุ่ม" onChange={(e) => setGroup(e.target.value)} />
        <input className={fieldCls} value={name} placeholder="ชื่อรายการ" onChange={(e) => setName(e.target.value)} />
        <input className={`${fieldCls} tabular`} value={custom} placeholder="จ่ายจริง (บาท)" inputMode="decimal" onChange={(e) => setCustom(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 text-sm">
        <button className="rounded-input px-3 py-1.5 text-ink-2 hover:bg-hairline" onClick={() => setOpen(false)}>ยกเลิก</button>
        <button
          className="rounded-input bg-grape-fill px-3 py-1.5 font-medium text-grape-ink"
          onClick={() => {
            apply(() => api.createExpense(monthId, { group, name, custom: parseBaht(custom) ?? 0 }));
            setGroup(""); setName(""); setCustom(""); setOpen(false);
          }}
        >
          เพิ่ม
        </button>
      </div>
    </div>
  );
}

export function ExpensesPanel({
  month,
  apply,
  onSplit,
}: {
  month: Month;
  apply: Apply;
  onSplit: (e: Expense) => void;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-hairline bg-surface">
      <header className="flex items-center justify-between px-4 py-3">
        <h2 className="font-semibold text-ink">รายจ่าย</h2>
        <span className="text-sm text-ink-2 tabular">{formatSatang(month.expenses.reduce((s, e) => s + e.custom, 0))}</span>
      </header>
      <div className="border-t border-hairline">
        {month.expenses.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-ink-muted">ยังไม่มีรายจ่าย</div>
        ) : (
          month.expenses.map((e) => <ExpenseRow key={e.id} expense={e} apply={apply} onSplit={onSplit} />)
        )}
      </div>
      <AddExpense monthId={month.id} apply={apply} />
    </section>
  );
}
