import { ORG_ID, as, meta, rawDb } from './context'
import { stored } from './files'
import { clockAt } from './runtime'
import { d, ids, strip, thaiId } from './state'
import { SUPERADMIN, payeeFieldsFor, syncUsers, type UserSyncOptions } from './users'

/**
 * ส่วน A/B/C ของ FINAL-coverage — ค่าตั้งเริ่มต้นมาตรฐาน + เทมเพลตครบทุกแบบ + master data
 * ทุกค่าผ่าน Zod schema ของ route + service ใน lib/ (actor = Superadmin `admin` · เวลาจำลอง 01/09/2569)
 * ค่าที่รอนักบัญชีติดป้าย "[สมมติฐาน]" ใน reason/คำอธิบาย
 */

const R = (text: string) => `${text} (Final Test seed)`

async function sctx(reason: string) {
  return { actor: await as(SUPERADMIN), meta, reason: R(reason) }
}

async function findId(table: 'team' | 'compensationPlan' | 'serviceFeeTemplate' | 'financeCompany', name: string): Promise<string | null> {
  const where = { organizationId: ORG_ID, name, deletedAt: null }
  const db = rawDb()
  if (table === 'team') return (await db.team.findFirst({ where, select: { id: true } }))?.id ?? null
  if (table === 'compensationPlan') return (await db.compensationPlan.findFirst({ where: { ...where, isCurrent: true }, select: { id: true } }))?.id ?? null
  if (table === 'serviceFeeTemplate') return (await db.serviceFeeTemplate.findFirst({ where: { ...where, isCurrent: true }, select: { id: true } }))?.id ?? null
  return (await db.financeCompany.findFirst({ where, select: { id: true } }))?.id ?? null
}

// ─── A: ค่าตั้ง ─────────────────────────────────────────────────────────────

// A.3 Tax Profile 4 แถว
const TAX_PROFILES: Array<[string, string, number, 'before_vat' | 'gross_amount', 'PND3' | 'PND53', string, string]> = [
  ['TP-1', 'Outsource Standard 3%', 3, 'before_vat', 'PND3', 'hire_of_work_40_8', ''],
  ['TP-2', 'Juristic Entity 3%', 3, 'before_vat', 'PND53', 'service_or_hire_of_work', ''],
  ['TP-3', 'ทดสอบลำดับ override 2%', 2, 'before_vat', 'PND3', 'hire_of_work_40_8', ''],
  ['TP-4', 'ฐานรวม VAT 3%', 3, 'gross_amount', 'PND3', 'other', 'ค่านายหน้าติดตามทรัพย์'],
]

// A.2 รูปแบบไฟล์ธนาคาร (U147 purpose + รหัสธนาคาร) — ไฟล์โอนครบ 3 สถานะ (passed/failed/pending) [สมมติฐาน F1] + statement 1
const BANK_FILE_FORMATS = [
  { key: 'BF-1', purpose: 'payment', bankCode: '004', fileType: 'CSV', encoding: 'UTF_8', columnMapping: 'receiving_bank_code,receiving_account_no,receiving_account_name,amount,transfer_date,reference_no', test: true },
  { key: 'BF-2', purpose: 'payment', bankCode: '014', fileType: 'TXT', encoding: 'TIS_620', columnMapping: 'receiving_bank_code,receiving_account_no,receiving_account_name,amount,email', test: true },
  { key: 'BF-3', purpose: 'payment', bankCode: '002', fileType: 'CSV', encoding: 'UTF_8', columnMapping: 'receiving_bank_code,receiving_account_no,receiving_account_name,amount', test: false },
  { key: 'BF-S', purpose: 'statement', bankCode: '004', fileType: 'CSV', encoding: 'UTF_8', columnMapping: 'transaction_date,description,reference,amount_in,amount_out', test: true },
] as const

/** A.2 บัญชีธนาคารบริษัท — key → เลขบัญชี (คีย์จับคู่ตอนโหลด id กลับจากฐาน) */
const BANK_ACCOUNTS = { 'BA-1': '9990001112', 'BA-2': '5550002223' } as const

/**
 * เติม `ids.taxProfiles` / `ids.bankFiles` / `ids.bankAccounts` จากฐาน — เรียกทุกครั้งหลังขั้นค่าตั้ง
 * (ทั้งตอนเพิ่งสร้างและตอนข้าม seedSettings เพราะค่าตั้งมีอยู่แล้ว เช่น --create-auth-users แล้วตามด้วย --seed)
 * จับคู่ด้วยคีย์ที่แน่นอนของแถวที่ seedSettings สร้าง — ไม่พบ/พบมากกว่า 1 แถว = throw
 */
