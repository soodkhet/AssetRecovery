/**
 * Route Contract กลางของโมดูล Case/Assignment/Field/Warehouse — SSOT อยู่ที่
 * `docs/45-case-warehouse-api-contracts.md` §6.1–6.5 (รวบจากไฟล์ต้นทาง `38`/`40`/`41`/`44`)
 *
 * ไฟล์นี้ **pure ล้วน** (ไม่มี Prisma/`next/*`) — ฝั่ง client ใช้ `apiPath()` สร้าง URL ได้ตรง ๆ
 * และฝั่ง route handler ผูก contract ผ่าน `withEndpoint()` (`lib/api/http.ts`)
 *
 * ⚠️ เพิ่ม/แก้ endpoint ที่นี่ได้ก็ต่อเมื่อไฟล์ `45` (และไฟล์ต้นทางของโมดูล) แก้ในคอมมิตเดียวกัน —
 * เทสต์ `contract.test.ts` เทียบรายการนี้กับ `docs/45` §6.1–6.5 แบบตัวต่อตัว
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** กลุ่มโมดูลตามไฟล์ต้นทาง — `case` = 38 · `assignment` = 40 · `field` = 41 · `warehouse` = 44 */
export type ContractModule = 'case' | 'assignment' | 'field' | 'warehouse'

export interface EndpointContract {
  readonly method: HttpMethod
  /** path template แบบ `:param` (Next.js เขียนเป็น `[param]` ในชื่อโฟลเดอร์) */
  readonly path: string
  readonly module: ContractModule
  /** อ้างอิงเอกสาร — ไฟล์ต้นทาง + ตำแหน่งใน `45` */
  readonly source: string
  readonly summary: string
  /** query key ที่สเปคอนุญาต — ประกาศไว้เมื่อไหร่ `apiPath()` จะปฏิเสธ key นอกรายการ */
  readonly query?: readonly string[]
}

/**
 * 41 endpoints ตาม `45` §6.1–6.5
 * (PLAN §2.1 เขียน "37" เป็นตัวเลขประมาณตอนวางแผน — นับจริงจากไฟล์ 45 ตอน 2.1 ได้ 7+8+14+4+6 = 39
 *  แล้ว Phase 2.2 เติม `case.update` เข้า `45` §6.1 v1.3 ตาม `38` §8 ⇒ 40
 *  และ Phase 2.5 เติม `case.teamOptions` เข้า v1.4 ตาม `38` §7.4 ⇒ 41)
 */
