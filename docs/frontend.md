# Tallo — Frontend (ร่างแรก)

> สถานะ: **Draft v0.1** · 2026-10-05
> เอกสารนี้บันทึกการตัดสินใจเรื่อง stack และทิศทางหน้าตา ส่วนกฎธุรกิจอยู่ที่ [business.md](business.md)

## Stack

| เรื่อง | ใช้ | หมายเหตุ |
|---|---|---|
| Framework | **React + Vite** (TypeScript) | เป็น SPA ไม่ใช้ Next.js |
| UI components | **shadcn/ui** | ปรับ token ให้เป็นธีม pastel |
| Styling | **Tailwind CSS** | |
| Forms | **React อย่างเดียว** | **ห้ามเพิ่ม lib จัดการ form** (เช่น react-hook-form, formik) ดูหัวข้อ Forms |
| Icons | **Phosphor Icons** (`@phosphor-icons/react`) | ใช้ weight `light` หรือ `regular` เพราะเส้นบางและปลายมน ดูน่ารักกว่า lucide ที่ shadcn ใช้เป็นค่าเริ่มต้น |
| Backend | **Supabase** (`@supabase/supabase-js`) | frontend เรียกใช้ตรง ไม่มี server ของตัวเอง สิทธิ์การเข้าถึงทั้งหมดบังคับด้วย RLS และแจ้งเตือนในแอปใช้ Realtime |

## Setup

- โค้ดอยู่ที่ `tallo_app/` ใช้ **pnpm**
- คำสั่ง: `pnpm dev`, `pnpm build`, `pnpm lint` (lint ด้วย oxlint)
- shadcn ใช้ preset **radix-maia** (โค้งมน) และตั้ง `iconLibrary: "phosphor"` ใน `components.json` เพื่อให้ component ที่เพิ่มด้วย `pnpm dlx shadcn@latest add <name>` ใช้ Phosphor
- Theme token อยู่ใน `src/index.css` มี token สถานะเพิ่มจาก shadcn คือ `success`, `warning`, `danger`, `info`, `savings` (แต่ละตัวมีคู่ `-foreground`)
- Supabase client อยู่ที่ `src/lib/supabase.ts` ให้คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ URL และ anon key

## Forms

- ใช้ `<form action={...}>` กับ `useActionState` / `useFormStatus` ของ React 19
- ใช้ HTML validation (`required`, `min`, `step`, `inputMode="decimal"`) และเขียนตรวจเพิ่มเองในฟังก์ชัน action
- รวม input ยอดเงินไว้ใน component เดียว คือ `MoneyInput`: รับค่าเป็นบาท แล้วแปลงเป็น **สตางค์ (integer)** ก่อนส่งต่อ
- ห้ามใช้ float คำนวณเงินเด็ดขาด

## ทิศทางหน้าตา: น่ารัก, pastel, มน

- **มุมโค้งใหญ่**: การ์ดใช้ `rounded-2xl` ถึง `rounded-3xl` ส่วนปุ่มและ chip ใช้ `rounded-full`
- **เงาเบา** และขอบบาง ไม่ใช้เส้นตารางแบบ Sheet
- **ฟอนต์มน**: ภาษาไทยใช้ IBM Plex Sans Thai Looped, Latin ใช้ Nunito ตัวเลขใช้ `tabular-nums` เพื่อให้คอลัมน์ยอดตรงกัน
- **สีประจำคน**: ผู้ติดต่อแต่ละคนได้สี pastel ของตัวเอง และใช้สีนั้นกับ chip ส่วนแบ่งทุกที่
- รองรับมือถือก่อน (mobile-first) และมี dark mode (pastel โทนเข้ม)

### Palette (ร่าง)

| Token | ใช้กับ | สี (light) |
|---|---|---|
| `--primary` | ปุ่มหลัก, ลิงก์ | lavender `#B8A9F0` |
| `--success` | จ่ายแล้ว / ได้รับแล้ว | mint `#A8E6CF` |
| `--warning` | ใกล้ครบกำหนด / ยังไม่กรอก | butter `#FFE29A` |
| `--danger` | เลยกำหนด / คงเหลือติดลบ | peach-pink `#FFB3B3` |
| `--info` | รายรับ | sky `#A7D8F0` |
| `--accent` | ออม/ลงทุน | blush `#F7C6D9` |
| `--background` | พื้นหลัง | cream `#FFFBF5` |

ตัวอักษรบนพื้น pastel ต้องใช้สีเข้มของโทนเดียวกัน (เช่น mint เข้ม `#2F6B55`) เพื่อให้ contrast ผ่าน WCAG AA
