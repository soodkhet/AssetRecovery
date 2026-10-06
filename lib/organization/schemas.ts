import { z } from 'zod'
import { reasonSchema } from '@/lib/api/validation'
import { normalizeTaxId } from '@/lib/finance-companies/company'
import { BRANCH_CODE_PATTERN } from '@/lib/format/branch'
import { PLACEHOLDER_TAX_ID } from '@/lib/organization/profile'
import { MAX_STORAGE_PATH_LENGTH } from '@/lib/uploads/targets'

/**
 * Zod ชุดเดียวใช้ร่วม FE/BE ของหน้า "ข้อมูลองค์กร" (มติ PO U99 · Rule 04)
 *
 * - เลขประจำตัวผู้เสียภาษี: ตัวเลข 13 หลัก (ตรวจรูปแบบอย่างเดียว — แนวเดียวกับบริษัทไฟแนนซ์ ไม่มี checksum)
 *   และห้ามเป็นค่าตัวอย่างของ seed `0000000000000`
 * - ที่อยู่ตามที่จดทะเบียนบังคับครบ 5 ช่อง (พิมพ์บนใบกำกับภาษีทุกฉบับ — ม.86/4)
 * - ทุกการแก้ = กระทบเอกสารภาษี ⇒ `reason` บังคับ
 */

const blankToNull = (value: unknown): unknown => (typeof value === 'string' && value.trim() === '' ? null : value)

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `ข้อความยาวเกิน ${max} ตัวอักษร`).nullable().default(null))

const requiredText = (label: string, max: number) =>
  z
    .string({ error: () => `กรุณากรอก${label}` })
    .trim()
    .min(1, `กรุณากรอก${label}`)
    .max(max, `${label}ยาวเกิน ${max} ตัวอักษร`)

/** เว็บไซต์ — รับทั้งแบบมี/ไม่มี `https://` (เช่น `www.example.co.th`) · ห้ามมีช่องว่าง */
const WEBSITE_PATTERN = /^(https?:\/\/)?[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i

export const ORGANIZATION_REQUIRED_ADDRESS_FIELDS = ['detail', 'postalCode', 'province', 'district', 'subdistrict'] as const

export const organizationProfileFormSchema = z.object({
  name: requiredText('ชื่อบริษัท (ไทย)', 200).refine((value) => value.length >= 2, 'ชื่อบริษัทสั้นเกินไป'),
  nameEn: optionalText(200),
  taxId: z
    .string({ error: () => 'กรุณากรอกเลขประจำตัวผู้เสียภาษี' })
    .trim()
    .transform(normalizeTaxId)
    .refine((value) => /^\d{13}$/.test(value), 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก')
    .refine((value) => value !== PLACEHOLDER_TAX_ID, 'กรุณากรอกเลขประจำตัวผู้เสียภาษีจริง (ไม่ใช่ค่าตัวอย่าง)'),
  branchCode: z
    .string({ error: () => 'กรุณาระบุสำนักงานใหญ่/สาขา' })
    .trim()
    .refine((value) => BRANCH_CODE_PATTERN.test(value), 'รหัสสาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)'),
  addressDetail: requiredText('บ้านเลขที่/อาคาร/ถนน', 300),
  addressSubdistrict: requiredText('ตำบล/แขวง', 100),
  addressDistrict: requiredText('อำเภอ/เขต', 100),
  addressProvince: requiredText('จังหวัด', 100),
  addressPostalCode: z
    .string({ error: () => 'กรุณากรอกรหัสไปรษณีย์' })
    .trim()
    .refine((value) => /^\d{5}$/.test(value), 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก'),
  phone: requiredText('เบอร์โทรสำนักงาน', 20),
  email: z.preprocess(
    blankToNull,
    z.string().trim().max(255, 'อีเมลยาวเกินไป').email('รูปแบบอีเมลไม่ถูกต้อง').nullable().default(null),
  ),
  website: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(255, 'เว็บไซต์ยาวเกินไป')
      .refine((value) => WEBSITE_PATTERN.test(value), 'รูปแบบเว็บไซต์ไม่ถูกต้อง (เช่น www.example.co.th)')
      .nullable()
      .default(null),
  ),
  vatRegistered: z.boolean({ error: () => 'กรุณาระบุสถานะจดทะเบียนภาษีมูลค่าเพิ่ม' }),
  /** ผู้มีอำนาจลงนาม (มติ PO U151) — ไม่บังคับ · พิมพ์ใต้ช่องลายเซ็นฝั่งบริษัทบนเอกสารส่งออกนอก */
  authorizedSignerName: optionalText(200),
  authorizedSignerTitle: optionalText(200),
})
export type OrganizationProfileFormInput = z.input<typeof organizationProfileFormSchema>

export const organizationProfileUpdateSchema = organizationProfileFormSchema.extend({ reason: reasonSchema })
export type OrganizationProfileUpdateInput = z.infer<typeof organizationProfileUpdateSchema>

/** ผูกโลโก้ที่อัปโหลดแล้ว (path ที่ server ออกให้) — server ตรวจชนิด/ขนาดจากเนื้อไฟล์อีกชั้น */
export const organizationLogoSetSchema = z.object({
  path: z.string().trim().min(1, 'กรุณาเลือกไฟล์โลโก้').max(MAX_STORAGE_PATH_LENGTH),
  reason: reasonSchema,
})
export type OrganizationLogoSetInput = z.infer<typeof organizationLogoSetSchema>

export const organizationLogoRemoveSchema = z.object({ reason: reasonSchema })
export type OrganizationLogoRemoveInput = z.infer<typeof organizationLogoRemoveSchema>

/** ผูกรูปลายเซ็นผู้มีอำนาจที่อัปโหลดแล้ว (มติ PO U122) — server ตรวจชนิด/ขนาดจากเนื้อไฟล์อีกชั้น */
export const organizationSignatureSetSchema = z.object({
  path: z.string().trim().min(1, 'กรุณาเลือกไฟล์รูปลายเซ็น').max(MAX_STORAGE_PATH_LENGTH),
  reason: reasonSchema,
})
export type OrganizationSignatureSetInput = z.infer<typeof organizationSignatureSetSchema>

export const organizationSignatureRemoveSchema = z.object({ reason: reasonSchema })
export type OrganizationSignatureRemoveInput = z.infer<typeof organizationSignatureRemoveSchema>
