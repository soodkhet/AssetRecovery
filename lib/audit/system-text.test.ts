import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  auditColumnMappingText,
  auditStoragePathText,
  auditStoredFileNameText,
  auditSystemReasonText,
  auditThrottleKeyText,
  jobRefText,
  jobTraceTag,
  serviceFeeSnapshotReason,
} from '@/lib/audit/system-text'
import { companyDocumentPrefix } from '@/lib/finance-companies/documents'
import { lotDocumentPrefix } from '@/lib/warehouse/lot-documents'
import { storagePath } from '@/lib/cases/document-upload'
import { debtorDocumentPurgeReason } from '@/lib/settings/data-retention'

/**
 * ตรวจซ้ำ staging SV6-R3-01 — ข้อความ/ค่าที่ระบบสร้างในบันทึกการใช้งานต้องเป็นไทยอ่านรู้เรื่อง (Rule 05)
 * แต่ยัง trace งานเบื้องหลังกลับได้ (Rule 03 — id เต็มอยู่ใน DB · หน้าจอย่อ 8 ตัว)
 */

const JOB_ID = 'e75d9d09-8c98-4937-afb7-c3206f37d834'

describe('SV6-R3-01 — ต้นทางข้อความใหม่', () => {
  it('ป้ายงานเบื้องหลังเก็บ id เต็ม (trace ได้) และไม่มีรูปแบบ [job: / job id', () => {
    expect(jobTraceTag(JOB_ID)).toBe(`(งานเบื้องหลัง #${JOB_ID})`)
    expect(jobRefText(JOB_ID)).toBe(`#${JOB_ID}`)
    const purge = debtorDocumentPurgeReason(JOB_ID, 5)
    expect(purge).toContain(JOB_ID)
    expect(purge).not.toMatch(/\[job:|job id/)
  })

  it('เหตุผลบันทึกค่าบริการตอนอนุมัติเคส — ไทยล้วน ระบุเทมเพลต/เวอร์ชัน', () => {
    const reason = serviceFeeSnapshotReason('ผสม 500 บาท + 3% (MT6)', 1)
    expect(reason).toBe('บันทึกค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "ผสม 500 บาท + 3% (MT6)" เวอร์ชัน 1')
    expect(reason).not.toMatch(/snapshot| v\d/)
  })

  it('ข้อความใหม่ผ่านตัวแสดงผลแล้ว id ย่อเหลือ 8 ตัว', () => {
    expect(auditSystemReasonText(`งานเบื้องหลัง "คำนวณ" ทำงานสำเร็จ (${jobRefText(JOB_ID)})`)).toBe(
      'งานเบื้องหลัง "คำนวณ" ทำงานสำเร็จ (#e75d9d09)',
    )
    expect(auditSystemReasonText(`คำนวณค่าน้ำมัน ${jobTraceTag(JOB_ID)} — กระจาย`)).toBe(
      'คำนวณค่าน้ำมัน (งานเบื้องหลัง #e75d9d09) — กระจาย',
    )
  })
})

describe('SV6-R3-01 — เหตุผลเดิม (audit immutable) แปลงตอนแสดง', () => {
  it('snapshot ค่าบริการ … v1 ⇒ บันทึกค่าบริการ … เวอร์ชัน 1 (รวมกรณีต่อท้ายเหตุผลอื่น)', () => {
    expect(auditSystemReasonText('snapshot ค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "ผสม 500 บาท + 3% (MT6)" v1')).toBe(
      'บันทึกค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "ผสม 500 บาท + 3% (MT6)" เวอร์ชัน 1',
    )
    expect(
      auditSystemReasonText('เปลี่ยนทีม: ใกล้กว่า · snapshot ค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "A" v12'),
    ).toBe('เปลี่ยนทีม: ใกล้กว่า · บันทึกค่าบริการอัตโนมัติตอนอนุมัติเคส — เทมเพลต "A" เวอร์ชัน 12')
  })

  it('(job id <uuid>) ⇒ (งานเบื้องหลัง #8 ตัว) · ทำต่อโดยงานเบื้องหลัง job id ⇒ ไม่พูดซ้ำ', () => {
    expect(
      auditSystemReasonText(`งานเบื้องหลัง "อัปเดตฐานยี่ห้อ/รุ่นจาก IMEI (TAC)" ทำงานสำเร็จ (job id ${JOB_ID})`),
    ).toBe('งานเบื้องหลัง "อัปเดตฐานยี่ห้อ/รุ่นจาก IMEI (TAC)" ทำงานสำเร็จ (งานเบื้องหลัง #e75d9d09)')
    expect(auditSystemReasonText(`ออกหนังสือรับรอง (ทำต่อโดยงานเบื้องหลัง job id ${JOB_ID})`)).toBe(
      'ออกหนังสือรับรอง (ทำต่อโดยงานเบื้องหลัง #e75d9d09)',
    )
    expect(auditSystemReasonText(`ตั้งงานเบื้องหลัง "X" (job id ${JOB_ID} · คีย์กันซ้ำ k-1)`)).toBe(
      'ตั้งงานเบื้องหลัง "X" (งานเบื้องหลัง #e75d9d09 · คีย์กันทำซ้ำ k-1)',
    )
  })

  it('[job:<id>] นำหน้า ⇒ ย้ายไปท้ายเป็น (งานเบื้องหลัง #…) · id ว่างตัดทิ้ง · id ที่ไม่ใช่ UUID คงเดิม', () => {
    expect(
      auditSystemReasonText(
        `[job:${JOB_ID}] คำนวณค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงรายวันของวันที่ 17/10/2569 — กระจายเท่ากันทุกเคสที่เช็คอินวันนั้น`,
      ),
    ).toBe('คำนวณค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยงรายวันของวันที่ 17/10/2569 — กระจายเท่ากันทุกเคสที่เช็คอินวันนั้น (งานเบื้องหลัง #e75d9d09)')
    expect(auditSystemReasonText('[job:] คำนวณระยะทาง')).toBe('คำนวณระยะทาง')
    expect(
      auditSystemReasonText('[job:advance_overdue] [จำลองวันที่ 01/11/2569] เลยกำหนดเคลียร์ยอดแล้วยังไม่เคลียร์ — มาร์คเป็น overdue อัตโนมัติ'),
    ).toBe('[จำลองวันที่ 01/11/2569] เลยกำหนดเคลียร์ยอดแล้วยังไม่เคลียร์ — เปลี่ยนเป็นเลยกำหนดเคลียร์อัตโนมัติ (งานเบื้องหลัง #advance_overdue)')
  })

  it('อัปเดตฐาน TAC แบบเดิม (รหัสชนิดงาน/uuid ในวงเล็บ) ⇒ ข้อความไทย', () => {
    expect(auditSystemReasonText(`งานเบื้องหลัง device_tac_sync (${JOB_ID}) อัปเดตฐาน TAC`)).toBe(
      'อัปเดตฐาน TAC อัตโนมัติ (งานเบื้องหลัง #e75d9d09)',
    )
    expect(auditSystemReasonText('งานเบื้องหลัง device_tac_sync (device_tac_sync) อัปเดตฐาน TAC')).toBe('อัปเดตฐาน TAC อัตโนมัติ')
    expect(auditSystemReasonText(`ผู้ดูแลสั่งอัปเดตฐาน TAC (${JOB_ID})`)).toBe('ผู้ดูแลสั่งอัปเดตฐาน TAC (งานเบื้องหลัง #e75d9d09)')
  })

  it('เหตุผลที่ผู้ใช้พิมพ์เอง/UUID ลอย ๆ ไม่ถูกแตะ', () => {
    expect(auditSystemReasonText('โอนผ่าน SCB Business Net แล้ว')).toBe('โอนผ่าน SCB Business Net แล้ว')
    expect(auditSystemReasonText(`id ${JOB_ID}`)).toBe(`id ${JOB_ID}`)
  })
})

describe('SV6-R3-01 — ค่าที่ระบบสร้างในตาราง "ค่าก่อน / หลัง"', () => {
  const CASE_ID = '816b715e-0a19-467e-bf81-a27b1d9a22c4'
  const KEY = '2de91006-08da-4460-8e01-96252cfc3985'

  it('path เอกสารเคส ⇒ ชนิดเอกสาร · ชื่อไฟล์ (ตัด uuid นำหน้า)', () => {
    expect(auditStoragePathText(storagePath(CASE_ID, 'national_id_doc', 'idcard16.jpg', KEY))).toBe(
      'บัตรประชาชน/Passport ลูกหนี้ · idcard16.jpg',
    )
    expect(auditStoragePathText(`cases/${CASE_ID}/product_photo/${KEY}-phone14.jpg`)).toBe('รูปสินค้า · phone14.jpg')
    expect(auditStoragePathText(`cases/${CASE_ID}/field_evidence/video/${KEY}-clip.mp4`)).toBe('หลักฐานปิดงาน — วิดีโอ · clip.mp4')
  })

  it('เอกสารบริษัท/ล็อต ⇒ ป้ายของชนิดเอกสาร · ไฟล์ชื่อ uuid ล้วน ⇒ "ไฟล์ PDF"', () => {
    expect(auditStoragePathText(`${companyDocumentPrefix(CASE_ID, 'vat_registration')}${KEY}.pdf`)).toBe(
      'ภ.พ.20 (ใบทะเบียนภาษีมูลค่าเพิ่ม) · ไฟล์ PDF',
    )
    expect(auditStoragePathText(`${lotDocumentPrefix(CASE_ID, 'signed_doc')}${KEY}.pdf`)).toBe(
      'ใบส่งมอบที่มีลายเซ็นผู้รับ · ไฟล์ PDF',
    )
    expect(auditStoragePathText(`${lotDocumentPrefix(CASE_ID, 'delivery_proof')}${KEY}.jpg`)).toBe(
      'หลักฐานส่งพัสดุ / Delivered · ไฟล์ JPG',
    )
  })

  it('ไม่ใช่ path ไฟล์ที่รู้จัก ⇒ null (ที่อยู่ API · ข้อความ · path ที่มี ..)', () => {
    expect(auditStoragePathText('GET /api/portal/cases')).toBeNull()
    expect(auditStoragePathText('sha_unchanged')).toBeNull()
    expect(auditStoragePathText('../../api/users')).toBeNull()
    expect(auditStoragePathText('https://x.test/cases/a/b/c.jpg')).toBeNull()
  })

  it('กุญแจจำกัดจำนวนครั้ง ⇒ ชื่อผู้ใช้/บัญชีผู้ใช้', () => {
    expect(auditThrottleKeyText('identifier:uat.temp2')).toBe('ชื่อผู้ใช้ uat.temp2')
    expect(auditThrottleKeyText(`user:${JOB_ID}`)).toBe('บัญชีผู้ใช้ #e75d9d09')
    expect(auditThrottleKeyText('อื่น')).toBeNull()
  })

  it('คอลัมน์ไฟล์โอน ⇒ ป้ายเดียวกับหน้าตั้งค่ารูปแบบไฟล์ · คอลัมน์ที่ไม่รู้จักคงเดิม', () => {
    expect(
      auditColumnMappingText('receiving_bank_code,receiving_account_no,receiving_account_name,amount,reference_no'),
    ).toBe('รหัสธนาคารผู้รับ, เลขบัญชีผู้รับ, ชื่อบัญชีผู้รับ, จำนวนเงิน, เลขที่อ้างอิง')
    expect(auditColumnMappingText('amount,xyz')).toBe('จำนวนเงิน, xyz')
    expect(auditColumnMappingText('xyz')).toBeNull()
  })
})

/**
 * กันถอยหลัง — ต้นทางเหตุผลที่ระบบสร้างต้องไม่กลับไปใช้รูปแบบ `[job:…]` / `job id …` / "snapshot ค่าบริการ…"
 * (สแกนข้อความใน string/template literal ของซอร์ส lib/app — ไม่นับคอมเมนต์และไฟล์ทดสอบ)
 */
const ROOT = join(__dirname, '..', '..')
const LEGACY_SOURCE_PATTERNS: readonly RegExp[] = [/\[job:/, /\bjob id\b/, /snapshot ค่าบริการอัตโนมัติ/]

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (entry === 'generated' || entry === 'node_modules') continue
    if (statSync(full).isDirectory()) files.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full)
  }
  return files
}