async function loadSettingIds(): Promise<void> {
  const db = rawDb()
  const one = (label: string, rows: Array<{ id: string }>): string => {
    if (rows.length !== 1) {
      throw new Error(`โหลดค่าตั้ง ${label} จากฐานไม่ได้ (พบ ${rows.length} แถว ต้องพบ 1) — ค่าตั้งไม่ตรงกับ seed-final: รัน --reset แล้ว seed ใหม่`)
    }
    return rows[0]?.id ?? ''
  }
  const base = { organizationId: ORG_ID, deletedAt: null }
  for (const [key, name, pct, basis, form] of TAX_PROFILES) {
    ids.taxProfiles[key] = one(`Tax Profile ${key}`, await db.taxProfile.findMany({
      where: { ...base, name, whtPct: pct, whtBasis: basis, filingForm: form }, select: { id: true },
    }))
  }
  for (const format of BANK_FILE_FORMATS) {
    ids.bankFiles[format.key] = one(`รูปแบบไฟล์ธนาคาร ${format.key}`, await db.bankFileFormat.findMany({
      where: { ...base, purpose: format.purpose, bankCode: format.bankCode, fileType: format.fileType, encoding: format.encoding, columnMapping: format.columnMapping },
      select: { id: true },
    }))
  }
  for (const [key, accountNumber] of Object.entries(BANK_ACCOUNTS)) {
    ids.bankAccounts[key] = one(`บัญชีธนาคาร ${key}`, await db.bankAccount.findMany({ where: { ...base, accountNumber }, select: { id: true } }))
  }
}

