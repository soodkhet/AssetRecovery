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
  UNLINKED_ID_DOCUMENT_TARGET_LABEL,
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
  AUDIT_LIST_REF_DISPLAY_LIMIT,
  auditListFieldRefType,
  auditFieldRefType,
  isAuditRefField,
  AUDIT_NESTED_REF_MAX_DEPTH,
  auditReplaceNestedRefs,
  auditTextRefs,
  auditReplaceTextRefs,
  BANK_TRANSACTION_REMATCH_SUFFIX,
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
    // mytester5 รีวิว H5-01 — เปิดดูเอกสารยืนยันตัวตนที่ยังไม่ผูกผู้รับ (ลงที่องค์กร) ⇒ ป้ายเฉพาะ ไม่ใช่ "ข้อมูลองค์กร"
    const idDocView = { targetType: 'organizations', targetId: ORG, action: 'view', afterData: { kind: 'payee_id_document' } }
    expect(auditOrgLevelTargetLabel(idDocView, ORG)).toBe(UNLINKED_ID_DOCUMENT_TARGET_LABEL)
    expect(UNLINKED_ID_DOCUMENT_TARGET_LABEL).toBe('เอกสารยืนยันตัวตน (ยังไม่ผูกผู้รับ)')
    expect(auditOrgLevelTargetLabel({ ...idDocView, action: 'update' }, ORG)).toBe('ข้อมูลองค์กร')
    expect(auditOrgLevelTargetLabel({ ...idDocView, afterData: { kind: 'company_document' } }, ORG)).toBe('ข้อมูลองค์กร')
    expect(auditOrgLevelTargetLabel({ ...idDocView, afterData: null }, ORG)).toBe('ข้อมูลองค์กร')
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