export const API_CONTRACT = {
  // ── 6.1 Case Submission (ไฟล์ 38 §17.1) ────────────────────────────────
  'case.create': {
    method: 'POST',
    path: '/api/cases',
    module: 'case',
    source: '38 §17.1 · 45 §6.1',
    summary: 'รับเคส (manual form submit + API ingestion — แยกด้วย field source_channel)',
  },
  'case.import': {
    method: 'POST',
    path: '/api/cases/import',
    module: 'case',
    source: '38 §17.1 · 45 §6.1',
    summary: 'Import ไฟล์ Excel/CSV แบบ batch',
  },
  'case.list': {
    method: 'GET',
    path: '/api/cases',
    module: 'case',
    source: '38 §17.1 · 45 §6.1',
    summary: 'List พร้อม filter',
    query: ['status', 'source_channel', 'finance_company_id', 'province', 'search', 'page', 'limit'],
  },
  'case.detail': {
    method: 'GET',
    path: '/api/cases/:id',
    module: 'case',
    source: '38 §17.1 · 45 §6.1',
    summary: 'รายละเอียดเคส',
  },
  'case.update': {
    method: 'PATCH',
    path: '/api/cases/:id',
    module: 'case',
    source: '38 §8 (edit_case) · 45 §6.1',
    summary: 'แก้ไขเคส (draft/pending_review/need_info เท่านั้น) — เพิ่มแถวใน edit_history ทุกครั้ง',
  },
  'case.uploadDocument': {
    method: 'POST',
    path: '/api/cases/:id/documents',
    module: 'case',
    source: '38 §17.1 · 45 §6.1',
    summary: 'อัปโหลดเอกสารต่อ slot (document_type ระบุใน payload)',
  },
  'case.changeStatus': {
    method: 'PATCH',
    path: '/api/cases/:id/status',
    module: 'case',
    source: '38 §17.1 · 45 §6.1',
    summary: 'เปลี่ยนสถานะ (review/accept/reject/request_more_info) — บังคับ reason ตามสเปค',
  },
  'case.teamSuggestion': {
    method: 'GET',
    path: '/api/cases/:id/team-suggestion',
    module: 'case',
    source: '38 §17.1 · 45 §6.1',
    summary: 'คำนวณทีมที่เสนอจากจังหวัดที่อยู่ปัจจุบัน',
  },
  'case.teamOptions': {
    method: 'GET',
    path: '/api/cases/team-options',
    module: 'case',
    source: '38 §7.4 · 45 §6.1 (v1.4)',
    summary: 'ทีม active ทั้งหมด + จังหวัดที่ดูแล + ค่าตั้งของแผนค่าตอบแทน (กล่องค่าใช้จ่ายทีม)',
  },

  // ── 6.2 Case Assignment & Routing (ไฟล์ 40 §17.1) ──────────────────────
  'assignment.list': {
    method: 'GET',
    path: '/api/assignments',
    module: 'assignment',
    source: '40 §17.1 · 45 §6.2',
    summary: 'List เคสพร้อมสถานะมอบหมาย',
    query: ['team', 'status', 'search', 'page', 'limit'],
  },
  'assignment.teamAgents': {
    method: 'GET',
    path: '/api/teams/:team_id/agents',
    module: 'assignment',
    source: '40 §17.1 · 45 §6.2',
    summary: 'รายชื่อพนักงานในทีม พร้อม active_case_count, success_rate, covered_provinces',
  },
  'assignment.agentCases': {
    method: 'GET',
    path: '/api/teams/:team_id/agents/:agent_id/cases',
    module: 'assignment',
    source: '40 §17.1 · 45 §6.2',
    summary: 'รายการเคสที่พนักงานคนนี้ถือครองอยู่',
  },
  'assignment.teamKanban': {
    method: 'GET',
    path: '/api/teams/:team_id/kanban',
    module: 'assignment',
    source: '40 §17.1 · 45 §6.2',
    summary: 'ข้อมูลสำหรับ Kanban Board ภาพรวมทีม',
    query: ['search', 'province'],
  },
  'assignment.assign': {
    method: 'POST',
    path: '/api/cases/:id/assign',
    module: 'assignment',
    source: '40 §17.1 · 45 §6.2',
    summary: 'มอบหมายเคสให้พนักงาน (body: agent_id)',
  },
  'assignment.reassign': {
    method: 'POST',
    path: '/api/cases/:id/reassign',
    module: 'assignment',
    source: '40 §17.1 · 45 §6.2',
    summary: 'เปลี่ยนพนักงานรับผิดชอบ — assigned เปลี่ยนทันที / accepted สร้าง pending_reassignment',
  },
  'assignment.respondReassignment': {
    method: 'POST',
    path: '/api/cases/:id/reassignment/respond',
    module: 'assignment',
    source: '40 §17.1 · 45 §6.2',
    summary: 'พนักงานคนเดิมตอบคำขอ (body: decision: consent|decline, decline_reason)',
  },
  'assignment.accept': {
    method: 'POST',
    path: '/api/cases/:id/accept',
    module: 'assignment',
    source: '40 §17.1 · 45 §6.2',
    summary: 'พนักงานกดรับงาน (เฉพาะ agent ที่ถูก assign)',
  },

  // ── 6.3 Field Tracker (ไฟล์ 41 §17.1) ──────────────────────────────────
  // ⚠️ `field.reorderCases` เป็น segment คงที่ (`/reorder`) ที่อยู่ระดับเดียวกับ `/:id` —
  //    ฝั่ง Next.js ต้องวางเป็นโฟลเดอร์ `reorder/` คู่กับ `[id]/` (static ชนะ dynamic)
  'field.caseList': {
    method: 'GET',
    path: '/api/field/cases',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'ดึงรายการเคสของพนักงานตามสถานะ (4 กลุ่มหลัก) + มุมมองของฉัน/ทีม',
    // `view` เติมเข้า `45` §6.3 พร้อม Phase 2.8 — มุมมองทีมของ `41` §7.3 (read-only ทั้งทีม)
    query: ['status', 'view'],
  },
  'field.caseDetail': {
    method: 'GET',
    path: '/api/field/cases/:id',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'ดึงรายละเอียดเคสเต็ม',
  },
  'field.acceptCase': {
    method: 'POST',
    path: '/api/field/cases/:id/accept',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'รับงาน',
  },
  'field.scheduleCase': {
    method: 'POST',
    path: '/api/field/cases/:id/schedule',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'จัดวันที่ (body: schedule_date)',
  },
  'field.reorderCases': {
    method: 'PATCH',
    path: '/api/field/cases/reorder',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'สลับลำดับเคสในวันเดียวกัน (body: date, ordered_case_ids[])',
  },
  'field.checkin': {
    method: 'POST',
    path: '/api/field/cases/:id/checkin',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'บันทึกเช็คอิน (body: lat, lng — ต้องมาจาก device GPS จริง)',
  },
  'field.closeDraft': {
    method: 'POST',
    path: '/api/field/cases/:id/close-draft',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'บันทึก Draft ปิดงาน',
  },
  'field.closeCase': {
    method: 'POST',
    path: '/api/field/cases/:id/close',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'ยืนยันปิดงาน (body: outcome, evidence)',
  },
  'field.resubmitClose': {
    method: 'POST',
    path: '/api/field/cases/:id/resubmit-close',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'ส่งกลับยืนยันอีกครั้งหลังถูกตีกลับ needs_revision (action resubmit_close_case)',
  },
  'field.resubmitExpense': {
    method: 'POST',
    path: '/api/field/expenses/:id/resubmit',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'แก้ไขรายการเบิกที่ถูกตีกลับแล้วส่งใหม่ (action resubmit_expense)',
  },
  'field.respondReassignment': {
    method: 'POST',
    path: '/api/field/reassignment/:id/respond',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'ตอบรับ/ปฏิเสธคำขอเปลี่ยนผู้รับผิดชอบ (body: consent, decline_reason?)',
  },
  'field.expenseList': {
    method: 'GET',
    path: '/api/field/expenses',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'ดึงรายการเบิกค่าใช้จ่าย',
    query: ['type'],
  },
  'field.hotelClaim': {
    method: 'POST',
    path: '/api/field/expenses/hotel',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'ส่งคำขอเบิกที่พัก',
  },
  'field.incomeSummary': {
    method: 'GET',
    path: '/api/field/income-summary',
    module: 'field',
    source: '41 §17.1 · 45 §6.3',
    summary: 'ดึงสรุปรายได้',
    query: ['month'],
  },

  // ── 6.4 Warehouse — Assets (ไฟล์ 44 §15) ───────────────────────────────
  'asset.list': {
    method: 'GET',
    path: '/api/assets',
    module: 'warehouse',
    source: '44 §15 · 45 §6.4',
    summary: 'List assets พร้อม filter',
    query: [
      'status',
      'companyId',
      'teamId',
      'agentId',
      'condition',
      'search',
      'dateFrom',
      'dateTo',
      'page',
      'limit',
    ],
  },
  'asset.detail': {
    method: 'GET',
    path: '/api/assets/:id',
    module: 'warehouse',
    source: '44 §15 · 45 §6.4',
    summary: 'รายละเอียด asset + lot info',
  },
  'asset.intake': {
    method: 'POST',
    path: '/api/assets/:id/intake',
    module: 'warehouse',
    source: '44 §15 · 45 §6.4',
    summary: 'รับเข้าคลัง (body: imeiActual, condition, conditionNote, photos[])',
  },
  'asset.rejectIntake': {
    method: 'POST',
    path: '/api/assets/:id/reject-intake',
    module: 'warehouse',
    source: '44 §15 · 45 §6.4',
    summary: 'ตีกลับ IMEI ไม่ตรง (body: rejectReason)',
  },

  // ── 6.5 Warehouse — Handover Lots (ไฟล์ 44 §15) ────────────────────────
  'lot.list': {
    method: 'GET',
    path: '/api/handover-lots',
    module: 'warehouse',
    source: '44 §15 · 45 §6.5',
    summary: 'List lots พร้อม filter',
    query: ['status', 'companyId', 'type', 'dateFrom', 'dateTo', 'search', 'page', 'limit'],
  },
  'lot.detail': {
    method: 'GET',
    path: '/api/handover-lots/:id',
    module: 'warehouse',
    source: '44 §15 · 45 §6.5',
    summary: 'รายละเอียด lot + assets',
  },
  'lot.create': {
    method: 'POST',
    path: '/api/handover-lots',
    module: 'warehouse',
    source: '44 §15 · 45 §6.5',
    summary: 'สร้าง Lot + นัดวัน (1 Lot = 1 บริษัทไฟแนนซ์ เสมอ)',
  },
  'lot.confirm': {
    method: 'PATCH',
    path: '/api/handover-lots/:id/confirm',
    module: 'warehouse',
    source: '44 §15 · 45 §6.5',
    summary: 'ยืนยัน + แนบเอกสาร → unlock expense + Revenue ใน $transaction เดียว (44 §11)',
  },
  'lot.pdf': {
    method: 'GET',
    path: '/api/handover-lots/:id/pdf',
    module: 'warehouse',
    source: '44 §15 · 45 §6.5',
    summary: 'ดาวน์โหลดใบส่งมอบ PDF',
  },
  'lot.exportExcel': {
    method: 'GET',
    path: '/api/handover-lots/:id/export-excel',
    module: 'warehouse',
    source: '44 §15 · 45 §6.5',
    summary: 'Export รายการเครื่องใน Lot',
  },
} as const satisfies Record<string, EndpointContract>

