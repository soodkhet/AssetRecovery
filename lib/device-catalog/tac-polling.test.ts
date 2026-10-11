import { describe, expect, it } from 'vitest'
import { catalogEmptyDescription, shouldPollTacSummary, tacImportedAtText, tacJobFinishedNotice } from '@/lib/device-catalog/tac-polling'

describe('ติดตามงานอัปเดตฐาน TAC (staging E-019)', () => {
  const summary = (pendingJob: boolean) => ({ pendingJob, tacCount: 120_000, brandCount: 14 })

  it('มีงานรอ/กำลังทำ ⇒ ถามซ้ำ · ไม่มี ⇒ หยุด', () => {
    expect(shouldPollTacSummary(summary(true))).toBe(true)
    expect(shouldPollTacSummary(summary(false))).toBe(false)
    expect(shouldPollTacSummary(null)).toBe(false)
  })

  it('แจ้งผลเฉพาะตอนงานเพิ่งจบ (pending → ไม่ pending)', () => {
    expect(tacJobFinishedNotice(summary(true), summary(false))?.title).toBe('อัปเดตฐานรุ่นเครื่องเสร็จแล้ว')
    expect(tacJobFinishedNotice(summary(false), summary(false))).toBeNull()
    expect(tacJobFinishedNotice(null, summary(false))).toBeNull()
    expect(tacJobFinishedNotice(summary(true), summary(true))).toBeNull()
  })
})

describe('สถานะระหว่างนำเข้าฐาน TAC (mytester A-13)', () => {
  it('ตารางว่างระหว่างนำเข้า ⇒ บอกว่ากำลังนำเข้า ไม่ชวนกดอัปเดตซ้ำ', () => {
    const text = catalogEmptyDescription({ pendingJob: true, filtered: false, unit: 'แบรนด์' })
    expect(text).toContain('กำลังนำเข้า')
    expect(text).not.toContain('อัปเดตตอนนี้')
    expect(catalogEmptyDescription({ pendingJob: false, filtered: true, unit: 'แบรนด์' })).toContain('ไม่พบแบรนด์ที่ตรง')
    expect(catalogEmptyDescription({ pendingJob: false, filtered: false, unit: 'แบรนด์' })).toContain('อัปเดตตอนนี้')
  })

  it('ฐานยังว่างทั้งระบบ ⇒ "ยังไม่มีข้อมูล" แม้ตัวกรองค่าเริ่มต้นเปิดอยู่ (mytester2 A2-02)', () => {
    const text = catalogEmptyDescription({ pendingJob: false, filtered: true, catalogEmpty: true, unit: 'แบรนด์' })
    expect(text).toContain('ยังไม่มีข้อมูล')
    expect(text).not.toContain('ตรงกับคำค้น')
    // ระหว่างนำเข้ายังบอก "กำลังนำเข้า" ก่อน · มีข้อมูลแล้วแต่ไม่ตรงตัวกรอง ⇒ ข้อความเดิม
    expect(catalogEmptyDescription({ pendingJob: true, filtered: true, catalogEmpty: true, unit: 'รุ่น' })).toContain('กำลังนำเข้า')
    expect(catalogEmptyDescription({ pendingJob: false, filtered: true, catalogEmpty: false, unit: 'รุ่น' })).toContain('ไม่พบรุ่นที่ตรง')
  })

  it('นำเข้าสำเร็จล่าสุด: ระหว่างงานแรก ⇒ "กำลังนำเข้าครั้งแรก…" ไม่ใช่ "ยังไม่เคย"', () => {
    const fmt = (iso: string) => `F(${iso})`
    expect(tacImportedAtText({ pendingJob: true, tacImportedAt: null }, fmt)).toBe('กำลังนำเข้าครั้งแรก…')
    expect(tacImportedAtText({ pendingJob: false, tacImportedAt: null }, fmt)).toBe('ยังไม่เคย')
    expect(tacImportedAtText({ pendingJob: true, tacImportedAt: '2026-10-11T00:00:00Z' }, fmt)).toBe('F(2026-10-11T00:00:00Z)')
  })
})
