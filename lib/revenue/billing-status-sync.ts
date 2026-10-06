import { emitAudit } from '@/lib/audit/audit'
import type { BillingBatchStatus } from '@/lib/generated/prisma/enums'
import { withDocumentedArTotals } from '@/lib/portal/documented-amounts'
import type { prisma } from '@/lib/prisma'
import { resolveBillingStatusAfterDocumentChange } from '@/lib/revenue/revenue'

/** ชนิด tx ของ client ที่ต่อ extension แล้ว (กับดัก `Prisma.TransactionClient` — REUSE_INDEX 14/08) */
export type BillingStatusSyncClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

/**
 * มติ O75 — ปรับสถานะรอบวางบิลให้ตรง**ยอดตามเอกสาร**หลังบันทึก/ยกเลิกใบลดหนี้-ใบเพิ่มหนี้ ·
 * เรียก**ใน transaction เดียวกับการบันทึกเอกสาร** (อ่านยอดผ่าน `tx` ⇒ เห็นเอกสารที่เพิ่งบันทึก) ·
 * กติกาจาก `resolveBillingStatusAfterDocumentChange()` (`23` §6.8) · เปลี่ยนจริงเท่านั้นจึงลง audit (เหตุผลบังคับ — กระทบเงิน)
 */
export async function syncBillingStatusWithDocuments(
  client: BillingStatusSyncClient,
  input: {
    organizationId: string
    billingBatchId: string
    actorId: string | null
    actorRole: string
    /** เอกสารต้นเหตุ — ใส่ใน reason ของ audit เพื่อ trace กลับได้ */
    sourceRef: string
    ipAddress: string | null
    userAgent: string | null
  },
): Promise<{ before: BillingBatchStatus; after: BillingBatchStatus } | null> {
  const batch = await client.billingBatch.findFirst({
    where: { id: input.billingBatchId, organizationId: input.organizationId, deletedAt: null },
    select: {
      id: true,
      status: true,
      totalSatang: true,
      receivedSatang: true,
      whtWithheldByCustomerSatang: true,
      bankFeeWrittenOffSatang: true,
    },
  })
  if (batch === null) return null
  const [documented] = await withDocumentedArTotals(input.organizationId, [batch], client)
  if (documented === undefined) return null
  const next = resolveBillingStatusAfterDocumentChange({ current: batch.status, ...documented })
  if (next === batch.status) return null

  // กันชนกับการรับเงินพร้อมกัน — เปลี่ยนเฉพาะเมื่อสถานะยังเป็นค่าที่อ่านมา
  const claimed = await client.billingBatch.updateMany({
    where: { id: batch.id, status: batch.status },
    data: { status: next, updatedBy: input.actorId },
  })
  if (claimed.count === 0) return null

  await emitAudit(
    {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: 'status_change',
      targetType: 'billing_batches',
      targetId: batch.id,
      before: { status: batch.status, documented_total_satang: documented.totalSatang },
      after: { status: next, documented_total_satang: documented.totalSatang, source_ref: input.sourceRef },
      reason:
        next === 'partially_paid'
          ? `ยอดตามเอกสารเพิ่มขึ้นจาก ${input.sourceRef} — รอบวางบิลมียอดค้างรับเพิ่ม`
          : `ยอดตามเอกสารลดลงจาก ${input.sourceRef} — รอบวางบิลรับชำระครบตามเอกสาร`,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      diffOnly: false,
    },
    client,
  )
  return { before: batch.status, after: next }
}
