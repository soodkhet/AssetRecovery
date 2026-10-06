import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORG_ID, as, rawDb } from './context'

/**
 * `--verify` — อ่านค่าจากฐานเทียบ golden (ส่วน H) + state coverage (ส่วน E) + คิว role (ส่วน G)
 * golden อยู่ใน `golden.json` (คัดจากเอกสาร ไม่คำนวณจากโค้ด lib) — ค่าไม่ตรง = รายงานความต่าง ห้ามแก้ golden ให้ตรงโค้ด
 */

interface Row {
  section: string
  item: string
  expected: string
  actual: string
  ok: boolean
}

const rows: Row[] = []

function check(section: string, item: string, expected: unknown, actual: unknown): void {
  const e = JSON.stringify(expected)
  const a = JSON.stringify(actual)
  rows.push({ section, item, expected: e, actual: a, ok: e === a })
}

function atLeast(section: string, item: string, min: number, actual: number): void {
  rows.push({ section, item, expected: `≥${min}`, actual: String(actual), ok: actual >= min })
}

interface Golden {
  revenues: Record<string, Array<{ round: number; beforeVat: number; vat: number; total: number; period: string }> | string[]>
  revenueTotals: Record<string, { beforeVat: number; vat: number; total: number }>
  payeeBatches: Record<string, { batch: string; payee: string; wht: number; gross: number; net: number }>
  advances: Record<string, { status: string; approved?: number; used?: number; returned?: number }>
  payoutBatches: Record<string, { status: string; gross?: number; wht?: number; net?: number; offset?: number; transfer?: number }>
  billing: Record<string, { company: string; status: string; total: number; received?: number; customerWht?: number; bankFee?: number }>
  arTotalEndOct: number
  bankFeeByMonth: Record<string, number>
  arByCompany: Record<string, number | string>
  taxInvoices: Record<string, { status: string; beforeVat?: number; vat?: number }>
  dailySplit: Record<string, { fuel?: number; allowance?: number } | string>
}

function loadGolden(): Golden {
  return JSON.parse(readFileSync(join(__dirname, 'golden.json'), 'utf8')) as Golden
}

const ORG = { organizationId: ORG_ID }