export type EndpointId = keyof typeof API_CONTRACT
export type EndpointPath<Id extends EndpointId> = (typeof API_CONTRACT)[Id]['path']

type Segments<P extends string> = P extends `${infer Head}/${infer Rest}` ? Head | Segments<Rest> : P
type ParamOf<S extends string> = S extends `:${infer Name}` ? Name : never

/** ชื่อ path param ที่ดึงจาก template — `/api/cases/:id/documents` → `'id'` */
export type PathParams<P extends string> = ParamOf<Segments<P>>

export type QueryValue = string | number | boolean | readonly string[] | undefined
export type QueryInit = Readonly<Record<string, QueryValue>>

type ParamsOf<Id extends EndpointId> = PathParams<EndpointPath<Id>>

type PathArgs<Id extends EndpointId> = [ParamsOf<Id>] extends [never]
  ? [params?: undefined, query?: QueryInit]
  : [params: Readonly<Record<ParamsOf<Id>, string>>, query?: QueryInit]

/** มุมมองแบบกว้างของทะเบียน — ใช้ตอนวนลูป/อ่าน field ที่ไม่ได้มีทุกตัว (เช่น `query`) */
export const CONTRACT_BY_ID: Readonly<Record<EndpointId, EndpointContract>> = API_CONTRACT

