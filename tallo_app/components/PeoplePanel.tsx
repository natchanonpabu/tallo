"use client";

import { useState } from "react";
import { api, type Entry, type Month, type Person } from "@/lib/api";
import { formatSignedSatang, netWord, parseBaht, satangToBahtInput } from "@/lib/format";
import { StatusPill } from "./StatusPill";

type Apply = (fn: () => Promise<Month>) => void;

const fieldCls =
  "w-full rounded-input border border-hairline bg-bg px-3 py-2 text-ink outline-none focus:border-grape-ink";

function netClass(net: number): string {
  if (net > 0) return "text-blueberry-ink";
  if (net < 0) return "text-strawberry-ink";
  return "text-ink-muted";
}

function EntryRow({ entry, apply }: { entry: Entry; apply: Apply }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(entry.label);
  const [amount, setAmount] = useState(satangToBahtInput(entry.amount));

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <input className={fieldCls} value={label} placeholder="รายการ" onChange={(e) => setLabel(e.target.value)} />
        <input className={`${fieldCls} w-28 tabular`} value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
        <button className="rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-hairline" onClick={() => setEditing(false)}>ยกเลิก</button>
        <button
          className="rounded-md bg-grape-fill px-2 py-1 text-sm font-medium text-grape-ink"
          onClick={() => {
            apply(() => api.updateEntry(entry.id, { label, amount: parseBaht(amount) ?? 0 }));
            setEditing(false);
          }}
        >
          ✓
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 py-1.5">
      <span className="min-w-0 flex-1 text-sm text-ink-2 truncate-thai">{entry.label || "—"}</span>
      <span className={`text-sm tabular ${netClass(entry.amount)}`}>{formatSignedSatang(entry.amount)}</span>
      <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button title="แก้ไข" className="rounded px-1 text-ink-2 hover:bg-hairline" onClick={() => setEditing(true)}>✎</button>
        <button title="ลบ" className="rounded px-1 text-ink-2 hover:bg-hairline" onClick={() => apply(() => api.deleteEntry(entry.id))}>🗑</button>
      </span>
    </div>
  );
}

function AddEntry({ personId, apply }: { personId: string; apply: Apply }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="mt-2 flex items-center gap-2 border-t border-hairline pt-2">
      <input className={fieldCls} value={label} placeholder="รายการ" onChange={(e) => setLabel(e.target.value)} />
      <input className={`${fieldCls} w-28 tabular`} value={amount} placeholder="±บาท" inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
      <button
        className="shrink-0 rounded-input bg-grape-fill px-3 py-2 text-sm font-medium text-grape-ink disabled:opacity-40"
        disabled={parseBaht(amount) === null}
        onClick={() => {
          const satang = parseBaht(amount);
          if (satang === null) return;
          apply(() => api.createEntry(personId, { label, amount: satang }));
          setLabel(""); setAmount("");
        }}
      >
        เพิ่ม
      </button>
    </div>
  );
}

function PersonCard({ person, apply }: { person: Person; apply: Apply }) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-ink truncate-thai">{person.name}</div>
          <div className="mt-0.5 text-sm">
            <span className={`font-semibold tabular ${netClass(person.net)}`}>{formatSignedSatang(person.net)}</span>
            <span className="text-ink-muted"> · {netWord(person.net, person.status)}</span>
          </div>
        </div>
        <StatusPill
          done={person.status === "settled"}
          doneLabel="เคลียร์แล้ว"
          pendingLabel="ค้างอยู่"
          onToggle={() =>
            apply(() => api.updatePerson(person.id, { status: person.status === "settled" ? "pending" : "settled" }))
          }
        />
      </div>

      <div className="mt-3 divide-y divide-hairline">
        {person.entries.length === 0 ? (
          <div className="py-2 text-sm text-ink-muted">ยังไม่มีรายการ</div>
        ) : (
          person.entries.map((e) => <EntryRow key={e.id} entry={e} apply={apply} />)
        )}
      </div>

      <AddEntry personId={person.id} apply={apply} />

      <div className="mt-3 text-right">
        <button className="text-xs text-ink-muted hover:text-ink" onClick={() => apply(() => api.deletePerson(person.id))}>
          ลบคนนี้
        </button>
      </div>
    </div>
  );
}

function AddPerson({ monthId, apply }: { monthId: string; apply: Apply }) {
  const [name, setName] = useState("");
  return (
    <div className="flex h-full flex-col justify-center gap-2 rounded-card border border-dashed border-hairline bg-surface p-5">
      <div className="text-sm font-medium text-ink-2">เพิ่มคน</div>
      <input className={fieldCls} value={name} placeholder="ชื่อ" onChange={(e) => setName(e.target.value)} />
      <button
        className="rounded-input bg-grape-fill px-3 py-2 text-sm font-medium text-grape-ink disabled:opacity-40"
        disabled={name.trim() === ""}
        onClick={() => {
          apply(() => api.createPerson(monthId, name.trim()));
          setName("");
        }}
      >
        + เพิ่มคน
      </button>
    </div>
  );
}

export function PeoplePanel({ month, apply }: { month: Month; apply: Apply }) {
  return (
    <section>
      <h2 className="mb-3 font-semibold text-ink">คนอื่น ๆ (บัญชีรายคน)</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {month.people.map((p) => (
          <PersonCard key={p.id} person={p} apply={apply} />
        ))}
        <AddPerson monthId={month.id} apply={apply} />
      </div>
    </section>
  );
}