async function seedSettings(): Promise<void> {
  const s = await import('@/lib/settings/schemas')
  const org = await import('@/lib/organization/schemas')
  const orgQ = await import('@/lib/organization/queries')
  const orgProfile = await import('@/lib/organization/profile')
  const vat = await import('@/lib/settings/queries/vat-rates')
  const tp = await import('@/lib/settings/queries/tax-profiles')
  const tpd = await import('@/lib/settings/queries/tax-profile-defaults')
  const wht = await import('@/lib/settings/queries/wht-policy')
  const cycles = await import('@/lib/settings/queries/cycles')
  const matrix = await import('@/lib/settings/queries/approval-matrix')
  const policy = await import('@/lib/settings/queries/finance-policy')
  const bank = await import('@/lib/settings/queries/bank-accounts')
  const bankFile = await import('@/lib/settings/queries/bank-file-formats')
  const cc = await import('@/lib/settings/queries/cost-centers')
  const tpl = await import('@/lib/settings/queries/tax-doc-templates')
  const sla = await import('@/lib/settings/queries/sla-policy')
  const assign = await import('@/lib/settings/queries/assignment-policy')
  const retention = await import('@/lib/settings/queries/data-retention')
  const holidays = await import('@/lib/settings/queries/holidays')

  // A.1 ข้อมูลองค์กร
  await orgQ.updateOrganizationProfile(
    await sctx('ตั้งข้อมูลองค์กร'),
    strip(
      org.organizationProfileUpdateSchema.parse({
        name: 'บริษัท แอสเซ็ท รีคัฟเวอรี่ (ทดสอบ) จำกัด',
        nameEn: 'Asset Recovery (Test) Co., Ltd.',
        taxId: '0105569000017',
        branchCode: '00000',
        addressDetail: '1 ถ.สีลม',
        addressSubdistrict: 'สีลม',
        addressDistrict: 'บางรัก',
        addressProvince: 'กรุงเทพมหานคร',
        addressPostalCode: '10500',
        phone: '020000000',
        email: 'finance@ar-test.test',
        website: 'ar-test.test',
        vatRegistered: true,
        authorizedSignerName: 'อำนาจ บริหารกิจ',
        authorizedSignerTitle: 'กรรมการผู้จัดการ',
        reason: R('ตั้งข้อมูลองค์กร'),
      }),
    ),
  )
  await orgQ.setOrganizationLogo(
    await sctx('อัปโหลดโลโก้ตัวอย่าง'),
    await stored(orgProfile.organizationLogoPath(ORG_ID, 'logo.png', 'seed-final')),
  )
  await orgQ.setOrganizationSignature(
    await sctx('อัปโหลดลายเซ็นผู้มีอำนาจตัวอย่าง (U122)'),
    await stored(orgProfile.organizationSignaturePath(ORG_ID, 'signature.png', 'seed-final')),
  )

  // A.5 VAT — V-1 ปิดวันสิ้นสุด 30/09/2569 · V-2 ต่ออายุ 01/10/2569 (O71/J4)
  const v1 = await vat.createVatRate(await sctx('อัตรา VAT 7% ปีงบ 2569'), strip(
    s.vatRateCreateSchema.parse({ ratePct: 7, effectiveFrom: '2025-10-01', effectiveTo: '2026-09-30', note: 'V-1 อัตราเดิม', reason: R('VAT V-1') }),
  ))
  void v1
  await vat.createVatRate(await sctx('ต่ออายุอัตรา VAT 7%'), strip(
    s.vatRateCreateSchema.parse({ ratePct: 7, effectiveFrom: '2026-10-01', effectiveTo: null, note: 'V-2 ต่ออายุมาตรการ (O71)', reason: R('VAT V-2') }),
  ))

  // A.3 Tax Profile 4 แถว
  // U148 — ประเภทเงินได้เลือกจากรายการมาตรฐาน 50 ทวิ (TP-4 ทดสอบ "อื่น ๆ (ระบุ)")
  for (const [key, name, pct, basis, form, incomeTypeCode, incomeType] of TAX_PROFILES) {
    const created = await tp.createTaxProfile(await sctx(`สร้าง Tax Profile ${key}`), strip(
      s.taxProfileCreateSchema.parse({
        name,
        whtPct: pct,
        whtBasis: basis,
        whtMinThresholdSatang: 100000,
        incomeTypeCode,
        incomeType,
        filingForm: form,
        reason: R(key),
      }),
    ))
    ids.taxProfiles[key] = created.id
  }
  // TD-1 ค่าเริ่มต้นตามประเภทผู้รับ (U121 · inhouse-นิติ ว่างตาม O71/J11)
  await tpd.createTaxProfileDefaults(await sctx('ค่าเริ่มต้นตามประเภทผู้รับ — Final'), {
    inhouseIndividual: ids.taxProfiles['TP-1'] ?? null,
    inhouseCorporate: null,
    outsourceIndividual: ids.taxProfiles['TP-1'] ?? null,
    outsourceCorporate: ids.taxProfiles['TP-2'] ?? null,
  })

  // A.4 WP-1 (01/09/2569) [สมมติฐาน Q1–Q4, Q18]
  await wht.createWhtPolicy(
    await sctx('นโยบายภาษีหัก ณ ที่จ่าย ก.ย. [สมมติฐาน Q1–Q4]'),
    strip(
      s.whtPolicyCreateSchema.parse({
        effectiveFrom: '2026-09-01',
        baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
        certificateMode: 'per_item',
        incomeTypeMode: 'all_40_8',
        issueZeroRate402Certificate: true,
        inhouseIncomeCategory: 'sec_40_2',
        outsourceIncomeCategory: 'sec_40_8',
        allowGrossUpConditions: false,
        filingMethod: 'paper',
        reason: R('WP-1'),
      }),
    ),
  )

  // A.2 รอบจ่าย (U133 ขอบเขตจริง · U146 ตัด custom_text) — รอบบิล AR สร้างหลังมีบริษัท (seedBillingCycles)
  const apCycles = [
    { name: 'AP จ่ายพนักงาน ทุกวันที่ 15 และสิ้นเดือน', type: 'AP', cutoffRuleType: 'fixed_dates', cutoffDates: [15, 31], dueRuleType: 'month_end', dueRuleValue: null, scopeKind: 'all_teams', companyIds: [] },
  ]
  for (const row of apCycles) {
    await cycles.createCycle(await sctx(`รอบ ${row.name}`), strip(s.cycleCreateSchema.parse({ ...row, reason: R('รอบจ่าย') })))
  }

  // A.2 สายอนุมัติ (ชุดเดียวกับ UAT M7 · U149 เก็บ role id)
  const roleIdOf = async (name: string, roleGroup: 'system' | 'inhouse') =>
    (await rawDb().role.findFirstOrThrow({ where: { organizationId: ORG_ID, name, roleGroup, deletedAt: null }, select: { id: true } })).id
  const mgrRole = await roleIdOf('ผู้จัดการทีมติดตามทรัพย์', 'inhouse')
  const finRole = await roleIdOf('การเงิน', 'system')
  const execRole = await roleIdOf('บริหาร', 'system')
  await matrix.createApprovalMatrix(await sctx('สายอนุมัติ ≤ ฿5,000'), strip(
    s.approvalMatrixCreateSchema.parse({
      condition: 'รายการไม่เกิน ฿5,000',
      conditionThresholdSatang: 500000,
      approvalFlowRoleIds: [mgrRole, finRole],
      enforceSegregationOfDuties: true,
      reason: R('สายอนุมัติ'),
    }),
  ))
  await matrix.createApprovalMatrix(await sctx('สายอนุมัติเกิน ฿5,000'), strip(
    s.approvalMatrixCreateSchema.parse({
      condition: 'รายการเกิน ฿5,000',
      conditionThresholdSatang: null,
      approvalFlowRoleIds: [mgrRole, finRole, execRole],
      enforceSegregationOfDuties: true,
      reason: R('สายอนุมัติ'),
    }),
  ))

  // A.2 นโยบายการเงิน (U103 · B4/D12)
  await policy.updateFinancePolicy(
    await sctx('นโยบายการเงิน Final'),
    await policy.getFinancePolicy(ORG_ID),
    strip(
      s.financePolicyUpdateSchema.parse({
        advanceMaxAmountPerRequestSatang: null,
        requirePayeeIdDocument: false,
        arAgingBuckets: [30, 60, 90],
        writeOffToleranceSatang: 5000,
        substituteReceiptMaxPerDocSatang: 50000,
        substituteReceiptMaxPerMonthSatang: 300000,
        reason: R('นโยบายการเงิน'),
      }),
    ),
  )

  // A.2 รูปแบบไฟล์ธนาคาร (U147 purpose + รหัสธนาคาร) — ไฟล์โอนครบ 3 สถานะ (passed/failed/pending) [สมมติฐาน F1] + statement 1
  for (const format of BANK_FILE_FORMATS) {
    const created = await bankFile.createBankFileFormat(await sctx(`รูปแบบไฟล์ธนาคาร ${format.key}`), strip(
      s.bankFileFormatCreateSchema.parse({ purpose: format.purpose, bankCode: format.bankCode, fileType: format.fileType, encoding: format.encoding, columnMapping: format.columnMapping, reason: R(format.key) }),
    ))
    ids.bankFiles[format.key] = created.id
    if (format.test) await bankFile.testBankFileFormat(await sctx(`ทดสอบไฟล์ ${format.key}`), created)
  }

  // A.2 บัญชีธนาคารบริษัท (U147 อ้างรูปแบบด้วย id)
  const ba1 = await bank.createBankAccount(await sctx('บัญชีหลัก BA-1'), strip(
    s.bankAccountCreateSchema.parse({
      bankName: 'ธนาคารกสิกรไทย', accountName: 'บจก. แอสเซ็ท รีคัฟเวอรี่ (ทดสอบ)', accountNumber: BANK_ACCOUNTS['BA-1'],
      accountType: 'savings', usage: 'both', statementFormatId: ids.bankFiles['BF-S'], paymentFileFormatId: ids.bankFiles['BF-1'],
      autoMatchToleranceDays: 7, isPrimary: true, reason: R('BA-1'),
    }),
  ))
  ids.bankAccounts['BA-1'] = ba1.id
  const ba2 = await bank.createBankAccount(await sctx('บัญชีรับเงิน BA-2'), strip(
    s.bankAccountCreateSchema.parse({
      bankName: 'ธนาคารไทยพาณิชย์', accountName: 'บจก. แอสเซ็ท รีคัฟเวอรี่ (ทดสอบ)', accountNumber: BANK_ACCOUNTS['BA-2'],
      accountType: 'current', usage: 'receive', statementFormatId: null, paymentFileFormatId: null,
      autoMatchToleranceDays: 7, isPrimary: false, reason: R('BA-2'),
    }),
  ))
  ids.bankAccounts['BA-2'] = ba2.id

  // A.2 ศูนย์ต้นทุน [สมมติฐาน Q11]
  for (const row of [
    { name: 'CC-IN ทีมใน', description: 'ทีมติดตามทรัพย์ inhouse [สมมติฐาน Q11]', isActive: true },
    { name: 'CC-OUT ทีมนอก', description: 'ทีม outsource [สมมติฐาน Q11]', isActive: true },
    { name: 'CC-HQ สำนักงานใหญ่', description: 'ปิดใช้งาน [สมมติฐาน Q11]', isActive: false },
  ]) {
    await cc.createCostCenter(await sctx(`ศูนย์ต้นทุน ${row.name}`), strip(s.costCenterCreateSchema.parse({ ...row, reason: R('ศูนย์ต้นทุน') })))
  }

  // A.7 เทมเพลตเอกสาร (U122) — ข้อความท้ายครบ 3 ชนิด · พิมพ์ลายเซ็นรูปบนใบแจ้งหนี้/ใบกำกับ · ใบส่งมอบเว้นช่องเซ็นมือ
  await tpl.updateTaxDocTemplate(await sctx('ข้อความท้ายใบแจ้งหนี้'), 'billing_invoice', {
    footerNote: 'กรุณาชำระภายในกำหนด โอนเข้าบัญชีกสิกรไทย 999-0-00111-2',
    printSignature: true,
  })
  await tpl.updateTaxDocTemplate(await sctx('ข้อความท้ายใบกำกับภาษี'), 'tax_invoice', {
    // ไม่ซ้ำประโยคเงื่อนไขที่ระบบพิมพ์ให้ทุกใบอยู่แล้ว (staging S-011)
    footerNote: 'ขอบคุณที่ใช้บริการ — สอบถามเอกสารภาษีได้ที่ฝ่ายบัญชี 02-000-0000',
    printSignature: true,
  })
  await tpl.updateTaxDocTemplate(await sctx('ข้อความท้ายใบส่งมอบ เว้นช่องเซ็นมือ'), 'handover_note', {
    footerNote: 'ผู้รับมอบตรวจสภาพเครื่องและ IMEI ครบถ้วนแล้ว',
    printSignature: false,
  })

  // A.2 SLA / มอบหมาย / ระยะเก็บเอกสาร
  await sla.updateSlaPolicy(await sctx('SLA 72 ชม.'), await sla.getSlaPolicy(ORG_ID), strip(s.slaPolicyUpdateSchema.parse({ slaAlertHours: 72, reason: R('SLA') })))
  await assign.updateAssignmentPolicySettings(await sctx('นโยบายมอบหมาย'), strip(
    s.assignmentPolicyUpdateSchema.parse({
      reassignTimeoutHours: 3, supervisorCanAssignSystem: true, supervisorCanAssignInhouse: true,
      supervisorCanAssignOutsource: true, acceptDeadlineHours: null, reason: R('มอบหมาย'),
    }),
  ))
  await retention.updateDataRetentionPolicy(await sctx('ระยะเก็บเอกสารลูกหนี้ 5 ปี'), await retention.getDataRetentionPolicy(ORG_ID), strip(
    s.dataRetentionUpdateSchema.parse({ debtorDocumentRetentionYears: 5, reason: R('ระยะเก็บ') }),
  ))

  // A.2 ปฏิทินวันหยุดราชการ 2569 [สมมติฐาน A5 — ชุดประกาศ ครม. ตามที่ทราบ]
  const holidayRows: Array<[string, string]> = [
    ['2026-01-01', 'วันขึ้นปีใหม่'], ['2026-03-03', 'วันมาฆบูชา'], ['2026-04-06', 'วันจักรี'],
    ['2026-04-13', 'วันสงกรานต์'], ['2026-04-14', 'วันสงกรานต์'], ['2026-04-15', 'วันสงกรานต์'],
    ['2026-05-01', 'วันแรงงานแห่งชาติ'], ['2026-05-04', 'วันฉัตรมงคล'], ['2026-06-01', 'ชดเชยวันวิสาขบูชา'],
    ['2026-06-03', 'วันเฉลิมพระชนมพรรษาพระราชินี'], ['2026-07-28', 'วันเฉลิมพระชนมพรรษา ร.10'],
    ['2026-07-29', 'วันอาสาฬหบูชา'], ['2026-08-12', 'วันแม่แห่งชาติ'], ['2026-10-13', 'วันนวมินทรมหาราช'],
    ['2026-10-23', 'วันปิยมหาราช'], ['2026-12-05', 'วันพ่อแห่งชาติ'], ['2026-12-10', 'วันรัฐธรรมนูญ'],
    ['2026-12-31', 'วันสิ้นปี'],
  ]
  await holidays.importHolidays(await sctx('วันหยุดราชการ 2569 [สมมติฐาน A5]'), holidayRows.map(([date, name]) => ({ holidayDate: d(date), name })))
}

