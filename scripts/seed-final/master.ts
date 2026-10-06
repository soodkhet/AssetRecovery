import { ORG_ID, as, meta, rawDb } from './context'
import { stored } from './files'
import { clockAt } from './runtime'
import { d, ids, strip, thaiId } from './state'
import { SUPERADMIN, syncUsers, type UserSyncOptions } from './users'

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
  const profiles: Array<[string, string, number, 'before_vat' | 'gross_amount', 'PND3' | 'PND53']> = [
    ['TP-1', 'Outsource Standard 3%', 3, 'before_vat', 'PND3'],
    ['TP-2', 'Juristic Entity 3%', 3, 'before_vat', 'PND53'],
    ['TP-3', 'ทดสอบลำดับ override 2%', 2, 'before_vat', 'PND3'],
    ['TP-4', 'ฐานรวม VAT 3%', 3, 'gross_amount', 'PND3'],
  ]
  for (const [key, name, pct, basis, form] of profiles) {
    const created = await tp.createTaxProfile(await sctx(`สร้าง Tax Profile ${key}`), strip(
      s.taxProfileCreateSchema.parse({
        name,
        whtPct: pct,
        whtBasis: basis,
        whtMinThresholdSatang: 100000,
        incomeType: form === 'PND53' ? 'ค่าบริการ (นิติบุคคล)' : 'ค่าจ้างทำของ/ค่าบริการ',
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

  // A.2 รอบบิล/รอบจ่าย (ครบ 3×3 ชนิด)
  const cycleRows = [
    { name: 'AR-CO1 สิ้นเดือน', type: 'AR', cutoffRuleType: 'month_end', cutoffDates: [], cutoffText: null, dueRuleType: 'net_days', dueRuleValue: 30, scope: 'บจก. ยูเอที ลิสซิ่ง' },
    { name: 'AR-CO2 ตัดวันที่ 5', type: 'AR', cutoffRuleType: 'fixed_dates', cutoffDates: [5], cutoffText: null, dueRuleType: 'day_of_next_month', dueRuleValue: 10, scope: 'บจก. ยูเอที แคปปิตอล' },
    { name: 'AP จ่ายพนักงาน', type: 'AP', cutoffRuleType: 'custom_text', cutoffDates: [], cutoffText: 'ทุกวันที่ 15 และสิ้นเดือน', dueRuleType: 'month_end', dueRuleValue: null, scope: 'พนักงานติดตามทรัพย์ทุกทีม' },
  ]
  for (const row of cycleRows) {
    await cycles.createCycle(await sctx(`รอบ ${row.name}`), strip(s.cycleCreateSchema.parse({ ...row, reason: R('รอบบิล/จ่าย') })))
  }

  // A.2 สายอนุมัติ (ชุดเดียวกับ UAT M7)
  await matrix.createApprovalMatrix(await sctx('สายอนุมัติ ≤ ฿5,000'), strip(
    s.approvalMatrixCreateSchema.parse({
      condition: 'รายการไม่เกิน ฿5,000',
      conditionThresholdSatang: 500000,
      approvalFlow: ['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน'],
      enforceSegregationOfDuties: true,
      reason: R('สายอนุมัติ'),
    }),
  ))
  await matrix.createApprovalMatrix(await sctx('สายอนุมัติเกิน ฿5,000'), strip(
    s.approvalMatrixCreateSchema.parse({
      condition: 'รายการเกิน ฿5,000',
      conditionThresholdSatang: null,
      approvalFlow: ['ผู้จัดการทีมติดตามทรัพย์', 'การเงิน', 'บริหาร'],
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
        advanceUnclearedToEmployeeReceivable: true,
        substituteReceiptMaxPerDocSatang: 50000,
        substituteReceiptMaxPerMonthSatang: 300000,
        reason: R('นโยบายการเงิน'),
      }),
    ),
  )

  // A.2 บัญชีธนาคารบริษัท
  const ba1 = await bank.createBankAccount(await sctx('บัญชีหลัก BA-1'), strip(
    s.bankAccountCreateSchema.parse({
      bankName: 'ธนาคารกสิกรไทย', accountName: 'บจก. แอสเซ็ท รีคัฟเวอรี่ (ทดสอบ)', accountNumber: '9990001112',
      accountType: 'savings', usage: 'both', statementFormat: null, paymentFileFormat: null,
      autoMatchToleranceDays: 7, isPrimary: true, reason: R('BA-1'),
    }),
  ))
  ids.bankAccounts['BA-1'] = ba1.id
  const ba2 = await bank.createBankAccount(await sctx('บัญชีรับเงิน BA-2'), strip(
    s.bankAccountCreateSchema.parse({
      bankName: 'ธนาคารไทยพาณิชย์', accountName: 'บจก. แอสเซ็ท รีคัฟเวอรี่ (ทดสอบ)', accountNumber: '5550002223',
      accountType: 'current', usage: 'receive', statementFormat: null, paymentFileFormat: null,
      autoMatchToleranceDays: 7, isPrimary: false, reason: R('BA-2'),
    }),
  ))
  ids.bankAccounts['BA-2'] = ba2.id

  // A.2 ไฟล์โอนธนาคาร — ครบ 3 สถานะ (passed/failed/pending) [สมมติฐาน F1]
  const formats = [
    { key: 'BF-1', bankName: 'ธนาคารกสิกรไทย', fileType: 'CSV', encoding: 'UTF_8', columnMapping: 'receiving_bank_code,receiving_account_no,receiving_account_name,amount,transfer_date,reference_no', test: true },
    { key: 'BF-2', bankName: 'ธนาคารไทยพาณิชย์', fileType: 'TXT', encoding: 'TIS_620', columnMapping: 'receiving_bank_code,receiving_account_no,receiving_account_name,amount,email', test: true },
    { key: 'BF-3', bankName: 'ธนาคารกรุงเทพ', fileType: 'CSV', encoding: 'UTF_8', columnMapping: 'receiving_bank_code,receiving_account_no,receiving_account_name,amount', test: false },
  ] as const
  for (const format of formats) {
    const created = await bankFile.createBankFileFormat(await sctx(`รูปแบบไฟล์โอน ${format.key}`), strip(
      s.bankFileFormatCreateSchema.parse({ bankName: format.bankName, fileType: format.fileType, encoding: format.encoding, columnMapping: format.columnMapping, reason: R(format.key) }),
    ))
    ids.bankFiles[format.key] = created.id
    if (format.test) await bankFile.testBankFileFormat(await sctx(`ทดสอบไฟล์ ${format.key}`), created)
  }

  // A.2 ศูนย์ต้นทุน [สมมติฐาน Q11]
  for (const row of [
    { name: 'CC-IN ทีมใน', description: 'ทีมติดตามทรัพย์ inhouse [สมมติฐาน Q11]', isActive: true },
    { name: 'CC-OUT ทีมนอก', description: 'ทีม outsource [สมมติฐาน Q11]', isActive: true },
    { name: 'CC-HQ สำนักงานใหญ่', description: 'ปิดใช้งาน [สมมติฐาน Q11]', isActive: false },
  ]) {
    await cc.createCostCenter(await sctx(`ศูนย์ต้นทุน ${row.name}`), strip(s.costCenterCreateSchema.parse({ ...row, reason: R('ศูนย์ต้นทุน') })))
  }

  // A.7 เทมเพลตเอกสาร (U122)
  await tpl.updateTaxDocTemplate(await sctx('ข้อความท้ายใบแจ้งหนี้'), 'billing_invoice', {
    footerNote: 'กรุณาชำระภายในกำหนด โอนเข้าบัญชีกสิกรไทย 999-0-00111-2',
    printSignature: true,
  })
  await tpl.updateTaxDocTemplate(await sctx('ข้อความท้ายใบกำกับภาษี'), 'tax_invoice', {
    footerNote: 'ใบเสร็จรับเงินจะสมบูรณ์เมื่อบริษัทได้รับเงินแล้ว',
    printSignature: true,
  })
  await tpl.updateTaxDocTemplate(await sctx('ใบส่งมอบเว้นช่องเซ็นมือ'), 'handover_note', { footerNote: null, printSignature: false })

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
    { key: 'T1', name: 'T1 สำเร็จ 5%', model: 'SUCCESS_FEE', baseSatang: 0, ratePct: 5, basis: 'debt_amount', chargeOnFail: false },
    { key: 'T2', name: 'T2 เหมา 7,490 ไม่คิดเมื่อไม่สำเร็จ', model: 'FLAT', baseSatang: 749000, ratePct: 0, basis: null, chargeOnFail: false },
    { key: 'T3', name: 'T3 ผสม', model: 'HYBRID', baseSatang: 200000, ratePct: 3, basis: 'debt_amount', chargeOnFail: true },
    { key: 'T4', name: 'T4 เหมา 3,000 คิดเมื่อไม่สำเร็จ', model: 'FLAT', baseSatang: 300000, ratePct: 0, basis: null, chargeOnFail: true },
    { key: 'T5', name: 'T5 สำเร็จ 5% (บริษัทปิด)', model: 'SUCCESS_FEE', baseSatang: 0, ratePct: 5, basis: 'debt_amount', chargeOnFail: false },
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
    { key: 'CO1', name: 'บจก. ยูเอที ลิสซิ่ง', shortName: 'UAT-L', tpl: 'T1', vatMode: 'exclude_vat', wht: 3, branch: '00000', billingDay: 25, due: 30, delivery: 'paper_pdf', taxSeed: '010556900101' },
    { key: 'CO2', name: 'บจก. ยูเอที แคปปิตอล', shortName: 'UAT-C', tpl: 'T2', vatMode: 'include_vat', wht: null, branch: '00000', billingDay: 5, due: 15, delivery: 'paper_pdf', taxSeed: '010556900102' },
    { key: 'CO3', name: 'บจก. ยูเอที ไฟแนนซ์', shortName: 'UAT-F', tpl: 'T3', vatMode: 'exclude_vat', wht: 3, branch: '00002', billingDay: 25, due: 30, delivery: 'paper_pdf', taxSeed: '010556900103' },
    { key: 'CO4', name: 'บจก. ยูเอที โมบาย', shortName: 'UAT-M', tpl: 'T4', vatMode: 'no_vat', wht: null, branch: '00000', billingDay: 1, due: 30, delivery: 'e_tax_invoice', taxSeed: '010556900104' },
    { key: 'CO5', name: 'บจก. ยูเอที ปิดกิจการ', shortName: 'UAT-X', tpl: 'T5', vatMode: 'exclude_vat', wht: 3, branch: '00000', billingDay: 1, due: 30, delivery: 'paper_pdf', taxSeed: '010556900105' },
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
        contactName: 'ฝ่ายติดตามทรัพย์', contactPhone: '0899999999', signerName: 'ผู้มีอำนาจลงนาม',
        serviceFeeTemplateId: ids.templates[company.tpl], vatRegistered: company.vatMode !== 'no_vat', vatMode: company.vatMode,
        whtWithheldByCustomerPct: company.wht, defaultInvoiceDeliveryFormat: company.delivery,
        billingDay: company.billingDay, paymentDueDays: company.due, reason: R(company.key),
      }),
    ))
    ids.companies[company.key] = created.id
    if (company.key === 'CO5') {
      await fcq.setFinanceCompanyStatus(await sctx('ระงับบริษัทที่ปิดกิจการ'), await fcq.getFinanceCompany(admin, created.id), 'suspended')
    }
  }
}

