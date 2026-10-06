import { ORG_ID, as, ctx, rawDb, userId } from './context'
import { stored, storedAll } from './files'
import { clockAt } from './runtime'
import { d, ids } from './state'

/**
 * ขั้นตอนธุรกิจที่ใช้ซ้ำ — ทุกขั้นเรียก service ตัวเดียวกับที่ route เรียก (actor = persona ตาม role จริงของ flow)
 * เวลาจำลองตั้งโดยผู้เรียกผ่าน clockAt() ก่อนเรียกแต่ละขั้น
 */

export type Agent = 'uat.agent.in1' | 'uat.agent.in2' | 'uat.agent.out1' | 'uat.agent.out2'
export type CompanyKey = 'CO1' | 'CO2' | 'CO3' | 'CO4'

export const SIDE_OF: Record<Agent, 'inhouse' | 'outsource'> = {
  'uat.agent.in1': 'inhouse',
  'uat.agent.in2': 'inhouse',
  'uat.agent.out1': 'outsource',
  'uat.agent.out2': 'outsource',
}

export function managerOf(agent: Agent): string {
  return SIDE_OF[agent] === 'inhouse' ? 'uat.mgr.in' : 'uat.mgr.out'
}

export function supervisorOf(agent: Agent): string {
  return SIDE_OF[agent] === 'inhouse' ? 'uat.sup.in' : 'uat.sup.out'
}

const PROVINCE = { inhouse: 'กรุงเทพมหานคร', outsource: 'ปทุมธานี' } as const
const DISTRICT = { inhouse: 'บางรัก', outsource: 'เมืองปทุมธานี' } as const

let imeiCounter = 0

/**
 * TAC ของ fixture `lib/device-catalog/fixtures/tac-sample.csv` (มติ PO U166) — IMEI ทุกเคสขึ้นต้นด้วย TAC ที่ฐานรู้จัก
 * (ไม่ให้ระบบจำรุ่นมั่ว) ยกเว้น {@link TAC_UNKNOWN} ที่ตั้งใจให้ "ไม่พบ → ระบบจำ" 1 เคส
 */
export const TAC_A55 = '35984745' // Samsung Galaxy A55 5G
export const TAC_IPHONE15 = '35089945' // Apple iPhone 15
const TAC_TYPED = '35087403' // Apple iPhone XR — เคส "ระบุเอง" (ข้อความไม่ตรงก็ไม่ทับฐาน)
export const TAC_UNKNOWN = '86999001'

/** IMEI 15 หลัก = TAC 8 หลัก + เลขลำดับ 7 หลัก (ไม่ซ้ำกันทั้งชุด) */
function imeiFor(tac: string): string {
  imeiCounter += 1
  return `${tac}${String(imeiCounter).padStart(7, '0')}`
}

/** ความจุ/สีตามสัญญา (มติ PO U166) — หมุนให้ครบทั้งค่ามาตรฐาน · "ระบุเอง" · "ไม่ระบุในสัญญา" */
const CAPACITIES = ['128GB', '256GB', 'ไม่ระบุในสัญญา', '512GB'] as const
const COLORS = ['ดำ', 'ขาว', 'ไม่ระบุในสัญญา', 'ม่วงลาเวนเดอร์', 'น้ำเงิน'] as const

export interface CaseSpec {
  key: string
  company: CompanyKey
  side: 'inhouse' | 'outsource'
  debtSatang: number
}

/**
 * Model Phone (U155 · U166) — เคส FT เลขหาร 3 ลงตัว = Samsung Galaxy A55 5G · เหลือเศษ 1 = Apple iPhone 15
 * (IMEI ขึ้นต้นด้วย TAC ของรุ่นนั้น — ฟอร์มเติมรุ่นจาก IMEI) · FT-02 = TAC ที่ฐานไม่รู้จัก แล้วเลือก Galaxy S24 จากรายการ
 * ⇒ ระบบจำ (learned) · ที่เหลือ / แถว X = "ไม่พบในรายการ — ระบุเอง" (ข้อความอิสระ)
 */
function deviceOf(key: string): { deviceModelId: string | null; assetBrandModel: string; tac: string } {
  const n = key.startsWith('FT-') ? Number(key.slice(3)) : -1
  if (n === 2) return { deviceModelId: ids.deviceModels['Samsung Galaxy S24'] ?? null, assetBrandModel: 'Samsung Galaxy S24', tac: TAC_UNKNOWN }
  if (n >= 0 && n % 3 === 0) {
    return { deviceModelId: ids.deviceModels['Samsung Galaxy A55 5G'] ?? null, assetBrandModel: 'Samsung Galaxy A55 5G', tac: TAC_A55 }
  }
  if (n >= 0 && n % 3 === 1) return { deviceModelId: ids.deviceModels['Apple iPhone 15'] ?? null, assetBrandModel: 'Apple iPhone 15', tac: TAC_IPHONE15 }
  return { deviceModelId: null, assetBrandModel: 'iPhone 15 สีดำ', tac: TAC_TYPED }
}