describe('ทดสอบซ้ำ local LR6-01 — target_id แบบ polymorphic + รายการ id', () => {
  const ids = Array.from({ length: 7 }, (_, index) => `0a1b2c3d-0000-4000-8000-00000000060${index}`)

  it('ชนิดของรายการ id จากชื่อเอกพจน์ (ตัดคำนำหน้าได้) · ชื่อที่ไม่รู้จัก = null', () => {
    expect(auditListFieldRefType('manager_ids')).toBe('users')
    expect(auditListFieldRefType('assetIds')).toBe('assets')
    expect(auditListFieldRefType('caseIds')).toBe('cases')
    expect(auditListFieldRefType('company_ids')).toBe('finance_companies')
    expect(auditListFieldRefType('approval_flow_role_ids')).toBe('roles')
    expect(auditListFieldRefType('expense_record_ids')).toBe('expense_records')
    expect(auditListFieldRefType('released_expense_ids')).toBe('expenses')
    expect(auditListFieldRefType('managedTeamIds')).toBe('teams')
    expect(auditListFieldRefType('foo_ids')).toBeNull()
    expect(auditListFieldRefType('case_id')).toBeNull()
    expect(auditListFieldRefType('Ids')).toBeNull()
  })

  it('staging SV5-02 — รายการ id ที่มีคำขยายต่อท้าย + ฟิลด์ผู้ทำ (*By/*_by) เป็นผู้ใช้', () => {
    expect(auditListFieldRefType('assetIdsHandedOver')).toBe('assets')
    expect(auditListFieldRefType('expenseIdsUnlocked')).toBe('expenses')
    expect(auditListFieldRefType('revenueIdsCreated')).toBe('revenues')
    expect(auditListFieldRefType('revenueIdsReleased')).toBe('revenues')
    expect(auditListFieldRefType('revenue_ids_created')).toBe('revenues')
    expect(auditListFieldRefType('revenue_ids_released')).toBe('revenues')
    expect(auditListFieldRefType('foo_ids_created')).toBeNull()
    expect(auditListFieldRefType('requirePayeeIdDocument')).toBeNull()

    for (const field of ['uploadedBy', 'cancelledBy', 'managerApprovedBy', 'creditNoteWaivedBy', 'resolved_by', 'authorized_by']) {
      expect(auditFieldRefType(field)).toBe('users')
      expect(isAuditRefField(field)).toBe(true)
    }
    for (const field of ['orderBy', 'groupBy', 'replacedBy', 'supersededBy', 'blockedBy', 'By', 'by', 'reason']) {
      expect(auditFieldRefType(field)).toBeNull()
    }

    const refs = auditValueRefs({
      assetIdsHandedOver: [ids[0], ids[1]],
      revenue_ids_created: [ids[2]],
      uploadedBy: ids[3],
      orderBy: ids[4],
    })
    expect(refs).toEqual([
      { type: 'assets', id: ids[0] },
      { type: 'assets', id: ids[1] },
      { type: 'revenues', id: ids[2] },
      { type: 'users', id: ids[3] },
    ])
  })

  it('auditValueRefs: รายการ id (เฉพาะที่แสดง) + target_id ตาม target_type ข้างกัน', () => {
    expect(
      auditValueRefs({
        manager_ids: [ids[0], 'not-uuid', 5],
        assetIds: ids,
        target_type: 'billing_batch',
        target_id: ids[1],
      }),
    ).toEqual([
      { type: 'users', id: ids[0] },
      ...ids.slice(0, AUDIT_LIST_REF_DISPLAY_LIMIT).map((id) => ({ type: 'assets', id })),
      { type: 'billing_batches', id: ids[1] },
    ])
    expect(auditValueRefs({ target_type: 'unknown_thing', target_id: ids[0] })).toEqual([])
    expect(auditValueRefs({ target_id: ids[0] })).toEqual([])
    expect(auditValueRefs({ targetType: 'revenue', targetId: ids[2] })).toEqual([{ type: 'revenues', id: ids[2] }])
  })

  it('หน้าจอ: รายการ id เป็นชื่อคั่น ", " · เกินย่อ "+n รายการ" · หาไม่พบแสดง id ย่อ · target_id ใช้ป้ายจาก server', () => {
    const labels = Object.fromEntries(ids.map((id, index) => [id, `คน ${index + 1}`]))
    expect(auditValueDisplay([ids[0], ids[1]], 'manager_ids', 'teams', labels)).toBe('คน 1, คน 2')
    expect(auditValueDisplay(ids, 'assetIds', 'handover_lots', labels)).toBe('คน 1, คน 2, คน 3, คน 4, คน 5 +2 รายการ')
    expect(auditValueDisplay([ids[0], ids[6]], 'company_ids', null, { [ids[0] ?? '']: 'ไฟแนนซ์ A' })).toBe(
      `ไฟแนนซ์ A, ${ids[6]?.slice(0, 8)}`,
    )
    // ตรวจซ้ำ staging SV6-R-03 — หาชื่อไม่พบเลย ⇒ id ย่อ (ไม่ใช่ JSON ดิบ)
    expect(auditValueDisplay([ids[0]], 'company_ids', null, {})).toBe(ids[0]?.slice(0, 8))
    expect(auditValueDisplay([], 'company_ids', null, labels)).toBe('ไม่มี')
    expect(auditRefLabel([ids[0]], 'tags', labels)).toBeNull()
    expect(auditValueDisplay(ids[1], 'target_id', 'adjustments', { [ids[1] ?? '']: 'BL-2569-001' })).toBe('BL-2569-001')
    expect(auditValueDisplay(ids[1], 'target_id', 'adjustments', {})).toBe(ids[1])
  })
})

