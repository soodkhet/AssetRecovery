/**
 * ใบเสร็จของรายการเบิกที่ "ตรวจแล้ว" (มติ PO 07/10/2569 U143) — **pure ล้วน** ใช้ร่วม FE/BE
 *
 * ใบเสร็จทุกช่องทาง (ค่าที่พัก · เบิกด้วยมือ · คำขอเบิกส่วนเกินจากการเคลียร์เงินทดรอง · ฉบับเซ็นของใบรับรอง
 * แทนใบเสร็จ) ต้องผ่าน `verifyUploadedFile()` ของ server (prefix · มีไฟล์จริง · magic bytes · ขนาด) และเก็บ
 * SHA-256 ที่ server คำนวณ (`receipt_file_hash`)
 *
 * ข้อมูลเก่าที่เป็น path พิมพ์เอง **ไม่ถูกลบ** แต่ถูกทำเครื่องหมาย `receipt_file_unverified = true` (migration
 * `20261008070000`) ⇒ ระบบถือว่า **ไม่มีไฟล์** (Export Pack `03_Expenses.receipt_file` · ความครบของเอกสาร)
 */

export interface ReceiptFileState {
  receiptFileUrl: string | null
  receiptFileHash: string | null
  receiptFileUnverified: boolean
}

/** ใบเสร็จนี้ผ่านการตรวจของ server ไหม — ไม่มี path / ไม่มี hash / ข้อมูลเก่าที่ทำเครื่องหมายไว้ = ไม่ผ่าน */
export function isReceiptVerified(state: ReceiptFileState): boolean {
  const path = state.receiptFileUrl?.trim() ?? ''
  return path !== '' && state.receiptFileHash !== null && !state.receiptFileUnverified
}

/** path ของใบเสร็จที่ตรวจแล้ว — `null` = ถือว่าไม่มีไฟล์ (รวมข้อมูลเก่าที่ไม่ผ่านการตรวจ) */
export function verifiedReceiptPath(state: ReceiptFileState): string | null {
  return isReceiptVerified(state) ? (state.receiptFileUrl?.trim() ?? null) : null
}

/** มี path ค้างอยู่แต่ไม่ผ่านการตรวจ (ข้อมูลเก่า) — ใช้ทำป้ายเตือนบนหน้าจอผู้อนุมัติ */
export function hasUnverifiedReceipt(state: ReceiptFileState): boolean {
  const path = state.receiptFileUrl?.trim() ?? ''
  return path !== '' && !isReceiptVerified(state)
}
