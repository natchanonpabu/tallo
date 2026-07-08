"use client";

import type { Summary } from "@/lib/api";
import { formatSatang } from "@/lib/format";

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-5">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{formatSatang(value)}</div>
    </div>
  );
}

/**
 * Dashboard strip: four equal stat tiles + one distinct hero (สุทธิเดือนนี้) — the
 * one number the owner came to check (frontend-design.md #2, #6). No deltas or
 * trends; a month has nothing to compare against.
 */
export function Dashboard({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <StatTile label="จ่ายแล้ว" value={summary.paid} />
      <StatTile label="รอจ่าย" value={summary.toPay} />
      <StatTile label="รับแล้ว" value={summary.received} />
      <StatTile label="รอรับ" value={summary.toReceive} />
      <div className="col-span-2 rounded-card border border-hairline bg-grape-fill p-5 lg:col-span-1">
        <div className="text-sm font-medium text-grape-ink">สุทธิเดือนนี้</div>
        <div className="mt-1 text-3xl font-semibold text-ink sm:text-4xl">
          {formatSatang(summary.cashNow)}
        </div>
        <div className="mt-1 text-xs text-ink-muted">รับแล้ว − จ่ายแล้ว เดือนนี้ (ไม่ใช่ยอดในบัญชี)</div>
      </div>
    </div>
  );
}
