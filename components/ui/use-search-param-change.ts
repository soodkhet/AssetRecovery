'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

/**
 * เรียก `onChange` เมื่อค่า `?key=` ใน URL **เปลี่ยน** หลัง mount (ไม่เรียกตอน mount — ค่าแรกมาจาก prop ของ page แล้ว)
 *
 * เหตุผล (preship R2-009): หน้าที่อ่าน `searchParams` เป็นค่าเริ่มต้นของ `useState` ครั้งเดียว — นำทางไป route เดิม
 * ด้วย `?tab=`/`?case=` ใหม่ (เช่น กดแจ้งเตือนตอนอยู่หน้านั้นอยู่แล้ว · `router.push`) URL เปลี่ยนแต่หน้าจอค้าง
 *
 * ใช้ร่วมกับ `replaceUrlParams()` ได้: ค่าที่หน้าเขียนลง URL เองจะวนกลับมาเป็นค่าเดียวกับ state
 * ผู้เรียกจึงควร set state แบบ idempotent (ค่าเท่าเดิม = ไม่เปลี่ยนอะไร)
 * ใช้รูปแบบ "ปรับ state ระหว่าง render" ของ React (ไม่ใช่ effect) — หน้าจอไม่กระพริบเป็นแท็บเก่าก่อน 1 เฟรม
 */
export function useSearchParamChange(key: string, onChange: (value: string | null) => void): void {
  const value = useSearchParams().get(key)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    onChange(value)
  }
}
