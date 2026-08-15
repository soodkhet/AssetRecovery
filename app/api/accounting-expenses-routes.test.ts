import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SessionUser } from '@/lib/auth/types'

/**
 * เทสต์ระดับ route ของบัญชีค่าใช้จ่าย (ไฟล์ 32 §12/§14) + ข้อซักถาม (ไฟล์ 36 §11/§13)
 *
 * ตรวจสิ่งที่ pure module ตรวจแทนไม่ได้: capability ที่ผูกกับ endpoint (DEC-002 — **การเงินดูได้
 * แต่ map Cost Center ไม่ได้**), การกัน `EDIT_AMOUNT_DIRECTLY` ตั้งแต่ชั้น route (ก่อน Zod),
 * และการที่รายการค่าใช้จ่าย **ไม่มีเส้นทางสร้าง/ลบด้วยมือ** (`32` §6.1 — เกิดจาก payout เท่านั้น)
 */

const requireSessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/session', () => ({ requireSession: requireSessionMock }))

const expenseQueriesMock = vi.hoisted(() => ({
  listExpenseRecords: vi.fn(),
  mapExpenseCostCenter: vi.fn(),
  syncExpenseRecordsFromPayout: vi.fn(),
}))
vi.mock('@/lib/expenses/queries', () => expenseQueriesMock)

const questionQueriesMock = vi.hoisted(() => ({
  listAccountantQuestions: vi.fn(),
  createAccountantQuestion: vi.fn(),
  answerAccountantQuestion: vi.fn(),
}))
vi.mock('@/lib/accounting/question-queries', () => questionQueriesMock)

const expensesRoute = await import('@/app/api/accounting/expenses/route')
const { PATCH: mapCostCenter } = await import('@/app/api/accounting/expenses/[id]/cost-center/route')
const questionsRoute = await import('@/app/api/accounting/questions/route')
const { PATCH: answerQuestion } = await import('@/app/api/accounting/questions/[id]/answer/route')

const EXPENSE_ID = '00000000-0000-4000-8000-000000004401'
const COST_CENTER_ID = '00000000-0000-4000-8000-000000004402'
const QUESTION_ID = '00000000-0000-4000-8000-000000004403'

function sessionUser(capabilities: Record<string, 'view' | 'manage'>): SessionUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    supabaseUid: 'uid-1',
    email: 'accounting@example.com',
    fullName: 'บัญชี ทดสอบ',
    status: 'active',
    roleId: 'role-1',
    roleName: 'บัญชี',
    roleGroup: 'system',
    isSuperadmin: false,
    teamId: null,
    companyId: null,
    capabilities,
    scope: { kind: 'global', teamIds: [], companyId: null, userId: 'user-1' },
    loginAt: new Date().toISOString(),
  }
}

const ACCOUNTANT = sessionUser({
  manage_sales_expenses: 'manage',
  map_cost_center: 'manage',
  manage_accountant_questions: 'manage',
})
/** การเงิน = ดูค่าใช้จ่าย/ข้อซักถามได้ แต่ map Cost Center และตอบคำถามไม่ได้ (`25` §7.5) */
const FINANCE = sessionUser({ manage_sales_expenses: 'view', manage_accountant_questions: 'view' })
const FIELD_AGENT = sessionUser({ perform_field_work: 'manage' })

