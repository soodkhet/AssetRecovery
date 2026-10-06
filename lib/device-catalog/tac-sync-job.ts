import { DEVICE_TAC_SYNC_JOB_TYPE, MANAGE_DEVICE_CATALOG_CAPABILITY } from '@/lib/device-catalog/permissions'
import { importTacRecords, type TacImportResult } from '@/lib/device-catalog/tac-import'
import { parseTacCsv, TacFileFormatError } from '@/lib/device-catalog/tac'
import {
  createGithubTacSourceClient,
  type TacSourceClient,
  type TacSourceCommit,
} from '@/lib/device-catalog/tac-source'
import { saveTacSyncState } from '@/lib/device-catalog/settings-queries'
import type { Prisma } from '@/lib/generated/prisma/client'
import { deviceTacUpdateFailedMessage } from '@/lib/notifications/messages'
import { enqueueNotificationOutbox } from '@/lib/notifications/outbox'
import { outboxMessageEntries } from '@/lib/notifications/outbox-core'
import { usersWithCapability } from '@/lib/notifications/recipients'
import { prisma } from '@/lib/prisma'

/**
 * Job `device_tac_sync` — อัปเดตฐาน TAC ของ Model Phone (มติ PO U166 → U167 → U168 · DEC-017 · `91` §6.1)
 *
 * รอบเวลา: **ทุกวันหลังเที่ยงคืนเวลาไทย** (คีย์กันซ้ำรายวันตามวันไทย — U168) + ผู้ดูแลกด "อัปเดตตอนนี้"
 * (ตัวเลือก "บังคับดึงใหม่") + "นำเข้าไฟล์เอง" (ไฟล์ที่อัปโหลดเข้า storage)
 *
 * ### ลำดับ (U167)
 * ① ถาม GitHub commits API ของไฟล์ → sha + วันที่แก้ล่าสุด
 * ② sha = sha ของการนำเข้าสำเร็จครั้งล่าสุด (ทุกองค์กร) และไม่บังคับ ⇒ **ไม่ดาวน์โหลด** บันทึก "ไม่มีของใหม่"
 * ③ sha เปลี่ยน ⇒ ดาวน์โหลด → เพิ่มเฉพาะ TAC ใหม่ → เก็บ sha/วันที่ไว้กับรอบนั้น
 * ④ commits API ล้ม (rate limit/เน็ต) ⇒ fallback ดาวน์โหลดแบบ If-None-Match (ETag) — 304 = ไม่มีของใหม่
 *
 * ### ล้มเหลว
 * บันทึกประวัติ "ล้มเหลว" + สาเหตุ (ทุกองค์กรที่เกี่ยว) + แจ้งผู้ดูแล (`manage_device_catalog` · ผ่าน outbox ในทรานแซกชัน
 * เดียวกับแถวประวัติ) แล้ว**โยนต่อ** ⇒ ตัวรันงานกลาง retry ตามระบบเดิม · ตัวเลือกเดิมในฟอร์มใช้ได้ตลอด
 * ไฟล์ผิดรูปแบบ (นำเข้าเอง) ก็นับเป็นล้มเหลวเช่นกัน
 *
 * idempotent: นำเข้าเพิ่มเฉพาะ TAC ที่ยังไม่มี (`importTacRecords()`) ⇒ รันซ้ำไม่เกิดแถวซ้ำ ไม่ทับของที่จำ/ผูก/ซ่อน
 * actor: job รายวัน = ระบบ (`reason` ระบุ job id) · ปุ่ม/นำเข้าไฟล์ = ผู้ดูแลที่กด (จาก payload ที่ server ใส่)
 */

export { DEVICE_TAC_SYNC_JOB_TYPE }
export const TAC_UPDATE_FAILED_OUTBOX_SOURCE = 'device_tac_sync'

export type TacSyncTrigger = 'daily' | 'manual' | 'file'

export interface TacSyncActor {
  id: string
  roleName: string
}

export interface DeviceTacSyncOptions {
  organizationId?: string
  jobId?: string
  now?: Date
  trigger?: TacSyncTrigger
  /** ข้าม sha/ETag เดิม — ดาวน์โหลดใหม่เสมอ (ผู้ดูแลเลือก "บังคับดึงใหม่") */
  force?: boolean
  /** นำเข้าไฟล์เอง — path ใน storage (ต้องมี `organizationId`) */
  filePath?: string
  actor?: TacSyncActor | null
  /** เทสต์ส่ง mock เสมอ — ห้ามเรียกเน็ตจริง */
  client?: TacSourceClient
  /** อ่านไฟล์ที่อัปโหลด — ไม่ส่ง = ดาวน์โหลดจาก storage จริง */
  readFile?: (path: string) => Promise<Uint8Array | null>
}

