import type { CaseFieldEvidenceDto } from '@/lib/cases/types'
import type { FieldMediaKind } from '@/lib/field/media-upload'

/**
 * ตัวช่วยหน้าตรวจหลักฐานปิดงานของเจ้าหน้าที่อนุมัติเคส (UAT BUG-045) — **pure ล้วน**
 * หน้าจอห้าม if สถานะเอง: ปุ่มตีกลับมาจาก {@link canRejectFieldEvidence} (UX เท่านั้น — API ตรวจซ้ำ)
 */

/** ตีกลับได้จากสถานะปิดงานเท่านั้น (`41` §8 `reject_evidence` · state `closed_success`/`closed_fail` → `needs_revision`) */
export function canRejectFieldEvidence(evidence: Pick<CaseFieldEvidenceDto, 'assignmentStatus'> | null): boolean {
  return evidence !== null && (evidence.assignmentStatus === 'closed_success' || evidence.assignmentStatus === 'closed_fail')
}

export const CHECKIN_TYPE_LABEL: Readonly<Record<string, string>> = {
  address: 'ที่อยู่ลูกหนี้',
  contact: 'ผู้ติดต่อ',
  workplace: 'ที่ทำงาน',
  asset_location: 'จุดพบทรัพย์',
}

export function checkinTypeLabel(type: string): string {
  return CHECKIN_TYPE_LABEL[type] ?? type
}

const KIND_MIME_PREFIX: Readonly<Record<FieldMediaKind, string>> = {
  photo: 'image/',
  product_photo: 'image/',
  video: 'video/',
  audio: 'audio/',
}

/** นามสกุลที่ชื่อ subtype ไม่ตรงกับนามสกุล */
const SUBTYPE_ALIAS: Readonly<Record<string, string>> = { jpg: 'jpeg', mov: 'quicktime', m4a: 'mp4', mp3: 'mpeg' }

/** path ของ `fieldEvidencePath()` = `cases/<caseId>/field_evidence/<kind>/<uuid>-<ชื่อไฟล์>` */
const UNIQUE_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i

export interface EvidenceViewableFile {
  fileUrl: string
  originalName: string
  mimeType: string
}

/**
 * แปลง path หลักฐาน (เก็บเป็น `text[]` ไม่มี MIME) ให้ตัวเปิดไฟล์ใช้ได้ —
 * ชนิดหลัก (image/video/audio) มาจากช่องที่เก็บ ไม่ใช่การเดาจากนามสกุล
 */
export function fieldEvidenceFile(path: string, kind: FieldMediaKind): EvidenceViewableFile {
  const segment = path.split('/').pop() ?? path
  const name = segment.replace(UNIQUE_PREFIX, '') || segment
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  const subtype = extension === '' ? '*' : (SUBTYPE_ALIAS[extension] ?? extension)
  return { fileUrl: path, originalName: name, mimeType: `${KIND_MIME_PREFIX[kind]}${subtype}` }
}
