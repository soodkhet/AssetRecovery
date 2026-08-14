import { describe, expect, it } from 'vitest'
import {
  SETTINGS_ERROR_CODES,
  settingsErrorMessage,
  settingsErrorStatus,
} from '@/lib/settings/errors'
import {
  approvalMatrixCreateSchema,
  bankAccountCreateSchema,
  bankFileFormatCreateSchema,
  bodyTouchesNumberingSequence,
  costCenterCreateSchema,
  cycleCreateSchema,
  cycleDueRuleLabel,
  financePolicyUpdateSchema,
  functionalPermissionUpdateSchema,
  numberingUpdateSchema,
  taxDocTemplateUpdateSchema,
  taxProfileCreateSchema,
  vatRateCreateSchema,
} from '@/lib/settings/schemas'

/** Rule 04/13 — Zod ชุดเดียวใช้ร่วม FE/BE · `reason` บังคับทุก mutation ของไฟล์ 13 */

const REASON = 'ตั้งค่าตามมติที่ประชุมการเงิน'

const validCycle = {
  reason: REASON,
  name: 'AR รอบวางบิลหลัก',
  type: 'AR',
  cutoffRuleType: 'fixed_dates',
  cutoffDates: [15, 30],
  cutoffText: '',
  dueRuleType: 'net_days',
  dueRuleValue: 30,
  scope: 'ทุกไฟแนนซ์',
}

describe('reason บังคับทุกหมวด', () => {
  const cases: [string, { safeParse: (input: unknown) => { success: boolean } }, Record<string, unknown>][] = [
    ['cycles', cycleCreateSchema, validCycle],
    [
      'approval-matrix',
      approvalMatrixCreateSchema,
      { reason: REASON, condition: 'Claim ปกติ', conditionThresholdSatang: 500_000, approvalFlow: ['การเงิน'] },
    ],
    [
      'cost-centers',
      costCenterCreateSchema,
      { reason: REASON, name: 'ทีม A / Inhouse', description: '' },
    ],
  ]

  it.each(cases)('%s — ไม่มี reason = ไม่ผ่าน', (_name, schema, payload) => {
    const { reason: _omit, ...withoutReason } = payload
    expect(schema.safeParse(payload).success).toBe(true)
    expect(schema.safeParse(withoutReason).success).toBe(false)
  })

  it('reason สั้นเกินไปไม่ผ่าน (`90` §13)', () => {
    expect(cycleCreateSchema.safeParse({ ...validCycle, reason: 'สั้น' }).success).toBe(false)
  })
})

describe('cycleCreateSchema (§6.1)', () => {
  it('fixed_dates ที่ไม่ระบุวันเลย = ไม่ผ่าน (ตรงกับ CHECK `cycles_cutoff_shape`)', () => {
    const parsed = cycleCreateSchema.safeParse({ ...validCycle, cutoffDates: [] })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues.flatMap((issue) => issue.path)).toContain('cutoffDates')
  })

  it('custom_text ที่ไม่มีข้อความ = ไม่ผ่าน', () => {
    expect(
      cycleCreateSchema.safeParse({ ...validCycle, cutoffRuleType: 'custom_text', cutoffDates: [], cutoffText: '' }).success,
    ).toBe(false)
  })

  it('month_end ไม่ต้องมี cutoffDates/cutoffText', () => {
    expect(
      cycleCreateSchema.safeParse({ ...validCycle, cutoffRuleType: 'month_end', cutoffDates: [], cutoffText: '' }).success,
    ).toBe(true)
  })

  it('วันที่ตัดรอบนอกช่วง 1-31 = ไม่ผ่าน', () => {
    expect(cycleCreateSchema.safeParse({ ...validCycle, cutoffDates: [0] }).success).toBe(false)
    expect(cycleCreateSchema.safeParse({ ...validCycle, cutoffDates: [32] }).success).toBe(false)
  })

  it('due rule ที่ต้องมีค่าแต่ไม่ส่งมา = ไม่ผ่าน (CHECK `cycles_due_rule_shape` — A5)', () => {
    expect(cycleCreateSchema.safeParse({ ...validCycle, dueRuleValue: null }).success).toBe(false)
  })

  it('month_end ไม่ต้องมี dueRuleValue', () => {
    expect(cycleCreateSchema.safeParse({ ...validCycle, dueRuleType: 'month_end', dueRuleValue: null }).success).toBe(true)
  })

  it('day_of_next_month ที่เกิน 31 = ไม่ผ่าน', () => {
    expect(
      cycleCreateSchema.safeParse({ ...validCycle, dueRuleType: 'day_of_next_month', dueRuleValue: 40 }).success,
    ).toBe(false)
  })

  it('label `due_rule` มาจาก type+value ไม่ให้ผู้ใช้พิมพ์เอง (A5)', () => {
    const parsed = cycleCreateSchema.parse(validCycle)
    expect(cycleDueRuleLabel(parsed)).toBe('Net 30 วัน')
  })
})

