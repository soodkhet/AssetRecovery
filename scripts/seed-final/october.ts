import { ORG_ID, as, ctx, meta, rawDb, userId } from './context'
import { stored } from './files'
import {
  type Agent,
  acceptAndSchedule,
  acceptOnly,
  approveExpense,
  approvedCase,
  assetOf,
  assign,
  caseAction,
  checkin,
  closeCase,
  createDraftCase,
  createLot,
  expensesOfCase,
  handover,
  hotelClaim,
  intake,
  managerOf,
  manualClaim,
  rejectEvidence,
  rejectIntake,
  resubmitClose,
  settleDay,
  signCrt,
} from './flows'
import {
  advanceApprove,
  advanceReject,
  advanceRequest,
  advanceSeparateReturn,
  advanceSettle,
  billing,
  cancelPayout,
  issueInvoice,
  matchToBilling,
  payout,
  periodId,
  statementLine,
} from './money'
import { clockAt } from './runtime'
import { d, ids, need, strip } from './state'
import { SUPERADMIN } from './users'

function step(label: string): void {
  console.log(`[timeline] ${label}`)
}

const ACC = 'uat.account'
const FIN = 'uat.finance'

async function reassign(caseKey: string, to: Agent, manager: string, reason: string): Promise<void> {
  const q = await import('@/lib/assignments/queries')
  await q.reassignCase(await as(manager), ids.cases[caseKey] ?? '', { agentId: await userId(to), reason }, await ctx(manager))
}

async function respond(caseKey: string, agent: Agent, consent: boolean): Promise<void> {
  const q = await import('@/lib/assignments/queries')
  await q.respondReassignment(
    await as(agent),
    ids.cases[caseKey] ?? '',
    consent ? { decision: 'consent' } : { decision: 'decline', declineReason: 'ลูกหนี้นัดไว้แล้ว ขอทำต่อเอง' },
    await ctx(agent),
  )
}

async function timeoutJob(): Promise<void> {
  const { resolveExpiredReassignments } = await import('@/lib/assignments/timeout-job')
  await resolveExpiredReassignments({ now: new Date(), organizationId: ORG_ID })
}

async function recycle(caseKey: string, approve: boolean): Promise<void> {
  await caseAction('uat.approver', caseKey, { action: 'create_recycle_request', reason: 'ลูกหนี้ย้ายที่อยู่ใหม่ ขอติดตามรอบใหม่' })
  if (approve) await caseAction('uat.approver', caseKey, { action: 'approve_recycle' })
  else await caseAction('uat.approver', caseKey, { action: 'reject_recycle', reason: 'ไม่มีข้อมูลใหม่ ไม่คุ้มติดตามต่อ' })
}