async function verifyMoney(golden: Golden): Promise<void> {
  const db = rawDb()
  const revenues = await db.revenue.findMany({
    where: { ...ORG, deletedAt: null },
    select: { trackingRound: true, grossSatang: true, vatSatang: true, totalSatang: true, revenueDate: true, case: { select: { caseRef: true } } },
  })
  const byCase = (key: string) => revenues.filter((row) => row.case.caseRef === `FINAL-${key}`)
  for (const [key, expected] of Object.entries(golden.revenues)) {
    if (key === '_none') {
      for (const none of expected as string[]) check('H.1 รายได้', `${none} ไม่มีรายได้`, 0, byCase(none).length)
      continue
    }
    for (const exp of expected as Array<{ round: number; beforeVat: number; vat: number; total: number }>) {
      const row = byCase(key).find((r) => r.trackingRound === exp.round)
      check('H.1 รายได้', `${key} r${exp.round} ก่อนVAT/VAT/รวม`, [exp.beforeVat, exp.vat, exp.total], row === undefined ? null : [row.grossSatang, row.vatSatang, row.totalSatang])
    }
  }
  for (const [period, exp] of Object.entries(golden.revenueTotals)) {
    const inPeriod = revenues.filter((row) => row.revenueDate.toISOString().slice(0, 7) === period)
    const sum = (pick: (r: (typeof inPeriod)[number]) => number) => inPeriod.reduce((acc, r) => acc + pick(r), 0)
    check('H.1 รวมรายได้', period, [exp.beforeVat, exp.vat, exp.total], [sum((r) => r.grossSatang), sum((r) => r.vatSatang), sum((r) => r.totalSatang)])
  }

  const batches = await db.payoutBatch.findMany({ where: ORG, select: { id: true, name: true, status: true, grossSatang: true, whtSatang: true, netSatang: true } })
  const items = await db.payoutBatchItem.findMany({
    where: { ...ORG, advanceId: null },
    select: { payoutBatchId: true, grossSatang: true, whtSatang: true, netSatang: true, advanceOffsetSatang: true, payee: { select: { user: { select: { username: true } } } } },
  })
  for (const [key, exp] of Object.entries(golden.payeeBatches)) {
    const batch = batches.find((b) => b.name === exp.batch)
    const mine = items.filter((i) => i.payoutBatchId === batch?.id && i.payee.user?.username === exp.payee)
    const sum = (pick: (r: (typeof mine)[number]) => number) => mine.reduce((acc, r) => acc + pick(r), 0)
    check('H.2 ผู้รับ×รอบ', `${key} ${exp.payee} @${exp.batch} WHT/gross/net`, [exp.wht, exp.gross, exp.net], [sum((r) => r.whtSatang), sum((r) => r.grossSatang), sum((r) => r.netSatang)])
  }
  for (const [key, exp] of Object.entries(golden.payoutBatches)) {
    const batch = batches.find((b) => b.name === key)
    if (batch === undefined) {
      check('H.4 รอบจ่าย', key, exp.status, null)
      continue
    }
    const offset = items.filter((i) => i.payoutBatchId === batch.id).reduce((acc, i) => acc + i.advanceOffsetSatang, 0)
    const actual: Record<string, unknown> = { status: batch.status }
    if (exp.gross !== undefined) Object.assign(actual, { gross: batch.grossSatang, wht: batch.whtSatang, net: batch.netSatang, offset, transfer: batch.netSatang - offset })
    check('H.4 รอบจ่าย', key, exp, actual)
  }

  const advances = await db.advance.findMany({ where: ORG, select: { advanceNumber: true, status: true, approvedSatang: true, usedSatang: true, returnSatang: true } })
  for (const [key, exp] of Object.entries(golden.advances)) {
    const row = advances.find((a) => a.advanceNumber === `ADV-2569-${key.slice(4).padStart(4, '0')}`)
    const actual: Record<string, unknown> = { status: row?.status ?? null }
    if (exp.approved !== undefined) actual['approved'] = row?.approvedSatang ?? null
    if (exp.used !== undefined) Object.assign(actual, { used: row?.usedSatang ?? null, returned: row?.returnSatang ?? null })
    const expected: Record<string, unknown> = { status: exp.status }
    if (exp.approved !== undefined) expected['approved'] = exp.approved
    if (exp.used !== undefined) Object.assign(expected, { used: exp.used, returned: exp.returned })
    check('H.3 ทดรอง', key, expected, actual)
  }

  const billings = await db.billingBatch.findMany({
    where: { ...ORG, deletedAt: null },
    select: { batchNumber: true, status: true, totalSatang: true, receivedSatang: true, bankFeeWrittenOffSatang: true, companyId: true },
    orderBy: { createdAt: 'asc' },
  })
  const cwht = await db.customerWhtCertificate.findMany({ where: ORG, select: { billingBatchId: true, withheldSatang: true } })
  const bb = await db.billingBatch.findMany({ where: ORG, select: { id: true, batchNumber: true, status: true } })
  for (const [key, exp] of Object.entries(golden.billing)) {
    const row = key === 'DRAFT-CO2' ? billings.find((b) => b.status === 'draft') : billings.find((b) => b.batchNumber === key)
    const id = bb.find((b) => b.batchNumber === row?.batchNumber)?.id
    const actual: Record<string, unknown> = { status: row?.status ?? null, total: row?.totalSatang ?? null }
    const expected: Record<string, unknown> = { status: exp.status, total: exp.total }
    if (exp.received !== undefined) {
      actual['received'] = row?.receivedSatang ?? null
      expected['received'] = exp.received
    }
    if (exp.bankFee !== undefined) {
      actual['bankFee'] = row?.bankFeeWrittenOffSatang ?? null
      expected['bankFee'] = exp.bankFee
    }
    if (exp.customerWht !== undefined) {
      actual['customerWht'] = cwht.find((c) => c.billingBatchId === id)?.withheldSatang ?? null
      expected['customerWht'] = exp.customerWht
    }
    check('H.5 วางบิล', key, expected, actual)
  }

  // U144/U163 — ค่าธรรมเนียมธนาคารที่ตัดส่วนต่าง รายเดือน (ตามวันที่ตัด)
  const fees = await db.billingBatch.findMany({ where: { ...ORG, deletedAt: null, bankFeeWrittenOffSatang: { gt: 0 } }, select: { bankFeeWrittenOffSatang: true, bankFeeWrittenOffDate: true } })
  for (const [month, expected] of Object.entries(golden.bankFeeByMonth)) {
    const actual = fees.filter((f) => f.bankFeeWrittenOffDate?.toISOString().slice(0, 7) === month).reduce((a, f) => a + f.bankFeeWrittenOffSatang, 0)
    check('H.5 ค่าธรรมเนียมธนาคาร', month, expected, actual)
  }

  const { getArAging } = await import('@/lib/revenue/queries')
  const aging = await getArAging(await as('uat.finance'), {})
  check('H.5 AR', 'AR รวมสิ้น ต.ค.', golden.arTotalEndOct, aging.totalOutstandingSatang)
  const companies = await db.financeCompany.findMany({ where: ORG, select: { id: true, name: true } })
  const companyNames: Record<string, string> = { CO1: 'บจก. ยูเอที ลิสซิ่ง', CO2: 'บจก. ยูเอที แคปปิตอล', CO3: 'บจก. ยูเอที ไฟแนนซ์', CO4: 'บจก. ยูเอที โมบาย' }
  for (const [key, expected] of Object.entries(golden.arByCompany)) {
    if (key.startsWith('_')) continue
    const companyId = companies.find((c) => c.name === companyNames[key])?.id
    check('H.5 AR', `AR ${key}`, expected, aging.companies.find((c) => c.companyId === companyId)?.outstandingSatang ?? 0)
  }

  const invoices = await db.taxInvoice.findMany({ where: ORG, select: { invoiceNumber: true, status: true, amountBeforeVatSatang: true, vatSatang: true } })
  for (const [key, exp] of Object.entries(golden.taxInvoices)) {
    const row = invoices.find((i) => i.invoiceNumber === key)
    const actual: Record<string, unknown> = { status: row?.status ?? null }
    if (exp.beforeVat !== undefined) Object.assign(actual, { beforeVat: row?.amountBeforeVatSatang ?? null, vat: row?.vatSatang ?? null })
    check('H.5 ใบกำกับ', key, exp, actual)
  }

  const expenses = await db.expense.findMany({
    where: { ...ORG, expenseType: { in: ['fuel', 'allowance'] }, status: { not: 'superseded' } },
    select: { expenseType: true, grossSatang: true, case: { select: { caseRef: true } }, expenseDate: true },
  })
  for (const [key, exp] of Object.entries(golden.dailySplit)) {
    if (key.startsWith('_') || typeof exp === 'string') continue
    const mine = expenses.filter((e) => e.case?.caseRef === `FINAL-${key}`)
    const actual: Record<string, number> = {}
    if (exp.fuel !== undefined) actual['fuel'] = mine.filter((e) => e.expenseType === 'fuel').reduce((a, e) => a + e.grossSatang, 0)
    if (exp.allowance !== undefined) actual['allowance'] = mine.filter((e) => e.expenseType === 'allowance').reduce((a, e) => a + e.grossSatang, 0)
    check('D.4 แบ่งรายวัน', key, exp, actual)
  }

  const filings = await db.whtFilingSummary.findMany({ where: ORG, select: { periodLabel: true, pnd3Satang: true, pnd53Satang: true, pnd1Satang: true, status: true } })
  const sept = filings.find((f) => f.periodLabel.startsWith('กันยายน'))
  const oct = filings.find((f) => f.periodLabel.startsWith('ตุลาคม'))
  check('H.6 ภ.ง.ด.', 'ก.ย. PND3/PND53/สถานะ', [4600, 10800, 'filed'], sept === undefined ? null : [sept.pnd3Satang, sept.pnd53Satang, sept.status])
  check('H.6 ภ.ง.ด.', 'ต.ค. PND3/PND1/สถานะ', [9897, 0, 'pending'], oct === undefined ? null : [oct.pnd3Satang, oct.pnd1Satang, oct.status])
}

