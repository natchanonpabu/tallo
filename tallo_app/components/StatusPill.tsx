"use client";

/**
 * Binary status pill (frontend-design.md #3, #6). Two states only, never
 * color-alone — always paired with its Thai label. "Done" is a soft mint fill
 * with mint ink + check; "pending" is a ghost outline in secondary ink. Tapping
 * it toggles directly (checking things off is the primary interaction).
 */
export function StatusPill({
  done,
  doneLabel,
  pendingLabel,
  onToggle,
}: {
  done: boolean;
  doneLabel: string;
  pendingLabel: string;
  onToggle?: () => void;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-medium transition-colors";
  if (done) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`${base} bg-mint-fill text-mint-ink`}
      >
        <span aria-hidden>✓</span>
        {doneLabel}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${base} border border-hairline text-ink-2 hover:bg-hairline`}
    >
      {pendingLabel}
    </button>
  );
}
