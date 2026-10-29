import type { ExpenseCategory, ItemKind, RequestStatus } from "@/lib/types"

export const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]

export function monthLabel(year: number, month: number): string {
  return `${TH_MONTHS[month - 1]} ${year}`
}

export const KIND_LABELS: Record<ItemKind, string> = {
  card: "บัตรเครดิต",
  loan: "สินเชื่อ",
  expense: "รายจ่าย",
  income: "รายรับ",
}

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  spending: "ค่าใช้จ่าย",
  subscription: "ค่าบริการรายเดือน",
  savings: "ออม/ลงทุน",
  pay_person: "จ่ายให้คน",
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  draft: "ร่าง",
  sent: "ส่งแล้ว",
  questioned: "มีคำถาม",
  accepted: "ยืนยันแล้ว",
  paid: "จ่ายแล้ว",
  received: "ได้รับแล้ว",
  cancelled: "ยกเลิก",
}

export const REQUEST_STATUS_CLASSES: Record<RequestStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-info text-info-foreground",
  questioned: "bg-warning text-warning-foreground",
  accepted: "bg-secondary text-secondary-foreground",
  paid: "bg-savings text-savings-foreground",
  received: "bg-success text-success-foreground",
  cancelled: "bg-muted text-muted-foreground",
}

export const CONTACT_COLORS = ["#A8E6CF", "#A7D8F0", "#F7C6D9", "#FFE29A", "#B8A9F0", "#FFB3B3"]
