/**
 * staging E-068 — ข้อความของขั้น "บันทึกว่าส่งแล้ว" / "บันทึกว่าตอบรับแล้ว" ของชุดส่งสำนักงานบัญชี
 * แยกตาม action (เดิมขั้นตอบรับใช้ตัวอย่างหมายเหตุของขั้นส่ง + ปุ่มภาษาผสม "ยืนยัน Accepted")
 */
export type ExportHandoffAction = 'mark-sent' | 'accept'

export interface ExportHandoffText {
  /** ปุ่มบนแถว */
  rowLabel: string
  title: string
  confirmLabel: string
  noteHint: string
}

export const EXPORT_HANDOFF_TEXT: Readonly<Record<ExportHandoffAction, ExportHandoffText>> = {
  'mark-sent': {
    rowLabel: 'บันทึกว่าส่งแล้ว',
    title: 'บันทึกว่าส่งให้สำนักงานบัญชีแล้ว',
    confirmLabel: 'ยืนยันว่าส่งแล้ว',
    noteHint: 'เช่น ส่งทางอีเมลถึงผู้ทำบัญชี — บันทึกไว้ในประวัติการใช้งาน',
  },
  accept: {
    rowLabel: 'บันทึกว่าตอบรับแล้ว',
    title: 'บันทึกว่าสำนักงานบัญชีตอบรับแล้ว',
    confirmLabel: 'ยืนยันว่าตอบรับแล้ว',
    noteHint: 'เช่น ผู้ทำบัญชีตอบกลับทางอีเมลว่าได้รับครบ — บันทึกไว้ในประวัติการใช้งาน',
  },
}