// ─── C: แผน/ทีม/บริษัท/ผู้ใช้/ผู้รับเงิน ──────────────────────────────────────

async function seedPlans(): Promise<void> {
  const s = await import('@/lib/compensation/schemas')
  const q = await import('@/lib/compensation/queries')
  const plans = [
    { key: 'PLAN_IN', name: 'PLAN_IN แผนทีมใน', side: 'inhouse', fuelMode: 'DAILY_FLAT', fuelDailyFlatSatang: 20000, allowanceSatang: 15000, commissionSatang: 50000, noSuccessFeeSatang: 20000, hotelMaxPerNightSatang: 80000, whtPct: 3 },
    { key: 'PLAN_OUT', name: 'PLAN_OUT แผนทีมนอก', side: 'outsource', fuelMode: 'DAILY_FLAT', fuelDailyFlatSatang: 30000, allowanceSatang: 0, commissionSatang: 100000, noSuccessFeeSatang: 30000, hotelMaxPerNightSatang: null, whtPct: 5 },
    { key: 'PLAN_KM', name: 'PLAN_KM แผนกิโลเมตร', side: 'inhouse', fuelMode: 'PER_KM', fuelRatePerKmSatang: 500, fuelMaxPerCaseSatang: 40000, allowanceSatang: 15000, commissionSatang: 50000, noSuccessFeeSatang: 20000, hotelMaxPerNightSatang: 80000, whtPct: 3 },
  ]
  for (const plan of plans) {
    const existing = await findId('compensationPlan', plan.name)
    if (existing !== null) {
      ids.plans[plan.key] = existing
      continue
    }
    const { key, ...values } = plan
    const created = await q.createCompensationPlan(await sctx(`แผน ${key} v1`), strip(
      s.compensationPlanCreateSchema.parse({ ...values, hotelReceiptRequired: true, effectiveFrom: '2026-09-01', reason: R(key) }),
    ))
    ids.plans[key] = created.id
  }
}

