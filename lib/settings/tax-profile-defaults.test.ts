import { describe, expect, it } from 'vitest'
import {
  TAX_PROFILE_DEFAULT_SLOTS,
  emptyTaxProfileDefaults,
  pickTaxProfileDefault,
  taxProfileDefaultSlotOf,
} from '@/lib/settings/tax-profile-defaults'
import { taxProfileDefaultsCreateSchema } from '@/lib/settings/schemas'

/** มติ PO 06/10/2569 U121 — Tax Profile ค่าเริ่มต้นตามประเภทผู้รับ (ฝั่ง × ชนิดผู้รับ) */
describe('taxProfileDefaultSlotOf / pickTaxProfileDefault', () => {
  const defaults = {
    inhouseIndividual: 'in-ind',
    inhouseCorporate: 'in-corp',
    outsourceIndividual: 'out-ind',
    outsourceCorporate: 'out-corp',
  }

  it('จับคู่ 4 ช่องตามฝั่ง × ชนิดผู้รับ', () => {
    expect(pickTaxProfileDefault(defaults, 'inhouse', 'individual')).toBe('in-ind')
    expect(pickTaxProfileDefault(defaults, 'inhouse', 'corporate')).toBe('in-corp')
    expect(pickTaxProfileDefault(defaults, 'outsource', 'individual')).toBe('out-ind')
    expect(pickTaxProfileDefault(defaults, 'outsource', 'corporate')).toBe('out-corp')
  })

  it('ไม่มีฝั่ง (ผู้รับฝั่งสำนักงาน) ⇒ ไม่มีช่อง · ไม่มีค่าเริ่มต้น', () => {
    expect(taxProfileDefaultSlotOf(null, 'individual')).toBeNull()
    expect(pickTaxProfileDefault(defaults, null, 'corporate')).toBeNull()
  })

  it('ช่องว่าง ⇒ null', () => {
    expect(pickTaxProfileDefault(emptyTaxProfileDefaults<string>(), 'outsource', 'individual')).toBeNull()
    expect(TAX_PROFILE_DEFAULT_SLOTS).toHaveLength(4)
  })
})

describe('taxProfileDefaultsCreateSchema', () => {
  const id = '11111111-1111-4111-8111-111111111111'

  it('ช่องว่าง/สตริงว่าง = null · เหตุผลบังคับ', () => {
    const parsed = taxProfileDefaultsCreateSchema.parse({
      inhouseIndividual: '',
      outsourceIndividual: id,
      reason: 'ตั้งค่าเริ่มต้น outsource',
    })
    expect(parsed).toEqual({
      inhouseIndividual: null,
      inhouseCorporate: null,
      outsourceIndividual: id,
      outsourceCorporate: null,
      reason: 'ตั้งค่าเริ่มต้น outsource',
    })
    expect(taxProfileDefaultsCreateSchema.safeParse({ outsourceIndividual: id, reason: '' }).success).toBe(false)
  })

  it('id ไม่ใช่ uuid ⇒ ไม่ผ่าน', () => {
    expect(taxProfileDefaultsCreateSchema.safeParse({ outsourceIndividual: 'abc', reason: 'x' }).success).toBe(false)
  })
})
