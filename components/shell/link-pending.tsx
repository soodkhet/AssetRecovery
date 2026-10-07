'use client'

import { useLinkStatus } from 'next/link'
import { Spinner } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'

/**
 * spinner เล็กในลิงก์เมนูระหว่างรอหน้าถัดไป — **ต้องวางเป็นลูกของ `<Link>`** (`useLinkStatus`)
 * เดิมกดเมนูแล้วหน้าเก่าค้างนิ่งจนผู้ใช้กดซ้ำ (preship PS-011) · คู่กับ `loading.tsx` ของแต่ละ route group
 * (ซึ่งต้องรอ prefetch) — ตัวนี้ขึ้นทันทีแม้ยังไม่ prefetch
 */
/**
 * ตำแหน่ง spinner สำหรับลิงก์เมนูแบบเม็ดยา (top-nav / sub-nav) — ลอยที่มุมขวาบนของลิงก์ (ลิงก์ต้อง `relative`)
 * ไม่กินที่ในแถว ⇒ ลิงก์ไม่กว้างขึ้นระหว่างโหลด เมนูข้างเคียงไม่ขยับ/ไม่ตกบรรทัด (preship R2-034)
 */
export const LINK_PENDING_CORNER_CLASS =
  'pointer-events-none absolute -top-1 -right-1 rounded-full bg-white p-px text-slate-500 shadow-sm ring-1 ring-slate-200'

export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span role="status" aria-label="กำลังเปิดหน้า" className={cn('inline-flex', className)}>
      <Spinner className="h-3 w-3" />
    </span>
  )
}
