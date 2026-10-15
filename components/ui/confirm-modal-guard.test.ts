import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * กันถดถอยกล่องยืนยัน (ตรวจซ้ำ staging SV5-P2-02)
 * - `<ConfirmModal>` ใช้กติกาเดียวกับ `<Modal>`: ห้ามปิด `confirmDiscard` (ไม่งั้น Back มือถือออกจากหน้า เหตุผลหาย)
 *   และปุ่มยกเลิกผ่าน `<ModalCancelButton>` (พิมพ์แล้วยกเลิก ⇒ ถามทิ้งเหมือน Esc/X/Back)
 */
const ROOT = join(__dirname, '..', '..')

describe('ConfirmModal — Back/ยกเลิก ผ่าน guard เดียวกับ Modal (SV5-P2-02)', () => {
  const source = readFileSync(join(ROOT, 'components/ui/modal.tsx'), 'utf8')
  const body = source.slice(source.indexOf('export function ConfirmModal('))
  const confirmModal = body.slice(0, body.indexOf('\n}\n'))

  it('ไม่ปิด confirmDiscard (guardModalHistory ทำงาน ⇒ Back ปิดกล่อง)', () => {
    expect(confirmModal).not.toMatch(/confirmDiscard=\{false\}/)
  })

  it('ปุ่มยกเลิกเป็น ModalCancelButton', () => {
    expect(confirmModal).toMatch(/<ModalCancelButton onClose=\{onClose\}>\{cancelLabel\}<\/ModalCancelButton>/)
  })
})
