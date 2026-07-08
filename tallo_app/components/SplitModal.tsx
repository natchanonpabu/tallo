"use client";

import { useMemo, useState } from "react";
import { ApiError, api, type Expense, type Month, type Person, type SplitRequest } from "@/lib/api";
import { formatSatang, formatSignedSatang, parseBaht } from "@/lib/format";
import { Modal } from "./Modal";

const fieldCls =
  "w-full rounded-input border border-hairline bg-bg px-3 py-2 text-ink outline-none focus:border-grape-ink";

export function SplitModal({
  expense,
  people,
  onClose,
  onApplied,
}: {
  expense: Expense;
  people: Person[];
  onClose: () => void;
  onApplied: (m: Month) => void;
}) {
  const [tab, setTab] = useState<"even" | "manual">("even");
  const [names, setNames] = useState<string[]>(() =>
    Array.from(new Set(people.map((p) => p.name).filter(Boolean))),
  );
  const [newName, setNewName] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(people.map((p) => [p.name, true])),
  );
  const [includeMe, setIncludeMe] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function addName() {
    const n = newName.trim();
    if (!n || names.includes(n)) {
      setNewName("");
      return;
    }
    setNames((s) => [...s, n]);
    setChecked((c) => ({ ...c, [n]: true }));
    setNewName("");
  }

  // --- Even preview: floor(custom/N) each, owner absorbs the remainder (business.md #8) ---
  const evenPreview = useMemo(() => {
    const participants = names.filter((n) => checked[n]);
    const nonOwner = participants.length;
    const N = nonOwner + (includeMe ? 1 : 0);
    if (N === 0) return { participants, share: 0, ownerAbsorbed: 0, N: 0 };
    const share = Math.floor(expense.custom / N);
    const ownerAbsorbed = expense.custom - share * nonOwner;
    return { participants, share, ownerAbsorbed, N };
  }, [names, checked, includeMe, expense.custom]);

  // --- Manual preview: running total vs custom; owner's implied share may go negative ---
  const manualPreview = useMemo(() => {
    let sum = 0;
    const rows = names.map((n) => {
      const satang = parseBaht(amounts[n] ?? "");
      if (satang !== null) sum += satang;
      return { name: n, satang };
    });
    return { rows, sum, ownerImplied: expense.custom - sum };
  }, [names, amounts, expense.custom]);

  function submit() {
    let req: SplitRequest;
    if (tab === "even") {
      if (evenPreview.participants.length === 0) {
        setError("เลือกอย่างน้อยหนึ่งคน");
        return;
      }
      req = { mode: "even", includeMe, participants: evenPreview.participants.map((name) => ({ name })) };
    } else {
      const participants = manualPreview.rows
        .filter((r) => r.satang !== null)
        .map((r) => ({ name: r.name, amount: r.satang as number }));
      if (participants.length === 0) {
        setError("กรอกจำนวนอย่างน้อยหนึ่งคน");
        return;
      }
      req = { mode: "manual", participants };
    }
    setBusy(true);
    setError(null);
    api
      .splitExpense(expense.id, req)
      .then((m) => {
        onApplied(m);
        onClose();
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "เกิดข้อผิดพลาด"))
      .finally(() => setBusy(false));
  }

  return (
    <Modal
      title={`แยกบิล · ${expense.name || "รายจ่าย"}`}
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
            {busy ? "กำลังบันทึก…" : "บันทึกการแยกบิล"}
          </button>
        </>
      }
    >
      <div className="mb-4 text-sm text-ink-2">
        ยอดเต็ม <span className="font-semibold text-ink tabular">{formatSatang(expense.custom)}</span> — บิลนี้ยังอยู่ครบในรายจ่าย
        (เขียนเฉพาะส่วนที่คนอื่นต้องจ่ายลงบัญชีรายคน)
      </div>

      <div className="mb-4 flex gap-1 rounded-pill border border-hairline p-1 text-sm">
        {(["even", "manual"] as const).map((t) => (
          <button
            key={t}
            className={`flex-1 rounded-pill px-3 py-1.5 ${tab === t ? "bg-grape-fill font-medium text-grape-ink" : "text-ink-2"}`}
            onClick={() => setTab(t)}
          >
            {t === "even" ? "หารเท่ากัน" : "กรอกเอง"}
          </button>
        ))}
      </div>

      {/* participant picker */}
      <div className="mb-3 flex flex-col gap-1">
        {names.length === 0 && <div className="text-sm text-ink-muted">ยังไม่มีคน เพิ่มชื่อด้านล่าง</div>}
        {names.map((n) => (
          <div key={n} className="flex items-center gap-3 py-1">
            {tab === "even" ? (
              <label className="flex flex-1 items-center gap-2">
                <input type="checkbox" checked={!!checked[n]} onChange={(e) => setChecked((c) => ({ ...c, [n]: e.target.checked }))} />
                <span className="text-ink truncate-thai">{n}</span>
              </label>
            ) : (
              <>
                <span className="flex-1 text-ink truncate-thai">{n}</span>
                <input
                  className={`${fieldCls} w-32 tabular`}
                  placeholder="บาท"
                  inputMode="decimal"
                  value={amounts[n] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [n]: e.target.value }))}
                />
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        <input className={fieldCls} value={newName} placeholder="เพิ่มชื่อคน" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addName()} />
        <button className="shrink-0 rounded-input border border-hairline px-3 text-ink-2 hover:bg-hairline" onClick={addName}>
          + เพิ่ม
        </button>
      </div>

      {/* live preview */}
      {tab === "even" ? (
        <label className="mb-3 flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} />
          รวมฉันเป็นผู้ร่วมหาร (ฉันไม่มีรายการในบัญชีรายคน)
        </label>
      ) : null}

      <div className="rounded-input bg-bg p-3 text-sm">
        {tab === "even" ? (
          evenPreview.N === 0 ? (
            <span className="text-ink-muted">เลือกคนเพื่อดูส่วนแบ่ง</span>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="text-ink-2">
                คนละ <span className="font-semibold text-ink tabular">{formatSatang(evenPreview.share)}</span> ({evenPreview.N} ส่วน)
              </div>
              <div className="text-ink-muted">
                ฉันรับผิดชอบ (รวมเศษ) <span className="tabular">{formatSatang(evenPreview.ownerAbsorbed)}</span>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-1">
            <div className="text-ink-2">
              รวมที่กรอก <span className="font-semibold text-ink tabular">{formatSatang(manualPreview.sum)}</span> / {formatSatang(expense.custom)}
            </div>
            <div className={manualPreview.ownerImplied < 0 ? "text-strawberry-ink" : "text-ink-muted"}>
              ส่วนของฉัน <span className="tabular">{formatSignedSatang(manualPreview.ownerImplied)}</span>
              {manualPreview.ownerImplied < 0 && " (เกินยอดบิล)"}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-input border border-hairline bg-surface px-3 py-2 text-sm text-ink">{error}</div>
      )}
    </Modal>
  );
}
