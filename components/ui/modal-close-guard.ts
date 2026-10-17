/**
 * ตัดสินว่าการปิด modal ที่ผู้ใช้สั่งเอง (Esc / คลิก backdrop / ปุ่ม X) ควรทำอะไร — preship audit PS-001
 *
 * - ระหว่างบันทึก (busy) ห้ามปิด: ถ้าปิดได้ ฟอร์มที่ mount เฉพาะตอนเปิดจะเสีย state `saving`
 *   แล้วเปิดใหม่ได้ปุ่มบันทึกที่กดได้ ทั้งที่ request แรกยังไม่จบ ⇒ ส่งคำขอซ้ำ
 * - ผู้ใช้กรอกข้อมูลไปแล้ว (dirty) ต้องยืนยันก่อนทิ้ง — คลิกพลาดครั้งเดียวไม่ควรทำให้ฟอร์มยาวหาย
 * การปิดที่โค้ดสั่งเอง (บันทึกสำเร็จแล้วตั้ง `open=false`) ไม่ผ่านตัวนี้ · ปุ่ม "ยกเลิก" ปกติก็ไม่ผ่าน ยกเว้น
 * `<ModalCancelButton>` (ฟอร์มที่เก็บร่าง — ตรวจซ้ำ staging SV5-J1-01: ทุกทางปิดใช้กติกาเดียว)
 */

export type ModalCloseDecision = 'ignore' | 'confirm-discard' | 'close'

/**
 * modal มีร่างที่ยังไม่บันทึกไหม — `tracked` = modal ตรวจเจอเองจาก input/change/drop · `declared` = ผู้เรียกบอกผ่าน
 * prop `dirty` (การแก้ด้วยปุ่มที่ไม่เกิด input/change เช่นย้ายจุด/ลบไฟล์ — mytester6 T-002) · อย่างใดอย่างหนึ่ง = มีร่าง
 */
export function modalHasDraft({ tracked, declared }: { tracked: boolean; declared: boolean }): boolean {
  return tracked || declared
}

export function decideModalClose({
  busy,
  dirty,
  confirmDiscard,
}: {
  busy: boolean
  dirty: boolean
  confirmDiscard: boolean
}): ModalCloseDecision {
  if (busy) return 'ignore'
  if (dirty && confirmDiscard) return 'confirm-discard'
  return 'close'
}

/**
 * ปุ่มที่กำลังหมุน (`aria-busy`) ถือเป็น "กำลังบันทึก" ของ modal ไหม — preship R3-002 → R4-006
 * ค่าเริ่มต้น = ล็อกเสมอ (ปุ่มบันทึกจริงอยู่ใน body ก็มี — R4-006: เดิมดูจากตำแหน่ง ทำให้ modal เอกสารบริษัท
 * ปิด/ทิ้งได้ระหว่างบันทึกแต่คำขอยังถูกส่ง) · ยกเว้นปุ่มย่อยที่ติด `data-modal-busy="ignore"` (ค้นหา/ดาวน์โหลด/โหลดตัวเลือก)
 */
export function busyElementLocksModal({ optedOut }: { optedOut: boolean }): boolean {
  return !optedOut
}

/** แอตทริบิวต์บนปุ่มย่อยใน modal ที่หมุนได้โดยไม่ล็อกทั้ง modal — `<Button {...MODAL_BUSY_IGNORE}>` */
export const MODAL_BUSY_IGNORE = { 'data-modal-busy': 'ignore' } as const

/**
 * ผู้ใช้ยืนยัน "ทิ้งข้อมูล" ⇒ ล้างร่างก่อน (ถ้าฟอร์มส่ง `onDiscard`) แล้วจึงปิด — ตรวจซ้ำ staging SV5-J1-01
 * (เดิมแค่ปิด ฟอร์มที่ค้าง mount เปิดใหม่แล้วร่างยังอยู่ ขัดกับข้อความ "ข้อมูลจะหายไป")
 */
export function discardAndClose({ onDiscard, onClose }: { onDiscard: (() => void) | undefined; onClose: () => void }): void {
  onDiscard?.()
  onClose()
}

/**
 * ลากไฟล์มาวางในโซนที่รับไฟล์ (`<FileDropzone onDropFile>` เรียก `preventDefault()`) ⇒ นับเป็น "มีร่าง" แบบเดียวกับคลิกเลือกไฟล์
 * — ตรวจซ้ำ staging SV5-P1-01: เดิม modal ฟังแค่ input/change ⇒ ลากวางอย่างเดียวแล้ว ยกเลิก/Esc ปิดไม่ถาม ไฟล์ค้างเมื่อเปิดใหม่
 * · วางที่อื่น (ไม่มีใครรับ = ไม่ `preventDefault`) หรือไม่มีไฟล์ (ลากข้อความ) ⇒ ไม่นับ
 * · ไม่ดู `isTrusted` (ต่างจาก input/change) — โค้ดแอปไม่ยิง drop เอง
 */
export function dropMarksDraft({ handled, fileCount }: { handled: boolean; fileCount: number }): boolean {
  return handled && fileCount > 0
}

/**
 * แอตทริบิวต์บนส่วนของ modal ที่ **บันทึกทันทีเมื่อเลือก/เปลี่ยนค่า** (เช่น แนบไฟล์แล้วผูกเข้าล็อตเลย)
 * ⇒ การกรอกในส่วนนี้ไม่นับเป็น "ข้อมูลที่ยังไม่บันทึก" ปิดแล้วไม่ถามทิ้งข้อมูล (mytester6 T-018)
 * — ใส่ที่ช่องหรือกล่องที่ห่อ: `<input {...MODAL_DRAFT_IGNORE}>`
 */
export const MODAL_DRAFT_IGNORE = { 'data-modal-draft': 'ignore' } as const

/** selector ที่ `<Modal>` ใช้ตรวจ `MODAL_DRAFT_IGNORE` ด้วย `closest()` */
export const MODAL_DRAFT_IGNORE_SELECTOR = '[data-modal-draft="ignore"]'

/**
 * การกรอก/เปลี่ยนค่าใน modal นับเป็น "มีร่าง" ไหม — ผู้ใช้ทำเอง (ไม่ใช่โค้ดตั้งค่า) · ไม่ใช่ช่องค้นหา
 * · ไม่อยู่ในส่วนที่บันทึกทันที (`MODAL_DRAFT_IGNORE`)
 */
export function inputMarksDraft({
  trusted,
  isSearch,
  savesImmediately,
}: {
  trusted: boolean
  isSearch: boolean
  savesImmediately: boolean
}): boolean {
  return trusted && !isSearch && !savesImmediately
}