async function seedTeams(): Promise<void> {
  const s = await import('@/lib/teams/schemas')
  const q = await import('@/lib/teams/queries')
  const teams = [
    { key: 'TEAM_A', name: 'TEAM_A กรุงเทพ', side: 'inhouse', plan: 'PLAN_IN', provinces: ['กรุงเทพมหานคร'], status: 'active' },
    { key: 'TEAM_B', name: 'TEAM_B นนทบุรี', side: 'inhouse', plan: 'PLAN_KM', provinces: ['นนทบุรี'], status: 'active' },
    { key: 'TEAM_C', name: 'TEAM_C ปทุมธานี', side: 'outsource', plan: 'PLAN_OUT', provinces: ['ปทุมธานี'], status: 'active' },
    { key: 'TEAM_D', name: 'TEAM_D (ปิด)', side: 'outsource', plan: 'PLAN_OUT', provinces: ['ชลบุรี'], status: 'inactive' },
  ]
  for (const team of teams) {
    const existing = await findId('team', team.name)
    if (existing !== null) {
      ids.teams[team.key] = existing
      continue
    }
    // หัวหน้า/ผู้จัดการผูกหลังมีผู้ใช้ (persona ต้องสังกัดทีมก่อน)
    const created = await q.createTeam(await sctx(`ทีม ${team.key}`), strip(
      s.teamCreateSchema.parse({
        name: team.name, side: team.side, compensationPlanId: ids.plans[team.plan], supervisorId: null,
        managerIds: [], provinces: team.provinces, status: team.status, reason: R(team.key),
      }),
    ))
    ids.teams[team.key] = created.id
  }
}

async function bindTeamLeads(): Promise<void> {
  const q = await import('@/lib/teams/queries')
  const db = rawDb()
  const uid = async (username: string) => (await db.user.findFirst({ where: { organizationId: ORG_ID, username }, select: { id: true } }))?.id ?? null
  const leads: Array<[string, string | null, string[]]> = [
    ['TEAM_A', 'uat.sup.in', ['uat.mgr.in']],
    ['TEAM_B', null, ['uat.mgr.in']],
    ['TEAM_C', 'uat.sup.out', ['uat.mgr.out']],
  ]
  const admin = await as(SUPERADMIN)
  for (const [key, supervisor, managers] of leads) {
    const teamId = ids.teams[key] ?? ''
    const current = await q.getTeam(admin, teamId)
    const supervisorId = supervisor === null ? null : await uid(supervisor)
    const managerIds = (await Promise.all(managers.map(uid))).filter((id): id is string => id !== null)
    const currentManagers = current.managers.map((row) => row.id)
    if ((current.supervisor?.id ?? null) === supervisorId && managerIds.every((id) => currentManagers.includes(id))) continue
    await q.updateTeam(await sctx(`ผูกหัวหน้า/ผู้จัดการ ${key}`), current, {
      name: current.name,
      side: current.side,
      compensationPlanId: current.compensationPlanId,
      supervisorId,
      managerIds,
      provinces: current.provinces,
      status: current.status,
    })
  }
}

