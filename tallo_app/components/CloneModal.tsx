"use client";

import { useState } from "react";
import { ApiError, api, type Month } from "@/lib/api";
import { formatSatang } from "@/lib/format";
import { Modal } from "./Modal";

const fieldCls =
  "w-full rounded-input border border-hairline bg-bg px-3 py-2 text-ink outline-none focus:border-grape-ink";

/**
 * New-cycle (clone) modal: two checklists (expenses, direct incomes) to carry
 * forward, a label for the new month, and a visible note that people/ledgers
 * never carry over (business.md #10, frontend-design.md #6).
 */
export function CloneModal({
  month,
  onClose,
  onApplied,
}: {
  month: Month;
  onClose: () => void;
  onApplied: (m: Month) => void;
}) {
  const [label, setLabel] = useState("");
  const [expenseIds, setExpenseIds] = useState<Set<string>>(() => new Set(month.expenses.map((e) => e.id)));
  const [incomeIds, setIncomeIds] = useState<Set<string>>(() => new Set(month.incomes.map((i) => i.id)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function submit() {
    if (label.trim() === "") {
      setError("ตั้งชื่อเดือนใหม่ก่อน");
      return;
    }
    setBusy(true);
    setError(null);
    api
      .cloneMonth(month.id, {
        label: label.trim(),
        expenseIds: [...expenseIds],
        incomeIds: [...incomeIds],
      })
      .then((m) => {
        onApplied(m);
        onClose();
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "เกิดข้อผิดพลาด"))
      .finally(() => setBusy(false));
  }

  return (
    <Modal
      title="เปิดรอบใหม่"
      onClose={onClose}
      footer={
        <>
          <button className="rounded-input px-4 py-2 text-ink-2 hover:bg-hairline" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            className="rounded-input bg-grape-ink px-4 py-2 font-medium text-grape-on disabled:opacity-50"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "กำลังสร้าง…" : "สร้างเดือนใหม่"}
          </button>
        </>
      }
    >
      <label className="mb-1 block text-sm text-ink-2">ชื่อเดือนใหม่</label>
      <input className={`${fieldCls} mb-4`} value={label} placeholder="เช่น ส.ค. 69" onChange={(e) => setLabel(e.target.value)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-medium text-ink">รายจ่ายที่จะยกไป</div>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {month.expenses.length === 0 && <span className="text-sm text-ink-muted">ไม่มี</span>}
            {month.expenses.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={expenseIds.has(e.id)} onChange={() => toggle(expenseIds, setExpenseIds, e.id)} />
                <span className="flex-1 text-ink truncate-thai">{e.name || "—"}</span>
                <span className="text-ink-muted tabular">{formatSatang(e.custom)}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium text-ink">รายรับที่จะยกไป</div>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {month.incomes.length === 0 && <span className="text-sm text-ink-muted">ไม่มี</span>}
            {month.incomes.map((i) => (
              <label key={i.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={incomeIds.has(i.id)} onChange={() => toggle(incomeIds, setIncomeIds, i.id)} />
                <span className="flex-1 text-ink truncate-thai">{i.name || "—"}</span>
                <span className="text-ink-muted tabular">{formatSatang(i.amount)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-input bg-blueberry-fill px-3 py-2 text-sm text-blueberry-ink">
        รายการที่ยกไปจะรีเซ็ตสถานะเป็น “รอ” · คนและบัญชีรายคนจะไม่ถูกยกไป (เป็นของเฉพาะเดือน)
      </div>

      {error && (
        <div className="mt-3 rounded-input border border-hairline bg-surface px-3 py-2 text-sm text-ink">{error}</div>
      )}
    </Modal>
  );
}
