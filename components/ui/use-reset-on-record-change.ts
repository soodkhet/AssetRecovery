'use client'

import { useState } from 'react'

/**
 * ร่างของฟอร์มที่ผูกกับ record (modal ค้าง mount · เปิดด้วย `record | null`) ควรเป็นของ record ไหน
 * — แยกเป็น pure function ให้ test ได้โดยไม่ต้องมี DOM (มติผู้ใช้ 14/10/2569)
 * · ปิดฟอร์ม (`recordId = null`) ⇒ คงร่าง + เจ้าของเดิมไว้ (เปิดซ้ำรายการเดิมได้ร่างเดิม)
 * · เปิดครั้งแรก ⇒ จำเจ้าของ ไม่ต้องล้าง (state ยังเป็นค่าเริ่มต้น)
 * · เปิดรายการเดิม ⇒ ไม่ล้าง · เปิดรายการอื่น ⇒ ล้างร่าง แล้วเปลี่ยนเจ้าของ
 */
export function draftOwnerTransition(
  owner: string | null,
  recordId: string | null,
): { owner: string | null; reset: boolean } {
  if (recordId === null || recordId === owner) return { owner, reset: false }
  return { owner: recordId, reset: owner !== null }
}

/**
 * เรียก `reset()` (ล้างร่างที่กรอกค้าง) เมื่อฟอร์มถูกเปิดให้ record คนละรายการกับร่างที่ค้างอยู่
 * — ล้างระหว่าง render (แนว "ปรับ state ตาม prop" ของ React) ⇒ ไม่มีร่างของรายการก่อนวาบขึ้นมา
 * · `reset` ต้องเรียกแค่ setter ของ state ใน component เดียวกัน · เรียกก่อน early return เสมอ (กติกา hooks)
 * · ใช้คู่ `useClearOnClose()` (ล้างข้อผิดตอนปิด) ได้
 */
export function useResetOnRecordChange(recordId: string | null, reset: () => void): void {
  const [owner, setOwner] = useState<string | null>(recordId)
  const next = draftOwnerTransition(owner, recordId)
  if (next.owner !== owner) {
    setOwner(next.owner)
    if (next.reset) reset()
  }
}