async function seedCompanies(): Promise<void> {
  const sf = await import('@/lib/service-fee/schemas')
  const sfq = await import('@/lib/service-fee/queries')
  const fc = await import('@/lib/finance-companies/schemas')
  const fcq = await import('@/lib/finance-companies/queries')
  const templates = [
    // มติ PO U165 — failFeeSatang = ยอดกรณีไม่สำเร็จ (null = ไม่เก็บ) · T3 = base เดิม (ผลเท่า charge_on_fail เดิม)
    // T4 = แบบ "สำเร็จ ≠ ไม่สำเร็จ" (สำเร็จ 3,000 / ไม่สำเร็จ 1,000) — เคสไม่สำเร็จที่ใช้: FT-12, FT-13 รอบ 1
    { key: 'T1', name: 'T1 สำเร็จ 5%', model: 'SUCCESS_FEE', baseSatang: 0, ratePct: 5, basis: 'debt_amount', failFeeSatang: null },
    { key: 'T2', name: 'T2 เหมา 7,490 ไม่คิดเมื่อไม่สำเร็จ', model: 'FLAT', baseSatang: 749000, ratePct: 0, basis: null, failFeeSatang: null },
    { key: 'T3', name: 'T3 ผสม', model: 'HYBRID', baseSatang: 200000, ratePct: 3, basis: 'debt_amount', failFeeSatang: 200000 },
    { key: 'T4', name: 'T4 เหมา 3,000 ไม่สำเร็จ 1,000', model: 'FLAT', baseSatang: 300000, ratePct: 0, basis: null, failFeeSatang: 100000 },
    { key: 'T5', name: 'T5 สำเร็จ 5% (บริษัทปิด)', model: 'SUCCESS_FEE', baseSatang: 0, ratePct: 5, basis: 'debt_amount', failFeeSatang: null },
  ]
  for (const template of templates) {
    const existing = await findId('serviceFeeTemplate', template.name)
    if (existing !== null) {
      ids.templates[template.key] = existing
      continue
    }
    const { key, ...values } = template
    const created = await sfq.createServiceFeeTemplate(await sctx(`เทมเพลต ${key}`), strip(sf.serviceFeeTemplateCreateSchema.parse({ ...values, reason: R(key) })))
    ids.templates[key] = created.id
  }
  const companies = [
    { key: 'CO1', name: 'บจก. ยูเอที ลิสซิ่ง', shortName: 'UAT-L', tpl: 'T1', vatMode: 'exclude_vat', wht: 3, branch: '00000', delivery: 'paper_pdf', taxSeed: '010556900101', signer: 'นายสมชาย ลิสซิ่งดี' },
    { key: 'CO2', name: 'บจก. ยูเอที แคปปิตอล', shortName: 'UAT-C', tpl: 'T2', vatMode: 'include_vat', wht: null, branch: '00000', delivery: 'paper_pdf', taxSeed: '010556900102', signer: 'นางสาวศิริพร แคปปิตอล' },
    { key: 'CO3', name: 'บจก. ยูเอที ไฟแนนซ์', shortName: 'UAT-F', tpl: 'T3', vatMode: 'exclude_vat', wht: 3, branch: '00002', delivery: 'paper_pdf', taxSeed: '010556900103', signer: 'นายไพโรจน์ ไฟแนนซ์' },
    { key: 'CO4', name: 'บจก. ยูเอที โมบาย', shortName: 'UAT-M', tpl: 'T4', vatMode: 'no_vat', wht: null, branch: '00000', delivery: 'e_tax_invoice', taxSeed: '010556900104', signer: null },
    { key: 'CO5', name: 'บจก. ยูเอที ปิดกิจการ', shortName: 'UAT-X', tpl: 'T5', vatMode: 'exclude_vat', wht: 3, branch: '00000', delivery: 'paper_pdf', taxSeed: '010556900105', signer: null },
  ]
  const admin = await as(SUPERADMIN)
  for (const company of companies) {
    const existing = await findId('financeCompany', company.name)
    if (existing !== null) {
      ids.companies[company.key] = existing
      continue
    }
    const created = await fcq.createFinanceCompany(await sctx(`บริษัท ${company.key}`), strip(
      fc.financeCompanyCreateSchema.parse({
        name: company.name, shortName: company.shortName, taxId: thaiId(company.taxSeed), branchCode: company.branch,
        address: '99 ถ.พหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร 10900', phone: '021112222', email: `ar@${company.shortName.toLowerCase()}.test`,
        contactName: 'ฝ่ายติดตามทรัพย์', contactPhone: '0899999999', signerName: company.signer,
        serviceFeeTemplateId: ids.templates[company.tpl], vatRegistered: company.vatMode !== 'no_vat', vatMode: company.vatMode,
        whtWithheldByCustomerPct: company.wht, defaultInvoiceDeliveryFormat: company.delivery,
        billingCycleId: null, reason: R(company.key),
      }),
    ))
    ids.companies[company.key] = created.id
    if (company.key === 'CO5') {
      await fcq.setFinanceCompanyStatus(await sctx('ระงับบริษัทที่ปิดกิจการ'), await fcq.getFinanceCompany(admin, created.id), 'suspended')
    }
    await seedCompanyDocuments(company.key, created.id)
  }
  await seedBillingCycles()
}

