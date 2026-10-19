import { describe, expect, it } from 'vitest'
import { versionRangeEnd, type VersionRow } from '@/components/settings/version-history-modal'

const row = (version: number, isCurrent: boolean, effectiveFrom: string, effectiveTo: string | null = null): VersionRow => ({
  id: `v${version}`,
  version,
  isCurrent,
  updatedAt: '2026-10-19T10:00:00.000Z',
  effectiveFrom: `${effectiveFrom}T00:00:00.000Z`,
  effectiveTo: effectiveTo === null ? null : `${effectiveTo}T00:00:00.000Z`,
  summary: '',
})

describe('versionRangeEnd — เวอร์ชันที่ถูกแทนต้องไม่แสดง "ปัจจุบัน" (mytester7 SV7-VFX-01)', () => {
  it('ถูกแทนในวันเดียวกัน ⇒ "ถูกแทนที่" · เวอร์ชันล่าสุด ⇒ "ปัจจุบัน"', () => {
    const rows = [row(3, true, '2026-10-19'), row(2, false, '2026-10-19'), row(1, false, '2026-10-19')]
    expect(rows.map((r) => versionRangeEnd(r, rows))).toEqual(['ปัจจุบัน', 'ถูกแทนที่', 'ถูกแทนที่'])
  })

  it('เวอร์ชันถัดไปเริ่มทีหลัง ⇒ วันก่อนวันเริ่มของเวอร์ชันถัดไป (พ.ศ.)', () => {
    const rows = [row(2, true, '2026-11-01'), row(1, false, '2026-01-01')]
    expect(versionRangeEnd(rows[1] as VersionRow, rows)).toBe('31/10/2569')
  })

  it('มีวันสิ้นสุดจริง ⇒ ใช้วันนั้น', () => {
    const rows = [row(2, true, '2026-11-01'), row(1, false, '2026-01-01', '2026-10-15')]
    expect(versionRangeEnd(rows[1] as VersionRow, rows)).toBe('15/10/2569')
  })
})
