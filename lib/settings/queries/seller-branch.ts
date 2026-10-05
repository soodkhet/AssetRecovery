import { emitAudit } from '@/lib/audit/audit'
import { formatBranch } from '@/lib/format/branch'
import { prisma } from '@/lib/prisma'
import type { SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { SellerBranchDto } from '@/lib/settings/types'

/**
 * สำนักงานใหญ่/สาขาของผู้ขาย (องค์กรเรา) — มติ PO 06/10/2569 U82 (ประมวลรัษฎากร ม.86/4)
 *
 * เก็บที่ `organizations.branch_code` คู่กับ `tax_id` · ค่าปัจจุบันใช้ตอน**ออกใบกำกับ**เท่านั้น
 * (snapshot ลง `tax_invoices.seller_branch_code`) ⇒ แก้ที่นี่ไม่กระทบใบที่ออกไปแล้ว
 * · แก้ได้เฉพาะผู้ถือ `manage_invoice_numbering` (ล็อก Superadmin — ค่าตั้งระดับองค์กรของใบกำกับ) + audit + เหตุผลบังคับ
 */

const TARGET = 'organizations'

const sellerSelect = { name: true, taxId: true, vatRegistered: true, branchCode: true } as const

function toDto(row: { name: string; taxId: string; vatRegistered: boolean; branchCode: string }): SellerBranchDto {
  return {
    name: row.name,
    taxId: row.taxId,
    vatRegistered: row.vatRegistered,
    branchCode: row.branchCode,
    branchLabel: formatBranch(row.branchCode),
  }
}

export async function getSellerBranch(organizationId: string): Promise<SellerBranchDto> {
  const row = await prisma.organization.findUnique({ where: { id: organizationId }, select: sellerSelect })
  // องค์กรของ session ต้องมีอยู่จริงเสมอ — ถ้าไม่มีคือข้อมูลเสีย ไม่ใช่ input ผิด
  if (row === null) throw new Error(`getSellerBranch: ไม่พบองค์กร ${organizationId}`)
  return toDto(row)
}

export async function updateSellerBranch(context: SettingsMutationContext, branchCode: string): Promise<SellerBranchDto> {
  const organizationId = context.actor.organizationId
  const before = await getSellerBranch(organizationId)

  return prisma.$transaction(async (tx) => {
    const row = await tx.organization.update({
      where: { id: organizationId },
      data: { branchCode },
      select: sellerSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: organizationId,
        before: { branch_code: before.branchCode },
        after: { branch_code: row.branchCode },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return toDto(row)
  })
}