/**
 * รอบบิล (U133 ขอบเขตเลือกบริษัทจริง · U146 รอบบิลเป็นแหล่งเดียวของวันตัดรอบ + เครดิตเทอม)
 * สร้างหลังมีบริษัท — บริษัทที่ไม่มีรอบบิลวางบิลไม่ได้ (`BILLING_CYCLE_NOT_SET`)
 */
async function seedBillingCycles(): Promise<void> {
  const s = await import('@/lib/settings/schemas')
  const cycles = await import('@/lib/settings/queries/cycles')
  if ((await rawDb().billingPayoutCycle.count({ where: { organizationId: ORG_ID, type: 'AR', deletedAt: null } })) > 0) return
  const co = (key: string) => ids.companies[key] ?? ''
  const rows = [
    { name: 'AR สิ้นเดือน เครดิต 30 วัน', type: 'AR', cutoffRuleType: 'month_end', cutoffDates: [], dueRuleType: 'net_days', dueRuleValue: 30, scopeKind: 'selected_companies', companyIds: [co('CO1'), co('CO3'), co('CO4'), co('CO5')] },
    { name: 'AR ตัดวันที่ 5 ชำระวันที่ 10 เดือนถัดไป', type: 'AR', cutoffRuleType: 'fixed_dates', cutoffDates: [5], dueRuleType: 'day_of_next_month', dueRuleValue: 10, scopeKind: 'selected_companies', companyIds: [co('CO2')] },
  ]
  for (const row of rows) {
    await cycles.createCycle(await sctx(`รอบ ${row.name}`), strip(s.cycleCreateSchema.parse({ ...row, reason: R('รอบบิล') })))
  }
}

/** เอกสารบริษัท (U132) — CO1 ครบ · CO3 หนังสือรับรองเกิน 6 เดือน (เตือน) · CO2/CO4 ไม่มี (เตือน) */
async function seedCompanyDocuments(key: string, companyId: string): Promise<void> {
  const docs = await import('@/lib/finance-companies/documents')
  const q = await import('@/lib/finance-companies/document-queries')
  const plan: Record<string, Array<{ type: 'company_certificate' | 'vat_registration' | 'service_contract' | 'bank_book' | 'other'; issued: string | null; title: string | null }>> = {
    CO1: [
      { type: 'company_certificate', issued: '2026-08-15', title: null },
      { type: 'vat_registration', issued: null, title: null },
      { type: 'service_contract', issued: null, title: null },
      { type: 'bank_book', issued: null, title: null },
      { type: 'other', issued: null, title: 'หนังสือมอบอำนาจรับมอบทรัพย์' },
    ],
    CO3: [
      { type: 'company_certificate', issued: '2026-01-15', title: null },
      { type: 'vat_registration', issued: null, title: null },
    ],
  }
  for (const row of plan[key] ?? []) {
    const path = await stored(docs.companyDocumentPath(companyId, row.type, `${row.type}.pdf`, `seed-final-${row.type}`))
    await q.createCompanyDocument(await sctx(`แนบเอกสารบริษัท ${key}`), companyId, docs.companyDocumentCreateSchema.parse({
      documentType: row.type, title: row.title, issuedDate: row.issued, path, originalName: `${row.type}.pdf`,
      replacesDocumentId: null, reason: R(`เอกสารบริษัท ${key}`),
    }))
  }
}

/**
 * ผู้รับเงิน 4 คน — ผ่านส่วน "ข้อมูลรับเงิน" ของฟอร์มผู้ใช้ (U131 · service เดียวกับหน้าผู้ใช้) + ติ๊กยืนยัน
 * (ผู้ใช้คงอยู่ข้าม reset แต่ payee ถูกล้าง ⇒ ใช้ `updateUser` พร้อม payment)
 */
async function seedPayees(): Promise<void> {
  const s = await import('@/lib/payees/schemas')
  const users = await import('@/lib/users/queries')
  const db = rawDb()
  const admin = await as(SUPERADMIN)
  for (const key of ['uat.agent.in1', 'uat.agent.in2', 'uat.agent.out1', 'uat.agent.out2']) {
    const user = await db.user.findFirstOrThrow({ where: { organizationId: ORG_ID, username: key }, select: { id: true, fullName: true } })
    const existing = await db.payeeProfile.findFirst({ where: { organizationId: ORG_ID, userId: user.id, deletedAt: null }, select: { id: true, isVerified: true } })
    if (existing === null || !existing.isVerified) {
      const fields = payeeFieldsFor(key, user.fullName) ?? {}
      if (typeof fields['idDocumentUrl'] === 'string') await stored(fields['idDocumentUrl'])
      const payment = s.userPaymentSchema.parse({ fields, verify: true, reason: R(`ข้อมูลรับเงิน ${key}`) })
      const current = await users.getUser(admin, user.id)
      await users.updateUser({ actor: admin, meta }, current, {
        roleId: current.roleId, username: current.username ?? key, email: current.email, fullName: current.fullName,
        phone: current.phone, employeeCode: current.employeeCode, teamId: current.teamId, companyId: current.companyId,
      }, payment)
    }
    const row = await db.payeeProfile.findFirstOrThrow({ where: { organizationId: ORG_ID, userId: user.id, deletedAt: null }, select: { id: true } })
    ids.payees[key] = row.id
  }
}