function literalTexts(source: string): string[] {
  const code = source
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .map((line) => line.replace(/\s\/\/\s.*$/, ''))
    .join('\n')
  return [...code.matchAll(/`[^`]*`|'[^'\n]*'|"[^"\n]*"/g)].map((match) => match[0])
}

describe('SV6-R3-01 — coverage: เหตุผลที่ระบบสร้างไม่มีรูปแบบเดิม', () => {
  it('ไม่มี [job: / job id / snapshot ค่าบริการอัตโนมัติ ในข้อความของซอร์ส (นอกจากตัวแปลงแถวเก่า)', () => {
    // ตัวสแกนเจอรูปแบบจริง (ตัวแปลงแถวเก่ามีข้อความเดิมอยู่) — กันเทสต์ผ่านลอย ๆ
    const converter = literalTexts(readFileSync(join(ROOT, 'lib', 'audit', 'system-text.ts'), 'utf8'))
    expect(converter.some((text) => LEGACY_SOURCE_PATTERNS[2]?.test(text) === true)).toBe(true)
    const offenders: string[] = []
    for (const file of [...sourceFiles(join(ROOT, 'lib')), ...sourceFiles(join(ROOT, 'app'))]) {
      if (file.endsWith(join('lib', 'audit', 'system-text.ts'))) continue
      for (const text of literalTexts(readFileSync(file, 'utf8'))) {
        if (LEGACY_SOURCE_PATTERNS.some((pattern) => pattern.test(text))) offenders.push(`${relative(ROOT, file)}: ${text}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('SV6-R4-01 — ช่องชื่อไฟล์ตัด UUID นำหน้าให้ตรงกับช่อง "ไฟล์"', () => {
  const KEY = 'b00d2446-08da-4460-8e01-96252cfc3985'

  it('ชื่อไฟล์ที่มี UUID นำหน้า ⇒ ชื่อเดิม · UUID ล้วน ⇒ "ไฟล์ <นามสกุล>"', () => {
    expect(auditStoredFileNameText(`${KEY}-idcard8.jpg`)).toBe('idcard8.jpg')
    expect(auditStoredFileNameText(`${KEY}.pdf`)).toBe('ไฟล์ PDF')
  })

  it('ชื่อไฟล์ปกติ (ไม่มี UUID นำหน้า) ⇒ null ให้แสดงค่าเดิม', () => {
    expect(auditStoredFileNameText('ภพ20-MT6.pdf')).toBeNull()
    expect(auditStoredFileNameText(`scan-${KEY}.pdf`)).toBeNull()
  })
})
