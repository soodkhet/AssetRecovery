import { EVENT_NAMES, type DomainEventName } from '@/lib/api/event-names'

/**
 * Event Registry — คำอธิบาย + ที่มาของทุก event ในทะเบียน (`lib/api/event-names.ts`)
 *
 * SSOT ของชื่อ = **ไฟล์ต้นทางของโมดูล** (`38` §17.2 · `40` §17.2 · `41` §17.2 · `44` §14)
 * ตามลำดับความสำคัญเอกสารใน CLAUDE.md (module spec ชนะ reference กลาง `45`)
 * ส่วนที่ `45` §7 เขียนไม่ตรงกับไฟล์ต้นทาง บันทึกไว้ที่ `EVENT_NAME_DIFFS` ด้านล่าง (ห้ามเงียบ)
 */

export type EventModule = 'case' | 'assignment' | 'field' | 'warehouse' | 'finance' | 'accounting'

export interface DomainEventContract {
  readonly module: EventModule
  readonly source: string
  readonly description: string
}

export const EVENT_REGISTRY: Readonly<Record<DomainEventName, DomainEventContract>> = {
  // ── Case Submission (38) ───────────────────────────────────────────────
  'case.created': { module: 'case', source: '38 §17.2', description: 'สร้างเคสใหม่ (ทุกช่องทาง)' },
  'case.updated': { module: 'case', source: '38 §17.2', description: 'แก้ไขข้อมูลเคส (ก่อน approved)' },
  'case.document_uploaded': { module: 'case', source: '38 §17.2', description: 'อัปโหลดเอกสารเข้า slot' },
  'case.status_changed': { module: 'case', source: '38 §17.2', description: 'เปลี่ยนสถานะเคสทุกกรณี' },
  'case.approved': { module: 'case', source: '38 §17.2', description: 'อนุมัติเคส — snapshot service fee ที่จุดนี้ (`10` §9.2)' },
  'case.rejected': { module: 'case', source: '38 §17.2', description: 'ปฏิเสธเคส (ต้องมี reason)' },
  'case.need_info_requested': { module: 'case', source: '38 §17.2', description: 'ขอข้อมูลเพิ่มเติมจากผู้ส่งเคส' },
  'case.recycle_approved': { module: 'case', source: '45 §7 (flow ที่ `38` §10)', description: 'อนุมัติรีไซเกิลเคส closed_fail → tracking_round +1' },

  // ── Case Assignment & Routing (40) ─────────────────────────────────────
  'assignment.created': { module: 'assignment', source: '40 §17.2', description: 'มอบหมายเคสให้พนักงานครั้งแรก' },
  'assignment.reassigned': { module: 'assignment', source: '40 §17.2', description: 'เปลี่ยนผู้รับผิดชอบทันที (เคสยัง assigned)' },
  'assignment.reassignment_requested': { module: 'assignment', source: '40 §17.2', description: 'สร้างคำขอเปลี่ยนผู้รับผิดชอบ (เคส accepted)' },
  'assignment.reassignment_consented': { module: 'assignment', source: '40 §17.2', description: 'พนักงานคนเดิมยินยอม' },
  'assignment.reassignment_declined': { module: 'assignment', source: '40 §17.2', description: 'พนักงานคนเดิมไม่ยินยอม (ต้องมี decline_reason)' },
  'assignment.reassignment_timeout_resolved': { module: 'assignment', source: '40 §17.2', description: 'คำขอหมดเขต — job auto-resolve เป็น timeout_auto' },
  'assignment.accepted': { module: 'assignment', source: '40 §17.2', description: 'พนักงานกดรับงานฝั่ง Back Office' },

  // ── Field Tracker (41) ─────────────────────────────────────────────────
  'case.accepted': { module: 'field', source: '41 §17.2', description: 'พนักงานกดรับงานจาก Field Tracker' },
  'case.scheduled': { module: 'field', source: '41 §17.2', description: 'จัดวันลงพื้นที่' },
  'case.reordered': { module: 'field', source: '41 §17.2', description: 'สลับลำดับเคสภายในวันเดียวกัน' },
  'case.checkin_recorded': { module: 'field', source: '41 §17.2', description: 'บันทึกเช็คอิน (GPS จริงเท่านั้น)' },
  'case.close_draft_saved': { module: 'field', source: '41 §17.2', description: 'บันทึก Draft ปิดงาน' },
  'case.closed_success': { module: 'field', source: '41 §17.2', description: 'ปิดงานสำเร็จ — ต้องผ่านคลังก่อนเกิด Revenue (`19` §6.1)' },
  'case.closed_fail': { module: 'field', source: '41 §17.2', description: 'ปิดงานไม่สำเร็จ — ไม่ผ่านคลัง' },
  'case.evidence_rejected': {
    module: 'field',
    source: '41 §17.2',
    description: 'ตีกลับหลักฐานปิดงาน — เจ้าหน้าที่อนุมัติเคสเท่านั้น (`41` §10.1 · ไม่เพิ่ม tracking_round)',
  },
  'case.close_resubmitted': { module: 'field', source: '41 §17.2', description: 'ส่งปิดงานใหม่หลังถูกตีกลับ — expense เดิม superseded' },
  'expense.case_bound_created': { module: 'field', source: '41 §17.2', description: 'สร้างรายการเบิกที่ผูกกับเคส' },
  'expense.hotel_claim_submitted': { module: 'field', source: '41 §17.2', description: 'ส่งคำขอเบิกที่พัก' },
  'expense.resubmitted': { module: 'field', source: '41 §17.2', description: 'ส่งรายการเบิกที่ถูกตีกลับใหม่ (needs_revision → pending_approval)' },
  'reassignment.consented': { module: 'field', source: '41 §17.2', description: 'ตอบยินยอมคำขอเปลี่ยนผู้รับผิดชอบจากฝั่ง Field' },
  'reassignment.declined': { module: 'field', source: '41 §17.2', description: 'ตอบไม่ยินยอมจากฝั่ง Field (ต้องมีเหตุผล)' },

  // ── Warehouse (44) ─────────────────────────────────────────────────────
  'asset.intake': { module: 'warehouse', source: '44 §14', description: 'รับเครื่องเข้าคลัง (IMEI ตรงหรือธุรการยืนยันทับคำเตือน)' },
  'asset.intake_rejected': { module: 'warehouse', source: '44 §14', description: 'ตีกลับการรับเข้าคลัง (ต้องมี reject_reason)' },
  'asset.intake_retry': { module: 'warehouse', source: '44 §14', description: 'รีเซ็ตสถานะจาก intake_rejected เพื่อรับเข้าใหม่' },
  'lot.created': { module: 'warehouse', source: '44 §14', description: 'สร้าง Lot ส่งมอบ (1 Lot = 1 บริษัทไฟแนนซ์)' },
  'lot.doc_attached': { module: 'warehouse', source: '44 §14', description: 'แนบใบเซ็นรับ/หลักฐานการส่ง' },
  'lot.confirmed': { module: 'warehouse', source: '44 §14', description: 'ยืนยันส่งมอบ — จุด trigger เดียวที่ unlock expense + สร้าง Revenue ใน transaction เดียว' },

  // ── Compensation Approval (16) ─────────────────────────────────────────
  'expense.approved': {
    module: 'finance',
    source: '16 §9 · 19 §6.1',
    description: 'รายการเบิกผ่านครบทุกขั้นของสายอนุมัติ — เกตหนึ่งในสามของ Revenue (`19` §6.1)',
  },
  'expense.rejected': {
    module: 'finance',
    source: '90 §6.3 · 16 §9',
    description: 'ตีกลับรายการเบิกให้ผู้เบิกแก้ (`needs_revision`) — ไม่แตะสถานะงานภาคสนาม (`41` §10.1)',
  },

  // ── Payout (17) + Advance job (15) — เข้าทะเบียนที่ Phase 5.2 ──────────
  'payout_batch.completed': {
    module: 'finance',
    source: '90 §6.3 · 17 §9/§18',
    description: 'รอบจ่ายโอนเงินสำเร็จ (ยืนยันด้วยมือ หรือจับคู่จาก Bank Reconciliation — ไฟล์ 35)',
  },
  'advance.overdue': {
    module: 'finance',
    source: '90 §6.3 (mockup `notifications.html`) · 15 §9.1',
    description: 'job มาร์คเงินทดรองที่เลย `due_clear_date` เป็น `overdue` — ไม่มีปุ่มให้กดเอง (`15` §10)',
  },

  // ── Accounting (30/33/34/36) — เข้าทะเบียนที่ Phase 5.2 ────────────────
  'wht.filing_due_reminder': {
    module: 'accounting',
    source: '90 §6.3 · 33 §6.2/§8',
    description: 'เตือนก่อนถึงกำหนดนำส่ง ภ.ง.ด.3/53 ของงวด — job รายวัน (idempotent ต่อ 1 งวด)',
  },
  'exception.created': {
    module: 'accounting',
    source: '90 §6.3 · 34 §9',
    description: 'ข้อยกเว้นใหม่ระดับ critical — ที่ยัง open จะบล็อก Export Pack (`37`)',
  },
  'question.asked': {
    module: 'accounting',
    source: '90 §6.3 (mockup `notifications.html`) · 36 §13',
    description: 'บันทึกข้อซักถามใหม่จากสำนักงานบัญชี รอคำตอบ',
  },
  'period.sent_to_accountant': {
    module: 'accounting',
    source: '90 §6.3 (mockup `notifications.html`) · 30 §9',
    description: 'งวดบัญชีผ่าน Readiness Check แล้วส่งให้สำนักงานบัญชี (`collecting → sent_to_accountant`)',
  },
}

