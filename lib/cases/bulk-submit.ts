import { caseRowActions } from '@/lib/cases/case-actions'

/**
 * staging E-029 (มติ PO 10/10/2569 "ทำเลย") — ส่งตรวจหลายเคสพร้อมกันจากหน้ารายการเคส · **pure** (mytester B-01)
 * เรียก API ส่งตรวจเดิม (`PATCH /api/cases/:id/status` action `review`) **ทีละเคสตามลำดับ** — ไม่มี endpoint ใหม่
 * server ตรวจความครบ/สิทธิ์/สถานะของแต่ละเคสเอง · ผลสำเร็จ/ไม่สำเร็จรายงานต่อแถว
 */

export const BULK_SUBMIT_ACTION = 'review'

/** เคสที่ติ๊กส่งตรวจได้ = แถวที่ปุ่ม "ส่งตรวจสอบ" ของแถวนั้นแสดงอยู่ (ชุดเงื่อนไขเดียวกับปุ่มเดี่ยว) */
export function bulkSubmittableIds(
  items: readonly { id: string; status: string }[],
  can: (capability: string) => boolean,
): string[] {
  return items
    .filter((item) => caseRowActions(item.status, can).some((button) => button.action === BULK_SUBMIT_ACTION))
    .map((item) => item.id)
}

export interface BulkSubmitTarget {
  id: string
  caseRef: string
}

export interface BulkSubmitResult {
  id: string
  caseRef: string
  ok: boolean
  /** สำเร็จ = สถานะใหม่ · ไม่สำเร็จ = เหตุผลจาก API (รายการเอกสาร/ช่องที่ขาด) */
  message: string
  /** มติ PO U129 — ส่งได้แต่ IMEI ชนเครื่องที่ยังไม่ส่งมอบ */
  warning: string | null
}

export type BulkSubmitAttempt =
  | { ok: true; statusLabel: string; warning: string | null }
  | { ok: false; message: string }

/**
 * ส่งตรวจทีละเคสตามลำดับที่เลือก (ไม่ยิงพร้อมกัน — กันชนเลขเอกสาร/ภาระ server และให้ผลอ่านง่าย)
 * error ของเคสหนึ่งไม่หยุดเคสถัดไป · `onProgress` รายงานจำนวนที่ทำแล้ว
 */
export async function runBulkSubmit(
  targets: readonly BulkSubmitTarget[],
  submit: (target: BulkSubmitTarget) => Promise<BulkSubmitAttempt>,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkSubmitResult[]> {
  const results: BulkSubmitResult[] = []
  for (const target of targets) {
    let attempt: BulkSubmitAttempt
    try {
      attempt = await submit(target)
    } catch (error) {
      attempt = { ok: false, message: error instanceof Error ? error.message : 'ส่งตรวจไม่สำเร็จ — กรุณาลองใหม่' }
    }
    results.push(
      attempt.ok
        ? { id: target.id, caseRef: target.caseRef, ok: true, message: attempt.statusLabel, warning: attempt.warning }
        : { id: target.id, caseRef: target.caseRef, ok: false, message: attempt.message, warning: null },
    )
    onProgress?.(results.length, targets.length)
  }
  return results
}

/** ข้อความสรุปหลังส่ง เช่น "ส่งตรวจสำเร็จ 3 จาก 4 เคส" */
export function bulkSubmitSummary(results: readonly BulkSubmitResult[]): string {
  const succeeded = results.filter((result) => result.ok).length
  return `ส่งตรวจสำเร็จ ${succeeded} จาก ${results.length} เคส`
}
