import { useMemo } from "react"

import { must } from "@/lib/errors"
import { supabase } from "@/lib/supabase"
import type {
  Contact,
  DebtAccount,
  Item,
  Month,
  MonthSummary,
  Offset,
  PaymentRequest,
  PersonBalance,
  Settlement,
  Share,
  SplitRule,
  SubItem,
} from "@/lib/types"
import { useAsync } from "@/lib/use-async"

export type MonthData = {
  month: Month
  summary: MonthSummary | null
  items: Item[]
  subItems: SubItem[]
  rules: SplitRule[]
  shares: Share[]
  offsets: Offset[]
  balances: PersonBalance[]
  contacts: Contact[]
  accounts: DebtAccount[]
  requests: PaymentRequest[]
  settlements: Settlement[]
}

async function loadMonth(monthId: string): Promise<MonthData> {
  const [month, summary, items, rules, shares, offsets, balances, contacts, accounts, requests, settlements] = await Promise.all([
    supabase.from("months").select("*").eq("id", monthId).single().then(must),
    supabase.from("month_summaries").select("*").eq("month_id", monthId).maybeSingle().then(must),
    supabase.from("items").select("*").eq("month_id", monthId).order("position").order("created_at").then(must),
    supabase.from("split_rules").select("*").eq("month_id", monthId).then(must),
    supabase.from("shares").select("*").eq("month_id", monthId).then(must),
    supabase.from("offsets").select("*").eq("month_id", monthId).order("position").order("created_at").then(must),
    supabase.from("month_person_balances").select("*").eq("month_id", monthId).then(must),
    supabase.from("contacts").select("*").order("created_at").then(must),
    supabase.from("debt_accounts").select("*").order("created_at").then(must),
    supabase.from("payment_requests").select("*").eq("sender_month_id", monthId).neq("status", "cancelled").then(must),
    supabase.from("settlements").select("*").eq("month_id", monthId).then(must),
  ])
  const subItems = items.length
    ? must(
        await supabase
          .from("sub_items")
          .select("*")
          .in("item_id", items.map((i) => i.id))
          .order("position")
          .order("created_at"),
      )
    : []
  return { month, summary, items, subItems, rules, shares, offsets, balances, contacts, accounts, requests, settlements }
}

export type SplitInfo = { rule: SplitRule; shares: Share[] }

export function useMonthData(monthId: string) {
  const query = useAsync(() => loadMonth(monthId), [monthId])
  const data = query.data

  const derived = useMemo(() => {
    if (!data) return null
    const subsByItem = new Map<string, SubItem[]>()
    for (const s of data.subItems) subsByItem.set(s.item_id, [...(subsByItem.get(s.item_id) ?? []), s])

    const sharesByRule = new Map<string, Share[]>()
    for (const s of data.shares) sharesByRule.set(s.rule_id, [...(sharesByRule.get(s.rule_id) ?? []), s])

    const splits = new Map<string, SplitInfo>()
    for (const rule of data.rules) {
      splits.set(splitKey(rule.item_id, rule.sub_item_id), { rule, shares: sharesByRule.get(rule.id) ?? [] })
    }

    const contactById = new Map(data.contacts.map((c) => [c.id, c]))
    const unallocated = (item: Item) =>
      (item.amount ?? 0) - (subsByItem.get(item.id) ?? []).reduce((sum, s) => sum + s.amount, 0)

    return { subsByItem, splits, contactById, unallocated }
  }, [data])

  return { ...query, derived }
}

export function splitKey(itemId: string, subItemId: string | null | undefined): string {
  return `${itemId}:${subItemId ?? ""}`
}