function request(url: string, init?: RequestInit): NextRequest {
  const base = new Request(url, init) as unknown as NextRequest
  return Object.assign(base, { nextUrl: new URL(url) }) as NextRequest
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function jsonRequest(url: string, method: 'POST' | 'PATCH', body: unknown): NextRequest {
  return request(url, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
}

interface Envelope {
  success: boolean
  error: { code: string } | null
}

async function codeOf(response: Response): Promise<string | undefined> {
  return ((await response.json()) as Envelope).error?.code
}

const EMPTY_LIST = {
  items: [],
  summary: { count: 0, grossSatang: 0, whtSatang: 0, netSatang: 0, incompleteCount: 0, unmappedCount: 0 },
  costCenters: [],
}

beforeEach(() => {
  requireSessionMock.mockReset()
  for (const fn of Object.values(expenseQueriesMock)) fn.mockReset()
  for (const fn of Object.values(questionQueriesMock)) fn.mockReset()
})

describe('สิทธิ์ของโมดูลบัญชีค่าใช้จ่าย (DEC-002 · `32` §12 · `36` §11)', () => {
  it('ไม่มี capability ของบัญชีเลย = 403 ทุก endpoint', async () => {
    requireSessionMock.mockResolvedValue(FIELD_AGENT)

    const responses = await Promise.all([
      expensesRoute.GET(request('http://localhost/api/accounting/expenses'), undefined),
      questionsRoute.GET(request('http://localhost/api/accounting/questions'), undefined),
      mapCostCenter(
        jsonRequest(`http://localhost/api/accounting/expenses/${EXPENSE_ID}/cost-center`, 'PATCH', {
          costCenterId: COST_CENTER_ID,
          reason: 'ทดสอบ',
        }),
        params(EXPENSE_ID),
      ),
    ])

    for (const response of responses) expect(response.status).toBe(403)
    expect(expenseQueriesMock.listExpenseRecords).not.toHaveBeenCalled()
    expect(expenseQueriesMock.mapExpenseCostCenter).not.toHaveBeenCalled()
  })

  it('การเงินดูค่าใช้จ่ายได้ (view) แต่ map Cost Center / ตอบคำถามไม่ได้ (403)', async () => {
    requireSessionMock.mockResolvedValue(FINANCE)
    expenseQueriesMock.listExpenseRecords.mockResolvedValue(EMPTY_LIST)

    const readable = await expensesRoute.GET(request('http://localhost/api/accounting/expenses'), undefined)
    expect(readable.status).toBe(200)

    const mapped = await mapCostCenter(
      jsonRequest(`http://localhost/api/accounting/expenses/${EXPENSE_ID}/cost-center`, 'PATCH', {
        costCenterId: COST_CENTER_ID,
        reason: 'ทดสอบ',
      }),
      params(EXPENSE_ID),
    )
    expect(mapped.status).toBe(403)

    const answered = await answerQuestion(
      jsonRequest(`http://localhost/api/accounting/questions/${QUESTION_ID}/answer`, 'PATCH', {
        answerText: 'ตอบ',
      }),
      params(QUESTION_ID),
    )
    expect(answered.status).toBe(403)
    expect(expenseQueriesMock.mapExpenseCostCenter).not.toHaveBeenCalled()
    expect(questionQueriesMock.answerAccountantQuestion).not.toHaveBeenCalled()
  })
})

describe('map Cost Center (`32` §14)', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(ACCOUNTANT))

  it('body ที่แนบยอดเงินมาด้วย ⇒ EDIT_AMOUNT_DIRECTLY (ไม่ใช่ field error) และไม่แตะ DB', async () => {
    const response = await mapCostCenter(
      jsonRequest(`http://localhost/api/accounting/expenses/${EXPENSE_ID}/cost-center`, 'PATCH', {
        costCenterId: COST_CENTER_ID,
        reason: 'แก้ยอดหน่อย',
        netSatang: 1_000_00,
      }),
      params(EXPENSE_ID),
    )

    expect(response.status).toBe(400)
    expect(await codeOf(response)).toBe('EDIT_AMOUNT_DIRECTLY')
    expect(expenseQueriesMock.mapExpenseCostCenter).not.toHaveBeenCalled()
  })

  it('ไม่ระบุเหตุผล ⇒ 400 REQUIRED_MISSING (reason บังคับตามนโยบาย audit)', async () => {
    const response = await mapCostCenter(
      jsonRequest(`http://localhost/api/accounting/expenses/${EXPENSE_ID}/cost-center`, 'PATCH', {
        costCenterId: COST_CENTER_ID,
        reason: '   ',
      }),
      params(EXPENSE_ID),
    )

    expect(response.status).toBe(400)
    expect(await codeOf(response)).toBe('REQUIRED_MISSING')
    expect(expenseQueriesMock.mapExpenseCostCenter).not.toHaveBeenCalled()
  })

  it('body ถูกต้อง ⇒ ส่งต่อให้ service พร้อม id ของรายการ', async () => {
    expenseQueriesMock.mapExpenseCostCenter.mockResolvedValue({ id: EXPENSE_ID, costCenterId: COST_CENTER_ID })

    const response = await mapCostCenter(
      jsonRequest(`http://localhost/api/accounting/expenses/${EXPENSE_ID}/cost-center`, 'PATCH', {
        costCenterId: COST_CENTER_ID,
        reason: 'ค่าคอมมิชชั่นทีมกลาง',
      }),
      params(EXPENSE_ID),
    )

    expect(response.status).toBe(200)
    expect(expenseQueriesMock.mapExpenseCostCenter).toHaveBeenCalledWith(
      expect.objectContaining({ actor: ACCOUNTANT }),
      EXPENSE_ID,
      { costCenterId: COST_CENTER_ID, reason: 'ค่าคอมมิชชั่นทีมกลาง' },
    )
  })
})

