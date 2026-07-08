"use client";

import { useEffect } from "react";

/**
 * Modal shell: a warm-haze overlay (never black) + a soft, low, diffuse shadow
 * so it reads as temporarily above the page (frontend-design.md #5).
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "var(--overlay)" }}
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-lg rounded-card border border-hairline bg-surface p-6"
        style={{ boxShadow: "0 24px 60px -20px rgba(43,38,34,0.35)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="rounded-input px-2 py-1 text-ink-2 transition-colors hover:bg-hairline"
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-6 flex items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