async function seedPayees(): Promise<void> {
  const s = await import('@/lib/payees/schemas')
  const q = await import('@/lib/payees/queries')
  const db = rawDb()
  const address = { detail: '10 ม.1', postalCode: '12000', province: 'ปทุมธานี', district: 'เมืองปทุมธานี', subdistrict: 'บางปรอก' }
  // BUG-SF1: verifyPayee บังคับ taxProfileId แม้ U121 ให้ใช้ "ช่องตามประเภท" ได้ ⇒ seed ผูก Tax Profile ที่เท่ากับค่าในช่อง
  // (ยอดภาษีเท่ากันทุกแถว) เพื่อให้ยืนยันผู้รับได้ — เส้นทาง resolve ผ่านช่องจึงไม่ถูกครอบในข้อมูล seed
  const payees = [
    { key: 'uat.agent.in1', payeeType: 'individual', taxProfile: 'TP-1', nationalId: thaiId('110000000001'), bank: 'ธนาคารกสิกรไทย', account: '1110001111', wht402Pct: 5 },
    { key: 'uat.agent.in2', payeeType: 'individual', taxProfile: 'TP-1', nationalId: thaiId('110000000002'), bank: 'ธนาคารกสิกรไทย', account: '1110002222', wht402Pct: 0 },
    { key: 'uat.agent.out1', payeeType: 'individual', taxProfile: 'TP-3', nationalId: thaiId('110000000003'), bank: 'ธนาคารกสิกรไทย', account: '1110003333', wht402Pct: null },
    { key: 'uat.agent.out2', payeeType: 'corporate', taxProfile: 'TP-2', nationalId: thaiId('010556900201'), bank: 'ธนาคารกสิกรไทย', account: '1110004444', wht402Pct: null },
  ]
  for (const payee of payees) {
    const user = await db.user.findFirstOrThrow({ where: { organizationId: ORG_ID, username: payee.key }, select: { id: true, fullName: true } })
    const existing = await db.payeeProfile.findFirst({ where: { organizationId: ORG_ID, userId: user.id, deletedAt: null }, select: { id: true } })
    if (existing !== null) {
      ids.payees[payee.key] = existing.id
      continue
    }
    const parsed = s.payeeCreateSchema.parse({
      userId: user.id, payeeType: payee.payeeType, taxProfileId: ids.taxProfiles[payee.taxProfile], nationalId: payee.nationalId,
      bankName: payee.bank, accountName: user.fullName, accountNumber: payee.account, idDocumentUrl: null,
      wht402Pct: payee.wht402Pct, nameTitle: payee.payeeType === 'corporate' ? 'บริษัท' : 'นาย', address,
      ...(payee.payeeType === 'corporate' ? { branchCode: '00000' } : {}), whtCondition: 'withhold', reason: R('ผู้รับเงิน'),
    })
    const created = await q.createPayee(await sctx(`ผู้รับเงิน ${payee.key}`), strip(parsed))
    ids.payees[payee.key] = created.payee.id
    await q.verifyPayee({ ...(await sctx('ยืนยันผู้รับเงิน')), actor: await as('uat.finance') }, created.payee.id)
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
  await seedPlans()
  await seedTeams()
  await seedCompanies()
  const missing = await syncUsers(options, {
    TEAM_A: ids.teams['TEAM_A'] ?? '', TEAM_B: ids.teams['TEAM_B'] ?? '', TEAM_C: ids.teams['TEAM_C'] ?? '',
  }, { CO1: ids.companies['CO1'] ?? '', CO2: ids.companies['CO2'] ?? '' })
  if (missing.length > 0) {
    throw new Error(`ยังไม่มีผู้ใช้: ${missing.join(', ')} — รัน --create-auth-users (บัญชี U123) หรือ --bootstrap-personas (เครื่อง)`)
  }
  await bindTeamLeads()
  await seedPayees()
}
