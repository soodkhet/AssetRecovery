'use client'

import { useEffect, useRef } from 'react'

/**
 * modal ที่ค้าง mount อยู่ (`if (!open) return null`) เปลี่ยนจากเปิด → ปิด หรือไม่
 * — แยกเป็น pure function ให้ test ได้โดยไม่ต้องมี DOM
 */
export function closedNow(wasOpen: boolean, open: boolean): boolean {
  return wasOpen && !open
}

/**
 * เรียก `clear()` ทุกครั้งที่ modal ถูกปิด (ยกเลิก/X/Esc/บันทึกสำเร็จ) — ใช้ล้าง **ข้อผิดจากการกดส่ง**
 * (ข้อความใต้ช่อง/แถว + footer + aria-invalid) ให้เปิดใหม่แล้วไม่ขึ้นข้อผิดเก่าก่อนกดส่งอีกครั้ง
 * · ล้างตอนปิด (ไม่ใช่ตอนเปิด) เพราะตอนปิด modal ไม่ render อยู่แล้ว ⇒ เปิดใหม่ไม่มีข้อผิดเก่าวาบขึ้นมา
 * · ร่างที่กรอกค้างไว้ไม่ถูกแตะ — ผู้เรียกส่งเฉพาะ setter ของ state ข้อผิด
 * · เรียกก่อน early return `if (!open) return null` เสมอ (กติกา hooks) · ตรวจซ้ำ staging SV5-R6-01
 */
export function useClearOnClose(open: boolean, clear: () => void): void {
  const clearRef = useRef(clear)
  const wasOpenRef = useRef(open)
  useEffect(() => {
    clearRef.current = clear
  })
  useEffect(() => {
    if (closedNow(wasOpenRef.current, open)) clearRef.current()
    wasOpenRef.current = open
  }, [open])
}
