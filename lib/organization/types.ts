/** DTO ของหน้า "ข้อมูลองค์กร" (มติ PO U99) — ใช้ร่วม route/หน้าจอ */
export interface OrganizationProfileDto {
  /** ใช้เป็นปลายทางอัปโหลดโลโก้ — server ตรวจซ้ำว่าเป็นองค์กรของผู้เรียกเสมอ */
  organizationId: string
  name: string
  nameEn: string | null
  taxId: string
  branchCode: string
  branchLabel: string
  /** ที่อยู่บรรทัดเดียว (พิมพ์บนเอกสาร) */
  address: string
  /** ที่อยู่แยกช่อง — ข้อมูลก่อน U99 = `null` ทุกช่อง (มีแต่บรรทัดรวม) */
  addressDetail: string | null
  addressSubdistrict: string | null
  addressDistrict: string | null
  addressProvince: string | null
  addressPostalCode: string | null
  phone: string | null
  email: string | null
  website: string | null
  vatRegistered: boolean
  /** path ของโลโก้ใน Storage — `null` = ไม่มีโลโก้ */
  logoPath: string | null
  /** signed URL อายุสั้นสำหรับแสดงตัวอย่างโลโก้ — ออกไม่ได้/ไม่มีโลโก้ = `null` */
  logoPreviewUrl: string | null
  /** รายการที่ยังเป็นค่าตัวอย่าง/ไม่ครบ — ว่าง = พร้อมออกเอกสารจริง */
  issues: string[]
  updatedAt: string
}