/** อนุมัติทุกรายการที่ค้างของผู้รับคนนี้ (เคส + เบิกนอกเคส) — ใช้คุมว่ารายการเข้ารอบจ่ายไหน */
async function approvePayeeItems(agent: Agent, excludeIds: readonly string[] = [], maxDate?: string): Promise<void> {
  const payeeId = ids.payees[agent] ?? ''
  const rows = await rawDb().expense.findMany({
    where: {
      organizationId: ORG_ID,
      payeeId,
      status: { in: ['pending_approval', 'pending_finance_approval'] },
      id: { notIn: [...excludeIds] },
      ...(maxDate === undefined ? {} : { expenseDate: { lte: d(maxDate) } }),
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  for (const row of rows) await approveExpense(row.id, managerOf(agent))
}

const OCT_CASES = [
  { key: 'FT-01', company: 'CO1', side: 'inhouse', debtSatang: 1000000 },
  { key: 'FT-02', company: 'CO1', side: 'inhouse', debtSatang: 1000000 },
  { key: 'FT-03', company: 'CO1', side: 'outsource', debtSatang: 987654 },
  { key: 'FT-04', company: 'CO1', side: 'inhouse', debtSatang: 2000001 },
  { key: 'FT-05', company: 'CO2', side: 'outsource', debtSatang: 1000000 },
  { key: 'FT-06', company: 'CO2', side: 'outsource', debtSatang: 980000 },
  { key: 'FT-07', company: 'CO2', side: 'inhouse', debtSatang: 1850000 },
  { key: 'FT-08', company: 'CO2', side: 'inhouse', debtSatang: 1000000 },
  { key: 'FT-09', company: 'CO3', side: 'outsource', debtSatang: 1500000 },
  { key: 'FT-10', company: 'CO3', side: 'outsource', debtSatang: 1000000 },
  { key: 'FT-12', company: 'CO4', side: 'outsource', debtSatang: 1600000 },
  { key: 'FT-13', company: 'CO4', side: 'inhouse', debtSatang: 3120000 },
  { key: 'FT-14', company: 'CO4', side: 'outsource', debtSatang: 1000000 },
] as const

/** 01/10/2569 08:00 — ส่งงวด ก.ย. ให้สำนักงานบัญชี + Export v1 + ล็อก (exception BL-003 บริหารอนุญาต) */
async function closeSeptember(): Promise<void> {
  const acc = await import('@/lib/accounting/queries')
  const exp = await import('@/lib/exports/queries')
  step('01/10/2569 ปิดงวด ก.ย.: exception → ส่ง → Export v1 → ล็อก')
  clockAt('2026-10-01 07:30')
  const sept = await periodId(2569, 9)
  ids.periods['2026-09'] = sept
  const resolved = await acc.createException(await ctx(ACC), {
    periodId: sept, level: 'warning', title: 'รอใบ 50 ทวิ ลูกค้า BL-2569-001', description: 'ลูกค้าหักภาษี 3% รอรับต้นฉบับ',
    sourceModule: 'customer_wht', sourceRef: 'BL-2569-001',
  })
  await acc.resolveException(await ctx(ACC), resolved.id, { resolutionNote: 'ได้รับใบ 50 ทวิ จากลูกค้าแล้ว' })
  const critical = await acc.createException(await ctx(ACC), {
    periodId: sept, level: 'critical', title: 'ยอดรับ BL-2569-003 ต่างจากใบแจ้งหนี้', description: 'ลูกค้าหักภาษี ยังไม่ได้รับใบ 50 ทวิ',
    sourceModule: 'billing', sourceRef: 'BL-2569-003',
  })
  await acc.authorizeException(await ctx('uat.exec'), critical.id, { authorizeNote: 'อนุญาตปิดงวด — ติดตามใบ 50 ทวิ ในงวดถัดไป' })
  // ภ.ง.ด. ก.ย. ยื่นแล้ว (ก่อนส่งงวด) → U127 ยกเลิก + ออก 50 ทวิ ใหม่หลังยื่น ⇒ ธง "ต้องยื่นเพิ่มเติม" (ยอดที่ยื่นไม่ถูกเขียนทับ)
  // ต้องทำก่อนล็อกงวด — งวดที่ล็อกแล้วยกเลิกใบไม่ได้ (PERIOD_LOCKED_DIRECT_EDIT)
  const wht = await import('@/lib/wht/queries')
  const septFilings = await rawDb().whtFilingSummary.findMany({ where: { organizationId: ORG_ID, periodId: sept, status: 'pending' }, select: { id: true } })
  for (const row of septFilings) await wht.markWhtFilingFiled(await ctx(ACC), row.id, { reason: 'ยื่นแบบกระดาษแล้ว' })
  const septCert = await rawDb().whtCertificate.findFirstOrThrow({
    where: { organizationId: ORG_ID, paymentDate: d('2026-09-20'), status: 'active', payeeId: ids.payees['uat.agent.out1'] ?? '' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  await wht.cancelWhtCertificate(await ctx(ACC), septCert.id, { reason: 'ที่อยู่ผู้ถูกหักภาษีผิด ออกใบใหม่หลังยื่นแบบแล้ว', reissue: true })
  await acc.sendPeriod(await ctx(ACC), sept, { reason: 'ส่งข้อมูลงวด ก.ย. 2569 ให้สำนักงานบัญชี' })
  const v1 = await exp.createExportPack(await ctx(ACC), { periodId: sept, note: 'ก.ย. v1' })
  await exp.markExportSent(await ctx(ACC), v1.id, { note: 'ส่งอีเมลสำนักงานบัญชี' })
  await exp.acceptExport(await ctx(ACC), v1.id, { note: 'สำนักงานบัญชียืนยันรับ' })
  await acc.lockPeriod(await ctx('uat.exec'), sept, { reason: 'ปิดงวด ก.ย. 2569 หลังสำนักงานบัญชีรับข้อมูล' })
}

/** 01/10/2569 — ค่าตั้ง ต.ค.: WP-2 · PLAN_IN v2 · T3 v2 · ผู้รับ (2)/(3) · แก้ข้อความท้ายใบแจ้งหนี้ */
async function octoberSettings(): Promise<void> {
  step('01/10/2569 WP-2 · PLAN_IN v2 · T3 v2 · ถอด TP-3 ของ out1 · ตั้ง (2)/(3)')
  clockAt('2026-10-01 08:00')
  const s = await import('@/lib/settings/schemas')
  const wht = await import('@/lib/settings/queries/wht-policy')
  const reason = (text: string) => `${text} (Final Test seed)`
  const sctx = async (text: string) => ({ actor: await as(SUPERADMIN), meta, reason: reason(text) })
  await wht.createWhtPolicy(await sctx('นโยบายภาษีหัก ณ ที่จ่าย ต.ค. [สมมติฐาน Q1–Q4, Q18]'), strip(
    s.whtPolicyCreateSchema.parse({
      effectiveFrom: '2026-10-01', baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'],
      certificateMode: 'per_payee_batch', incomeTypeMode: 'by_team_side', issueZeroRate402Certificate: true,
      inhouseIncomeCategory: 'sec_40_2', outsourceIncomeCategory: 'sec_40_8', allowGrossUpConditions: true,
      filingMethod: 'online', reason: reason('WP-2'),
    }),
  ))

  const comp = await import('@/lib/compensation/queries')
  const compS = await import('@/lib/compensation/schemas')
  const plan = await comp.getCompensationPlan(ORG_ID, ids.plans['PLAN_IN'] ?? '')
  await comp.updateCompensationPlan(await sctx('PLAN_IN v2 ค่าคอมมิชชั่น 600 บาท'), plan, strip(
    compS.compensationPlanUpdateSchema.parse({
      name: plan.name, side: plan.side, fuelMode: 'DAILY_FLAT', fuelDailyFlatSatang: 20000, allowanceSatang: 15000,
      commissionSatang: 60000, noSuccessFeeSatang: 20000, hotelMaxPerNightSatang: 80000, hotelReceiptRequired: true,
      whtPct: 3, effectiveFrom: '2026-10-01', reason: reason('PLAN_IN v2'),
    }),
  ))

  const sf = await import('@/lib/service-fee/queries')
  const sfS = await import('@/lib/service-fee/schemas')
  const t3 = await sf.getServiceFeeTemplate(ORG_ID, ids.templates['T3'] ?? '')
  await sf.updateServiceFeeTemplate(await sctx('T3 v2 อัตรา 4% ไม่คิดเมื่อไม่สำเร็จ'), t3, strip(
    sfS.serviceFeeTemplateUpdateSchema.parse({
      name: t3.name, model: 'HYBRID', baseSatang: 200000, ratePct: 4, basis: 'debt_amount', failFeeSatang: null, reason: reason('T3 v2'),
    }),
  ))

  const tpl = await import('@/lib/settings/queries/tax-doc-templates')
  await tpl.updateTaxDocTemplate(await sctx('แก้ข้อความท้ายใบแจ้งหนี้ ต.ค.'), 'billing_invoice', {
    footerNote: 'กรุณาชำระภายใน 30 วัน โอนเข้าบัญชีกสิกรไทย 999-0-00111-2',
    printSignature: true,
  })

  await updatePayeeFields('uat.agent.out1', { taxProfile: 'TP-1', whtCondition: 'pay_always' }, 'ถอด Tax Profile รายคน + ตั้งบริษัทออกภาษีให้ทุกครั้ง')
  await updatePayeeFields('uat.agent.out2', { whtCondition: 'pay_once' }, 'ตั้งบริษัทออกภาษีให้ครั้งเดียว')
}

async function updatePayeeFields(
  agent: Agent,
  change: { taxProfile?: string; whtCondition?: 'withhold' | 'pay_always' | 'pay_once'; accountNumber?: string },
  why: string,
  reverify = true,
): Promise<void> {
  const q = await import('@/lib/payees/queries')
  const payeeId = ids.payees[agent] ?? ''
  const current = await q.getPayee(await as(FIN), payeeId)
  const reason = `${why} (Final Test seed)`
  // BUG-SF1: ช่อง "ใช้ค่าเริ่มต้นตามประเภท" (taxProfileId = null) ยืนยันผู้รับไม่ได้ ⇒ ใส่ TP-1 (= ค่าช่อง outsource-บุคคล)
  await q.updatePayee({ actor: await as(FIN), meta, reason }, payeeId, {
    payeeType: current.payeeType,
    taxProfileId: change.taxProfile === undefined ? current.taxProfileId : need('taxProfiles', change.taxProfile),
    nationalId: current.nationalId,
    bankName: current.bankName,
    accountName: current.accountName,
    accountNumber: change.accountNumber ?? current.accountNumber,
    idDocumentUrl: current.idDocumentUrl,
    wht402Pct: current.wht402Pct,
    nameTitle: current.nameTitle,
    address: current.address,
    branchCode: current.branchCode,
    whtCondition: change.whtCondition ?? current.whtCondition,
  })
  const after = await q.getPayee(await as(FIN), payeeId)
  if (reverify && !after.isVerified) await q.verifyPayee({ actor: await as(FIN), meta, reason: `ตรวจข้อมูลผู้รับใหม่แล้ว (Final Test seed)` }, payeeId)
}

async function octoberCases(): Promise<void> {
  step('01/10/2569 รับเคส ต.ค. (CO3 หลัง T3 v2) + มอบหมาย')
  clockAt('2026-10-01 08:30')
  for (const spec of OCT_CASES) await approvedCase(spec)
  clockAt('2026-10-01 08:40')
  const plan: Array<[string, Agent]> = [
    ['FT-01', 'uat.agent.in1'], ['FT-02', 'uat.agent.in2'], ['FT-03', 'uat.agent.out1'], ['FT-04', 'uat.agent.in1'],
    ['FT-05', 'uat.agent.out1'], ['FT-06', 'uat.agent.out1'], ['FT-07', 'uat.agent.in1'], ['FT-08', 'uat.agent.in1'],
    ['FT-09', 'uat.agent.out2'], ['FT-10', 'uat.agent.out2'], ['FT-12', 'uat.agent.out2'], ['FT-13', 'uat.agent.in2'],
    ['FT-14', 'uat.agent.out1'],
  ]
  for (const [key, agent] of plan) await assign(key, agent)
  clockAt('2026-10-01 08:50')
  const schedule: Record<string, string> = {
    'FT-01': '2026-10-03', 'FT-03': '2026-10-01', 'FT-04': '2026-10-02', 'FT-05': '2026-10-01', 'FT-07': '2026-10-01',
    'FT-08': '2026-10-02', 'FT-10': '2026-10-01', 'FT-12': '2026-10-02', 'FT-13': '2026-10-01', 'FT-14': '2026-10-03',
  }
  for (const [key, agent] of plan) {
    if (key === 'FT-02' || key === 'FT-06' || key === 'FT-09') await acceptOnly(key, agent)
    else await acceptAndSchedule(key, agent, schedule[key] ?? '2026-10-02')
  }

  step('01/10/2569 ย้ายงาน: FT-06 (ยินยอม) · FT-14 (ปฏิเสธ) · FT-02/FT-09 (หมดเวลา → job)')
  clockAt('2026-10-01 09:00')
  await reassign('FT-06', 'uat.agent.out2', 'uat.mgr.out', 'out1 คิวเต็ม ขอย้ายให้ out2')
  await respond('FT-06', 'uat.agent.out1', true)
  await reassign('FT-14', 'uat.agent.out2', 'uat.mgr.out', 'ขอย้ายงานให้ out2')
  await respond('FT-14', 'uat.agent.out1', false)
  await reassign('FT-02', 'uat.agent.in1', 'uat.mgr.in', 'in2 ลาป่วย ขอย้ายให้ in1')
  await reassign('FT-09', 'uat.agent.out1', 'uat.mgr.out', 'out2 คิวเต็ม ขอย้ายให้ out1')
  clockAt('2026-10-01 12:30')
  await timeoutJob()
  clockAt('2026-10-01 13:00')
  await acceptAndSchedule('FT-06', 'uat.agent.out2', '2026-10-02')
  await acceptAndSchedule('FT-09', 'uat.agent.out1', '2026-10-02')
  await acceptAndSchedule('FT-02', 'uat.agent.in1', '2026-10-07')
}

async function fieldOct1(): Promise<void> {
  step('01/10/2569 ภาคสนาม: FT-07 r1 · FT-13 r1 · FT-03 r1 · FT-05 · FT-10 r1 ไม่สำเร็จ')
  const day: Array<[string, Agent, string]> = [
    ['FT-07', 'uat.agent.in1', '10:00'], ['FT-13', 'uat.agent.in2', '10:00'], ['FT-03', 'uat.agent.out1', '10:00'],
    ['FT-05', 'uat.agent.out1', '11:00'], ['FT-10', 'uat.agent.out2', '10:00'],
  ]
  for (const [key, agent, time] of day) {
    clockAt(`2026-10-01 ${time}`)
    await checkin(key, agent)
  }
  clockAt('2026-10-01 14:00')
  for (const [key, agent] of day) await closeCase(key, agent, 'closed_fail')
  clockAt('2026-10-01 18:00')
  await hotelClaim('uat.agent.out1', '2026-10-01', 150000, 2, false)
  await manualClaim('uat.agent.out1', 'receipt', '2026-10-01', 25000)
  await settleDay('2026-10-01')

  step('01/10/2569 รีไซเคิล FT-03/07/10/13 อนุมัติ · FT-05 ปฏิเสธ → มอบหมายรอบ 2')
  // BUG-SF2: รายได้รอบที่ไม่สำเร็จ (cof=true) ต้องเกิด **ก่อน** อนุมัติรีไซเคิล — tryCreateRevenue ประเมินเฉพาะรอบปัจจุบัน
  // ถ้าอนุมัติรายการรอบ 1 หลังขึ้นรอบ 2 รายได้รอบ 1 หายถาวร ⇒ อนุมัติรายการ FT-13 r1 ครบสายก่อน (in2 อยู่รอบ PB-O-IN1 เหมือนเดิม)
  clockAt('2026-10-01 18:30')
  for (const row of await expensesOfCase('FT-13')) await approveExpense(row.id, 'uat.mgr.in')
  clockAt('2026-10-01 19:00')
  for (const key of ['FT-03', 'FT-07', 'FT-10', 'FT-13']) await recycle(key, true)
  await recycle('FT-05', false)
  await assign('FT-03', 'uat.agent.out1')
  await assign('FT-07', 'uat.agent.in1')
  await assign('FT-10', 'uat.agent.out2')
  await assign('FT-13', 'uat.agent.in2')
  clockAt('2026-10-01 19:30')
  await acceptAndSchedule('FT-03', 'uat.agent.out1', '2026-10-02')
  await acceptAndSchedule('FT-07', 'uat.agent.in1', '2026-10-02')
  await acceptOnly('FT-10', 'uat.agent.out2')
  await acceptAndSchedule('FT-13', 'uat.agent.in2', '2026-10-03')
}

async function fieldOct2(): Promise<{ crtFt09: string | null }> {
  step('02/10/2569 ภาคสนาม: in1 FT-04/FT-07 r2/FT-08 (N=3) · out1 FT-03 r2/FT-09 · out2 FT-06/FT-12')
  const day: Array<[string, Agent, string, 'closed_success' | 'closed_fail']> = [
    ['FT-04', 'uat.agent.in1', '09:00', 'closed_success'], ['FT-07', 'uat.agent.in1', '10:00', 'closed_success'],
    ['FT-08', 'uat.agent.in1', '11:00', 'closed_success'], ['FT-03', 'uat.agent.out1', '09:00', 'closed_success'],
    ['FT-09', 'uat.agent.out1', '10:00', 'closed_success'], ['FT-06', 'uat.agent.out2', '09:00', 'closed_success'],
    ['FT-12', 'uat.agent.out2', '10:00', 'closed_fail'],
  ]
  for (const [key, agent, time] of day) {
    clockAt(`2026-10-02 ${time}`)
    await checkin(key, agent)
  }
  clockAt('2026-10-02 14:00')
  for (const [key, agent, , outcome] of day) await closeCase(key, agent, outcome)
  clockAt('2026-10-02 15:00')
  await rejectEvidence('FT-04')
  clockAt('2026-10-02 16:00')
  await resubmitClose('FT-04', 'uat.agent.in1', true)
  clockAt('2026-10-02 18:00')
  await hotelClaim('uat.agent.in1', '2026-10-02', 80000, 1, false)
  const ft09 = await hotelClaim('uat.agent.out1', '2026-10-02', 45000, 1, true)
  if (ft09.crtId !== null) await signCrt('uat.agent.out1', ft09.crtId)
  await manualClaim('uat.agent.out2', 'manual', '2026-10-02', 600000)
  await settleDay('2026-10-02')

  step('02/10/2569 เคลียร์ทดรอง ADV-2 (ใช้เกิน → เบิกส่วนเกิน) · ADV-3 (คืนเงินสด RAV-0001) · รับเงิน BL-002 บางส่วน')
  clockAt('2026-10-02 19:00')
  await advanceSettle('ADV-2', 'uat.agent.out1', 210000, 'payout_offset')
  await advanceSettle('ADV-3', 'uat.agent.in2', 60000, 'separate')
  await advanceSeparateReturn('ADV-3', 'cash', 40000, '2026-10-02')
  const bl002 = await statementLine('2026-10-02', 'IN-BL002', 400000)
  await matchToBilling(bl002, 'BL-002', 'ลูกค้าแบ่งชำระงวดแรก')
  await issueInvoice('BL-002')
  return { crtFt09: ft09.crtId }
}

async function fieldOct3(): Promise<void> {
  step('03/10/2569 ภาคสนาม: FT-01 (ไม่สำเร็จ+ขอรีไซเคิลค้าง) · FT-13 r2 · FT-11 · FT-14 (ตีกลับ)')
  const day: Array<[string, Agent, string, 'closed_success' | 'closed_fail']> = [
    ['FT-01', 'uat.agent.in1', '10:00', 'closed_fail'], ['FT-13', 'uat.agent.in2', '10:00', 'closed_success'],
    ['FT-11', 'uat.agent.out1', '09:00', 'closed_success'], ['FT-14', 'uat.agent.out1', '10:00', 'closed_success'],
  ]
  for (const [key, agent, time] of day) {
    clockAt(`2026-10-03 ${time}`)
    await checkin(key, agent)
  }
  clockAt('2026-10-03 14:00')
  for (const [key, agent, , outcome] of day) await closeCase(key, agent, outcome)
  clockAt('2026-10-03 15:00')
  await rejectEvidence('FT-14', 'ภาพเครื่องไม่เห็น IMEI ถ่ายใหม่')
  await caseAction('uat.approver', 'FT-01', { action: 'create_recycle_request', reason: 'ได้ที่อยู่ใหม่ของลูกหนี้จากไฟแนนซ์' })
  clockAt('2026-10-03 18:00')
  await hotelClaim('uat.agent.in1', '2026-10-03', 90000, 2, false)
  await hotelClaim('uat.agent.out1', '2026-10-03', 60000, 1, false)
  const ft14Manual = await manualClaim('uat.agent.out1', 'manual', '2026-10-03', 550000)
  const ft10Hotel = await hotelClaim('uat.agent.out2', '2026-10-03', 40000, 1, false)
  await settleDay('2026-10-03')
  extra.ft14Manual = ft14Manual
  extra.ft10Hotel = ft10Hotel.expenseId

  step('03/10/2569 คลัง ล็อต CO1/CO2/CO3/CO4 (LOT-005…008) · รับเงิน BL-005 บางส่วน')
  clockAt('2026-10-03 16:00')
  await handover('CO1', ['FT-03', 'FT-04'])
  // U142 — CO2 แยก 2 ล็อตวันเดียวกัน (ก.ย. + ต.ค. หลายล็อตต่อบริษัท)
  await handover('CO2', ['FT-06'])
  await handover('CO2', ['FT-07'])
  await handover('CO3', ['FT-09', 'FT-11'])
  await handover('CO4', ['FT-13'])
  clockAt('2026-10-03 17:00')
  const bl005 = await statementLine('2026-10-03', 'IN-BL005', 250000)
  await matchToBilling(bl005, 'BL-005', 'ลูกค้าแบ่งชำระ')
}

const extra: { ft14Manual: string; ft10Hotel: string } = { ft14Manual: '', ft10Hotel: '' }

async function approvalsAndPayoutsOct4(): Promise<void> {
  step('04/10/2569 ทดรอง ADV-1 (หักกลบ) · ADV-4 (CRT ยกเลิก→ออกแทน · RAV-0002) · ADV-5/6/7/8 ขอใหม่')
  clockAt('2026-10-04 08:00')
  await advanceSettle('ADV-1', 'uat.agent.in1', 245000, 'payout_offset')
  await advanceSettle('ADV-4', 'uat.agent.out2', 120000, 'separate', 26000)
  {
    const crt = await import('@/lib/substitute-receipts/queries')
    const row = await rawDb().substituteReceipt.findFirstOrThrow({ where: { advanceId: ids.advances['ADV-4'] ?? '' }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    await crt.cancelSubstituteReceipt(await ctx(FIN), row.id, { reason: 'รายการในใบรับรองไม่ตรงใบเสร็จย่อย ออกใบใหม่' })
    await crt.reissueSubstituteReceipt(await ctx(FIN), row.id, [
      { lineDate: d('2026-10-04'), description: 'ค่าใช้จ่ายย่อยไม่มีใบเสร็จ (แก้ไข)', amountSatang: 26000, note: null },
    ])
  }
  await advanceSeparateReturn('ADV-4', 'bank_transfer', 30000, '2026-10-04')
  await advanceRequest('ADV-5', 'uat.agent.in2', 50000, '2026-10-05')
  await advanceRequest('ADV-6', 'uat.agent.out1', 70000, '2026-10-25')
  await advanceRequest('ADV-7', 'uat.agent.in1', 90000, '2026-10-25')
  await advanceReject('ADV-7', 'ยังมีงานค้างเคลียร์ ขอให้เคลียร์งานก่อน')
  await advanceRequest('ADV-8', 'uat.agent.out2', 80000, '2026-10-20')

  step('04/10/2569 อนุมัติ out1 → รายได้ FT-03 r2/FT-09 → BL-006 CO1 · BL-007 CO3 → PB-O-OUT1 (โอน → auto-match)')
  clockAt('2026-10-04 09:00')
  // FT-11 (out1 · 03/10) ต้องเข้า PB-O-OUT2 ⇒ อนุมัติเฉพาะรายการถึง 02/10 (= วันตัดรอบ)
  await approvePayeeItems('uat.agent.out1', [extra.ft14Manual], '2026-10-02')
  await billing('BL-006', 'CO1', '2026-10-03', true)
  // O72 — วันที่รายได้ = วันยืนยันล็อต (FT-09 ส่งมอบ 03/10) ⇒ วันตัดรอบ 03/10 (FT-11 ยังไม่เกิดรายได้ — รายการ out1 03/10 ยังไม่อนุมัติ)
  await billing('BL-007', 'CO3', '2026-10-03', true)
  await payout('PB-O-OUT1', 'outsource', '2026-10-02', 'file_generated')
  const out1 = await rawDb().payoutBatch.findUniqueOrThrow({ where: { id: ids.payouts['PB-O-OUT1'] ?? '' }, select: { netSatang: true } })
  await statementLine('2026-10-04', 'OUT-PBOOUT1', -out1.netSatang)

  step('04/10/2569 อนุมัติ in2 → รายได้ FT-13 r1+r2 → BL-008 CO4 → PB-O-IN1 (โอน → auto-match) → ยกเลิกใบ 0% ออกใหม่')
  clockAt('2026-10-04 10:00')
  await approvePayeeItems('uat.agent.in2')
  await billing('BL-008', 'CO4', '2026-10-04', true)
  await payout('PB-O-IN1', 'inhouse', '2026-10-04', 'file_generated')
  const in1 = await rawDb().payoutBatch.findUniqueOrThrow({ where: { id: ids.payouts['PB-O-IN1'] ?? '' }, select: { netSatang: true } })
  await statementLine('2026-10-04', 'OUT-PBOIN1', -in1.netSatang)
  {
    const wht = await import('@/lib/wht/queries')
    const cert = await rawDb().whtCertificate.findFirst({
      where: { organizationId: ORG_ID, payoutBatchId: ids.payouts['PB-O-IN1'] ?? '', status: 'active' },
      select: { id: true },
    })
    if (cert !== null) await wht.cancelWhtCertificate(await ctx(ACC), cert.id, { reason: 'ที่อยู่ผู้รับเงินผิด ออกใบใหม่', reissue: true })
  }

  step('04/10/2569 อนุมัติ in1 (FT-04/FT-07) → PB-O-IN2 checking (หักกลบ ADV-1)')
  clockAt('2026-10-04 11:00')
  // FT-01 (03/10) ค้างรอผู้จัดการตามแถว E ⇒ อนุมัติเฉพาะรายการถึง 02/10
  await approvePayeeItems('uat.agent.in1', [], '2026-10-02')
  await payout('PB-O-IN2', 'inhouse', '2026-10-02', 'checking')

  step('04/10/2569 อนุมัติ out2 FT-06 → PB-O-X → ยกเลิก "ยอดผิด สร้างใหม่" · ร่างบิล CO2 (FT-06+07)')
  clockAt('2026-10-04 13:00')
  for (const row of await expensesOfCase('FT-06')) await approveExpense(row.id, 'uat.mgr.out')
  await payout('PB-O-X', 'outsource', '2026-10-04', 'checking')
  await cancelPayout('PB-O-X', 'ยอดผิด สร้างใหม่')
  await billing('DRAFT-CO2', 'CO2', '2026-10-04', false)

  step('04/10/2569 ใบลดหนี้ CN-1 / CN-2 (ยกเลิก) บน INV-0003 · ใบเพิ่มหนี้ DN-1 บน INV-0001')
  clockAt('2026-10-04 15:00')
  {
    const cn = await import('@/lib/credit-notes/queries')
    const inv = async (num: string) => (await rawDb().taxInvoice.findFirstOrThrow({ where: { organizationId: ORG_ID, invoiceNumber: num }, select: { id: true } })).id
    await cn.createCreditNote(await ctx(FIN), { noteType: 'credit', taxInvoiceId: await inv('INV-0003'), adjustmentId: null, creditNoteNumber: 'CN-1', issueDate: d('2026-10-04'), amountBeforeVatSatang: 50000, vatSatang: 3500, reason: 'ส่วนลดค่าบริการตามที่ตกลง', filePath: null })
    const cn2 = await cn.createCreditNote(await ctx(FIN), { noteType: 'credit', taxInvoiceId: await inv('INV-0003'), adjustmentId: null, creditNoteNumber: 'CN-2', issueDate: d('2026-10-04'), amountBeforeVatSatang: 1000, vatSatang: 70, reason: 'ส่วนลดทดสอบ (ยกเลิกภายหลัง)', filePath: null })
    await cn.cancelCreditNote(await ctx(FIN), cn2.id, { reason: 'ออกผิด ยกเลิก' })
    await cn.createCreditNote(await ctx(FIN), { noteType: 'debit', taxInvoiceId: await inv('INV-0001'), adjustmentId: null, creditNoteNumber: 'DN-1', issueDate: d('2026-10-04'), amountBeforeVatSatang: 10000, vatSatang: 700, reason: 'ค่าบริการเพิ่มเติมที่ตกหล่น', filePath: null })
  }
}

async function oct5(): Promise<void> {
  step('05/10/2569 อนุมัติ FT-11/FT-12 → PB-O-OUT2 file_generated · ADV-5/ADV-8 อนุมัติ')
  clockAt('2026-10-05 09:00')
  await approvePayeeItems('uat.agent.out1', [extra.ft14Manual])
  // FT-12 manual ผ่านครบ 3 ขั้น (บริหาร) · FT-10 r1 / hotel FT-10 ไม่อยู่ในรอบ (ค้างตามแถว E)
  const out2Pending = await rawDb().expense.findMany({
    where: { payeeId: ids.payees['uat.agent.out2'] ?? '', status: { in: ['pending_approval', 'pending_finance_approval'] }, caseId: { in: [ids.cases['FT-12'] ?? ''] } },
    select: { id: true },
  })
  for (const row of out2Pending) await approveExpense(row.id, 'uat.mgr.out')
  const manualFt12 = await rawDb().expense.findFirstOrThrow({ where: { payeeId: ids.payees['uat.agent.out2'] ?? '', expenseType: 'manual', grossSatang: 600000, status: { not: 'approved' } }, select: { id: true } })
  await approveExpense(manualFt12.id, 'uat.mgr.out')
  await payout('PB-O-OUT2', 'outsource', '2026-10-05', 'file_generated')
  await advanceApprove('ADV-5')
  await advanceApprove('ADV-8')

  step('05/10/2569 ค้างตามแถว E: FT-10 r1 ขั้นการเงิน · ค่าที่พัก FT-10 ตีกลับ · FT-14 manual ค้างบริหาร · FT-01 รอผู้จัดการ')
  for (const row of await expensesOfCase('FT-10')) await approveExpense(row.id, 'uat.mgr.out', 2)
  await approveExpense(extra.ft10Hotel, 'uat.mgr.out', 2)
  {
    const approvals = await import('@/lib/compensation/approval-queries')
    await approvals.rejectCompensationExpense(await ctx(FIN), extra.ft10Hotel, { reason: 'ใบเสร็จไม่ระบุชื่อผู้เข้าพัก แก้ไขแล้วส่งใหม่' })
  }
  await approveExpense(extra.ft14Manual, 'uat.mgr.out', 3)

  step('05/10/2569 รับเงิน BL-007 (หักภาษี) → INV-0004 ยกเลิก → INV-0005 · BL-008 เต็ม · รายการธนาคารอื่น')
  clockAt('2026-10-05 14:00')
  await statementLine('2026-10-05', 'IN-BL007', 270400)
  {
    const sales = await import('@/lib/sales/queries')
    const inv4 = await issueInvoice('BL-007')
    await sales.cancelTaxInvoice(await ctx(FIN), inv4, { reason: 'พิมพ์สาขาผู้ซื้อผิด ออกใบใหม่' })
    await sales.issueTaxInvoice(await ctx(FIN), { replacesInvoiceId: inv4 })
  }
  // มติ U165 — BL-008 = FT-13 r1 ไม่สำเร็จ 100000 + r2 สำเร็จ 300000 (T4) ⇒ รับเต็ม 400000
  await statementLine('2026-10-05', 'IN-BL008', 400000)
  // U144 — รับขาดไม่เกินเพดาน (฿50) = ปิดบิล + ตัดส่วนต่างเป็นค่าธรรมเนียมธนาคาร
  const bl005Rest = await statementLine('2026-10-05', 'IN-BL005-2', 345000)
  await matchToBilling(bl005Rest, 'BL-005', 'ลูกค้าโอนงวดสุดท้าย ขาดค่าธรรมเนียมโอนต่างธนาคาร')
  // U163 — ลูกค้าหักภาษี 3% + ค่าโอนในรายการเดียว ⇒ นับภาษีเต็ม 1481 ก่อน ส่วนต่าง 3520 เป็นค่าธรรมเนียม · paid
  const bl006Short = await statementLine('2026-10-05', 'IN-BL006', 47839)
  await matchToBilling(bl006Short, 'BL-006', 'ลูกค้าหักภาษี ณ ที่จ่าย และหักค่าโอนต่างธนาคาร')
  // U144 — รอบใหม่ CO4 (FT-12 ไม่สำเร็จ 100000 ตาม U165) รับขาด 5001 เกินเพดาน 1 สตางค์ ⇒ ค้าง partially_paid
  await billing('BL-010', 'CO4', '2026-10-05', true)
  const bl010Short = await statementLine('2026-10-05', 'IN-BL010', 94999)
  await matchToBilling(bl010Short, 'BL-010', 'ลูกค้าโอนขาด เกินเพดานค่าธรรมเนียม รอติดตามส่วนที่เหลือ')
  const recon = await import('@/lib/bank-recon/queries')
  await statementLine('2026-10-05', 'IN-UNKNOWN', 20000)
  const fee = await statementLine('2026-10-05', 'FEE-OCT', -1500)
  await recon.resolveUnmatchedTransaction(await ctx(FIN), fee, { matchNote: 'ค่าธรรมเนียมธนาคาร' })
  const suspense = await statementLine('2026-10-05', 'IN-SUSPENSE', 12345)
  await recon.moveToSuspense(await ctx(FIN), suspense, { reason: 'ยังไม่ทราบผู้โอน รอตรวจสอบ' })
  const refund = await statementLine('2026-10-05', 'IN-REFUND', 5000)
  await recon.moveToSuspense(await ctx(FIN), refund, { reason: 'โอนผิดบัญชี รอคืนเงิน' })
  {
    const { bankRefundFilePrefix } = await import('@/lib/customer-wht/file')
    await recon.refundSuspense(await ctx(FIN), refund, { refundDate: d('2026-10-05'), reason: 'คืนเงินผู้โอนผิด', filePath: await stored(`${bankRefundFilePrefix(refund)}slip.pdf`) })
  }

  step('05/10/2569 X-08…X-11 ภาคสนาม + คลัง')
  await xRows()

  step('05/10/2569 แก้เลขบัญชี in1 → รอยืนยันใหม่ · Adjustment ADJ-1/2/3 · Export ก.ย. v2 / ต.ค. v1 · คำถามนักบัญชี · ภ.ง.ด.')
  clockAt('2026-10-05 17:00')
  await updatePayeeFields('uat.agent.in1', { accountNumber: '1110009999' }, 'ผู้รับแจ้งเปลี่ยนบัญชีธนาคาร', false)
  await accountingOct()
}

async function xRows(): Promise<void> {
  clockAt('2026-10-05 08:00')
  await createDraftCase({ key: 'X-01', company: 'CO1', side: 'inhouse', debtSatang: 500000 })
  await createDraftCase({ key: 'X-02', company: 'CO2', side: 'inhouse', debtSatang: 500000 })
  await caseAction('uat.admin', 'X-02', { action: 'review' })
  await approvedCase({ key: 'X-03', company: 'CO1', side: 'inhouse', debtSatang: 500000 })
  await assign('X-03', 'uat.agent.in2')
  await createDraftCase({ key: 'X-04', company: 'CO1', side: 'inhouse', debtSatang: 500000 })
  await caseAction('uat.admin', 'X-04', { action: 'review' })
  await caseAction('uat.approver', 'X-04', { action: 'request_more_info', reason: 'ขอสำเนาสัญญาหน้าสุดท้ายเพิ่ม' })
  await createDraftCase({ key: 'X-05', company: 'CO1', side: 'inhouse', debtSatang: 500000 })
  await caseAction('uat.admin', 'X-05', { action: 'review' })
  await caseAction('uat.approver', 'X-05', { action: 'reject', reason: 'เอกสารไม่ครบ และเลขอ้างอิงซ้ำกับเคสเดิม' })
  await approvedCase({ key: 'X-06', company: 'CO3', side: 'inhouse', debtSatang: 500000 })
  await approvedCase({ key: 'X-13', company: 'CO3', side: 'outsource', debtSatang: 500000 })

  const rows: Array<[string, 'CO1' | 'CO2' | 'CO4', Agent, 'inhouse' | 'outsource']> = [
    ['X-08', 'CO1', 'uat.agent.in1', 'inhouse'], ['X-09', 'CO4', 'uat.agent.out1', 'outsource'],
    ['X-10', 'CO1', 'uat.agent.out1', 'outsource'], ['X-11', 'CO2', 'uat.agent.out2', 'outsource'],
  ]
  for (const [key, company, agent, side] of rows) {
    await approvedCase({ key, company, side, debtSatang: 800000 })
    await assign(key, agent)
    await acceptAndSchedule(key, agent, '2026-10-05')
  }
  clockAt('2026-10-05 10:00')
  for (const [key, , agent] of rows) await checkin(key, agent)
  clockAt('2026-10-05 12:00')
  for (const [key, , agent] of rows) await closeCase(key, agent, 'closed_success')
  clockAt('2026-10-05 15:00')
  await rejectIntake('X-09')
  const x08 = await intake('X-08')
  await createLot('CO1', [x08], 'we_deliver')
  const x10 = await intake('X-10')
  await createLot('CO1', [x10], 'finance_pickup')
  await intake('X-11')
  // U129 — รับเคสใหม่ที่ IMEI ซ้ำกับเครื่องในคลังที่ยังไม่ส่งมอบ (X-11) ⇒ ระบบเตือนตอนส่งเคส (ไม่บล็อก) · ค้าง draft
  await createDraftCase({ key: 'X-14', company: 'CO2', side: 'outsource', debtSatang: 500000 }, (await assetOf('X-11')).imeiContract ?? undefined)
  // X-12: ค่าที่พัก out1 ฿700 ตีกลับแล้วปฏิเสธถาวร (U118)
  clockAt('2026-10-05 16:00')
  const x12 = await hotelClaim('uat.agent.out1', '2026-10-05', 70000, 1, false)
  const approvals = await import('@/lib/compensation/approval-queries')
  await approvals.rejectCompensationExpense(await ctx('uat.mgr.out'), x12.expenseId, { reason: 'ใบเสร็จไม่ใช่ชื่อบริษัท' })
  await approvals.rejectExpensePermanently(await ctx('uat.mgr.out'), x12.expenseId, { reason: 'ไม่มีใบเสร็จที่ถูกต้อง ปฏิเสธถาวร' })
}

async function accountingOct(): Promise<void> {
  const adj = await import('@/lib/adjustments/queries')
  const acc = await import('@/lib/accounting/queries')
  const exp = await import('@/lib/exports/queries')
  const qs = await import('@/lib/accounting/question-queries')
  const revenueOf = async (key: string) =>
    (await rawDb().revenue.findFirstOrThrow({ where: { caseId: ids.cases[key] ?? '' }, orderBy: { trackingRound: 'asc' }, select: { id: true } })).id
  const adj1 = await adj.createAdjustment(await ctx(FIN), { targetType: 'revenue', targetId: await revenueOf('FT-17'), adjustmentType: 'decrease', amountSatang: 50000, reason: 'ลดค่าบริการ FT-17 ตามที่ตกลงกับลูกค้า (งวดล็อก)' })
  await adj.approveAdjustment(await ctx('uat.exec'), adj1.id, { note: 'อนุมัติปรับย้อนหลังงวดล็อก' })
  await adj.createAdjustment(await ctx(FIN), { targetType: 'revenue', targetId: await revenueOf('FT-11'), adjustmentType: 'decrease', amountSatang: 10000, reason: 'ส่วนลดค่าบริการ FT-11 รออนุมัติ' })
  const adj3 = await adj.createAdjustment(await ctx(FIN), { targetType: 'revenue', targetId: await revenueOf('FT-04'), adjustmentType: 'increase', amountSatang: 5000, reason: 'ขอเพิ่มค่าบริการ FT-04' })
  await adj.rejectAdjustment(await ctx(FIN), adj3.id, { rejectionReason: 'ไม่มีเอกสารประกอบ' })

  const sept = ids.periods['2026-09'] ?? ''
  const oct = await periodId(2569, 10)
  ids.periods['2026-10'] = oct
  await exp.createExportPack(await ctx(ACC), { periodId: sept, note: 'ก.ย. v2 หลังใบเพิ่มหนี้ DN-1' })
  await acc.createException(await ctx(ACC), {
    periodId: oct, level: 'warning', title: 'รอใบ 50 ทวิ ลูกค้า BL-2569-007', description: 'ลูกค้าหักภาษี 3% รอรับต้นฉบับ',
    sourceModule: 'customer_wht', sourceRef: 'BL-2569-007',
  })
  const octV1 = await exp.createExportPack(await ctx(ACC), { periodId: oct, note: 'ต.ค. v1 (ระหว่างงวด)' })
  await exp.markExportSent(await ctx(ACC), octV1.id, { note: 'ส่งสำนักงานบัญชีระหว่างงวด' })
  const q1 = await qs.createAccountantQuestion(await ctx(ACC), { periodId: sept, questionText: 'ใบเพิ่มหนี้ DN-1 ลงงวดไหน' })
  await qs.answerAccountantQuestion(await ctx(ACC), q1.id, { answerText: 'ลงงวด ต.ค. ตามวันที่ออกใบ' })
  await qs.createAccountantQuestion(await ctx(ACC), { periodId: oct, questionText: 'เงินรับรอตรวจสอบ 123.45 บาท บันทึกบัญชีอย่างไร' })
}

async function oct6(): Promise<void> {
  step('06/10/2569 (วันนี้) job: ทดรองเกินกำหนด ADV-5 · ภ.ง.ด. ต.ค. · X-07 ขอย้ายรอความยินยอม')
  clockAt('2026-10-06 08:00')
  const { runAdvanceOverdueJob } = await import('@/lib/advances/overdue-job')
  await runAdvanceOverdueJob({ organizationId: ORG_ID, now: new Date() })
  await runAdvanceOverdueJob({ organizationId: ORG_ID, now: new Date() })
  const { runWhtSummaryJob } = await import('@/lib/wht/summary-job')
  await runWhtSummaryJob({ organizationId: ORG_ID, now: new Date() })
  clockAt('2026-10-06 09:00')
  await approvedCase({ key: 'X-07', company: 'CO3', side: 'outsource', debtSatang: 500000 })
  await assign('X-07', 'uat.agent.out1')
  await acceptAndSchedule('X-07', 'uat.agent.out1', '2026-10-08')
  await reassign('X-07', 'uat.agent.out2', 'uat.mgr.out', 'ขอย้ายให้ out2 ใกล้พื้นที่กว่า')
}

export async function october(): Promise<void> {
  await closeSeptember()
  await octoberSettings()
  await octoberCases()
  await fieldOct1()
  await fieldOct2()
  await fieldOct3()
  await approvalsAndPayoutsOct4()
  await oct5()
  await oct6()
}
