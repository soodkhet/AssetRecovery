import { ORG_ID, ctx } from './context'
import {
  acceptAndSchedule,
  approveCase,
  approveExpense,
  approvedCase,
  assign,
  checkin,
  closeCase,
  handover,
  hotelClaim,
  managerOf,
  manualClaim,
  rejectEvidence,
  resubmitClose,
  settleDay,
  signCrt,
} from './flows'
import { advanceApprove, advanceRequest, billing, sendBilling, issueInvoice, payout, receiveCustomerWht, statementLine } from './money'
import { clockAt } from './runtime'
import { ids } from './state'

/**
 * ส่วน D/E/G/I ของ FINAL-coverage — เดินตามเวลา ก.ย. → ต.ค. ด้วยนาฬิกาจำลอง (U124)
 * แต่ละขั้นตั้งเวลา (เวลาไทย) ก่อนเรียก service · job เรียก handler ตรงพร้อม `now` จำลอง
 */

function step(label: string): void {
  console.log(`[timeline] ${label}`)
}

export const SEPT_CASES = [
  { key: 'FT-15', company: 'CO1', side: 'outsource', debtSatang: 1234567 },
  { key: 'FT-16', company: 'CO2', side: 'outsource', debtSatang: 2490000 },
  { key: 'FT-17', company: 'CO3', side: 'inhouse', debtSatang: 1200000 },
  { key: 'FT-18', company: 'CO3', side: 'outsource', debtSatang: 2345678 },
  { key: 'FT-19', company: 'CO4', side: 'outsource', debtSatang: 1500000 },
  { key: 'FT-20', company: 'CO4', side: 'outsource', debtSatang: 1590000 },
] as const

