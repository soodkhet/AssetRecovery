import type { CustomerWhtAgeBucket } from '@/lib/customer-wht/customer-wht'
import type { CustomerWhtStatus } from '@/lib/generated/prisma/enums'
import type { StatusBadgeGroup } from '@/lib/ui/status-badge'

/** รายการ 50 ทวิ ที่ลูกค้าหักเรา (มติ PO U40) — เงินเป็นสตางค์ · วันที่เป็น ISO UTC (หน้าจอแปลง พ.ศ. เอง) */
export interface CustomerWhtDto {
  id: string
  companyId: string
  companyName: string
  status: CustomerWhtStatus
  statusLabel: string
  statusGroup: StatusBadgeGroup
  /** ยอดที่ลูกค้าหักไว้ตอนโอน (จากเงินรับ) */
  withheldSatang: number
  /** วันที่รับเงิน */
  withheldDate: string
  ageDays: number
  ageBucket: CustomerWhtAgeBucket
  billingBatchId: string | null
  /** รอบวางบิลที่เกี่ยว (ข้อความที่คนอ่านรู้เรื่อง) */
  billingRef: string | null
  /** เลขที่ใบกำกับภาษีที่ยัง active ของรอบวางบิลนั้น */
  taxInvoiceNumbers: string[]
  cashReceiptId: string | null
  bankTransactionId: string | null
  certificateNumber: string | null
  certificateDate: string | null
  whtSatang: number | null
  grossSatang: number | null
  /** path ของไฟล์สแกนใน Storage (เปิดผ่าน URL ชั่วคราวของ server) */
  filePath: string | null
  note: string | null
  /** ยอดในหนังสือตรงยอดที่ถูกหักไหม — `null` = ยังไม่ได้รับหนังสือ */
  amountMatches: boolean | null
  receivedAt: string | null
  receivedByName: string | null
  createdAt: string
}

export interface CustomerWhtCompanySummary {
  companyId: string
  companyName: string
  pendingCount: number
  pendingSatang: number
}

export interface CustomerWhtListDto {
  items: CustomerWhtDto[]
  summary: {
    pendingCount: number
    pendingSatang: number
    receivedCount: number
    receivedSatang: number
  }
  /** ค้างรับต่อบริษัท (ทั้งองค์กร ไม่ขึ้นกับตัวกรองสถานะ/อายุ) — ใช้แสดงในหน้าบริษัทไฟแนนซ์ด้วย */
  byCompany: CustomerWhtCompanySummary[]
}

export interface CustomerWhtReceiveResultDto {
  certificate: CustomerWhtDto
  /** เตือนแต่ไม่บล็อก — ยอดในหนังสือไม่ตรงยอดที่ถูกหัก */
  warnings: string[]
}
