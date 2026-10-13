import { describe, expect, it } from 'vitest'
import { auditRefLabel, auditValueDisplay } from '@/lib/audit/log-display'
import {
  AUDIT_REF_TYPES,
  AUDIT_TARGET_TYPES_WITHOUT_REF,
  adjustmentRefLabel,
  assignmentRefLabel,
  auditRefKey,
  auditTargetContextRef,
  caseScopedRefLabel,
  customerWhtRefLabel,
  deviceTacRefLabel,
  effectiveVersionRefLabel,
  expenseRefLabel,
  fieldDaySettlementRefLabel,
  payeeAmountRefLabel,
  reassignmentRefLabel,
  shortRefText,
  signedAdjustmentDisplaySatang,
  vatRateRefLabel,
  auditOrgLevelTargetLabel,
  auditTargetRef,
  auditValueRefs,
  bankAccountRefLabel,
  bankFileFormatRefLabel,
  bankTransactionRefLabel,
  companyDocumentRefLabel,
  costCenterRefLabel,
  holidayRefLabel,
  jobRefLabel,
  taxProfileDefaultRefLabel,
  versionedRefLabel,
  caseRefLabel,
  cashReceiptRefLabel,
  exportRecordRefLabel,
  groupAuditRefs,
} from '@/lib/audit/target-refs'

/** known H-06 — เป้าหมาย/ค่าอ้างอิงในบันทึกการใช้งานเป็นชื่อที่อ่านได้ (ส่วน pure) */

const PERIOD = '0a1b2c3d-0000-4000-8000-000000000001'
const CASE = '0a1b2c3d-0000-4000-8000-000000000002'
const LOT = '0a1b2c3d-0000-4000-8000-000000000003'

describe('auditTargetRef', () => {
  it('ชนิดที่รู้จัก + UUID ⇒ ref (รวมชื่อเอกพจน์ billing_batch)', () => {
    expect(auditTargetRef({ targetType: 'cases', targetId: CASE })).toEqual({ type: 'cases', id: CASE })
    expect(auditTargetRef({ targetType: 'billing_batch', targetId: LOT })).toEqual({ type: 'billing_batches', id: LOT })
  })
  it('ไม่รู้จักชนิด / ไม่มี id / ไม่ใช่ UUID ⇒ null', () => {
    expect(auditTargetRef({ targetType: 'sessions', targetId: CASE })).toBeNull()
    expect(auditTargetRef({ targetType: 'cases', targetId: null })).toBeNull()
    expect(auditTargetRef({ targetType: 'cases', targetId: 'not-a-uuid' })).toBeNull()
  })
})

describe('auditValueRefs + groupAuditRefs', () => {
  it('เก็บเฉพาะฟิลด์อ้างอิงที่รู้จัก (snake/camel) ค่าเป็น UUID · รวมต่อชนิดไม่ซ้ำ', () => {
    const refs = [
      ...auditValueRefs({ period_id: PERIOD, status: 'open', note: CASE }),
      ...auditValueRefs({ periodId: PERIOD, lotId: LOT, caseId: CASE }),
      ...auditValueRefs(null),
      ...auditValueRefs(['x']),
    ]
    expect(refs).toHaveLength(4)
    const grouped = groupAuditRefs(refs)
    expect(grouped.get('accounting_periods')).toEqual([PERIOD])
    expect(grouped.get('handover_lots')).toEqual([LOT])
    expect(grouped.get('cases')).toEqual([CASE])
  })
})

describe('ป้ายที่แสดง', () => {
  it('เคสรอบที่ 2 ขึ้นไปบอกรอบ', () => {
    expect(caseRefLabel('FT-001', 1)).toBe('FT-001')
    expect(caseRefLabel('FT-001', 2)).toBe('FT-001 (รอบที่ 2)')
  })
  it('ค่าก่อน/หลังที่เป็น id ⇒ ชื่อจาก refLabels · ไม่มีป้าย/ฟิลด์ทั่วไป ⇒ ค่าเดิม', () => {
    const labels = { [PERIOD]: 'ตุลาคม 2569' }
    expect(auditValueDisplay(PERIOD, 'period_id', 'exceptions', labels)).toBe('ตุลาคม 2569')
    expect(auditValueDisplay(PERIOD.toUpperCase(), 'period_id', 'exceptions', labels)).toBe('ตุลาคม 2569')
    expect(auditValueDisplay(CASE, 'period_id', 'exceptions', labels)).toBe(CASE)
    expect(auditValueDisplay(PERIOD, 'note', 'exceptions', labels)).toBe(PERIOD)
    expect(auditValueDisplay('open', 'status', 'exceptions', labels)).toBe('เปิดอยู่')
    expect(auditRefLabel(PERIOD, 'note', labels)).toBeNull()
  })
})