async function september(): Promise<void> {
  step('01/09/2569 รับเคส ก.ย. + อนุมัติ + มอบหมาย')
  clockAt('2026-09-01 09:00')
  for (const spec of SEPT_CASES) await approvedCase(spec)
  clockAt('2026-09-01 10:00')
  await assign('FT-15', 'uat.agent.out2')
  await assign('FT-16', 'uat.agent.out1')
  await assign('FT-17', 'uat.agent.in2')
  await assign('FT-18', 'uat.agent.out2')
  await assign('FT-19', 'uat.agent.out1')
  await assign('FT-20', 'uat.agent.out1')
  clockAt('2026-09-01 11:00')
  await acceptAndSchedule('FT-15', 'uat.agent.out2', '2026-09-15')
  await acceptAndSchedule('FT-16', 'uat.agent.out1', '2026-09-12')
  await acceptAndSchedule('FT-17', 'uat.agent.in2', '2026-09-10')
  await acceptAndSchedule('FT-18', 'uat.agent.out2', '2026-09-16')
  await acceptAndSchedule('FT-19', 'uat.agent.out1', '2026-09-16')
  await acceptAndSchedule('FT-20', 'uat.agent.out1', '2026-09-12')

  step('02/09/2569 ขอเบิกทดรอง ADV-1…4')
  clockAt('2026-09-02 09:00')
  await advanceRequest('ADV-1', 'uat.agent.in1', 300000, '2026-09-30')
  await advanceRequest('ADV-2', 'uat.agent.out1', 200000, '2026-09-30')
  await advanceRequest('ADV-3', 'uat.agent.in2', 100000, '2026-09-30')
  await advanceRequest('ADV-4', 'uat.agent.out2', 150000, '2026-09-30')

  step('10/09/2569 in2 FT-17 ไม่สำเร็จ')
  clockAt('2026-09-10 10:00')
  await checkin('FT-17', 'uat.agent.in2')
  clockAt('2026-09-10 11:00')
  await closeCase('FT-17', 'uat.agent.in2', 'closed_fail')
  await settleDay('2026-09-10')

  step('12/09/2569 out1 FT-16 (ตีกลับ→ส่งใหม่) + FT-20')
  clockAt('2026-09-12 10:00')
  await checkin('FT-16', 'uat.agent.out1')
  clockAt('2026-09-12 11:00')
  await checkin('FT-20', 'uat.agent.out1')
  clockAt('2026-09-12 12:00')
  await closeCase('FT-16', 'uat.agent.out1', 'closed_success')
  clockAt('2026-09-12 13:00')
  await closeCase('FT-20', 'uat.agent.out1', 'closed_success')
  clockAt('2026-09-12 14:00')
  await rejectEvidence('FT-16')
  clockAt('2026-09-12 15:00')
  await resubmitClose('FT-16', 'uat.agent.out1', true)
  clockAt('2026-09-12 18:00')
  const hotelFt20 = await hotelClaim('uat.agent.out1', '2026-09-12', 120000, 1, false)
  await settleDay('2026-09-12')

  step('14/09/2569 ผู้จัดการขอย้าย FT-19 out1→out2 · หมดเวลา (job) → out2')
  clockAt('2026-09-14 09:00')
  {
    const assignments = await import('@/lib/assignments/queries')
    const { as } = await import('./context')
    const { userId } = await import('./context')
    await assignments.reassignCase(
      await as('uat.mgr.out'),
      ids.cases['FT-19'] ?? '',
      { agentId: await userId('uat.agent.out2'), reason: 'out1 งานล้น ย้ายให้ out2' },
      await ctx('uat.mgr.out'),
    )
    clockAt('2026-09-14 13:00')
    const { resolveExpiredReassignments } = await import('@/lib/assignments/timeout-job')
    await resolveExpiredReassignments({ now: new Date(), organizationId: ORG_ID })
    clockAt('2026-09-14 14:00')
    await acceptAndSchedule('FT-19', 'uat.agent.out2', '2026-09-16')
  }

  step('15/09/2569 out2 FT-15 สำเร็จ')
  clockAt('2026-09-15 10:00')
  await checkin('FT-15', 'uat.agent.out2')
  clockAt('2026-09-15 11:00')
  await closeCase('FT-15', 'uat.agent.out2', 'closed_success')
  clockAt('2026-09-15 18:00')
  const hotelFt15 = await hotelClaim('uat.agent.out2', '2026-09-15', 80000, 1, false)
  await settleDay('2026-09-15')

  step('16/09/2569 out2 FT-18 (ตีกลับ→ส่งใหม่) + FT-19')
  clockAt('2026-09-16 10:00')
  await checkin('FT-18', 'uat.agent.out2')
  clockAt('2026-09-16 11:00')
  await checkin('FT-19', 'uat.agent.out2')
  clockAt('2026-09-16 12:00')
  await closeCase('FT-18', 'uat.agent.out2', 'closed_success')
  clockAt('2026-09-16 13:00')
  await closeCase('FT-19', 'uat.agent.out2', 'closed_success')
  clockAt('2026-09-16 14:00')
  await rejectEvidence('FT-18')
  clockAt('2026-09-16 15:00')
  await resubmitClose('FT-18', 'uat.agent.out2', true)
  clockAt('2026-09-16 18:00')
  const hotelFt19 = await hotelClaim('uat.agent.out2', '2026-09-16', 50000, 1, true)
  if (hotelFt19.crtId !== null) await signCrt('uat.agent.out2', hotelFt19.crtId)
  const manualFt18 = await manualClaim('uat.agent.out2', 'manual', '2026-09-16', 600000)
  await settleDay('2026-09-16')

  step('17/09/2569 คลังรับเข้า + ล็อต LOT-001…004 + อนุมัติรายการ')
  clockAt('2026-09-17 09:00')
  await handover('CO1', ['FT-15'])
  await handover('CO2', ['FT-16'])
  await handover('CO3', ['FT-18'])
  await handover('CO4', ['FT-19', 'FT-20'])
  clockAt('2026-09-17 10:00')
  for (const key of ['FT-15', 'FT-16', 'FT-18', 'FT-19', 'FT-20'] as const) {
    await approveCase(key, key === 'FT-16' || key === 'FT-20' ? 'uat.agent.out1' : 'uat.agent.out2')
  }
  for (const id of [hotelFt20.expenseId, hotelFt15.expenseId, hotelFt19.expenseId, manualFt18]) {
    await approveExpense(id, managerOf('uat.agent.out1'))
  }

  step('18/09/2569 สร้างร่าง BL-001 CO1 · BL-002 CO2 · BL-003 CO3 (ก่อนรายได้ FT-17 เกิด)')
  // ระบบเลือกรายได้เข้ารอบตาม "วันตัด" อย่างเดียว (เลือกรายตัวไม่ได้) และ FT-17 (10/09) เก่ากว่า FT-18 (16/09)
  // ⇒ ต้องสร้างรอบ CO3 ของ FT-18 ก่อนรายได้ FT-17 เกิด · เลข BL ออกตามลำดับสร้าง จึงสร้าง CO1/CO2 ก่อนให้เลขตรง golden
  clockAt('2026-09-18 10:00')
  await billing('BL-001', 'CO1', '2026-09-18', false)
  await billing('BL-002', 'CO2', '2026-09-18', false)
  await billing('BL-003', 'CO3', '2026-09-18', false)

  step('19/09/2569 อนุมัติรายการ FT-17 → รายได้ FT-17')
  clockAt('2026-09-19 10:00')
  await approveCase('FT-17', 'uat.agent.in2')

  step('20/09/2569 รอบจ่าย PB-S-IN / PB-S-OUT → completed (50 ทวิ per_item)')
  clockAt('2026-09-20 10:00')
  await payout('PB-S-IN', 'inhouse', '2026-09-20', 'completed')
  await payout('PB-S-OUT', 'outsource', '2026-09-20', 'completed')

  step('21–22/09/2569 อนุมัติทดรอง ADV-1…4 + รอบจ่ายเงินทดรอง (U83 — ต้องจ่ายจริงก่อนเคลียร์)')
  clockAt('2026-09-21 10:00')
  for (const key of ['ADV-1', 'ADV-2', 'ADV-3', 'ADV-4']) await advanceApprove(key)
  clockAt('2026-09-22 10:00')
  await payout('PB-S-ADV-IN', 'inhouse', '2026-09-22', 'completed')
  await payout('PB-S-ADV-OUT', 'outsource', '2026-09-22', 'completed')

  step('25/09/2569 ส่ง BL-001…003 + วางบิล BL-004 CO3(FT-17) / BL-005 CO4')
  clockAt('2026-09-25 10:00')
  for (const key of ['BL-001', 'BL-002', 'BL-003']) await sendBilling(key)
  await billing('BL-004', 'CO3', '2026-09-25', true)
  await billing('BL-005', 'CO4', '2026-09-25', true)

  step('28–29/09/2569 รับเงิน BL-001/BL-003 (หักภาษีลูกค้า) + INV-0001/0002')
  clockAt('2026-09-28 15:00')
  await statementLine('2026-09-28', 'IN-BL001', 64197)
  await issueInvoice('BL-001')
  await receiveCustomerWht('BL-001', 'CO1-WHT-0928', '2026-09-28')
  clockAt('2026-09-29 15:00')
  await statementLine('2026-09-29', 'IN-BL003', 281185)
  await issueInvoice('BL-003')

  step('29/09/2569 อนุมัติเคส FT-11 (snapshot T3 v1 ก่อนแก้เป็น v2)')
  clockAt('2026-09-29 16:00')
  await approvedCase({ key: 'FT-11', company: 'CO3', side: 'outsource', debtSatang: 1111111 })
  await assign('FT-11', 'uat.agent.out1')
  await acceptAndSchedule('FT-11', 'uat.agent.out1', '2026-10-03')
}

export async function runTimeline(): Promise<void> {
  await september()
  const { october } = await import('./october')
  await october()
}