/** ธุรการรับเคส (createCase + เอกสาร 3 ช่อง) — ค้างที่ `draft` */
export async function createDraftCase(spec: CaseSpec, imei?: string): Promise<string> {
  const cases = await import('@/lib/cases/queries')
  const admin = await as('uat.admin')
  const address = { detail: `${spec.key} ม.1`, province: PROVINCE[spec.side], district: DISTRICT[spec.side] }
  const { tac, ...device } = deviceOf(spec.key)
  const created = await cases.createCase(
    {
      caseRef: `FINAL-${spec.key}`,
      financeCompanyId: ids.companies[spec.company] ?? '',
      sourceChannel: 'manual',
      debtorName: `ลูกหนี้ ${spec.key}`,
      debtorNationality: 'TH',
      debtorNationalId: '1100700000011',
      debtorPhoneMobile: '0812345678',
      addressCurrent: address,
      addressIdCard: address,
      assetType: 'smartphone',
      ...device,
      assetImeiSerial: imei ?? imeiFor(tac),
      assetCapacity: CAPACITIES[imeiCounter % CAPACITIES.length],
      assetColor: COLORS[imeiCounter % COLORS.length],
      outstandingDebtSatang: spec.debtSatang,
    },
    { actor: admin, meta: (await ctx('uat.admin')).meta },
  )
  ids.cases[spec.key] = created.id
  for (const slot of ['contract_doc', 'national_id_doc', 'product_photo'] as const) {
    const fileUrl = await stored(`cases/${created.id}/${slot}/${slot}.${slot === 'product_photo' ? 'jpg' : 'pdf'}`)
    await cases.addCaseDocument(
      admin,
      created.id,
      { documentType: slot, fileUrl, originalName: `${slot}.pdf`, mimeType: 'application/pdf', sizeBytes: 1024 },
      await ctx('uat.admin'),
    )
  }
  return created.id
}

export async function caseAction(actor: string, caseKey: string, input: Record<string, unknown> & { action: string }): Promise<void> {
  const status = await import('@/lib/cases/status-queries')
  const user = await as(actor)
  await status.changeCaseStatus(user, ids.cases[caseKey] ?? '', input as Parameters<typeof status.changeCaseStatus>[2], await ctx(actor))
}

/** draft → pending_review (ธุรการ) → approved (เจ้าหน้าที่อนุมัติเคส — snapshot ค่าบริการ) */
export async function approvedCase(spec: CaseSpec): Promise<string> {
  const id = await createDraftCase(spec)
  await caseAction('uat.admin', spec.key, { action: 'review' })
  await caseAction('uat.approver', spec.key, { action: 'accept', teamId: ids.teams[spec.side === 'inhouse' ? 'TEAM_A' : 'TEAM_C'] })
  return id
}

export async function assign(caseKey: string, agent: Agent, by?: string): Promise<void> {
  const assignments = await import('@/lib/assignments/queries')
  const actor = by ?? supervisorOf(agent)
  await assignments.assignCase(await as(actor), ids.cases[caseKey] ?? '', { agentId: await userId(agent) }, await ctx(actor))
}

export async function acceptAndSchedule(caseKey: string, agent: Agent, date: string): Promise<void> {
  const field = await import('@/lib/field/queries')
  const user = await as(agent)
  await field.acceptFieldCase(user, ids.cases[caseKey] ?? '', await ctx(agent))
  await field.scheduleFieldCase(user, ids.cases[caseKey] ?? '', { scheduleDate: d(date) }, await ctx(agent))
}

export async function acceptOnly(caseKey: string, agent: Agent): Promise<void> {
  const field = await import('@/lib/field/queries')
  await field.acceptFieldCase(await as(agent), ids.cases[caseKey] ?? '', await ctx(agent))
}

export async function checkin(caseKey: string, agent: Agent): Promise<void> {
  const field = await import('@/lib/field/queries')
  await field.recordCheckin(await as(agent), ids.cases[caseKey] ?? '', { latitude: 13.73, longitude: 100.52, checkinType: 'address' }, await ctx(agent))
}

let evidenceRound = 0

