import { sanitizeFileName } from '@/lib/cases/document-upload'
import { INTAKE_PHOTO_ANGLES, type IntakePhotoAngle } from '@/lib/warehouse/intake'

/**
 * รูปหลักฐานตอนรับเข้าคลัง 7 มุม (`44` §8.2 ขั้น 3/3) — **pure ล้วน**
 *
 * `assets.photos` เป็น `text[]` ของ **path ใน bucket** เท่านั้น (ไม่มีคอลัมน์เก็บ "มุม") ⇒ มุมของรูป
 * ถูกเข้ารหัสไว้ใน path เอง แล้วอ่านกลับด้วย {@link angleOfIntakePhoto} เวลาแสดงผล
 * ⇒ modal รับเข้าคลัง/ดูรายละเอียดเครื่องรู้ว่ารูปไหนเป็นมุมไหนโดยไม่ต้องแก้ schema/contract ของ 2.13
 *
 * ⚠️ จำนวนรูป **ไม่ block** (ดู `intake.ts` — `44` §12 ไม่มี code สำหรับ "รูปไม่ครบ")
 *    ที่นี่จึงมีแค่ตัวประกอบ**ข้อความเตือน** ไม่มีตัว throw
 */

/** โฟลเดอร์ย่อยใน bucket `case-documents` (bucket เดียวกับเอกสารเคส — ไม่ต้องตั้ง bucket ใหม่) */
const INTAKE_PHOTO_PREFIX = 'assets'
const INTAKE_PHOTO_SEGMENT = 'intake'

/**
 * path ของรูปมุมหนึ่ง — `assets/<assetId>/intake/<angle>/<uniqueKey>-<ชื่อไฟล์>`
 * `uniqueKey` ให้ผู้เรียกส่งเข้ามา (`crypto.randomUUID()`) เพื่อให้ฟังก์ชันนี้ยัง pure/เทสต์ได้
 */
export function intakePhotoPath(
  assetId: string,
  angle: IntakePhotoAngle,
  fileName: string,
  uniqueKey: string,
): string {
  return `${INTAKE_PHOTO_PREFIX}/${assetId}/${INTAKE_PHOTO_SEGMENT}/${angle}/${uniqueKey}-${sanitizeFileName(fileName)}`
}

/**
 * อ่านมุมกลับจาก path — คืน `null` เมื่อไม่ใช่ path ของรูปรับเข้าคลัง (เช่นรูปที่แนบไว้ก่อนมีโครงนี้)
 * รูปที่อ่านมุมไม่ได้ยัง**ต้องแสดงบนจอ** เสมอ (ดู {@link groupIntakePhotos} → `others`)
 */
export function angleOfIntakePhoto(path: string): IntakePhotoAngle | null {
  const segments = path.split('/')
  const index = segments.indexOf(INTAKE_PHOTO_SEGMENT)
  if (index === -1) return null
  const angle = segments[index + 1]
  return INTAKE_PHOTO_ANGLES.find((each) => each === angle) ?? null
}

export interface IntakePhotoGroups {
  /** path ของแต่ละมุม — มุมที่ยังไม่ถ่ายเป็น `null` (มุมเดียวกันถ่ายซ้ำ = เก็บรูปล่าสุด) */
  byAngle: Readonly<Record<IntakePhotoAngle, string | null>>
  /** รูปที่อ่านมุมไม่ได้ หรือมุมซ้ำที่ถูกแทนที่ — ยังต้องแสดงให้ครบ ห้ามทิ้ง */
  others: readonly string[]
  /** จำนวนมุมที่ถ่ายแล้ว (ไม่นับ `others`) */
  filledAngles: number
}

export function groupIntakePhotos(paths: readonly string[]): IntakePhotoGroups {
  const byAngle: Record<IntakePhotoAngle, string | null> = {
    front: null,
    back: null,
    top: null,
    bottom: null,
    left: null,
    right: null,
    imei: null,
  }
  const others: string[] = []

  for (const path of paths) {
    const angle = angleOfIntakePhoto(path)
    if (angle === null) {
      others.push(path)
      continue
    }
    const previous = byAngle[angle]
    if (previous !== null) others.push(previous)
    byAngle[angle] = path
  }

  return {
    byAngle,
    others,
    filledAngles: INTAKE_PHOTO_ANGLES.filter((angle) => byAngle[angle] !== null).length,
  }
}

/** เรียงรูปกลับเป็น array เดียวตามลำดับมุมของ `INTAKE_PHOTO_ANGLES` แล้วต่อท้ายด้วยรูปที่ไม่มีมุม */
export function flattenIntakePhotos(groups: IntakePhotoGroups): string[] {
  const ordered = INTAKE_PHOTO_ANGLES.map((angle) => groups.byAngle[angle]).filter(
    (path): path is string => path !== null,
  )
  return [...ordered, ...groups.others]
}

/**
 * ข้อความเตือนเมื่อถ่ายไม่ครบ 7 มุม — **เตือนอย่างเดียว ห้าม block** (`44` §8.2 · `intake.ts`)
 * คืน `null` เมื่อครบทุกมุม
 */
export function intakePhotoWarning(filledAngles: number): string | null {
  if (filledAngles >= INTAKE_PHOTO_ANGLES.length) return null
  const missing = INTAKE_PHOTO_ANGLES.length - filledAngles
  return `ยังไม่ได้ถ่ายอีก ${missing} มุม (แนะนำให้ครบ ${INTAKE_PHOTO_ANGLES.length} มุม) — รับเข้าคลังต่อได้`
}