describe('ตรวจซ้ำ staging SV5-R-02 — id ในค่าซ้อน (object/array ของ object)', () => {
  const USER = '0a1b2c3d-0000-4000-8000-0000000000a1'

  it('auditValueRefs ไล่ array ของ object และ object ซ้อน ด้วยกติกาชื่อฟิลด์เดิม', () => {
    const refs = auditValueRefs({
      revenueByCase: [
        { caseId: CASE, reason: 'expense_not_approved', result: 'skipped' },
        { caseId: PERIOD, result: 'created' },
      ],
      payload: { actorId: USER, options: { lotId: LOT } },
    })
    expect(refs).toEqual([
      { type: 'cases', id: CASE },
      { type: 'cases', id: PERIOD },
      { type: 'users', id: USER },
      { type: 'handover_lots', id: LOT },
    ])
  })

  it('จำกัดความลึก — ลึกเกินเพดานไม่ค้นชื่อ', () => {
    let deep: Record<string, unknown> = { caseId: CASE }
    for (let level = 0; level <= AUDIT_NESTED_REF_MAX_DEPTH; level += 1) deep = { nested: deep }
    expect(auditValueRefs(deep)).toEqual([])
    let ok: Record<string, unknown> = { caseId: CASE }
    for (let level = 0; level < AUDIT_NESTED_REF_MAX_DEPTH; level += 1) ok = { nested: ok }
    expect(auditValueRefs(ok)).toEqual([{ type: 'cases', id: CASE }])
  })

  it('actorId/actor_id = ผู้ใช้', () => {
    expect(auditFieldRefType('actorId')).toBe('users')
    expect(auditFieldRefType('actor_id')).toBe('users')
  })

  it('auditReplaceNestedRefs แทน id ที่รู้ชื่อ · id ที่ไม่รู้จัก/ฟิลด์ที่ไม่ใช่ id คงเดิม · ไม่แก้ค่าต้นฉบับ', () => {
    const labels = { [CASE.toLowerCase()]: 'CS-2569-0001', [USER.toLowerCase()]: 'สมชาย ใจดี' }
    const source = {
      rows: [{ caseId: CASE, note: CASE }, { caseId: PERIOD }],
      payload: { actorId: USER, caseIds: [CASE, PERIOD] },
    }
    expect(auditReplaceNestedRefs(source.rows, labels)).toEqual([{ caseId: 'CS-2569-0001', note: CASE }, { caseId: PERIOD }])
    expect(auditReplaceNestedRefs(source.payload, labels)).toEqual({ actorId: 'สมชาย ใจดี', caseIds: ['CS-2569-0001', PERIOD] })
    expect(source.rows[0]?.caseId).toBe(CASE)
  })

  it('auditValueDisplay แสดงค่าซ้อนเป็นข้อความที่แทนชื่อแล้ว (SV6-R-03 — ไม่ใช่ JSON ดิบ)', () => {
    const labels = { [CASE.toLowerCase()]: 'CS-2569-0001' }
    expect(auditValueDisplay([{ caseId: CASE, result: 'skipped' }], 'revenueByCase', 'handover_lots', labels)).toBe(
      'เคส: CS-2569-0001, ผล: ข้าม',
    )
    expect(auditValueDisplay({ settled: 1 }, 'result', 'jobs', {})).toBe('คำนวณแล้ว: 1')
  })
})

describe('ตรวจซ้ำ staging SV5-R-03 — อ้างอิงรายการเดินบัญชีในข้อความ', () => {
  const TX = 'af8cd930-4998-4000-8000-0000000000b1'
  const LABEL = '13/10/2569 · ฿1,000.00 · กสิกรไทย'
  const labelOf = (ref: { type: string; id: string }) => (ref.type === 'bank_transactions' && ref.id === TX ? LABEL : null)

  it('auditTextRefs ดึง id จาก bank_transaction:<id>[:rematch] และ "รายการเดินบัญชี <id>"', () => {
    expect(auditTextRefs(`รับชำระจากรายการเดินบัญชี bank_transaction:${TX}`)).toEqual([{ type: 'bank_transactions', id: TX }])
    expect(auditTextRefs(`bank_transaction:${TX}:rematch`)).toEqual([{ type: 'bank_transactions', id: TX }])
    expect(auditTextRefs(`เปลี่ยนการจับคู่รายการเดินบัญชี ${TX}`)).toEqual([{ type: 'bank_transactions', id: TX }])
    expect(auditTextRefs(`เคส ${TX}`)).toEqual([])
    expect(auditTextRefs(null)).toEqual([])
  })

  it('auditReplaceTextRefs แทนด้วยป้าย · rematch ต่อท้าย · หาไม่พบคงเดิม', () => {
    expect(auditReplaceTextRefs(`รับชำระจากรายการเดินบัญชี bank_transaction:${TX} (ไฟล์ 35)`, labelOf)).toBe(
      `รับชำระจากรายการเดินบัญชี ${LABEL} (ไฟล์ 35)`,
    )
    expect(auditReplaceTextRefs(`bank_transaction:${TX}:rematch`, labelOf)).toBe(`รายการเดินบัญชี ${LABEL}${BANK_TRANSACTION_REMATCH_SUFFIX}`)
    const unknown = 'bank_transaction:00000000-0000-4000-8000-000000000000'
    expect(auditReplaceTextRefs(unknown, labelOf)).toBe(unknown)
  })

  it('auditValueRefs เก็บ id จาก source_ref · auditValueDisplay แสดงป้าย', () => {
    expect(auditValueRefs({ source_ref: `bank_transaction:${TX}`, received_source: 'bank_reconciliation' })).toEqual([
      { type: 'bank_transactions', id: TX },
    ])
    expect(auditValueDisplay(`bank_transaction:${TX}`, 'source_ref', 'billing_batches', { [TX]: LABEL })).toBe(`รายการเดินบัญชี ${LABEL}`)
    expect(auditValueDisplay('BANKTX-001', 'source_ref', 'billing_batches', { [TX]: LABEL })).toBe('BANKTX-001')
  })
})
