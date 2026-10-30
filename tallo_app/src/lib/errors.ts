// Error codes raised by the database (see docs/design.md "Local development") → Thai messages.
const messages: Record<string, string> = {
  month_closed: "เดือนนี้ปิดแล้ว ต้องเปิดเดือนใหม่ก่อนถึงจะแก้ได้",
  month_not_found: "ไม่พบเดือนนี้",
  item_not_found: "ไม่พบรายการนี้",
  sub_item_not_found: "ไม่พบรายการย่อยนี้",
  contact_not_found: "ไม่พบผู้ติดต่อนี้",
  contact_not_linked: "คนนี้ยังไม่ได้ผูกบัญชี ผูกได้ที่หน้า \"คน\" → แก้ไข",
  invite_not_found: "ไม่พบโค้ดนี้ หรือโค้ดถูกใช้ไปแล้ว",
  already_linked: "บัญชีของเราผูกกับคนนี้อยู่แล้ว",
  contact_already_linked: "คนนี้ผูกบัญชีแล้ว",
  contact_in_use: "คนนี้มีข้อมูลอยู่ ต้องยืนยันการลบข้อมูลด้วย",
  contact_in_closed_month: "คนนี้มีข้อมูลในเดือนที่ปิดแล้ว ลบไม่ได้ ใช้ \"เก็บคนนี้\" แทน หรือเปิดเดือนนั้นก่อน",
  net_is_zero: "ยอดสุทธิเป็นศูนย์ ไม่มีอะไรให้ส่ง",
  cannot_link_self: "ใช้โค้ดของตัวเองไม่ได้",
  cannot_split_income: "รายรับแบ่งยอดไม่ได้",
  split_needs_people: "เลือกคนที่จะแบ่งอย่างน้อย 1 คน",
  split_needs_targets: "เลือกรายการที่จะแบ่งอย่างน้อย 1 รายการ",
  split_needs_my_weight: "ใส่สัดส่วนของเราด้วย",
  split_needs_weight: "ใส่สัดส่วนของทุกคน",
  split_needs_amount: "ใส่ยอดของทุกคน",
  split_exceeds_amount: "ยอดที่แบ่งรวมกันเกินยอดของรายการ",
  request_not_found: "ไม่พบยอดนี้",
  request_wrong_status: "สถานะตอนนี้ทำแบบนี้ไม่ได้",
  message_required: "พิมพ์ข้อความก่อน",
  "Invalid login credentials": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const { message, code } = error as { message?: string; code?: string }
    if (message && messages[message]) return messages[message]
    if (code === "23505") return "มีข้อมูลนี้อยู่แล้ว"
    if (code === "42501") return "ไม่มีสิทธิ์ทำรายการนี้ ถ้าเพิ่ง reset ข้อมูล ให้ออกจากระบบแล้วเข้าใหม่"
    if (code === "23503" && message?.includes("profiles")) return "บัญชีนี้ไม่มีอยู่แล้ว กรุณาออกจากระบบแล้วเข้าใหม่"
    if (message) return message
  }
  return "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง"
}

/** Unwraps a supabase-js result, throwing its error. */
export function must<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error
  return result.data as NonNullable<T>
}
