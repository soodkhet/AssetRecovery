import { emitAudit } from '@/lib/audit/audit'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  SETTING_ASSUMPTIONS,
  settingAssumptionStatuses,
  type SettingAssumptionKey,
  type SettingAssumptionStatusDto,
} from '@/lib/settings/assumptions'
import { listDocumentNumbering } from '@/lib/document-numbering/queries'
import { buddhistYear } from '@/lib/format/datetime'
import {
  settingAssumptionCurrentValues,
  type SettingAssumptionOverviewDto,
  type SettingAssumptionValueInputs,
} from '@/lib/settings/assumption-overview'
import { listBankFileFormats } from '@/lib/settings/queries/bank-file-formats'
import { listCostCenters } from '@/lib/settings/queries/cost-centers'
import { getFinancePolicy } from '@/lib/settings/queries/finance-policy'
import { listHolidays } from '@/lib/settings/queries/holidays'
import type { SettingsMutationContext } from '@/lib/settings/queries/shared'
import { listTaxProfiles } from '@/lib/settings/queries/tax-profiles'
import { listVatRates } from '@/lib/settings/queries/vat-rates'
import { getWhtPolicyOverview } from '@/lib/settings/queries/wht-policy'

/**
 * ป้าย "รอนักบัญชียืนยัน" บนหน้าตั้งค่า (มติ PO 07/10/2569 U140) — ชั้น DB
 * แถว `setting_assumption_confirmations` insert-only (trigger) · 1 แถวต่อองค์กรต่อรายการ (unique)
 */

const TARGET = 'setting_assumption_confirmations'

async function loadStatuses(organizationId: string): Promise<SettingAssumptionStatusDto[]> {
  const rows = await prisma.settingAssumptionConfirmation.findMany({
    where: { organizationId },
    select: { assumptionKey: true, confirmedAt: true, reason: true, confirmedByUser: { select: { fullName: true } } },
  })
  return settingAssumptionStatuses(
    rows.map((row) => ({
      assumptionKey: row.assumptionKey,
      confirmedAt: row.confirmedAt,
      reason: row.reason,
      confirmedByName: row.confirmedByUser.fullName,
    })),
  )
}

/** `GET /api/settings/assumptions` — ทุกรายการพร้อมสถานะยืนยัน (ลำดับตามทะเบียน) */
export async function listSettingAssumptions(organizationId: string): Promise<SettingAssumptionStatusDto[]> {
  return loadStatuses(organizationId)
}

/**
 * ค่าที่ใช้อยู่ของค่าตั้งแต่ละตัว (มติ PO 07/10/2569 U170 · BUG-180) — เรียก **query เดิม**ของแต่ละค่าตั้ง (อ่านอย่างเดียว)
 * แล้วส่งให้ `settingAssumptionCurrentValues()` สรุปเป็นข้อความ
 */
export async function loadSettingAssumptionValueInputs(
  organizationId: string,
  now: Date = new Date(),
): Promise<SettingAssumptionValueInputs> {
  const yearBe = buddhistYear(now) ?? now.getUTCFullYear() + 543
  const [whtPolicy, taxProfiles, holidays, vatRates, numbering, costCenters, bankFileFormats, financePolicy] =
    await Promise.all([
      getWhtPolicyOverview(organizationId, now),
      listTaxProfiles(organizationId, 'active'),
      listHolidays(organizationId, yearBe),
      listVatRates(organizationId, now),
      listDocumentNumbering(organizationId, now),
      listCostCenters(organizationId, 'active'),
      listBankFileFormats(organizationId, 'active'),
      getFinancePolicy(organizationId),
    ])
  const invoice = numbering.find((row) => row.docType === 'tax_invoice')
  return {
    whtPolicy: whtPolicy.current,
    taxProfiles: taxProfiles.map((profile) => ({
      name: profile.name,
      whtPct: profile.whtPct,
      whtMinThresholdSatang: profile.whtMinThresholdSatang,
    })),
    holidays: { yearBe, count: holidays.items.length },
    vatRatePct: vatRates.find((rate) => rate.isCurrent)?.ratePct ?? null,
    invoiceNumbering:
      invoice === undefined ? null : { pattern: invoice.pattern, nextNumberPreview: invoice.nextNumberPreview },
    costCenters: costCenters.map((center) => `${center.code} ${center.name}`),
    bankFileFormats: bankFileFormats.map((format) => ({ label: format.label, usable: format.usable })),
    writeOffToleranceSatang: financePolicy.writeOffToleranceSatang,
  }
}

/** `GET /api/settings/assumptions?include=current_value` — หน้ารวมในเมนูบัญชี (สถานะ + ค่าที่ใช้อยู่) */
export async function listSettingAssumptionOverview(
  organizationId: string,
  now: Date = new Date(),
): Promise<SettingAssumptionOverviewDto[]> {
  const [statuses, inputs] = await Promise.all([
    loadStatuses(organizationId),
    loadSettingAssumptionValueInputs(organizationId, now),
  ])
  const values = settingAssumptionCurrentValues(inputs)
  return statuses.map((status) => ({ ...status, currentValue: values[status.key] }))
}

/**
 * `POST /api/settings/assumptions/:key/confirm` — บัญชียืนยันว่านักบัญชีตอบแล้ว ⇒ ป้ายหาย
 * ยืนยันซ้ำ (หรือกดพร้อมกันสองคน) = คืนสถานะเดิม ไม่เขียนแถว/ audit ซ้ำ (idempotent)
 */
export async function confirmSettingAssumption(
  context: SettingsMutationContext,
  key: SettingAssumptionKey,
  now: Date = new Date(),
): Promise<SettingAssumptionStatusDto> {
  const organizationId = context.actor.organizationId
  const meta = SETTING_ASSUMPTIONS[key]
  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.settingAssumptionConfirmation.create({
        data: {
          organizationId,
          assumptionKey: key,
          reason: context.reason,
          confirmedAt: now,
          confirmedBy: context.actor.id,
        },
        select: { id: true },
      })
      await emitAudit(
        {
          organizationId,
          actorId: context.actor.id,
          actorRole: context.actor.roleName,
          action: 'create',
          targetType: TARGET,
          targetId: created.id,
          before: { assumption_key: key, confirmed: false },
          after: { assumption_key: key, label: meta.label, confirmed: true, confirmed_at: now.toISOString() },
          reason: context.reason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
          diffOnly: false,
        },
        tx,
      )
    })
  } catch (error) {
    // ยืนยันไปแล้ว (unique) — ไม่ใช่ error ของผู้ใช้ คืนสถานะปัจจุบัน
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
  }
  const statuses = await loadStatuses(organizationId)
  return statuses.find((status) => status.key === key)!
}
