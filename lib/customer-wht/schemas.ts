import { z } from 'zod'
import { dateOnlySchema } from '@/lib/api/validation'
import { CUSTOMER_WHT_AGE_BUCKETS } from '@/lib/customer-wht/customer-wht'
import { MAX_STORAGE_PATH_LENGTH } from '@/lib/uploads/targets'

/**
 * Zod schema ชุดเดียวใช้ร่วม FE/BE ของ 50 ทวิ ที่ลูกค้าหักเรา (มติ PO 05/10/2569 U40) — Rule 13
 *
 * ⚠️ ไม่มี field ยอดที่ถูกหัก — ยอดนั้นมาจากเงินรับ (snapshot ตอนจับคู่) แก้จากหน้านี้ไม่ได้
 */

const uuidSchema = z.string().guid('รูปแบบรหัสไม่ถูกต้อง')

export const customerWhtStatusSchema = z.enum(['pending', 'received'])

export const customerWhtListQuerySchema = z.object({
  companyId: uuidSchema.optional(),
  status: customerWhtStatusSchema.optional(),
  /** อายุค้างรับนับจากวันที่รับเงิน */
  age: z.enum(CUSTOMER_WHT_AGE_BUCKETS).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

export const customerWhtReceiveSchema = z.object({
  certificateNumber: z.string().trim().min(1, 'กรอกเลขที่หนังสือรับรอง').max(50, 'เลขที่ยาวเกิน 50 ตัวอักษร'),
  certificateDate: dateOnlySchema('วันที่ในหนังสือรับรอง'),
  /** ยอดภาษีตามหนังสือ — ไม่ตรงยอดที่ถูกหัก = เตือน ไม่บล็อก */
  whtSatang: z.number().int('ยอดต้องเป็นสตางค์จำนวนเต็ม').positive('ยอดภาษีต้องมากกว่า 0'),
  /** ยอดเงินได้ (ก่อน VAT) ตามหนังสือ — ไม่บังคับ */
  grossSatang: z.number().int('ยอดต้องเป็นสตางค์จำนวนเต็ม').positive('ยอดเงินได้ต้องมากกว่า 0').nullish(),
  /** สแกนหนังสือจริง — บังคับ (อัปโหลดผ่าน server ก่อนบันทึก) */
  filePath: z.string().min(1, 'แนบไฟล์หนังสือรับรอง').max(MAX_STORAGE_PATH_LENGTH),
  note: z.string().trim().max(1000).nullish(),
})

export type CustomerWhtListQuery = z.infer<typeof customerWhtListQuerySchema>
export type CustomerWhtReceiveInput = z.infer<typeof customerWhtReceiveSchema>
export type CustomerWhtReceiveRequest = z.input<typeof customerWhtReceiveSchema>
