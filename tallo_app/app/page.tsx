"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type Expense, type Month, type MonthListItem } from "@/lib/api";
import { Dashboard } from "@/components/Dashboard";
import { ExpensesPanel } from "@/components/ExpensesPanel";
import { IncomePanel } from "@/components/IncomePanel";
import { PeoplePanel } from "@/components/PeoplePanel";
import { MonthBar } from "@/components/MonthBar";
import { SplitModal } from "@/components/SplitModal";
import { CloneModal } from "@/components/CloneModal";

export default function Home() {
  const [months, setMonths] = useState<MonthListItem[]>([]);
  const [month, setMonth] = useState<Month | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitFor, setSplitFor] = useState<Expense | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof ApiError ? e.message : "เกิดข้อผิดพลาด");
  }, []);

  // Initial load: month list + newest month.
  useEffect(() => {
    (async () => {
      try {
        const list = await api.listMonths();
        setMonths(list);
        if (list.length > 0) setMonth(await api.getMonth(list[0].id));
      } catch (e) {
        fail(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [fail]);

  // Mutation runner: every write returns the full month; replace state with it.
  const apply = useCallback(
    (fn: () => Promise<Month>) => {
      setBusy(true);
      setError(null);
      fn()
        .then(setMonth)
        .catch(fail)
        .finally(() => setBusy(false));
    },
    [fail],
  );

  const onApplied = useCallback(async (m: Month) => {
    setMonth(m);
    setError(null);
    try {
      setMonths(await api.listMonths());
    } catch {
      /* list refresh is best-effort */
    }
  }, []);

  const selectMonth = useCallback(
    (id: string) => {
      if (!id) return;
      setBusy(true);
      api.getMonth(id).then(setMonth).catch(fail).finally(() => setBusy(false));
    },
    [fail],
  );

  const createEmpty = useCallback(
    (label: string) => {
      setBusy(true);
      setError(null);
      api.createMonth(label).then(onApplied).catch(fail).finally(() => setBusy(false));
    },
    [fail, onApplied],
  );

  const deleteMonth = useCallback(async () => {
    if (!month) return;
    if (!confirm(`ลบเดือน “${month.label}” และทุกอย่างในนั้น?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteMonth(month.id);
      const list = await api.listMonths();
      setMonths(list);
      setMonth(list.length > 0 ? await api.getMonth(list[0].id) : null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [month, fail]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Tallo</h1>
          {busy && <span className="text-sm text-ink-muted">กำลังบันทึก…</span>}
        </div>
        <MonthBar
          months={months}
          current={month}
          onSelect={selectMonth}
          onNewCycle={() => setCloneOpen(true)}
          onCreateEmpty={createEmpty}
        />
      </header>

      {error && (
        <div className="mb-4 rounded-input border border-hairline bg-surface px-4 py-2 text-sm text-ink">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-card bg-surface" />
          <div className="h-64 animate-pulse rounded-card bg-surface" />
        </div>
      ) : !month ? (
        <div className="rounded-card border border-dashed border-hairline bg-surface p-12 text-center">
          <p className="text-ink-2">ยังไม่มีเดือน — สร้างเดือนแรกเพื่อเริ่มบันทึก</p>
        </div>
      ) : (
        <div className="space-y-6">
          <Dashboard summary={month.summary} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ExpensesPanel month={month} apply={apply} onSplit={setSplitFor} />
            <IncomePanel month={month} apply={apply} />
          </div>

          <PeoplePanel month={month} apply={apply} />

          <div className="pt-2 text-right">
            <button className="text-sm text-ink-muted hover:text-ink" onClick={deleteMonth}>
              ลบเดือนนี้
            </button>
          </div>
        </div>
      )}

      {splitFor && month && (
        <SplitModal
          expense={splitFor}
          people={month.people}
          onClose={() => setSplitFor(null)}
          onApplied={setMonth}
        />
      )}
      {cloneOpen && month && (
        <CloneModal month={month} onClose={() => setCloneOpen(false)} onApplied={onApplied} />
      )}
    </div>
  );
}