export function endpoint<Id extends EndpointId>(id: Id): (typeof API_CONTRACT)[Id] {
  return API_CONTRACT[id]
}

function buildQuery(id: EndpointId, query: QueryInit): string {
  const allowed = CONTRACT_BY_ID[id].query
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (allowed !== undefined && !allowed.includes(key)) {
      throw new Error(`endpoint "${id}" ไม่รับ query "${key}" (สเปครับเฉพาะ: ${allowed.join(', ')})`)
    }
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
      continue
    }
    params.append(key, String(value))
  }
  const search = params.toString()
  return search === '' ? '' : `?${search}`
}

/**
 * สร้าง URL ของ endpoint จาก contract — **ห้ามประกอบ path ด้วยมือในโค้ดโมดูล**
 * (พิมพ์ path ผิดจะจับไม่ได้จนถึง runtime · ตัวนี้บังคับชื่อ param และ query ตามสเปค)
 */
export function apiPath<Id extends EndpointId>(id: Id, ...args: PathArgs<Id>): string {
  const [params, query] = args
  const path = API_CONTRACT[id].path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment
      const name = segment.slice(1)
      const value = (params as Readonly<Record<string, string>> | undefined)?.[name]
      if (value === undefined || value === '') throw new Error(`endpoint "${id}" ขาด path param "${name}"`)
      return encodeURIComponent(value)
    })
    .join('/')
  return query === undefined ? path : `${path}${buildQuery(id, query)}`
}