export interface DeviceTacSyncResult {
  trigger: TacSyncTrigger
  status: 'success' | 'not_modified'
  organizations: number
  /** ผ่านกิ่งไหน — ใช้ตรวจในเทสต์/Job Log */
  path: 'sha_unchanged' | 'etag_not_modified' | 'downloaded' | 'file'
  sourceSha: string | null
  sourceUpdatedAt: string | null
  fileRows: number
  tacsAdded: number
  brandsAdded: number
  modelsAdded: number
}

/** อ่านตัวเลือกของ job จาก payload (ผู้ดูแลกด/นำเข้าไฟล์) — server เป็นผู้ใส่ payload เอง */
export function tacSyncOptionsFromPayload(payload: unknown): {
  trigger: TacSyncTrigger
  force: boolean
  filePath: string | null
  actor: TacSyncActor | null
} {
  const record = payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {}
  const triggerValue = record['trigger']
  const trigger: TacSyncTrigger = triggerValue === 'manual' || triggerValue === 'file' ? triggerValue : 'daily'
  const filePath = typeof record['filePath'] === 'string' && record['filePath'] !== '' ? record['filePath'] : null
  const actorId = record['actorId']
  const actorRole = record['actorRole']
  return {
    trigger: filePath === null ? (trigger === 'file' ? 'daily' : trigger) : 'file',
    force: record['force'] === true,
    filePath,
    actor: typeof actorId === 'string' && typeof actorRole === 'string' ? { id: actorId, roleName: actorRole } : null,
  }
}

async function defaultReadFile(path: string): Promise<Uint8Array | null> {
  const { downloadUploadedFile } = await import('@/lib/uploads/storage')
  return downloadUploadedFile(path)
}

function bangkokText(date: Date): string {
  return new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
}

