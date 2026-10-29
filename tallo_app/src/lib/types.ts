import type { Database } from "@/lib/database.types"

type Tables = Database["public"]["Tables"]
type Views = Database["public"]["Views"]

export type Profile = Tables["profiles"]["Row"]
export type Contact = Tables["contacts"]["Row"]
export type DebtAccount = Tables["debt_accounts"]["Row"]
export type Month = Tables["months"]["Row"]
export type Item = Tables["items"]["Row"]
export type SubItem = Tables["sub_items"]["Row"]
// split_target is a PostgREST computed field (function public.split_target), not a column.
export type SplitRule = Omit<Tables["split_rules"]["Row"], "split_target">
export type Share = Tables["shares"]["Row"]
export type Offset = Tables["offsets"]["Row"]
export type Settlement = Tables["settlements"]["Row"]
export type PaymentRequest = Tables["payment_requests"]["Row"]
export type RequestLine = Tables["request_lines"]["Row"]
export type RequestEvent = Tables["request_events"]["Row"]
export type Notification = Tables["notifications"]["Row"]
export type MonthSummary = Views["month_summaries"]["Row"]
export type PersonBalance = Views["month_person_balances"]["Row"]
export type PublicProfile = Views["public_profiles"]["Row"]

export type ItemKind = Database["public"]["Enums"]["item_kind"]
export type ExpenseCategory = Database["public"]["Enums"]["expense_cat"]
export type SplitMode = Database["public"]["Enums"]["split_mode"]
export type RequestStatus = Database["public"]["Enums"]["request_status"]
