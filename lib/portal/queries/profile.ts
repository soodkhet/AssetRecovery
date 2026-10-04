import type { PortalContext } from '@/lib/portal/guard'
import { serializePortalCompanyProfile, type PortalCompanyProfileDto } from '@/lib/portal/serializers'
import { prisma } from '@/lib/prisma'

/**
 * ข้อมูลบริษัทของผู้เรียก (`97` §6.6 · มติ O44 — ชื่อ + model ของ template เท่านั้น ไม่ส่งอัตรา/รหัส template)
 * · id บริษัทมาจาก session เสมอ (`ctx.companyId`) — ไม่มี path param ให้ชี้ไปบริษัทอื่น
 * · `null` = บริษัทถูกลบระหว่างทาง (ยามตรวจ active แล้วแต่กันไว้) — route ตอบ 403 ผ่าน `requirePortalRow()`
 */
export async function findPortalCompanyProfile(
  ctx: PortalContext,
): Promise<{ companyId: string; dto: PortalCompanyProfileDto } | null> {
  const company = await prisma.financeCompany.findFirst({
    where: { id: ctx.companyId, organizationId: ctx.user.organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      taxId: true,
      address: true,
      contactName: true,
      contactPhone: true,
      signerName: true,
      serviceFeeTemplate: { select: { name: true, model: true, deletedAt: true } },
    },
  })
  if (company === null) return null
  const template = company.serviceFeeTemplate
  return {
    companyId: company.id,
    dto: serializePortalCompanyProfile({
      ...company,
      serviceFeeTemplate:
        template === null || template.deletedAt !== null ? null : { templateName: template.name, model: template.model },
    }),
  }
}
