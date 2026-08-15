import type { ExportRecordStatus } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * DTO ของงานส่งมอบชุดบัญชี (ไฟล์ 37) — **type-only** เพื่อให้ฝั่ง client import ได้โดยไม่ลาก Prisma
 * (แนวเดียวกับ `lib/settings/types.ts`)
 */

export interface ExportPackFileDto {
  /** `01`–`08` · `cover` · `pack` (ไฟล์ .zip ทั้งชุด) */
  key: string
  fileName: string
}

export interface ExportRecordDto {
  id: string
  periodId: string
  periodLabel: string
  version: number
  versionLabel: string
  status: ExportRecordStatus
  statusLabel: string
  statusGroup: StatusBadgeGroup
  /** จำนวนไฟล์หลักในชุด (`37` §7.1 — นับเฉพาะ 01–08 ไม่รวมหน้าปก/ไฟล์ zip) */
  fileCount: number
  /** เอกสารแนบ (ใบเสร็จ/หลักฐาน) — ยังไม่รวมในชุดรอบนี้ ดู `37` §7.1 */
  attachmentCount: number
  files: readonly ExportPackFileDto[]
  /** SHA-256 ของไฟล์ `.zip` ทั้งชุด (`export_records.file_hash`) */
  fileHash: string
  zipFileName: string | null
  generatedAt: string
  generatedByName: string
  sentAt: string | null
  sentByName: string | null
  acceptedAt: string | null
}

export interface ExportHistoryListDto {
  items: readonly ExportRecordDto[]
}