describe('ทางเข้าที่ห้ามมี (`32` §6.1)', () => {
  it('รายการค่าใช้จ่ายมีแต่ GET — สร้าง/ลบด้วยมือไม่ได้ (เกิดจากรอบจ่ายที่ completed เท่านั้น)', () => {
    expect(Object.keys(expensesRoute).sort()).toEqual(['GET'])
  })
})

describe('ข้อซักถามจากสำนักงานบัญชี (`36` §13)', () => {
  beforeEach(() => requireSessionMock.mockResolvedValue(ACCOUNTANT))

  it('สร้างคำถามสำเร็จ ⇒ 201', async () => {
    questionQueriesMock.createAccountantQuestion.mockResolvedValue({ id: QUESTION_ID, isResolved: false })

    const response = await questionsRoute.POST(
      jsonRequest('http://localhost/api/accounting/questions', 'POST', { questionText: 'ขอรายละเอียดเงินเข้า' }),
      undefined,
    )

    expect(response.status).toBe(201)
    expect(questionQueriesMock.createAccountantQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ actor: ACCOUNTANT }),
      { questionText: 'ขอรายละเอียดเงินเข้า' },
    )
  })

  it('คำถาม/คำตอบว่าง ⇒ 400 REQUIRED_MISSING', async () => {
    const created = await questionsRoute.POST(
      jsonRequest('http://localhost/api/accounting/questions', 'POST', { questionText: '  ' }),
      undefined,
    )
    expect(await codeOf(created)).toBe('REQUIRED_MISSING')

    const answered = await answerQuestion(
      jsonRequest(`http://localhost/api/accounting/questions/${QUESTION_ID}/answer`, 'PATCH', { answerText: '' }),
      params(QUESTION_ID),
    )
    expect(await codeOf(answered)).toBe('REQUIRED_MISSING')
    expect(questionQueriesMock.createAccountantQuestion).not.toHaveBeenCalled()
    expect(questionQueriesMock.answerAccountantQuestion).not.toHaveBeenCalled()
  })

  it('ตอบคำถามส่งต่อให้ service พร้อม id', async () => {
    questionQueriesMock.answerAccountantQuestion.mockResolvedValue({ id: QUESTION_ID, isResolved: true })

    const response = await answerQuestion(
      jsonRequest(`http://localhost/api/accounting/questions/${QUESTION_ID}/answer`, 'PATCH', {
        answerText: 'เป็นเงินรับจากบริษัท เร็วดี จำกัด',
      }),
      params(QUESTION_ID),
    )

    expect(response.status).toBe(200)
    expect(questionQueriesMock.answerAccountantQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ actor: ACCOUNTANT }),
      QUESTION_ID,
      { answerText: 'เป็นเงินรับจากบริษัท เร็วดี จำกัด' },
    )
  })
})
