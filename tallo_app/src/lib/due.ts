import { differenceInCalendarDays, parseISO } from "date-fns"

import type { Item } from "@/lib/types"

export type DueState = { kind: "overdue" | "soon"; days: number } | null

/**
 * Whether an unpaid item needs attention (business.md §12): overdue, or due within `remindDays`
 * (profiles.due_remind_days, the same window as the daily reminder). Income and done items never do.
 */
export function dueState(item: Item, remindDays: number, today = new Date()): DueState {
  if (!item.due_date || item.status === "done" || item.kind === "income") return null
  const days = differenceInCalendarDays(parseISO(item.due_date), today)
  if (days < 0) return { kind: "overdue", days: -days }
  if (days <= remindDays) return { kind: "soon", days }
  return null
}

export function dueLabel(state: NonNullable<DueState>): string {
  if (state.kind === "overdue") return `เลยกำหนด ${state.days} วัน`
  return state.days === 0 ? "ครบวันนี้" : state.days === 1 ? "ครบพรุ่งนี้" : `ครบในอีก ${state.days} วัน`
}