describe('ทดสอบซ้ำ local LR5-01 — ชุดส่งบัญชี / แบรนด์ / รายการเดินบัญชี / รายการรับเงิน', () => {
  it('ชนิดเป้าหมายใหม่ถูกรู้จัก', () => {
    for (const type of ['export_records', 'device_brands', 'bank_transactions', 'cash_receipts'] as const) {
      expect(auditTargetRef({ targetType: type, targetId: CASE })).toEqual({ type, id: CASE })
    }
  })
  it('ฟิลด์อ้างอิง bank_transaction_id / cashReceiptId / brandId / exportRecordId', () => {
    const refs = auditValueRefs({ bank_transaction_id: CASE, cashReceiptId: LOT, brandId: PERIOD, exportRecordId: CASE })
    const grouped = groupAuditRefs(refs)
    expect(grouped.get('bank_transactions')).toEqual([CASE])
    expect(grouped.get('cash_receipts')).toEqual([LOT])
    expect(grouped.get('device_brands')).toEqual([PERIOD])
    expect(grouped.get('export_records')).toEqual([CASE])
  })
  it('รูปแบบป้าย', () => {
    expect(exportRecordRefLabel('ตุลาคม 2569', 'v1.2')).toBe('ชุดส่งบัญชี ตุลาคม 2569 v1.2')
    expect(bankTransactionRefLabel('08/10/2569', '฿1,070.00', 'กสิกรไทย')).toBe('08/10/2569 · ฿1,070.00 · กสิกรไทย')
    expect(cashReceiptRefLabel('BL-2569-010', '฿1,070.00')).toBe('รับเงิน BL-2569-010 · ฿1,070.00')
  })
})

describe('mytester5 A5-01 — รายการตั้งค่า + ค่าตั้งระดับองค์กรเป็นชื่อที่อ่านได้', () => {
  const ORG = '00000000-0000-4000-8000-0000000000aa'
  const ID = '0a1b2c3d-0000-4000-8000-0000000000bb'

  it('ตารางตั้งค่า 15 ชนิดเป็นเป้าหมายที่ระบบแปลงชื่อ', () => {
    for (const type of [
      'tax_profiles',
      'tax_profile_default_history',
      'bank_accounts',
      'billing_payout_cycles',
      'approval_matrices',
      'cost_centers',
      'document_number_series',
      'bank_file_formats',
      'service_fee_templates',
      'finance_company_documents',
      'payee_profiles',
      'public_holidays',
      'tax_document_template_settings',
      'device_models',
      'jobs',
    ]) {
      expect(AUDIT_REF_TYPES).toContain(type)
      expect(auditTargetRef({ targetType: type, targetId: ID })).toEqual({ type, id: ID })
    }
  })

  it('ค่าตั้งระดับองค์กร (target_id = id องค์กร) ⇒ ชื่อหมวด · SLA อยู่ในนโยบายมอบหมาย · id อื่น/ชนิดอื่น ⇒ null', () => {
    expect(auditOrgLevelTargetLabel({ targetType: 'organizations', targetId: ORG }, ORG)).toBe('ข้อมูลองค์กร')
    expect(auditOrgLevelTargetLabel({ targetType: 'finance_policy_settings', targetId: ORG.toUpperCase() }, ORG)).toBe(
      'นโยบายการเงิน',
    )
    expect(auditOrgLevelTargetLabel({ targetType: 'assignment_policy_settings', targetId: ORG }, ORG)).toBe(
      'นโยบายการมอบหมายงาน / SLA',
    )
    expect(auditOrgLevelTargetLabel({ targetType: 'organizations', targetId: ID }, ORG)).toBeNull()
    expect(auditOrgLevelTargetLabel({ targetType: 'cases', targetId: ORG }, ORG)).toBeNull()
    expect(auditOrgLevelTargetLabel({ targetType: 'organizations', targetId: null }, ORG)).toBeNull()
  })

  it('ค่าก่อน/หลังที่อ้างรายการตั้งค่า (tax_profile_id ฯลฯ) ถูกค้นชื่อด้วย', () => {
    expect(auditValueRefs({ tax_profile_id: ID, inhouse_individual_tax_profile_id: ID, cost_center_id: ID })).toEqual([
      { type: 'tax_profiles', id: ID },
      { type: 'tax_profiles', id: ID },
      { type: 'cost_centers', id: ID },
    ])
  })

  it('รูปแบบป้าย', () => {
    expect(costCenterRefLabel('CC-001', 'ทีมติดตาม Inhouse')).toBe('CC-001 ทีมติดตาม Inhouse')
    expect(versionedRefLabel('Success Fee 5%', 2)).toBe('Success Fee 5% (ฉบับที่ 2)')
    expect(holidayRefLabel('13/10/2569', 'วันคล้ายวันสวรรคต ร.9')).toBe('13/10/2569 วันคล้ายวันสวรรคต ร.9')
    expect(bankAccountRefLabel('ธนาคารกสิกรไทย', 'xxxxxx7890')).toBe('ธนาคารกสิกรไทย xxxxxx7890')
    expect(bankFileFormatRefLabel('payment', 'กสิกรไทย')).toBe('ไฟล์โอนเงิน กสิกรไทย')
    expect(bankFileFormatRefLabel('statement', 'กสิกรไทย')).toBe('ไฟล์เดินบัญชี กสิกรไทย')
    expect(companyDocumentRefLabel('หนังสือรับรองบริษัท', 'ไฟแนนซ์ A', 1)).toBe('หนังสือรับรองบริษัท · ไฟแนนซ์ A')
    expect(companyDocumentRefLabel('สัญญาว่าจ้าง', 'ไฟแนนซ์ A', 2)).toBe('สัญญาว่าจ้าง · ไฟแนนซ์ A (ฉบับที่ 2)')
    expect(taxProfileDefaultRefLabel('13/10/2569 10:00')).toBe('ฉบับ 13/10/2569 10:00')
    expect(jobRefLabel('สร้างไฟล์โอนเงินของรอบจ่าย', '13/10/2569 10:00')).toBe('สร้างไฟล์โอนเงินของรอบจ่าย · 13/10/2569 10:00')
  })
})

