import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * ตัวช่วย **pure** ของการอัปโหลดไฟล์แนบเคส (mytester B-04 · B-14)
 *
 * - อัปโหลดขึ้น Storage แบบขนานจำกัดจำนวน (เดิมทีละไฟล์ต่อกัน 3–4 ไฟล์ใช้ 5–8 วินาที)
 * - ป้ายสถานะต่อช่องแยก "อัปโหลดแล้ว" (ผูกกับเคสแล้วจริง) ออกจาก "รออัปโหลด" (เพิ่งเลือก ยังไม่ส่ง)
 */

/** จำนวนไฟล์ที่อัปโหลดพร้อมกัน — พอเร็วขึ้นชัดเจนโดยไม่แย่งแบนด์วิดท์มือถือจนทุกไฟล์ช้า */
export const CASE_UPLOAD_CONCURRENCY = 3

/**
 * รัน `worker` กับทุกรายการ พร้อมกันไม่เกิน `limit` ตัว — คืนผลตามลำดับเดิมของ `items` เสมอ
 * (ไม่ throw: ตัวที่ล้มคืนเป็น `rejected` ให้ผู้เรียกรายงานรายไฟล์)
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array<PromiseSettledResult<R>>(items.length)
  let next = 0
  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index] as T, index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  const lanes = Math.max(1, Math.min(Math.floor(limit), items.length))
  await Promise.all(Array.from({ length: lanes }, () => lane()))
  return results
}

/** ป้ายสถานะของช่องเอกสาร — นับเฉพาะไฟล์ที่ผูกกับเคสแล้วว่า "อัปโหลดแล้ว" */
export function slotUploadBadge(uploaded: number, pending: number): { label: string; group: StatusBadgeGroup } {
  if (pending > 0) {
    return {
      label: uploaded > 0 ? `อัปโหลดแล้ว ${uploaded} · รออัปโหลด ${pending} ไฟล์` : `รออัปโหลด ${pending} ไฟล์`,
      group: 'pending',
    }
  }
  if (uploaded > 0) return { label: `อัปโหลดแล้ว ✓ (${uploaded} ไฟล์)`, group: 'success' }
  return { label: 'ยังไม่อัปโหลด', group: 'neutral' }
}

/** ข้อความความคืบหน้าระหว่างอัปโหลดหลังกดบันทึก */
export function uploadProgressLabel(done: number, total: number): string {
  return `กำลังอัปโหลดไฟล์ ${Math.min(done, total)}/${total} — อย่าปิดหน้านี้`
}
