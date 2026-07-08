"use client";

import { useState } from "react";
import type { Month, MonthListItem } from "@/lib/api";
import { formatMonthDate } from "@/lib/format";

/**
 * Top bar: month switcher (label + created date) and the New-cycle entry point.
 * Also creates a brand-new empty month.
 */
export function MonthBar({
  months,
  current,
  onSelect,
  onNewCycle,
  onCreateEmpty,
}: {
  months: MonthListItem[];
  current: Month | null;
  onSelect: (id: string) => void;
  onNewCycle: () => void;
  onCreateEmpty: (label: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <select
          className="rounded-input border border-hairline bg-surface px-3 py-2 text-ink outline-none"
          value={current?.id ?? ""}
          onChange={(e) => onSelect(e.target.value)}
        >
          {months.length === 0 && <option value="">— ยังไม่มีเดือน —</option>}
          {months.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {current && <span className="text-sm text-ink-muted">สร้างเมื่อ {formatMonthDate(current.createdAt)}</span>}
      </div>

      <div className="flex items-center gap-2">
        {creating ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              className="rounded-input border border-hairline bg-surface px-3 py-2 text-ink outline-none focus:border-grape-ink"
              value={label}
              placeholder="เช่น ก.ค. 69"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && label.trim()) {
                  onCreateEmpty(label.trim());
                  setLabel("");
                  setCreating(false);
                }
                if (e.key === "Escape") setCreating(false);
              }}
            />
            <button
              className="rounded-input bg-grape-fill px-3 py-2 text-sm font-medium text-grape-ink disabled:opacity-40"
              disabled={label.trim() === ""}
              onClick={() => {
                onCreateEmpty(label.trim());
                setLabel("");
                setCreating(false);
              }}
            >
              สร้าง
            </button>
            <button className="rounded-input px-3 py-2 text-sm text-ink-2 hover:bg-hairline" onClick={() => setCreating(false)}>
              ยกเลิก
            </button>
          </div>
        ) : (
          <button className="rounded-input border border-hairline px-3 py-2 text-sm text-ink-2 hover:bg-hairline" onClick={() => setCreating(true)}>
            + เดือนใหม่
          </button>
        )}
        <button
          className="rounded-input bg-grape-ink px-3 py-2 text-sm font-medium text-grape-on disabled:opacity-40"
          onClick={onNewCycle}
          disabled={!current}
        >
          เปิดรอบใหม่ ▾
        </button>
      </div>
    </div>
  );
}