async function evidence(caseId: string, success: boolean) {
  evidenceRound += 1
  const tag = `r${evidenceRound}`
  return {
    photos: await storedAll([`cases/${caseId}/field_evidence/photo/${tag}.jpg`]),
    videos: await storedAll([`cases/${caseId}/field_evidence/video/${tag}.mp4`]),
    productPhotos: success ? await storedAll([`cases/${caseId}/field_evidence/product_photo/${tag}.jpg`]) : [],
  }
}

export async function closeCase(caseKey: string, agent: Agent, outcome: 'closed_success' | 'closed_fail'): Promise<void> {
  const field = await import('@/lib/field/queries')
  const caseId = ids.cases[caseKey] ?? ''
  const media = await evidence(caseId, outcome === 'closed_success')
  await field.closeFieldCase(
    await as(agent),
    caseId,
    outcome === 'closed_success'
      ? { outcome, ...media }
      : { outcome, ...media, failReason: 'debtor_not_found', failReasonDetail: null },
    await ctx(agent),
  )
}

/** เจ้าหน้าที่อนุมัติเคสตีกลับหลักฐาน → assignment `needs_revision` */
export async function rejectEvidence(caseKey: string, reason = 'ภาพหลักฐานไม่ชัด ถ่ายใหม่'): Promise<void> {
  const field = await import('@/lib/field/queries')
  await field.rejectFieldEvidence(await as('uat.approver'), ids.cases[caseKey] ?? '', { reason }, await ctx('uat.approver'))
}

export async function resubmitClose(caseKey: string, agent: Agent, success: boolean): Promise<void> {
  const field = await import('@/lib/field/queries')
  const caseId = ids.cases[caseKey] ?? ''
  const media = await evidence(caseId, success)
  await field.resubmitCloseCase(await as(agent), caseId, { ...media, note: 'ส่งหลักฐานใหม่' }, await ctx(agent))
}

/** job รายวัน (Q21) — สั่งหลังจบวันด้วยเวลาจำลอง */
export async function settleDay(date: string): Promise<void> {
  const { runDailyFieldAllowanceJob } = await import('@/lib/field/daily-allowance-job')
  const next = new Date(`${date}T00:00:00+07:00`)
  next.setUTCDate(next.getUTCDate() + 1)
  await runDailyFieldAllowanceJob({ organizationId: ORG_ID, date, now: new Date(next.getTime() + 2 * 3600_000) })
}

export async function assetOf(caseKey: string) {
  return rawDb().asset.findFirstOrThrow({ where: { caseId: ids.cases[caseKey] ?? '' }, orderBy: { createdAt: 'desc' } })
}

export async function intake(caseKey: string): Promise<string> {
  const warehouse = await import('@/lib/warehouse/queries')
  const asset = await assetOf(caseKey)
  await warehouse.intakeAsset(
    await as('uat.admin'),
    asset.id,
    {
      imeiActual: asset.imeiContract,
      serialActual: null,
      condition: 'normal',
      conditionNote: null,
      photos: await storedAll([`assets/${asset.id}/intake/front.jpg`]),
      colorCapacityMatched: true,
    },
    await ctx('uat.admin'),
  )
  return asset.id
}

export async function rejectIntake(caseKey: string): Promise<void> {
  const warehouse = await import('@/lib/warehouse/queries')
  const asset = await assetOf(caseKey)
  await warehouse.rejectAssetIntake(
    await as('uat.admin'),
    asset.id,
    { rejectReason: 'IMEI ที่ได้รับไม่ตรงสัญญา', imeiActual: '356900000000999', serialActual: null },
    await ctx('uat.admin'),
  )
}

export async function createLot(company: CompanyKey, assetIds: string[], type: 'finance_pickup' | 'we_deliver'): Promise<string> {
  const warehouse = await import('@/lib/warehouse/queries')
  const lot = await warehouse.createLot(
    await as('uat.admin'),
    {
      companyId: ids.companies[company] ?? '',
      assetIds,
      type,
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      contactPerson: 'ฝ่ายติดตามทรัพย์ของไฟแนนซ์',
      deliveryAddr: type === 'we_deliver' ? '99 ถ.พหลโยธิน กรุงเทพมหานคร 10900' : null,
      trackingNo: null,
      note: null,
    },
    await ctx('uat.admin'),
  )
  return lot.id
}

export async function confirmLot(lotId: string, type: 'finance_pickup' | 'we_deliver'): Promise<void> {
  const warehouse = await import('@/lib/warehouse/queries')
  const { lotDocumentPrefix } = await import('@/lib/warehouse/lot-documents')
  const signed = await stored(`${lotDocumentPrefix(lotId, 'signed_doc')}signed.pdf`)
  const proof = type === 'we_deliver' ? await stored(`${lotDocumentPrefix(lotId, 'delivery_proof')}proof.pdf`) : null
  await warehouse.confirmLot(await as('uat.admin'), lotId, { deliveredAt: null, signedDocUrl: signed, deliveryProofUrl: proof }, await ctx('uat.admin'))
}