/**
 * แคตตาล็อก Model Phone (U155–U162 · U166) — เพิ่มเองผ่าน service ของหน้าตั้งค่า แล้ว**นำเข้าฐาน TAC ตัวอย่าง**
 * (fixture เล็กใน repo `lib/device-catalog/fixtures/tac-sample.csv` ผ่านทาง "นำเข้าไฟล์เอง" — ไม่เรียกเน็ต)
 * เคส FT บางแถวได้รุ่นจาก TAC (`deviceModelId`) บางแถว "ระบุเอง" · 1 เคส TAC ไม่พบ → ระบบจำ · ซ่อน 1 รุ่นเพื่อเห็นสถานะปิด
 */
async function seedDeviceCatalog(): Promise<void> {
  const q = await import('@/lib/device-catalog/queries')
  const db = rawDb()
  const catalog: Array<[string, Array<[string, 'smartphone' | 'tablet', number]>]> = [
    ['Apple', [['iPhone 15', 'smartphone', 2023], ['iPhone 14', 'smartphone', 2022], ['iPad (10th generation)', 'tablet', 2022]]],
    ['Samsung', [['Galaxy A55 5G', 'smartphone', 2024], ['Galaxy S24', 'smartphone', 2024]]],
    ['OPPO', [['Reno12 5G', 'smartphone', 2024]]],
  ]
  for (const [brandName, models] of catalog) {
    const existing = await db.deviceBrand.findFirst({ where: { organizationId: ORG_ID, name: brandName, deletedAt: null }, select: { id: true } })
    const brandId = existing?.id ?? (await q.createManualDeviceBrand(await sctx(`เพิ่มแบรนด์ ${brandName}`), { name: brandName })).id
    for (const [name, assetKind, releaseYear] of models) {
      const found = await db.deviceModel.findFirst({ where: { brandId, name, deletedAt: null }, select: { id: true } })
      const id = found?.id ?? (await q.createManualDeviceModel(await sctx(`เพิ่มรุ่น ${brandName} ${name}`), { brandId, assetKind, name, releaseYear })).id
      ids.deviceModels[`${brandName} ${name}`] = id
    }
  }
  // ฐาน TAC ตัวอย่าง — รันซ้ำได้ (เพิ่มเฉพาะ TAC ใหม่) · ผูกรุ่นที่เพิ่มเองข้างบนด้วยชื่อ (Galaxy A55 5G / iPhone 15)
  if ((await db.deviceTac.count({ where: { organizationId: ORG_ID, source: 'tacdb' } })) === 0) {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { runDeviceTacSyncJob } = await import('@/lib/device-catalog/tac-sync-job')
    const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'lib/device-catalog/fixtures/tac-sample.csv')))
    const actor = (await sctx('นำเข้าฐาน TAC ตัวอย่าง')).actor
    await runDeviceTacSyncJob({
      organizationId: ORG_ID,
      filePath: `organization/${ORG_ID}/device-tac/seed-final.csv`,
      actor: { id: actor.id, roleName: actor.roleName },
      readFile: async () => bytes,
    })
  }
  const hidden = ids.deviceModels['Apple iPhone 14'] ?? ''
  const row = await db.deviceModel.findUniqueOrThrow({ where: { id: hidden }, select: { manualStatus: true } })
  if (row.manualStatus !== 'hidden') {
    await q.updateDeviceModel(await sctx('ซ่อนรุ่นที่ไม่รับงานแล้ว'), hidden, { manualStatus: 'hidden' })
  }
}

export interface MasterOptions extends UserSyncOptions {
  settings: boolean
}

/** A + C (รันซ้ำได้: ทีม/แผน/บริษัท/ผู้รับ ตรวจชื่อก่อนสร้าง · ค่าตั้งทำเฉพาะ settings=true หลัง reset) */
export async function seedMaster(options: MasterOptions): Promise<void> {
  clockAt('2026-09-01 08:00')
  const { ensureSuperadmin } = await import('./users')
  await ensureSuperadmin(options.bootstrap)
  if (options.settings) await seedSettings()
  await loadSettingIds()
  await seedPlans()
  await seedTeams()
  await seedCompanies()
  await seedDeviceCatalog()
  const missing = await syncUsers(options, {
    TEAM_A: ids.teams['TEAM_A'] ?? '', TEAM_B: ids.teams['TEAM_B'] ?? '', TEAM_C: ids.teams['TEAM_C'] ?? '',
  }, { CO1: ids.companies['CO1'] ?? '', CO2: ids.companies['CO2'] ?? '' })
  if (missing.length > 0) {
    throw new Error(`ยังไม่มีผู้ใช้: ${missing.join(', ')} — รัน --create-auth-users (บัญชี U123) หรือ --bootstrap-personas (เครื่อง)`)
  }
  await bindTeamLeads()
  await seedPayees()
}