describe('approvalMatrixCreateSchema (§6.2)', () => {
  const base = { reason: REASON, condition: 'Claim เกินเพดาน', approvalFlow: ['ผู้จัดการ', 'การเงิน'] }

  it('เพดานเงินทศนิยม = ไม่ผ่าน (เงินเป็น satang เท่านั้น — Rule 01)', () => {
    expect(approvalMatrixCreateSchema.safeParse({ ...base, conditionThresholdSatang: 500.5 }).success).toBe(false)
  })

  it('เพดานเงินติดลบ = ไม่ผ่าน', () => {
    expect(approvalMatrixCreateSchema.safeParse({ ...base, conditionThresholdSatang: -1 }).success).toBe(false)
  })

  it('ไม่ระบุเพดาน = null (สายที่ไม่อ้างเงิน)', () => {
    const parsed = approvalMatrixCreateSchema.parse(base)
    expect(parsed.conditionThresholdSatang).toBeNull()
  })

  it('สายอนุมัติว่าง = ไม่ผ่าน', () => {
    expect(approvalMatrixCreateSchema.safeParse({ ...base, approvalFlow: [] }).success).toBe(false)
  })

  it('บังคับแยกหน้าที่ + บทบาทซ้ำ = ไม่ผ่าน (ไฟล์ 16)', () => {
    expect(
      approvalMatrixCreateSchema.safeParse({
        ...base,
        approvalFlow: ['การเงิน', 'การเงิน'],
        enforceSegregationOfDuties: true,
      }).success,
    ).toBe(false)
  })

  it('ไม่บังคับแยกหน้าที่ = บทบาทซ้ำได้', () => {
    expect(approvalMatrixCreateSchema.safeParse({ ...base, approvalFlow: ['การเงิน', 'การเงิน'] }).success).toBe(true)
  })
})

describe('financePolicyUpdateSchema (§6.2.1)', () => {
  const base = {
    reason: REASON,
    requirePayeeIdDocument: false,
    arAgingBuckets: [30, 60, 90],
    writeOffToleranceSatang: 5_000,
    advanceUnclearedToEmployeeReceivable: true,
  }

  it('ค่าครบผ่าน + เพดาน advance ไม่ส่ง = null (ไม่จำกัด)', () => {
    const parsed = financePolicyUpdateSchema.parse(base)
    expect(parsed.advanceMaxAmountPerRequestSatang).toBeNull()
  })

  it('ช่วงอายุหนี้ว่าง = ไม่ผ่าน', () => {
    expect(financePolicyUpdateSchema.safeParse({ ...base, arAgingBuckets: [] }).success).toBe(false)
  })

  it('เพดาน advance ทศนิยม = ไม่ผ่าน (satang เท่านั้น)', () => {
    expect(financePolicyUpdateSchema.safeParse({ ...base, advanceMaxAmountPerRequestSatang: 1.5 }).success).toBe(false)
  })
})

describe('bankAccountCreateSchema (§6.3)', () => {
  const base = {
    reason: REASON,
    bankName: 'ธนาคารกสิกรไทย',
    accountName: 'บริษัท แอสเซท รีคัฟเวอรี่ จำกัด',
    accountNumber: '123-4-56789-0',
    accountType: 'current',
    usage: 'both',
    statementFormat: '',
    paymentFileFormat: '',
    autoMatchToleranceDays: 7,
  }

  it('ค่าครบผ่าน + ช่องว่างกลายเป็น null', () => {
    const parsed = bankAccountCreateSchema.parse(base)
    expect(parsed.statementFormat).toBeNull()
    expect(parsed.isPrimary).toBe(false)
  })

  it('เลขบัญชีที่มีตัวอักษร = ไม่ผ่าน', () => {
    expect(bankAccountCreateSchema.safeParse({ ...base, accountNumber: '12345678AB' }).success).toBe(false)
  })

  it('usage นอก enum = ไม่ผ่าน (`02` §3)', () => {
    expect(bankAccountCreateSchema.safeParse({ ...base, usage: 'payout' }).success).toBe(false)
  })

  it('tolerance ติดลบ / เกินเพดาน = ไม่ผ่าน', () => {
    expect(bankAccountCreateSchema.safeParse({ ...base, autoMatchToleranceDays: -1 }).success).toBe(false)
    expect(bankAccountCreateSchema.safeParse({ ...base, autoMatchToleranceDays: 91 }).success).toBe(false)
  })
})