export async function runDeviceTacSyncJob(options: DeviceTacSyncOptions = {}): Promise<DeviceTacSyncResult> {
  const now = options.now ?? new Date()
  const jobRef = options.jobId ?? DEVICE_TAC_SYNC_JOB_TYPE
  const trigger: TacSyncTrigger = options.filePath === undefined ? (options.trigger ?? 'daily') : 'file'
  const actor = options.actor ?? null
  const reason =
    actor === null
      ? `งานเบื้องหลัง ${DEVICE_TAC_SYNC_JOB_TYPE} (${jobRef}) อัปเดตฐาน TAC`
      : trigger === 'file'
        ? `นำเข้าไฟล์ TAC เอง (${jobRef})`
        : `ผู้ดูแลสั่งอัปเดตฐาน TAC (${jobRef})`

  if (trigger === 'file' && options.organizationId === undefined) {
    throw new Error('นำเข้าไฟล์ TAC ต้องระบุองค์กร')
  }
  const organizations = await prisma.organization.findMany({
    where: options.organizationId === undefined ? {} : { id: options.organizationId },
    select: { id: true },
  })
  const orgIds = organizations.map((org) => org.id)
  const base = (): DeviceTacSyncResult => ({
    trigger,
    status: 'not_modified',
    organizations: orgIds.length,
    path: 'sha_unchanged',
    sourceSha: null,
    sourceUpdatedAt: null,
    fileRows: 0,
    tacsAdded: 0,
    brandsAdded: 0,
    modelsAdded: 0,
  })
  if (orgIds.length === 0) return base()

  const settings = await prisma.deviceCatalogSettings.findMany({
    where: { organizationId: { in: orgIds } },
    select: { organizationId: true, tacEtag: true, tacSourceSha: true },
  })
  const settingsOf = new Map(settings.map((row) => [row.organizationId, row]))
  const createdBy = actor?.id ?? null
  let commit: TacSourceCommit | null = null

  const recordFailure = async (message: string): Promise<void> => {
    for (const organizationId of orgIds) {
      await prisma.$transaction(async (tx) => {
        await tx.deviceTacUpdate.create({
          data: {
            organizationId,
            jobId: options.jobId ?? null,
            trigger,
            status: 'failed',
            sourceSha: commit?.sha ?? null,
            sourceUpdatedAt: commit?.committedAt ?? null,
            errorMessage: message.slice(0, 1000),
            createdBy,
          },
        })
        const recipients = await usersWithCapability(organizationId, MANAGE_DEVICE_CATALOG_CAPABILITY)
        await enqueueNotificationOutbox(
          tx,
          outboxMessageEntries(
            organizationId,
            recipients,
            deviceTacUpdateFailedMessage({ jobRef, dayKey: bangkokText(now), reason: message }),
          ),
          { jobType: TAC_UPDATE_FAILED_OUTBOX_SOURCE, jobRef: options.jobId ?? null },
        )
      })
    }
  }

  try {
    // ── นำเข้าไฟล์เอง ──────────────────────────────────────────────
    if (trigger === 'file') {
      const organizationId = orgIds[0] ?? ''
      const bytes = await (options.readFile ?? defaultReadFile)(options.filePath ?? '')
      if (bytes === null) throw new TacFileFormatError('ไม่พบไฟล์ที่อัปโหลด — อัปโหลดใหม่อีกครั้ง')
      const parsed = parseTacCsv(new TextDecoder('utf-8').decode(bytes))
      const imported = await importTacRecords(organizationId, parsed.records, {
        actorId: createdBy,
        actorRole: actor?.roleName ?? null,
        reason,
      })
      await recordSuccess(organizationId, imported, parsed.totalRows, null, null)
      await saveTacSyncState(organizationId, { tacCheckedAt: now, tacImportedAt: now })
      return { ...base(), status: 'success', path: 'file', fileRows: parsed.totalRows, ...counts(imported) }
    }

    // ── ① commits API ──────────────────────────────────────────────
    const client = options.client ?? createGithubTacSourceClient()
    commit = await client.latestCommit()
    const force = options.force === true
    const sourceSha = commit?.sha ?? null
    const sourceUpdatedAt = commit?.committedAt ?? null

    // ② sha เดิมทุกองค์กร ⇒ ไม่ดาวน์โหลด
    if (commit !== null && !force && orgIds.every((id) => settingsOf.get(id)?.tacSourceSha === commit?.sha)) {
      await recordNotModified(sourceSha, sourceUpdatedAt)
      return { ...base(), path: 'sha_unchanged', sourceSha, sourceUpdatedAt: sourceUpdatedAt?.toISOString() ?? null }
    }

    // ③/④ ดาวน์โหลด — ETag ใช้เฉพาะกิ่ง fallback (ถาม commits ไม่ได้) และทุกองค์กรมี ETag เดียวกัน
    const etags = new Set(orgIds.map((id) => settingsOf.get(id)?.tacEtag ?? null))
    const sharedEtag = etags.size === 1 ? ([...etags][0] ?? null) : null
    const downloaded = await client.download(commit === null && !force ? sharedEtag : null)
    if (downloaded.status === 'not_modified') {
      await recordNotModified(null, null)
      return { ...base(), path: 'etag_not_modified' }
    }

    const parsed = parseTacCsv(downloaded.text)
    const total = { tacsAdded: 0, brandsAdded: 0, modelsAdded: 0 }
    for (const organizationId of orgIds) {
      const imported = await importTacRecords(organizationId, parsed.records, {
        actorId: createdBy,
        actorRole: actor?.roleName ?? null,
        reason,
      })
      total.tacsAdded += imported.tacsAdded
      total.brandsAdded += imported.brandsAdded
      total.modelsAdded += imported.modelsAdded
      await recordSuccess(organizationId, imported, parsed.totalRows, sourceSha, sourceUpdatedAt, downloaded.etag)
      await saveTacSyncState(organizationId, {
        tacEtag: downloaded.etag,
        tacSourceSha: sourceSha,
        ...(sourceUpdatedAt === null ? {} : { tacSourceUpdatedAt: sourceUpdatedAt }),
        tacCheckedAt: now,
        tacImportedAt: now,
      })
    }
    return {
      ...base(),
      status: 'success',
      path: 'downloaded',
      sourceSha,
      sourceUpdatedAt: sourceUpdatedAt?.toISOString() ?? null,
      fileRows: parsed.totalRows,
      ...total,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'อัปเดตฐาน TAC ไม่สำเร็จ (ไม่ทราบสาเหตุ)'
    await recordFailure(message)
    throw error
  }

  async function recordNotModified(sha: string | null, updatedAt: Date | null): Promise<void> {
    for (const organizationId of orgIds) {
      await prisma.deviceTacUpdate.create({
        data: {
          organizationId,
          jobId: options.jobId ?? null,
          trigger,
          status: 'not_modified',
          sourceSha: sha,
          sourceUpdatedAt: updatedAt,
          etag: settingsOf.get(organizationId)?.tacEtag ?? null,
          createdBy,
        },
      })
      await saveTacSyncState(organizationId, {
        tacCheckedAt: now,
        ...(updatedAt === null ? {} : { tacSourceUpdatedAt: updatedAt }),
      })
    }
  }

  async function recordSuccess(
    organizationId: string,
    imported: TacImportResult,
    fileRows: number,
    sha: string | null,
    updatedAt: Date | null,
    etag: string | null = null,
  ): Promise<void> {
    await prisma.deviceTacUpdate.create({
      data: {
        organizationId,
        jobId: options.jobId ?? null,
        trigger,
        status: 'success',
        sourceSha: sha,
        sourceUpdatedAt: updatedAt,
        etag,
        fileRows,
        tacsAdded: imported.tacsAdded,
        brandsAdded: imported.brandsAdded,
        modelsAdded: imported.modelsAdded,
        addedModels: imported.addedModels as Prisma.InputJsonValue,
        createdBy,
      },
    })
  }
}

function counts(imported: TacImportResult): { tacsAdded: number; brandsAdded: number; modelsAdded: number } {
  return { tacsAdded: imported.tacsAdded, brandsAdded: imported.brandsAdded, modelsAdded: imported.modelsAdded }
}
