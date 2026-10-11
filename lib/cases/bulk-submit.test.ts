import { describe, expect, it } from 'vitest'
import { bulkSubmitSummary, bulkSubmittableIds, runBulkSubmit, type BulkSubmitAttempt } from '@/lib/cases/bulk-submit'
import { CASE_ACTION_CAPABILITIES } from '@/lib/cases/state-machine'

describe('mytester B-01 — ส่งตรวจหลายเคส (E-029)', () => {
  const reviewCaps = new Set(CASE_ACTION_CAPABILITIES.review)
  const canClerk = (capability: string) => reviewCaps.has(capability)

  it('เลือกได้เฉพาะเคสที่ปุ่มส่งตรวจของแถวแสดง (ร่างเท่านั้น — ขอข้อมูลเพิ่มต้องกลับเป็นร่างก่อน) · ไม่มีสิทธิ์ = เลือกไม่ได้', () => {
    const items = [
      { id: 'a', status: 'draft' },
      { id: 'b', status: 'pending_review' },
      { id: 'c', status: 'need_info' },
      { id: 'd', status: 'approved' },
    ]
    expect(bulkSubmittableIds(items, canClerk)).toEqual(['a'])
    expect(bulkSubmittableIds(items, () => false)).toEqual([])
  })

  it('ส่งทีละเคสตามลำดับ · เคสที่ล้มไม่หยุดเคสถัดไป · error ที่โยนมากลายเป็นแถวไม่สำเร็จ', async () => {
    const order: string[] = []
    const progress: number[] = []
    const results = await runBulkSubmit(
      [
        { id: '1', caseRef: 'C-1' },
        { id: '2', caseRef: 'C-2' },
        { id: '3', caseRef: 'C-3' },
      ],
      async (target): Promise<BulkSubmitAttempt> => {
        order.push(target.id)
        if (target.id === '2') return { ok: false, message: 'เอกสารที่ยังไม่ได้แนบ: สัญญาเช่าซื้อ' }
        if (target.id === '3') throw new Error('เครือข่ายขัดข้อง')
        return { ok: true, statusLabel: 'รอพิจารณา', warning: null }
      },
      (done) => progress.push(done),
    )
    expect(order).toEqual(['1', '2', '3'])
    expect(progress).toEqual([1, 2, 3])
    expect(results.map((result) => [result.caseRef, result.ok, result.message])).toEqual([
      ['C-1', true, 'รอพิจารณา'],
      ['C-2', false, 'เอกสารที่ยังไม่ได้แนบ: สัญญาเช่าซื้อ'],
      ['C-3', false, 'เครือข่ายขัดข้อง'],
    ])
    expect(bulkSubmitSummary(results)).toBe('ส่งตรวจสำเร็จ 1 จาก 3 เคส')
  })
})
