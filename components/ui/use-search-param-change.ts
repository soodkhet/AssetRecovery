'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { isRecentSelfWrite } from '@/components/ui/url-state'

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

/**
 * เหมือน `useSearchParamChange` แต่ดูทั้ง query — สำหรับหน้าที่ผูกหลาย key (ตัวกรองรายการเคส) · preship R7-004:
 * กดแจ้งเตือนที่พามา route เดิม (`router.push('/cases/submit?case=…')`) แทน URL ทั้งก้อน ⇒ ตัวกรองต้องตาม URL ใหม่
 * ไม่งั้นจอยังกรองค่าเดิมแต่ URL ไม่มีตัวกรอง (refresh แล้วผลเปลี่ยน) · ผู้เรียกต้อง set state แบบ idempotent
 */
export function useSearchQueryChange(onChange: (params: URLSearchParams) => void): void {
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  const [seen, setSeen] = useState(query)
  if (query !== seen) {
    setSeen(query)
    // ค่าที่หน้าเพิ่งเขียนเองวนกลับมาช้า (transition) — ไม่ใช่การนำทาง ข้าม ไม่งั้นตัวกรองย้อนไปค่าก่อนหน้า
    if (!isRecentSelfWrite(query)) onChange(new URLSearchParams(query))
  }
}
