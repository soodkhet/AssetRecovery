import { describe, expect, it } from 'vitest'
import type { Prisma } from '@/lib/generated/prisma/client'
import { inLineage, lineageKeyOfRow, notInLineage } from '@/lib/versioning/lineage'

/** FX review L5 — ตัวกลางสายเวอร์ชัน ใช้ร่วมแผนค่าตอบแทน/เทมเพลตค่าบริการ */
describe('lib/versioning/lineage', () => {
  it('key ของสาย = lineage_id หรือ id ของตัวเองเมื่อเป็นเวอร์ชันแรก', () => {
    expect(lineageKeyOfRow({ id: 'a', lineageId: null })).toBe('a')
    expect(lineageKeyOfRow({ id: 'b', lineageId: 'a' })).toBe('a')
  })

  it('inLineage = ตัวแรก + ตัวถัดไป · ใช้เป็น where ได้ทั้งสองตาราง', () => {
    const plan: Prisma.CompensationPlanWhereInput = inLineage('k')
    const template: Prisma.ServiceFeeTemplateWhereInput = inLineage('k')
    expect(plan).toEqual({ OR: [{ id: 'k' }, { lineageId: 'k' }] })
    expect(template).toEqual(plan)
  })

  it('notInLineage null-safe — ไม่ใช่ NOT ของ inLineage (เวอร์ชันแรกของสายอื่นมี lineage_id = NULL)', () => {
    const where: Prisma.ServiceFeeTemplateWhereInput = notInLineage('k')
    expect(where).toEqual({ NOT: { id: 'k' }, OR: [{ lineageId: null }, { lineageId: { not: 'k' } }] })
    expect(where).not.toHaveProperty('NOT.OR')
  })
})