describe('taxProfileCreateSchema (§6.4)', () => {
  const base = {
    reason: REASON,
    name: 'Outsource บุคคลธรรมดา',
    whtPct: 3,
    whtBasis: 'before_vat',
    whtMinThresholdSatang: 100_000,
    incomeType: 'ค่าจ้างทำของ มาตรา 40(8)',
    filingForm: 'PND3',
  }

  it('ค่ามาตรฐานผ่าน', () => {
    expect(taxProfileCreateSchema.safeParse(base).success).toBe(true)
  })

  it('อัตรา WHT เกิน 100 / ติดลบ = ไม่ผ่าน (`INVALID_WHT_RATE`)', () => {
    expect(taxProfileCreateSchema.safeParse({ ...base, whtPct: 101 }).success).toBe(false)
    expect(taxProfileCreateSchema.safeParse({ ...base, whtPct: -1 }).success).toBe(false)
  })

  it('อัตรา WHT ทศนิยมเกิน 2 ตำแหน่ง = ไม่ผ่าน (NUMERIC(5,2))', () => {
    expect(taxProfileCreateSchema.safeParse({ ...base, whtPct: 3.005 }).success).toBe(false)
    expect(taxProfileCreateSchema.safeParse({ ...base, whtPct: 1.5 }).success).toBe(true)
  })

  it('เกณฑ์ขั้นต่ำทศนิยม = ไม่ผ่าน (เงินเป็น satang)', () => {
    expect(taxProfileCreateSchema.safeParse({ ...base, whtMinThresholdSatang: 1000.5 }).success).toBe(false)
  })
})