/** รับเข้าคลัง + ล็อตรับเอง + ยืนยันส่งมอบ (เคสสำเร็จของบริษัทเดียว) */
export async function handover(company: CompanyKey, caseKeys: string[]): Promise<void> {
  const assetIds: string[] = []
  for (const key of caseKeys) assetIds.push(await intake(key))
  const lotId = await createLot(company, assetIds, 'finance_pickup')
  await confirmLot(lotId, 'finance_pickup')
}

// ─── รายการเบิก ─────────────────────────────────────────────────────────────

export async function expensesOfCase(caseKey: string) {
  return rawDb().expense.findMany({
    where: { caseId: ids.cases[caseKey] ?? '', status: { in: ['pending_approval', 'pending_finance_approval'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, payeeId: true, grossSatang: true, status: true, approvalStepCurrent: true },
  })
}

/** อนุมัติครบสาย: ผู้จัดการทีม → การเงิน → (บริหาร ถ้ารายการเกินเพดานแถว 1) · `upToStep` = หยุดค้างไว้ก่อนขั้นนั้น */
export async function approveExpense(expenseId: string, manager: string, upToStep = 99): Promise<void> {
  const approvals = await import('@/lib/compensation/approval-queries')
  const steps: Array<[string, number]> = [[manager, 1], ['uat.finance', 2], ['uat.exec', 3]]
  for (const [actor, step] of steps) {
    if (step >= upToStep) return
    const row = await rawDb().expense.findUniqueOrThrow({ where: { id: expenseId }, select: { status: true } })
    if (row.status === 'approved') return
    await approvals.approveCompensationExpense(await ctx(actor), expenseId, { step })
  }
}

export async function approveCase(caseKey: string, agent: Agent): Promise<void> {
  for (const row of await expensesOfCase(caseKey)) await approveExpense(row.id, managerOf(agent))
}

export async function hotelClaim(
  agent: Agent,
  date: string,
  amountSatang: number,
  nights: number,
  crt: boolean,
): Promise<{ expenseId: string; crtId: string | null }> {
  const fieldExpenses = await import('@/lib/field/expense-queries')
  const user = await as(agent)
  const result = await fieldExpenses.submitHotelClaim(
    user,
    {
      expenseDate: d(date),
      amountSatang,
      hotelNights: nights,
      receiptInCompanyName: false,
      ...(crt
        ? { substituteReceipt: { lines: [{ lineDate: d(date), description: 'ค่าที่พักระหว่างลงพื้นที่', amountSatang, note: null }] } }
        : { receiptFileUrl: await stored(`expenses/${user.id}/receipts/hotel-${date}-${amountSatang}.pdf`) }),
      note: null,
    },
    await ctx(agent),
  )
  const expenseId = (result as { id?: string; expense?: { id: string } }).expense?.id ?? (result as { id: string }).id
  const crtRow = crt ? await rawDb().substituteReceipt.findFirst({ where: { expenseId }, orderBy: { createdAt: 'desc' }, select: { id: true } }) : null
  return { expenseId, crtId: crtRow?.id ?? null }
}

export async function signCrt(agent: Agent, crtId: string): Promise<void> {
  const q = await import('@/lib/substitute-receipts/queries')
  const { substituteReceiptFilePrefix } = await import('@/lib/substitute-receipts/file')
  await q.attachSignedSubstituteReceipt(await ctx(agent), crtId, { signedFilePath: await stored(`${substituteReceiptFilePrefix(crtId)}signed.pdf`) })
}

export async function manualClaim(agent: Agent, type: 'receipt' | 'manual', date: string, amountSatang: number): Promise<string> {
  const claims = await import('@/lib/claims/queries')
  const user = await as(agent)
  const created = await claims.createManualClaim(await ctx(agent), {
    claimType: type,
    grossSatang: amountSatang,
    expenseDate: d(date),
    payeeId: null,
    receiptFileUrl: await stored(`expenses/${user.id}/receipts/${type}-${date}-${amountSatang}.pdf`),
    note: type === 'manual' ? 'ค่าใช้จ่ายพิเศษตามจริง' : 'ใบเสร็จค่าใช้จ่าย',
  })
  return (created as { id?: string; expense?: { id: string } }).expense?.id ?? (created as { id: string }).id
}

export { clockAt }
