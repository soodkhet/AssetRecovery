import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  busyElementLocksModal,
  decideModalClose,
  discardAndClose,
  dropMarksDraft,
  inputMarksDraft,
  MODAL_BUSY_IGNORE,
  MODAL_DRAFT_IGNORE,
  MODAL_DRAFT_IGNORE_SELECTOR,
  modalGuardsBack,
  modalHasDraft,
} from '@/components/ui/modal-close-guard'

describe('decideModalClose', () => {
  it('ระหว่างบันทึก ปิดไม่ได้เลย แม้กรอกข้อมูลไว้หรือปิดการยืนยันทิ้ง', () => {
    expect(decideModalClose({ busy: true, dirty: false, confirmDiscard: true })).toBe('ignore')
    expect(decideModalClose({ busy: true, dirty: true, confirmDiscard: true })).toBe('ignore')
    expect(decideModalClose({ busy: true, dirty: true, confirmDiscard: false })).toBe('ignore')
  })

  it('กรอกข้อมูลแล้ว ต้องยืนยันก่อนทิ้ง', () => {
    expect(decideModalClose({ busy: false, dirty: true, confirmDiscard: true })).toBe('confirm-discard')
  })

  it('modal ที่ปิดการยืนยันทิ้ง ปิดได้ทันทีแม้กรอกแล้ว', () => {
    expect(decideModalClose({ busy: false, dirty: true, confirmDiscard: false })).toBe('close')
  })

  it('ยังไม่ได้กรอกอะไร ปิดได้ทันที', () => {
    expect(decideModalClose({ busy: false, dirty: false, confirmDiscard: true })).toBe('close')
  })
})

describe('busyElementLocksModal (R3-002 → R4-006)', () => {
  it('ปุ่มที่หมุนใน modal ล็อกเสมอ — รวมปุ่มบันทึกที่อยู่ใน body', () => {
    expect(busyElementLocksModal({ optedOut: false })).toBe(true)
  })

  it('ปุ่มย่อยที่ติด data-modal-busy="ignore" (ค้นหา) ไม่ล็อกทั้ง modal', () => {
    expect(busyElementLocksModal({ optedOut: true })).toBe(false)
    expect(MODAL_BUSY_IGNORE).toEqual({ 'data-modal-busy': 'ignore' })
  })
})

describe('discardAndClose (SV5-J1-01)', () => {
  it('มี onDiscard ⇒ ล้างร่างก่อนแล้วจึงปิด', () => {
    const calls: string[] = []
    discardAndClose({ onDiscard: () => calls.push('discard'), onClose: () => calls.push('close') })
    expect(calls).toEqual(['discard', 'close'])
  })

  it('ไม่มี onDiscard ⇒ ปิดอย่างเดียว', () => {
    const calls: string[] = []
    discardAndClose({ onDiscard: undefined, onClose: () => calls.push('close') })
    expect(calls).toEqual(['close'])
  })
})

describe('dropMarksDraft (ตรวจซ้ำ staging SV5-P1-01)', () => {
  it('ลากไฟล์วางในโซนที่รับไฟล์ ⇒ มีร่าง (ปิดแล้วถามทิ้ง)', () => {
    expect(dropMarksDraft({ handled: true, fileCount: 1 })).toBe(true)
  })

  it('วางนอกโซนที่รับ หรือไม่มีไฟล์ ⇒ ไม่นับ', () => {
    expect(dropMarksDraft({ handled: false, fileCount: 1 })).toBe(false)
    expect(dropMarksDraft({ handled: true, fileCount: 0 })).toBe(false)
  })
})

describe('modalHasDraft (mytester6 T-002)', () => {
  it('การแก้ด้วยปุ่มที่ผู้เรียกบอกเอง (dirty prop) นับเป็นร่างแม้ไม่มี input/change ⇒ ปิดต้องถามทิ้ง', () => {
    expect(modalHasDraft({ tracked: false, declared: true })).toBe(true)
    const dirty = modalHasDraft({ tracked: false, declared: true })
    expect(decideModalClose({ busy: false, dirty, confirmDiscard: true })).toBe('confirm-discard')
  })

  it('ไม่ส่ง dirty (false) ⇒ พฤติกรรมเดิมตาม input/change · โหมดไม่ถาม (confirmDiscard=false) ⇒ ปิดได้เลย', () => {
    expect(modalHasDraft({ tracked: true, declared: false })).toBe(true)
    expect(modalHasDraft({ tracked: false, declared: false })).toBe(false)
    expect(decideModalClose({ busy: false, dirty: true, confirmDiscard: false })).toBe('close')
  })
})

describe('inputMarksDraft — ส่วนที่บันทึกทันทีไม่นับเป็นร่าง (mytester6 T-018)', () => {
  it('ผู้ใช้กรอกช่องปกติ ⇒ มีร่าง', () => {
    expect(inputMarksDraft({ trusted: true, isSearch: false, savesImmediately: false })).toBe(true)
  })

  it('แนบไฟล์ที่ผูกเข้าล็อตทันที / ช่องค้นหา / ค่าที่โค้ดตั้ง ⇒ ไม่นับ', () => {
    expect(inputMarksDraft({ trusted: true, isSearch: false, savesImmediately: true })).toBe(false)
    expect(inputMarksDraft({ trusted: true, isSearch: true, savesImmediately: false })).toBe(false)
    expect(inputMarksDraft({ trusted: false, isSearch: false, savesImmediately: false })).toBe(false)
  })

  it('selector ตรงกับแอตทริบิวต์ที่ใส่ · ช่องแนบไฟล์ล็อตติดแอตทริบิวต์นี้', () => {
    expect(MODAL_DRAFT_IGNORE_SELECTOR).toBe(`[data-modal-draft="${MODAL_DRAFT_IGNORE['data-modal-draft']}"]`)
    const source = readFileSync(join(__dirname, '..', 'warehouse', 'attach-doc-modal.tsx'), 'utf8')
    expect(source).toMatch(/<input\s+\{\.\.\.MODAL_DRAFT_IGNORE\}\s+type="file"/)
  })
})

describe('modalGuardsBack — ปุ่ม Back ปิด modal แทนออกจากหน้า (mytester6 SV6-01)', () => {
  it('ไม่ส่ง closeOnBack ⇒ ตาม confirmDiscard (พฤติกรรมเดิมของ modal อื่น)', () => {
    expect(modalGuardsBack({ closeOnBack: undefined, confirmDiscard: true })).toBe(true)
    expect(modalGuardsBack({ closeOnBack: undefined, confirmDiscard: false })).toBe(false)
  })

  it('closeOnBack ชนะ confirmDiscard ทั้งสองทาง', () => {
    expect(modalGuardsBack({ closeOnBack: true, confirmDiscard: false })).toBe(true)
    expect(modalGuardsBack({ closeOnBack: false, confirmDiscard: true })).toBe(false)
  })

  it('Modal ผูก guardModalHistory ผ่าน modalGuardsBack · popup คำขอเปลี่ยนผู้รับผิดชอบส่ง closeOnBack', () => {
    const modal = readFileSync(join(__dirname, 'modal.tsx'), 'utf8')
    expect(modal).toMatch(/modalGuardsBack\(\{ closeOnBack: closeOnBackRef\.current, confirmDiscard: guardRef\.current\.confirmDiscard \}\)\s*\?\s*guardModalHistory\(/)
    const provider = readFileSync(join(__dirname, '..', 'field', 'reassignment-provider.tsx'), 'utf8')
    expect(provider).toMatch(/confirmDiscard=\{false\}\s+closeOnBack\s/)
  })
})