/** ส่วน E — ทุก state ต้องมีอย่างน้อย 1 แถวที่จบที่ state นั้น */
async function verifyStates(): Promise<void> {
  const db = rawDb()
  const where = { organizationId: ORG_ID }
  const groups: Array<[string, () => Promise<Array<{ key: string; n: number }>>, string[]]> = [
    ['case', async () => (await db.case.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['draft', 'pending_review', 'need_info', 'approved', 'rejected', 'active', 'closed_success', 'closed_fail', 'pending_recycle_review']],
    ['expense', async () => (await db.expense.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['pending_warehouse_confirm', 'pending_approval', 'pending_finance_approval', 'approved', 'needs_revision', 'rejected', 'superseded']],
    ['advance', async () => (await db.advance.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['pending_approval', 'approved', 'overdue', 'cleared', 'rejected']],
    ['payout', async () => (await db.payoutBatch.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['checking', 'file_generated', 'completed', 'cancelled']],
    ['revenue', async () => (await db.revenue.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['ready_for_billing', 'billed']],
    ['billing', async () => (await db.billingBatch.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['draft', 'sent', 'partially_paid', 'paid']],
    ['adjustment', async () => (await db.adjustment.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['approved', 'pending_approval', 'rejected']],
    ['tax invoice', async () => (await db.taxInvoice.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['active', 'cancelled']],
    ['credit/debit note', async () => (await db.creditNote.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['active', 'cancelled']],
    ['WHT certificate', async () => (await db.whtCertificate.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['active', 'cancelled']],
    ['WHT filing', async () => (await db.whtFilingSummary.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['filed', 'pending']],
    ['exception', async () => (await db.exception.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['open', 'resolved', 'authorized']],
    ['period', async () => (await db.accountingPeriod.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['locked', 'collecting']],
    ['bank transaction', async () => (await db.bankTransaction.groupBy({ by: ['matchStatus'], where, _count: true })).map((r) => ({ key: r.matchStatus, n: r._count })),
      ['auto_matched', 'manual_matched', 'unmatched', 'unmatched_resolved', 'suspense', 'suspense_refunded']],
    ['customer WHT', async () => (await db.customerWhtCertificate.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['pending', 'received']],
    ['export', async () => (await db.exportRecord.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['accepted', 'generated', 'sent']],
    ['CRT', async () => (await db.substituteReceipt.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['pending_signature', 'signed', 'cancelled']],
    ['recycle', async () => (await db.recycleRequest.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['pending', 'approved', 'rejected']],
    ['assignment', async () => (await db.caseAssignment.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['pending_accept', 'accepted_unscheduled', 'scheduled', 'closed_success', 'closed_fail', 'needs_revision', 'reassigned_away']],
    ['pending reassignment', async () => (await db.pendingReassignment.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['waiting_consent', 'consented', 'declined', 'timeout_auto']],
    ['evidence', async () => (await db.caseEvidence.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['pending', 'approved', 'rejected']],
    ['asset', async () => (await db.asset.groupBy({ by: ['assetStatus'], where, _count: true })).map((r) => ({ key: r.assetStatus, n: r._count })),
      ['pending_intake', 'intake_rejected', 'in_custody', 'handover_pending', 'handed_over']],
    ['handover lot', async () => (await db.handoverLot.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['pending_attach', 'pending_delivery_proof', 'confirmed']],
    ['user', async () => (await db.user.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['active', 'suspended', 'deleted']],
    ['team', async () => (await db.team.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['active', 'inactive']],
    ['bank file test', async () => (await db.bankFileFormat.groupBy({ by: ['testStatus'], where, _count: true })).map((r) => ({ key: r.testStatus, n: r._count })),
      ['passed', 'failed', 'pending']],
    ['company', async () => (await db.financeCompany.groupBy({ by: ['status'], where, _count: true })).map((r) => ({ key: r.status, n: r._count })),
      ['active', 'suspended']],
  ]
  for (const [entity, load, states] of groups) {
    const counts = await load()
    for (const state of states) atLeast('E state', `${entity}: ${state}`, 1, counts.find((c) => c.key === state)?.n ?? 0)
  }
  const verified = await db.payeeProfile.count({ where: { ...where, isVerified: true } })
  const unverified = await db.payeeProfile.count({ where: { ...where, isVerified: false } })
  check('E state', 'payee verified / unverified', [3, 1], [verified, unverified])
  const snapshotMissing = Number(
    (
      await db.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM billing_batches WHERE organization_id = $1::uuid AND status <> 'draft' AND document_template_snapshot IS NULL`,
        ORG_ID,
      )
    )[0]?.n ?? 0,
  )
  check('E state', 'BL ที่ส่งแล้วมี document_template_snapshot ครบ', 0, snapshotMissing)
}

/** ส่วน G — คิวบนแดชบอร์ดของแต่ละ role (เฉพาะคิวที่มีบนแดชบอร์ด · คิวอื่นตรวจด้วยมือในด่าน 7) */
async function verifyQueues(): Promise<void> {
  const { getDashboardOverview } = await import('@/lib/dashboard/queries')
  const expected: Array<[string, string, number, string]> = [
    ['uat.approver', 'case_pending_review', 1, 'X-02'],
    ['uat.approver', 'case_recycle_review', 1, 'FT-01'],
    ['uat.finance', 'advance_pending_approval', 1, 'ADV-6'],
    ['uat.finance', 'payout_in_progress', 2, 'PB-O-IN2/OUT2'],
    ['uat.finance', 'compensation_my_step', 2, 'FT-10 r1'],
    ['uat.exec', 'compensation_my_step', 1, 'FT-14 manual'],
    ['uat.exec', 'adjustment_pending', 1, 'ADJ-2'],
    ['uat.mgr.in', 'compensation_my_step', 4, 'FT-01'],
    // U129/O72 — FT-14 (ตีกลับหลักฐาน · เครื่องยังไม่เข้าคลัง) นับในคิวรับเข้าด้วย
    ['uat.admin', 'asset_pending_intake', 2, 'FT-08 + FT-14'],
    ['uat.sup.in', 'case_awaiting_assignment', 1, 'X-06'],
    ['uat.sup.out', 'case_awaiting_assignment', 1, 'X-13'],
  ]
  for (const [persona, queue, count, note] of expected) {
    const overview = await getDashboardOverview(await as(persona))
    const item = overview.queues.find((q) => q.id === queue)
    check('G คิว', `${persona} ${queue} (${note})`, count, item === undefined ? 'ไม่แสดงคิว' : item.count)
  }
  // O72 — คิวรายการธนาคารยังไม่จับคู่ของการเงินถูกตัดออกจากแดชบอร์ด
  const finance = await getDashboardOverview(await as('uat.finance'))
  check('G คิว', 'uat.finance ไม่มีคิว bank_unmatched', 'ไม่แสดงคิว', finance.queues.some((q) => q.id === 'bank_unmatched') ? 'แสดงคิว' : 'ไม่แสดงคิว')
}

/** มติ U120–U162 ที่ seed ต้องครอบ (ข้อมูลตัวอย่างให้เห็นบนหน้าจอในด่าน 7) */
async function verifyDecisions(): Promise<void> {
  const db = rawDb()
  const where = { organizationId: ORG_ID }
  const org = await db.organization.findUniqueOrThrow({ where: { id: ORG_ID }, select: { authorizedSignerName: true, authorizedSignerTitle: true } })
  check('มติ', 'U151 ผู้ลงนามองค์กร ชื่อ+ตำแหน่ง', true, org.authorizedSignerName !== null && org.authorizedSignerTitle !== null)
  atLeast('มติ', 'U151 บริษัทไฟแนนซ์มีผู้ลงนาม', 3, await db.financeCompany.count({ where: { ...where, signerName: { not: null } } }))
  const templates = await db.taxDocumentTemplateSettings.findMany({ where, select: { documentType: true, footerNote: true, printSignature: true } })
  check('มติ', 'U122 ข้อความท้ายเอกสารครบ 3 ชนิด', 3, templates.filter((t) => (t.footerNote ?? '') !== '').length)
  atLeast('มติ', 'U122 เปิดพิมพ์ลายเซ็นรูป ≥ 1 ชนิด', 1, templates.filter((t) => t.printSignature).length)
  const docs = await db.financeCompanyDocument.groupBy({ by: ['companyId'], where, _count: true })
  const companies = await db.financeCompany.findMany({ where, select: { id: true, name: true } })
  const docCount = (name: string) => docs.find((d) => d.companyId === companies.find((c) => c.name === name)?.id)?._count ?? 0
  check('มติ', 'U132 เอกสารบริษัท CO1 ครบ 5 / CO3 2 (หนังสือรับรองเก่า) / CO2 ไม่มี', [5, 2, 0],
    [docCount('บจก. ยูเอที ลิสซิ่ง'), docCount('บจก. ยูเอที ไฟแนนซ์'), docCount('บจก. ยูเอที แคปปิตอล')])
  const cycles = await db.billingPayoutCycle.groupBy({ by: ['scopeKind'], where: { ...where, deletedAt: null }, _count: true })
  check('มติ', 'U133/U146 รอบบิลเลือกบริษัท 2 · รอบจ่ายทุกทีม 1', [2, 1],
    [cycles.find((c) => c.scopeKind === 'selected_companies')?._count ?? 0, cycles.find((c) => c.scopeKind === 'all_teams')?._count ?? 0])
  const withIdDoc = await db.payeeProfile.count({ where: { ...where, idDocumentHash: { not: null } } })
  check('มติ', 'U150 เอกสารยืนยันตัวตนผู้รับ (ไฟล์ตรวจแล้ว)', 2, withIdDoc)
  const unhashedReceipts = await db.expense.count({ where: { ...where, receiptFileUrl: { not: null }, receiptFileHash: null } })
  check('มติ', 'U143 ใบเสร็จทุกใบเป็นไฟล์ที่ตรวจแล้ว (มี SHA-256)', 0, unhashedReceipts)
  const sept = await db.whtFilingSummary.findFirst({ where: { ...where, periodLabel: { startsWith: 'กันยายน' } }, select: { supplementaryRequiredAt: true } })
  check('มติ', 'U127 ภ.ง.ด. ก.ย. ติดธงต้องยื่นเพิ่มเติม', true, sept?.supplementaryRequiredAt !== null && sept !== null)
  const x14 = await db.case.findFirst({ where: { ...where, caseRef: 'FINAL-X-14' }, select: { status: true, imei: true } })
  const x11Asset = await db.asset.findFirst({ where: { ...where, case: { caseRef: 'FINAL-X-11' } }, select: { imeiContract: true } })
  check('มติ', 'U129 X-14 IMEI ซ้ำเครื่องในคลัง (ค้าง draft)', ['draft', true], [x14?.status ?? null, x14 !== null && x14.imei === x11Asset?.imeiContract])
  const fromCatalog = await db.case.count({ where: { ...where, deviceModelId: { not: null } } })
  const typed = await db.case.count({ where: { ...where, deviceModelId: null } })
  atLeast('มติ', 'U155 เคสเลือกรุ่นจากแคตตาล็อก', 5, fromCatalog)
  atLeast('มติ', 'U155 เคสระบุรุ่นเอง', 5, typed)
  check('มติ', 'U157 รุ่นที่ซ่อน', 1, await db.deviceModel.count({ where: { ...where, manualStatus: 'hidden' } }))
  // มติ PO U166 — ฐาน TAC ตัวอย่าง (fixture 27 แถว) + ระบบจำ 1 TAC · เคสได้รุ่นจาก TAC · ความจุ/สีครบรวม "ไม่ระบุในสัญญา"
  check('มติ', 'U166 TAC จากฐานตัวอย่าง', 27, await db.deviceTac.count({ where: { ...where, source: 'tacdb' } }))
  check('มติ', 'U166 TAC ที่ระบบจำ (TAC ไม่พบ → เลือกรุ่นเอง)', 1, await db.deviceTac.count({ where: { ...where, source: 'learned' } }))
  const tacCases = await db.case.findMany({ where: { ...where, deviceModelId: { not: null } }, select: { imei: true, deviceModelId: true } })
  const tacRows = await db.deviceTac.findMany({ where: { ...where, source: 'tacdb' }, select: { tac: true, deviceModelId: true } })
  const tacModel = new Map(tacRows.map((row) => [row.tac, row.deviceModelId]))
  atLeast('มติ', 'U166 เคสได้รุ่นจาก TAC ของ IMEI', 5, tacCases.filter((row) => row.imei !== null && tacModel.get(row.imei.slice(0, 8)) === row.deviceModelId).length)
  check('มติ', 'U166 เคสไม่มีความจุ/สี', 0, await db.case.count({ where: { ...where, OR: [{ assetCapacity: null }, { assetColor: null }] } }))
  atLeast('มติ', 'U166 เคส "ไม่ระบุในสัญญา"', 1, await db.case.count({ where: { ...where, OR: [{ assetCapacity: 'ไม่ระบุในสัญญา' }, { assetColor: 'ไม่ระบุในสัญญา' }] } }))
  atLeast('มติ', 'U166 คลังติ๊ก สี/ความจุตรง', 1, await db.asset.count({ where: { ...where, colorCapacityMatched: true } }))
  atLeast('มติ', 'U167 ประวัติการอัปเดต TAC (นำเข้าไฟล์สำเร็จ)', 1, await db.deviceTacUpdate.count({ where: { ...where, status: 'success' } }))
  const lots = await db.handoverLot.groupBy({ by: ['companyId'], where: { ...where, status: 'confirmed' }, _count: true })
  atLeast('มติ', 'U142 บริษัทที่มีล็อตส่งมอบแล้ว ≥ 3 ล็อต', 2, lots.filter((l) => l._count >= 3).length)
}

export async function runVerify(): Promise<boolean> {
  const golden = loadGolden()
  await verifyMoney(golden)
  await verifyStates()
  await verifyQueues()
  await verifyDecisions()
  const failed = rows.filter((row) => !row.ok)
  let section = ''
  for (const row of rows) {
    if (row.section !== section) {
      section = row.section
      console.log(`\n── ${section}`)
    }
    console.log(`${row.ok ? '✅' : '❌'} ${row.item}${row.ok ? '' : `  คาด ${row.expected} · ได้ ${row.actual}`}`)
  }
  console.log(`\n[verify] ✅ ${rows.length - failed.length} · ❌ ${failed.length} (รวม ${rows.length})`)
  return failed.length === 0
}