/**
 * ส่วนต่างของชื่อ event ระหว่างไฟล์ต้นทางกับ `45` §7 (บันทึกตาม PLAN §2.1 — ห้ามแก้เงียบ)
 * ทะเบียนจริงยึด `canonical` เสมอ
 */
export const EVENT_NAME_DIFFS = [
  {
    canonical: 'asset.intake',
    alsoWrittenAs: 'asset.intake_confirmed',
    note: '`45` §7 เขียน `asset.intake_confirmed` แต่ไฟล์ต้นทาง `44` §14 ใช้ `asset.intake` — ยึดไฟล์ต้นทาง',
  },
  {
    canonical: 'asset.intake_retry',
    alsoWrittenAs: null,
    note: 'มีใน `44` §14 แต่ `45` §7 ไม่ได้ลิสต์ — รับเข้าทะเบียนตามไฟล์ต้นทาง',
  },
  {
    canonical: 'lot.doc_attached',
    alsoWrittenAs: null,
    note: 'มีใน `44` §14 แต่ `45` §7 ไม่ได้ลิสต์ — รับเข้าทะเบียนตามไฟล์ต้นทาง',
  },
  {
    canonical: 'expense.case_bound_created',
    alsoWrittenAs: null,
    note: 'มีใน `41` §17.2 แต่ `45` §7 ไม่ได้ลิสต์ — รับเข้าทะเบียนตามไฟล์ต้นทาง',
  },
  {
    canonical: 'expense.hotel_claim_submitted',
    alsoWrittenAs: null,
    note: 'มีใน `41` §17.2 แต่ `45` §7 ไม่ได้ลิสต์ — รับเข้าทะเบียนตามไฟล์ต้นทาง',
  },
  {
    canonical: 'case.recycle_approved',
    alsoWrittenAs: null,
    note: 'มีใน `45` §7 แต่ `38` §17.2 ไม่ได้ลิสต์ (flow recycle มีจริงที่ `38` §10) — รับเข้าทะเบียน',
  },
] as const

const REGISTERED = new Set<string>(EVENT_NAMES)

export function isDomainEvent(name: string): name is DomainEventName {
  return REGISTERED.has(name)
}

/** ใช้ตอนรับชื่อ event จากข้อมูลภายนอก (job payload/import) — ชื่อนอกทะเบียนต้องดังทันที */
export function assertDomainEvent(name: string): DomainEventName {
  if (!isDomainEvent(name)) throw new Error(`event "${name}" ไม่มีในทะเบียน (\`lib/api/event-names.ts\`)`)
  return name
}

export { EVENT_NAMES }
export type { DomainEventName }
