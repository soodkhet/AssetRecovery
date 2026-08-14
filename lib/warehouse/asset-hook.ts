import type { AssetKind } from '@/lib/generated/prisma/enums'
import type { prisma } from '@/lib/prisma'

/**
 * Asset auto-create hook (`44` §6.1 · §9.1) — **1 เคส = 1 Asset เสมอ**
 *
 * เครื่องเกิดอัตโนมัติเมื่อเคสปิดแบบ `closed_success` แล้วเข้าคิว `pending_intake`
 * ⇒ "ปิดงานสำเร็จแล้วไม่มีเครื่องรอรับเข้าคลัง" เป็นไปไม่ได้ (คู่กับกติกา expense ของ `41` §6.6)
 *
 * ⚠️ ต้องเรียกใน `$transaction` **เดียวกับ**ที่เปลี่ยนสถานะเคส — ถ้าเคสปิดสำเร็จแต่ asset ไม่เกิด
 *    เกต Revenue ของ `19` §6.1 จะรอล็อตที่ไม่มีวันมี (เคสค้างเงียบ)
 * ⚠️ **idempotent**: เรียกซ้ำ (เช่น `resubmit_close_case` ของ `41` §10.1 ที่ปิดเคสเดิมอีกรอบ)
 *    ต้องไม่สร้างเครื่องใบที่สอง — กันด้วยการอ่านก่อนสร้างภายในทรานแซกชันเดียวกัน ซึ่งปลอดภัย
 *    เพราะทุกเส้นทางที่เรียกได้ล็อกแถวเคสไว้แล้ว (UPDATE `cases` มาก่อนในทรานแซกชันเดียวกัน)
 */

/** client ที่ใช้ได้ทั้ง `prisma` และ tx client จาก `prisma.$transaction()` (แบบเดียวกับโมดูลอื่น) */
export type WarehouseTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

const ASSET_KIND_LABELS: Readonly<Record<AssetKind, string>> = {
  smartphone: 'สมาร์ทโฟน',
  tablet: 'แท็บเล็ต',
}

/**
 * คำอธิบายเครื่องที่ snapshot ลง `assets.device_desc` (`44` §7.1 "ยี่ห้อ รุ่น สี") — **pure**
 * เคสที่ยังไม่ได้กรอกรุ่นใช้ชื่อชนิดทรัพย์แทน (ธุรการยังต้องเห็นว่ากำลังรับอะไรเข้าคลัง)
 */
export function buildDeviceDesc(kind: AssetKind | null, description: string | null): string {
  const trimmed = (description ?? '').trim()
  if (trimmed !== '') return trimmed
  return kind === null ? 'ไม่ระบุอุปกรณ์' : ASSET_KIND_LABELS[kind]
}

export interface EnsureAssetInput {
  organizationId: string
  caseId: string
  /** เวลาที่เคสปิด — snapshot ลง `assets.closed_at` (`44` §7.1) */
  closedAt: Date
  actorId: string
}

export interface EnsureAssetResult {
  assetId: string
  /** `false` = มีอยู่แล้ว (เรียกซ้ำ) — ผู้เรียกใช้ค่านี้ตัดสินใจว่าจะลง audit/แจ้งเตือนซ้ำหรือไม่ */
  created: boolean
}

/**
 * สร้างเครื่องรอรับเข้าคลังของเคสที่เพิ่งปิดสำเร็จ (ถ้ายังไม่มี)
 *
 * snapshot จากเคส ณ เวลาปิดงาน: `case_ref`, ชื่อลูกหนี้, คำอธิบายเครื่อง, IMEI/serial ตามสัญญา,
 * บริษัทไฟแนนซ์ — ต่อจากนี้ข้อมูลเคสเปลี่ยนก็ไม่กระทบใบที่ออกไปแล้ว (`92` §7.1)
 */
export async function ensureAssetForClosedCase(
  tx: WarehouseTxClient,
  input: EnsureAssetInput,
): Promise<EnsureAssetResult> {
  const existing = await tx.asset.findFirst({
    where: { caseId: input.caseId, deletedAt: null },
    select: { id: true },
  })
  if (existing !== null) return { assetId: existing.id, created: false }

  const source = await tx.case.findUniqueOrThrow({
    where: { id: input.caseId },
    select: {
      companyId: true,
      caseRef: true,
      debtorName: true,
      assetKind: true,
      assetDescription: true,
      imei: true,
      serialNo: true,
    },
  })

  const asset = await tx.asset.create({
    data: {
      organizationId: input.organizationId,
      caseId: input.caseId,
      companyId: source.companyId,
      caseRef: source.caseRef,
      // เคสที่ปิดงานสำเร็จผ่าน `assertReadyForReview()` มาแล้ว ⇒ มีชื่อลูกหนี้เสมอ (กันไว้ที่ชั้นนี้อีกชั้น)
      debtorName: source.debtorName ?? '(ไม่ระบุชื่อลูกหนี้)',
      deviceDesc: buildDeviceDesc(source.assetKind, source.assetDescription),
      imeiContract: source.imei,
      serialContract: source.serialNo,
      assetStatus: 'pending_intake',
      closedAt: input.closedAt,
      createdBy: input.actorId,
    },
    select: { id: true },
  })

  return { assetId: asset.id, created: true }
}
