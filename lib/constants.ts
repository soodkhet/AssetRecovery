/** ค่าคงที่ระดับแอป — ค่าที่เป็น business rule ต้องมาจาก settings (ไฟล์ 13) ไม่ใช่ที่นี่ */

export const APP_NAME = 'AssetRecovery'

/** เวลาแสดงผลทั้งระบบ (Rule 01 · `03` §6.5) — storage เป็น UTC เสมอ */
export const DISPLAY_TIMEZONE = 'Asia/Bangkok'

/** ส่วนต่างปี พ.ศ. − ค.ศ. — แสดงผลบนหน้าจอต้องเป็น พ.ศ. เท่านั้น */
export const BUDDHIST_YEAR_OFFSET = 543
