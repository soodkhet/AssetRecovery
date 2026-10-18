import type { CaseFieldEvidenceDto } from '@/lib/cases/types'
import type { FieldMediaKind } from '@/lib/field/media-upload'
import { hasCapability } from '@/lib/auth/permission'
import type { SessionUser } from '@/lib/auth/types'
import { FIELD_REJECT_EVIDENCE_CAPABILITY } from '@/lib/field/permissions'

/**
 * ตัวช่วยหน้าตรวจหลักฐานปิดงานของเจ้าหน้าที่อนุมัติเคส (UAT BUG-045) — **pure ล้วน**
 * หน้าจอห้าม if สถานะเอง: ปุ่มตีกลับมาจาก {@link canRejectFieldEvidence} (UX เท่านั้น — API ตรวจซ้ำ)
 */

/**
 * ข้อความ "แก้ไขได้อะไรบ้าง" ของโหมดแก้ไขหลักฐาน (`needs_revision` — `41` §7.6 · mytester3 V3-02 / D-IN3-01)
 * · เช็คอิน + ผลการติดตามล็อก · สื่อหลักฐานแก้ได้ · จุดเริ่มเดินทางปรับได้ (ไม่ใช่หลักฐาน — แสดงเฉพาะทีมที่คิดค่าน้ำมันตามระยะทาง)
 * `showsTravelOrigin` — ฟอร์มพนักงานรู้โหมดค่าน้ำมันของทีม (`true`/`false`) · ฝั่งผู้อนุมัติไม่รู้ ⇒ `null` (บอกเงื่อนไขในข้อความ)
 */
export function revisionEditableHint(showsTravelOrigin: boolean | null): string {
  const editable =
    showsTravelOrigin === false
      ? 'รูป/วิดีโอ/เสียง/รูปสินค้า'
      : showsTravelOrigin === true
        ? 'รูป/วิดีโอ/เสียง/รูปสินค้า และจุดเริ่มเดินทาง'
        : 'รูป/วิดีโอ/เสียง/รูปสินค้า และจุดเริ่มเดินทาง (ทีมที่คิดค่าน้ำมันตามระยะทาง)'
  return `แก้ไขได้เฉพาะ${editable} — เช็คอินและผลการติดตามล็อกไว้ตามรอบเดิม`
}

/**
 * ป้ายรอบของกล่องหลักฐานปิดงาน (`38` §6.4 — tracking_round แสดงคู่ทุกจุด · mytester7 S7-AG1-02)
 * - เคสรอบเดียว (รอบ 1 ทั้งคู่) = ไม่มีป้าย (หน้าจอเดิม)
 * - หลักฐานเป็นของรอบก่อน (เคสรีไซเคิลแล้ว) = ป้าย "รอบที่ n (รอบก่อน)" + คำอธิบาย ไม่ให้เข้าใจว่าเป็นผลของรอบปัจจุบัน
 */
export function evidenceRoundBadge(
  evidenceRound: number | undefined,
  caseRound: number,
): { label: string; previousRound: boolean } | null {
  if (evidenceRound === undefined) return null
  if (evidenceRound < caseRound) return { label: `รอบที่ ${evidenceRound} (รอบก่อน)`, previousRound: true }
  if (evidenceRound <= 1 && caseRound <= 1) return null
  return { label: `รอบที่ ${evidenceRound}`, previousRound: false }
}

/** ตีกลับได้จากสถานะปิดงานเท่านั้น (`41` §8 `reject_evidence` · state `closed_success`/`closed_fail` → `needs_revision`) */
export function canRejectFieldEvidence(
  evidence: Pick<CaseFieldEvidenceDto, 'assignmentStatus' | 'evidenceStatus'> | null,
): boolean {
  if (evidence === null) return false
  // หลักฐานที่ผ่านอัตโนมัติแล้ว (คลังรับเข้า / ค่าตอบแทนอนุมัติ — มติ PO 03/10/2569 UAT Q14) ตีกลับไม่ได้
  if (evidence.evidenceStatus === 'approved') return false
  return evidence.assignmentStatus === 'closed_success' || evidence.assignmentStatus === 'closed_fail'
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

/**
 * ระดับการเห็นหลักฐานปิดงานในรายละเอียดเคส (pure) — `full` = ผู้ถือ `reject_evidence` (ทุกเคสที่เห็น) ·
 * `team` = ผู้จัดการ/หัวหน้าทีม อ่านอย่างเดียวเฉพาะงานของทีมตัวเอง (มติชั่วคราว M10) · `none` = ไม่เห็น
 */
export function fieldEvidenceAccess(user: SessionUser): 'full' | 'team' | 'none' {
  if (hasCapability(user, 'view', FIELD_REJECT_EVIDENCE_CAPABILITY)) return 'full'
  if (user.scope.kind === 'team' && user.scope.teamIds.length > 0) return 'team'
  return 'none'
}