describe('vatRateCreateSchema (§6.5)', () => {
  const base = { reason: REASON, ratePct: 7, effectiveFrom: '2026-10-01', effectiveTo: '', note: '' }

  it('แปลงวันที่เป็นเที่ยงคืน **UTC** — คอลัมน์เป็น DATE ห้ามเลื่อนวันเพราะ timezone', () => {
    const parsed = vatRateCreateSchema.parse(base)
    expect(parsed.effectiveFrom.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(parsed.effectiveTo).toBeNull()
  })

  it('ปิดช่วงได้ด้วย effectiveTo', () => {
    const parsed = vatRateCreateSchema.parse({ ...base, effectiveTo: '2027-09-30' })
    expect(parsed.effectiveTo?.toISOString()).toBe('2027-09-30T00:00:00.000Z')
  })

  it('วันสิ้นสุดมาก่อนวันเริ่ม = ไม่ผ่าน', () => {
    expect(vatRateCreateSchema.safeParse({ ...base, effectiveTo: '2026-09-30' }).success).toBe(false)
  })

  it('รูปแบบวันที่ผิด / วันที่ไม่มีจริง = ไม่ผ่าน', () => {
    expect(vatRateCreateSchema.safeParse({ ...base, effectiveFrom: '01/10/2569' }).success).toBe(false)
    expect(vatRateCreateSchema.safeParse({ ...base, effectiveFrom: '2026-02-30' }).success).toBe(false)
  })

  it('อัตรา VAT ทศนิยม 2 ตำแหน่งได้ (NUMERIC(5,2))', () => {
    expect(vatRateCreateSchema.safeParse({ ...base, ratePct: 7.5 }).success).toBe(true)
    expect(vatRateCreateSchema.safeParse({ ...base, ratePct: 7.555 }).success).toBe(false)
  })
})

describe('bankFileFormatCreateSchema (§6.8)', () => {
  const base = {
    reason: REASON,
    bankName: 'ธนาคารกรุงไทย',
    fileType: 'CSV',
    encoding: 'UTF_8',
    columnMapping: 'receiving_bank_code, receiving_account_no, receiving_account_name, amount',
  }

  it('ค่าครบผ่าน', () => {
    expect(bankFileFormatCreateSchema.safeParse(base).success).toBe(true)
  })

  it('encoding ใช้ชื่อ Prisma (`UTF_8`/`TIS_620`) ไม่ใช่ค่าที่มีขีดกลาง', () => {
    expect(bankFileFormatCreateSchema.safeParse({ ...base, encoding: 'UTF-8' }).success).toBe(false)
    expect(bankFileFormatCreateSchema.safeParse({ ...base, encoding: 'TIS_620' }).success).toBe(true)
  })

  it('mapping ว่าง = ไม่ผ่าน', () => {
    expect(bankFileFormatCreateSchema.safeParse({ ...base, columnMapping: '   ' }).success).toBe(false)
  })

  it('test_status ส่งมาเองไม่ได้ (เปลี่ยนผ่าน `POST /:id/test` เท่านั้น — Rule 04)', () => {
    const parsed = bankFileFormatCreateSchema.parse({ ...base, testStatus: 'passed' })
    expect(parsed).not.toHaveProperty('testStatus')
  })
})

describe('numberingUpdateSchema (§6.12)', () => {
  const base = { reason: REASON, mode: 'continuous', prefix: 'INV', digitLength: 4 }

  it('ค่าครบผ่าน', () => {
    expect(numberingUpdateSchema.safeParse(base).success).toBe(true)
  })

  it('prefix ที่มีขีด/อักขระพิเศษ = ไม่ผ่าน (ตัวคั่นระบบใส่ให้)', () => {
    expect(numberingUpdateSchema.safeParse({ ...base, prefix: 'INV-' }).success).toBe(false)
  })

  it('จำนวนหลักนอกช่วง 3-10 = ไม่ผ่าน', () => {
    expect(numberingUpdateSchema.safeParse({ ...base, digitLength: 2 }).success).toBe(false)
    expect(numberingUpdateSchema.safeParse({ ...base, digitLength: 11 }).success).toBe(false)
  })

  it('ตรวจจับความพยายามแก้ตัวเดินเลขด้วยมือ (`NUMBERING_SEQ_NOT_EDITABLE`)', () => {
    expect(bodyTouchesNumberingSequence({ ...base, lastNumber: 500 })).toBe(true)
    expect(bodyTouchesNumberingSequence({ ...base, taxInvoiceSeq: 1 })).toBe(true)
    expect(bodyTouchesNumberingSequence({ ...base, lastResetYear: 2569 })).toBe(true)
    expect(bodyTouchesNumberingSequence(base)).toBe(false)
    expect(bodyTouchesNumberingSequence(null)).toBe(false)
  })
})

describe('taxDocTemplateUpdateSchema (§6.13)', () => {
  const base = {
    reason: REASON,
    documentType: 'tax_invoice',
    logoUrl: '',
    footerNote: '',
    signatureImageUrl: '',
    paperSize: 'A4',
    language: 'th',
  }

  it('ช่องว่างกลายเป็น null', () => {
    const parsed = taxDocTemplateUpdateSchema.parse(base)
    expect(parsed.logoUrl).toBeNull()
    expect(parsed.signatureImageUrl).toBeNull()
  })

  it('ลิงก์ที่ไม่ใช่ URL = ไม่ผ่าน', () => {
    expect(taxDocTemplateUpdateSchema.safeParse({ ...base, logoUrl: 'logo.png' }).success).toBe(false)
    expect(taxDocTemplateUpdateSchema.safeParse({ ...base, logoUrl: 'https://cdn.example.com/l.png' }).success).toBe(true)
  })

  it('ขนาดกระดาษ/ภาษานอก enum = ไม่ผ่าน', () => {
    expect(taxDocTemplateUpdateSchema.safeParse({ ...base, paperSize: 'A3' }).success).toBe(false)
    expect(taxDocTemplateUpdateSchema.safeParse({ ...base, language: 'en' }).success).toBe(false)
  })
})

describe('functionalPermissionUpdateSchema (§6.10)', () => {
  const entry = { roleId: '00000000-0000-4000-8000-000000000001', capabilityCode: 'approve_expense_finance', level: 'view' }

  it('รายการเดียวผ่าน', () => {
    expect(functionalPermissionUpdateSchema.safeParse({ reason: REASON, entries: [entry] }).success).toBe(true)
  })

  it('รายการว่าง = ไม่ผ่าน', () => {
    expect(functionalPermissionUpdateSchema.safeParse({ reason: REASON, entries: [] }).success).toBe(false)
  })

  it('ระดับสิทธิ์นอก 3 ระดับ (DEC-009) = ไม่ผ่าน', () => {
    expect(
      functionalPermissionUpdateSchema.safeParse({ reason: REASON, entries: [{ ...entry, level: 'admin' }] }).success,
    ).toBe(false)
  })
})

describe('error catalog ของโมดูล (Rule 04)', () => {
  it('ทุก code มี status + ข้อความไทยครบ', () => {
    for (const code of SETTINGS_ERROR_CODES) {
      expect(settingsErrorStatus(code)).toBeGreaterThanOrEqual(400)
      const message = settingsErrorMessage(code)
      expect(message.title.length).toBeGreaterThan(0)
      expect(message.message.length).toBeGreaterThan(0)
    }
  })

  it('code ไม่ซ้ำ', () => {
    expect(new Set(SETTINGS_ERROR_CODES).size).toBe(SETTINGS_ERROR_CODES.length)
  })

  it('code ที่ลงท้าย `_NOT_FOUND` ต้องเป็น 404 (ไม่ leak ว่ามี record ในองค์กรอื่น)', () => {
    for (const code of SETTINGS_ERROR_CODES.filter((value) => value.endsWith('_NOT_FOUND'))) {
      expect(settingsErrorStatus(code)).toBe(404)
    }
  })
})
