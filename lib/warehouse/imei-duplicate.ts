import { prisma } from '@/lib/prisma'

/**
 * มติ PO U129 — IMEI ของเคสตรงกับเครื่องที่**ยังไม่ส่งมอบ** (`uniq_assets_active_imei` — ยังอยู่ในคลัง/รอรับเข้า/อยู่ในล็อต)
 *
 * - ตอนส่งเคส/นำเข้าเคส = **เตือนในฟอร์มเท่านั้น ไม่บล็อก** (ข้อมูลประกอบใน `data` ไม่ใช่ error code — แบบเดียวกับ
 *   `assetIdentifierWarning` ของมติ U54) · เครื่องเดิมอาจส่งมอบก่อนเคสนี้ปิดงานก็ได้
 * - ตอนปิดงานสำเร็จ = บล็อกด้วย `IMEI_DUPLICATE_ACTIVE_ASSET` (`ensureAssetForClosedCase()`)
 *
 * ข้อความไม่ระบุเลขเคสของเครื่องเดิม — ผู้ส่งเคสอาจเป็นผู้ใช้ฝั่งบริษัทไฟแนนซ์ (ห้าม leak ข้อมูลข้ามบริษัท)
 */
export const ACTIVE_ASSET_IMEI_WARNING_MESSAGE =
  'IMEI นี้ตรงกับเครื่องอีกเครื่องที่ยังอยู่ในคลังหรือยังไม่ส่งมอบ — บันทึก/ส่งเคสได้ แต่จะปิดงานสำเร็จไม่ได้จนกว่าจะตรวจสอบกับคลัง'

/** IMEI (15 หลักที่ผ่าน `parseImei()` แล้ว) ที่ชนเครื่องที่ยังไม่ส่งมอบ — ไม่นับเครื่องของเคสเดียวกัน */
export async function findImeisWithActiveAsset(
  organizationId: string,
  imeis: readonly string[],
  excludeCaseId: string | null = null,
): Promise<Set<string>> {
  const unique = [...new Set(imeis)]
  if (unique.length === 0) return new Set()
  const rows = await prisma.asset.findMany({
    where: {
      organizationId,
      imeiContract: { in: unique },
      assetStatus: { not: 'handed_over' },
      deletedAt: null,
      ...(excludeCaseId === null ? {} : { caseId: { not: excludeCaseId } }),
    },
    select: { imeiContract: true },
  })
  return new Set(rows.flatMap((row) => (row.imeiContract === null ? [] : [row.imeiContract])))
}

/** ข้อความเตือนของเคสหนึ่ง — `null` = ไม่มี IMEI หรือไม่ชน */
export async function activeAssetImeiWarning(
  organizationId: string,
  imei: string | null,
  caseId: string | null,
): Promise<string | null> {
  if (imei === null) return null
  const hits = await findImeisWithActiveAsset(organizationId, [imei], caseId)
  return hits.has(imei) ? ACTIVE_ASSET_IMEI_WARNING_MESSAGE : null
}