describe('mytester5 H5-01 — ธุรกรรม/ภาคสนามเป็นชื่อที่อ่านได้', () => {
  const ID = '0a1b2c3d-0000-4000-8000-0000000000cc'
  const CASE_ID = '0a1b2c3d-0000-4000-8000-0000000000dd'

  it('ชนิดธุรกรรม/ภาคสนาม 14 ชนิดที่ผู้ทดสอบพบ + ชื่อเอกพจน์ revenue/expense/payout_batch', () => {
    for (const type of [
      'expense_records',
      'expenses',
      'adjustments',
      'advance_returns',
      'customer_wht_certificates',
      'sales_records',
      'case_documents',
      'case_evidences',
      'check_ins',
      'case_assignments',
      'close_case_drafts',
      'field_day_settlements',
      'pending_reassignments',
      'jobs',
    ]) {
      expect(auditTargetRef({ targetType: type, targetId: ID })).toEqual({ type, id: ID })
    }
    expect(auditTargetRef({ targetType: 'expense', targetId: ID })).toEqual({ type: 'expenses', id: ID })
    expect(auditTargetRef({ targetType: 'revenue', targetId: ID })).toEqual({ type: 'revenues', id: ID })
    expect(auditTargetRef({ targetType: 'payout_batch', targetId: ID })).toEqual({ type: 'payout_batches', id: ID })
  })

  it('portal อยู่ในรายการยกเว้น (ไม่ค้นชื่อของ id ที่ผู้ใช้พอร์ทัลส่งมา)', () => {
    expect(AUDIT_TARGET_TYPES_WITHOUT_REF.portal).toBeTruthy()
    expect(auditTargetRef({ targetType: 'portal', targetId: ID })).toBeNull()
  })

  it('ฟิลด์ *_id ที่พบบ่อยในค่าก่อน/หลังถูกค้นชื่อ (snake/camel)', () => {
    const refs = auditValueRefs({
      cost_center_id: ID,
      payee_id: ID,
      case_id: ID,
      team_id: ID,
      company_id: ID,
      plan_id: ID,
      compPlanId: ID,
      advance_id: ID,
      approval_matrix_id: ID,
      assignmentId: ID,
      agentId: ID,
      evidenceApprovedId: ID,
      fieldDaySettlementId: ID,
      payout_batch_item_id: ID,
      expense_record_id: ID,
      matched_billing_id: ID,
      matched_payout_id: ID,
      wht_policy_id: ID,
      debtorNationalId: ID,
    })
    expect(refs.map((ref) => ref.type)).toEqual([
      'cost_centers',
      'payee_profiles',
      'cases',
      'teams',
      'finance_companies',
      'compensation_plans',
      'compensation_plans',
      'advances',
      'approval_matrices',
      'case_assignments',
      'users',
      'case_evidences',
      'field_day_settlements',
      'payout_batch_items',
      'expense_records',
      'billing_batches',
      'payout_batches',
      'wht_policy_history',
    ])
  })

  it('ร่างปิดงานที่ถูกลบแล้ว ⇒ ค่าอ้างอิงสำรอง = เคสในค่าหลัง · ชนิดอื่น/ไม่มีค่า ⇒ null', () => {
    expect(auditTargetContextRef({ targetType: 'close_case_drafts', afterData: { caseId: CASE_ID } })).toEqual({
      type: 'cases',
      id: CASE_ID,
    })
    expect(auditTargetContextRef({ targetType: 'close_case_drafts', afterData: { case_id: CASE_ID } })).toEqual({
      type: 'cases',
      id: CASE_ID,
    })
    expect(auditTargetContextRef({ targetType: 'close_case_drafts', afterData: null })).toBeNull()
    expect(auditTargetContextRef({ targetType: 'close_case_drafts', afterData: { caseId: 'x' } })).toBeNull()
    expect(auditTargetContextRef({ targetType: 'check_ins', afterData: { caseId: CASE_ID } })).toBeNull()
  })

  it('คีย์ป้ายแยกตามชนิด (id เดียวกันคนละชนิดไม่ชนกัน)', () => {
    expect(auditRefKey({ type: 'users', id: ID.toUpperCase() })).toBe(`users:${ID}`)
    expect(auditRefKey({ type: 'push_subscriptions', id: ID })).not.toBe(auditRefKey({ type: 'users', id: ID }))
  })

  it('รูปแบบป้าย', () => {
    expect(expenseRefLabel('ค่าน้ำมัน', 'MTJ-2569-01', '฿72.36')).toBe('ค่าน้ำมัน MTJ-2569-01 ฿72.36')
    expect(signedAdjustmentDisplaySatang('decrease', 10000)).toBe(-10000)
    expect(signedAdjustmentDisplaySatang('increase', 10000)).toBe(10000)
    expect(adjustmentRefLabel('ลดยอด', 'SPC-2569-0005', '−฿100.00')).toBe('ลดยอด SPC-2569-0005 −฿100.00')
    expect(assignmentRefLabel('MTJ-2569-01', 'อนันต์')).toBe('MTJ-2569-01 → อนันต์')
    expect(reassignmentRefLabel('MTJ-2569-01', 'สมชาย', 'อนันต์')).toBe('MTJ-2569-01: สมชาย → อนันต์')
    expect(caseScopedRefLabel('MTJ-2569-01', 'รูปสินค้า')).toBe('MTJ-2569-01 · รูปสินค้า')
    expect(fieldDaySettlementRefLabel('อนันต์', '13/10/2569', '฿250.00')).toBe('อนันต์ 13/10/2569 ฿250.00')
    expect(payeeAmountRefLabel('สมชาย', '฿500.00')).toBe('สมชาย ฿500.00')
    expect(payeeAmountRefLabel('สมชาย', '฿500.00', 'รอบจ่าย 1')).toBe('สมชาย ฿500.00 · รอบจ่าย 1')
    expect(payeeAmountRefLabel('สมชาย', '฿500.00', '  ')).toBe('สมชาย ฿500.00')
    expect(customerWhtRefLabel('ไฟแนนซ์ A', '฿30.00', null)).toBe('ไฟแนนซ์ A ฿30.00')
    expect(customerWhtRefLabel('ไฟแนนซ์ A', '฿30.00', '001/2569')).toBe('ไฟแนนซ์ A ฿30.00 (เลขที่ 001/2569)')
    expect(vatRateRefLabel('7.00%', '01/01/2569')).toBe('7.00% ตั้งแต่ 01/01/2569')
    expect(effectiveVersionRefLabel('01/10/2569')).toBe('ฉบับมีผล 01/10/2569')
    expect(deviceTacRefLabel('35391110', 'Apple', 'iPhone 15')).toBe('TAC 35391110 · Apple iPhone 15')
    expect(shortRefText('ยอด  ภ.ง.ด.3\nเดือนนี้')).toBe('ยอด ภ.ง.ด.3 เดือนนี้')
    expect(shortRefText('ก'.repeat(50), 10)).toBe(`${'ก'.repeat(9)}…`)
  })
})
