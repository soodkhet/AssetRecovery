import type { Prisma } from '@/lib/generated/prisma/client'
import { diffRecords, toAuditJson } from '@/lib/audit/diff'
import type { AuditJsonValue } from '@/lib/audit/diff'
import type { AuditEntry, AuditRecordData } from '@/lib/audit/types'
import { validateAuditEntry } from '@/lib/audit/validate'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { prisma } from '@/lib/prisma'

/**
 * Audit emit helper — **ทุก mutation ต้องผ่านที่นี่** (`90` §13 · `02` §10 · Rule 03)
 * ห้ามสร้าง helper audit ตัวใหม่ที่อื่น ให้แก้ไฟล์นี้แทน
 *
 * ครบ 9 fields บังคับ: actor_id, role, action, target_type, target_id, before, after, reason, created_at
 * (`created_at` มาจาก DB default)
 *
 * สิ่งที่ helper จัดการให้เอง:
 *  - บังคับ `reason` เมื่อกระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock period (`lib/audit/reason-policy.ts`)
 *  - แปลง Date/Decimal/BigInt ให้ JSONB เก็บได้ + ปิดบังค่าอ่อนไหว (`lib/audit/diff.ts`)
 *  - action `update` เก็บเฉพาะฟิลด์ที่เปลี่ยนจริง (ปิดด้วย `diffOnly: false` ถ้าต้องการ snapshot เต็ม)
 *
 * ⚠️ audit ที่อยู่ใน flow เดียวกับ mutation ต้องอยู่ใน `$transaction` เดียวกัน (เช่น lot confirm 4 steps
 *    ของ `44` §11) — ส่ง tx client เข้ามาทาง argument ที่สอง
 */

/**
 * client ที่เขียน audit ได้ — `prisma` หรือ tx client จาก `prisma.$transaction()`
 * ประกาศแบบ structural (เอาเฉพาะ `create`) เพราะ type ของ extended client กับ tx client ไม่ตรงกันเป๊ะ
 */
export interface AuditClient {
  auditLog: {
    create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown>
  }
}

/** ประกอบ payload ที่จะเขียนลง DB (pure ยกเว้นการ validate) — แยกไว้ให้เทสต์เรียกตรงได้ */
export function buildAuditRecord(entry: AuditEntry): AuditRecordData {
  const reason = validateAuditEntry(entry)
  const useDiff = entry.diffOnly ?? entry.action === 'update'

  let before: AuditJsonValue | undefined
  let after: AuditJsonValue | undefined

  if (useDiff && entry.before !== undefined && entry.after !== undefined) {
    const diff = diffRecords(entry.before, entry.after)
    before = diff.before ?? undefined
    after = diff.after ?? undefined
  } else {
    before = entry.before === undefined ? undefined : toAuditJson(entry.before)
    after = entry.after === undefined ? undefined : toAuditJson(entry.after)
  }

  return {
    organizationId: entry.organizationId,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    beforeData: before,
    afterData: after,
    reason,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  }
}

export async function emitAudit(entry: AuditEntry, client: AuditClient = prisma): Promise<void> {
  const data = buildAuditRecord(entry)
  await client.auditLog.create({
    data: {
      ...data,
      beforeData: data.beforeData ?? undefined,
      afterData: data.afterData ?? undefined,
    },
  })
}

/** ผู้สั่ง export — รูปแบบย่อของ `SessionUser` (เอาเฉพาะฟิลด์ที่ audit ต้องใช้) */
export interface ExportAuditActor {
  readonly id: string
  readonly organizationId: string
  readonly roleName: string
}

export interface DocumentExportAudit {
  readonly actor: ExportAuditActor
  /** request ของ endpoint ดาวน์โหลด — ใช้เก็บ ip/user-agent (ไม่ส่ง = null) */
  readonly request?: Request
  readonly targetType: string
  readonly targetId: string | null
  /** ชนิดเอกสาร/ไฟล์ เช่น `handover_note_pdf` — แยกได้ว่านำไฟล์อะไรออกไป */
  readonly document: string
  readonly fileName: string
  /** รายละเอียดเพิ่ม (เลขเอกสาร, version, ผู้รับเงิน ฯลฯ) */
  readonly details?: Readonly<Record<string, unknown>>
}

/** ประกอบ entry ของการนำเอกสารออก (pure — แยกให้เทสต์เรียกตรงได้) */
export function buildDocumentExportEntry(input: DocumentExportAudit): AuditEntry {
  const meta = input.request ? getRequestMeta(input.request) : { ipAddress: null, userAgent: null }
  return {
    organizationId: input.actor.organizationId,
    actorId: input.actor.id,
    actorRole: input.actor.roleName,
    action: 'export',
    targetType: input.targetType,
    targetId: input.targetId,
    before: null,
    after: { channel: 'internal', document: input.document, file_name: input.fileName, ...(input.details ?? {}) },
    reason: null,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  }
}

/**
 * audit การนำเอกสาร/ไฟล์ออกจากระบบ (ดาวน์โหลด PDF/Excel/ไฟล์ธนาคาร/แพ็กซ้ำ) — action `export`
 * ทุก export ต้อง trace กลับผู้สั่งได้ (Rule 03 · `90` §13) · อ่านอย่างเดียวจึงไม่มี before/reason
 */
export async function emitDocumentExportAudit(
  input: DocumentExportAudit,
  client: AuditClient = prisma,
): Promise<void> {
  await emitAudit(buildDocumentExportEntry(input), client)
}

export type { AuditEntry } from '@/lib/audit/types'
