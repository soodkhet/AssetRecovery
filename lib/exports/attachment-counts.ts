import { packAttachmentCount } from '@/lib/exports/pack'
import { prisma } from '@/lib/prisma'

/**
 * จำนวน PDF ที่แนบใน zip ต่อชุด — อ่านจาก `after_data.attachments` ของ audit `export` ที่บันทึกตอนสร้าง
 * (immutable — ไม่ต้องเพิ่มคอลัมน์ และชุดเก่าที่สร้างไปแล้วได้ค่าถูกย้อนหลัง · UAT BUG-167)
 * ใช้ร่วมระหว่างหน้าประวัติการส่งมอบ (`lib/exports/queries.ts`) กับรายงาน A3 (staging E-059) — ตัวเลขต้องตรงกัน
 */
export async function loadExportAttachmentCounts(
  organizationId: string,
  exportIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (exportIds.length === 0) return counts
  const audits = await prisma.auditLog.findMany({
    where: { organizationId, targetType: 'export_records', targetId: { in: [...exportIds] }, action: 'export' },
    orderBy: { createdAt: 'asc' },
    select: { targetId: true, afterData: true },
  })
  for (const audit of audits) {
    if (audit.targetId === null || counts.has(audit.targetId)) continue
    const after = audit.afterData
    if (after === null || typeof after !== 'object' || Array.isArray(after) || !('attachments' in after)) continue
    counts.set(audit.targetId, packAttachmentCount(after.attachments))
  }
  return counts
}
