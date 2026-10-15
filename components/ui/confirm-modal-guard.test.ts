import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * กันถดถอยกล่องยืนยัน (ตรวจซ้ำ staging SV5-P2-02 / SV5-P2-03)
 * - `<ConfirmModal>` ใช้กติกาเดียวกับ `<Modal>`: ห้ามปิด `confirmDiscard` (ไม่งั้น Back มือถือออกจากหน้า เหตุผลหาย)
 *   และปุ่มยกเลิกผ่าน `<ModalCancelButton>` (พิมพ์แล้วยกเลิก ⇒ ถามทิ้งเหมือน Esc/X/Back)
 * - ช่องบังคับบอกด้วย `<Field required>` (* + aria-required) — ห้ามเขียน "(บังคับ)"/"(จำเป็น)" ไว้ท้าย label แทน
 */
const ROOT = join(__dirname, '..', '..')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sourceFiles(path, out)
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      out.push(path)
    }
  }
  return out
}

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

describe('label ช่องบังคับใช้ required ไม่เขียน "(บังคับ)" เอง (SV5-P2-03)', () => {
  it('ไม่มี label="…(บังคับ)" / "…(จำเป็น)"', () => {
    const offenders = ['app', 'components'].flatMap((dir) =>
      sourceFiles(join(ROOT, dir)).flatMap((file) => {
        const text = readFileSync(file, 'utf8')
        return /label=["{`][^"\n]*\((บังคับ|จำเป็น)\)/.test(text) ? [relative(ROOT, file)] : []
      }),
    )
    expect(offenders).toEqual([])
  })
})
