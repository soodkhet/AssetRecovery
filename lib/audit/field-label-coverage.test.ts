import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  auditComposedFieldLabel,
  auditEnumValueLabel,
  auditFieldLabel,
  auditFieldLabelIsWordByWord,
} from '@/lib/audit/field-display'

/**
 * mytester6 T-009 → ตรวจซ้ำ staging SV6-R-01 — ล็อกความครบ (แนวเดียวกับ `target-ref-coverage.test.ts`): ชื่อฟิลด์ที่ขึ้นตาราง
 * "ค่าก่อน / หลัง" ต้องแปลเป็นภาษาไทยที่อ่านรู้เรื่องได้ทุกตัว — ไม่หลุดเป็นชื่อภายใน และไม่เป็นผลแปลทีละคำหลายคำต่อกัน
 * ("รอบ ชื่อ" · "ทีม เปลี่ยน") ⇒ คีย์แบบนั้นต้องมีป้ายเฉพาะใน `field-display.ts`
 *
 * แหล่งชื่อฟิลด์ 2 ทาง:
 *  1. คีย์ที่ซอร์สเขียนลง audit (`app` · `lib` · `components` ไม่รวมเทสต์ · ไฟล์ที่เรียก audit helper) — ทุกรูปแบบชื่อ
 *     (snake/camel/คำเดียว · คีย์ย่อ `{ name }` · คีย์ในเงื่อนไข `...(x ? { k: v } : {})` · คีย์ของอ็อบเจกต์ซ้อน) จาก
 *     `before: { … }` / `after: { … }` / `details: { … }` (ข้อมูลเสริมของ `emitDocumentExportAudit`) /
 *     ตัวแปร `audit*` ที่ประกอบ payload (`const auditAfter = { … }` · `auditAfter.teamChanged = …`)
 *  2. ทุกคอลัมน์ในสคีมา (`prisma/schema.prisma` ไม่รวม relation) — payload แบบ snapshot แถว/diff ใช้ชื่อคอลัมน์ตรง ๆ
 * เพิ่มคีย์/คอลัมน์ใหม่ ⇒ ป้ายเฉพาะใน `field-display.ts` (หรือคำเดียวใน `field-tokens.ts`)
 */

const ROOT = resolve(__dirname, '..', '..')
const SOURCE_DIRS = ['app', 'lib', 'components']
const AUDIT_CALL = /emitAudit|AuditEntry|DocumentExportAudit/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'generated' || name === 'node_modules' ? [] : walk(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

/** เนื้อใน `{ … }` ที่จับคู่วงเล็บแล้ว เริ่มหลังวงเล็บเปิดที่ตำแหน่ง `start` */
function braceBlock(source: string, start: number): string {
  let depth = 1
  let index = start
  while (index < source.length && depth > 0) {
    const char = source[index]
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    index += 1
  }
  return source.slice(start, index)
}

/** ไฟล์ซอร์สที่เขียน audit (ไม่รวมโมดูลแสดงผลของ audit เอง) */
function auditSourceFiles(): { file: string; source: string }[] {
  return SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
    .filter((file) => !relative(ROOT, file).startsWith(join('lib', 'audit')))
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ source }) => AUDIT_CALL.test(source))
}

/** บล็อก payload ของ audit: `before|after|details: { … }` และ `audit<ชื่อ> = { … }` */
function auditPayloadBlocks(source: string): string[] {
  return [...source.matchAll(/\b(?:before|after|details|audit[A-Z]\w*)\s*(?::|=)\s*\{/g)].map((match) =>
    braceBlock(source, (match.index ?? 0) + match[0].length),
  )
}

/** ตัดข้อความใน string/template ทิ้ง (กันคำในข้อความถูกนับเป็นคีย์) */
function stripStrings(block: string): string {
  return block.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
}

function collectSourceKeys(): Map<string, string> {
  const found = new Map<string, string>()
  for (const { file, source } of auditSourceFiles()) {
    const add = (name: string | undefined): void => {
      if (name !== undefined && !found.has(name)) found.set(name, relative(ROOT, file))
    }
    for (const block of auditPayloadBlocks(source).map(stripStrings)) {
      for (const key of block.matchAll(/(?:^|[\s,{(])([A-Za-z_]\w*)\??\s*:(?!:)/g)) add(key[1])
      // คีย์ย่อ `{ name, status }`
      for (const key of block.matchAll(/(?:^|[{,])\s*([A-Za-z_]\w*)\s*(?=[,}])/g)) add(key[1])
    }
    for (const assign of source.matchAll(/\baudit(?:After|Before|Payload|Data|Details)\w*\.(\w+)\s*=(?!=)/g)) add(assign[1])
  }
  return found
}

function collectSchemaColumns(): string[] {
  const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8')
  const models = new Set([...schema.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]))
  const columns = new Set<string>()
  let inModel = false
  for (const line of schema.split('\n')) {
    if (/^model \w+ \{/.test(line)) {
      inModel = true
      continue
    }
    if (line.startsWith('}')) {
      inModel = false
      continue
    }
    if (!inModel || line.includes('@relation')) continue
    const parsed = /^\s+(\w+)\s+([A-Za-z]+)/.exec(line)
    const field = parsed?.[1]
    // relation ไม่มี `@relation` (ฝั่งรายการ `Case[]`) — ไม่ใช่คอลัมน์ ไม่ขึ้นใน payload
    if (field === undefined || models.has(parsed?.[2])) continue
    const mapped = /@map\("(\w+)"\)/.exec(line)?.[1]
    columns.add(mapped ?? field.replace(/([A-Z])/g, '_$1').toLowerCase())
  }
  return [...columns]
}

const THAI = /[฀-๿]/

/** แปลไม่ได้ (ชื่อเดิม/มี `_`/ไม่มีภาษาไทย) หรือได้แค่ผลแปลทีละคำหลายคำต่อกัน */
function untranslated(fields: Iterable<string>): string[] {
  return [...fields].filter((field) => {
    const label = auditFieldLabel(field)
    return label === field || label.includes('_') || !THAI.test(label) || auditFieldLabelIsWordByWord(field)
  })
}

describe('mytester6 T-009 / SV6-R-01 — ทุกชื่อฟิลด์ใน audit แปลเป็นไทยที่อ่านรู้เรื่อง', () => {
  const sourceKeys = collectSourceKeys()
  const schemaColumns = collectSchemaColumns()

  it('ตัวเก็บเจอคีย์/คอลัมน์หลักจริง (กันรูปแบบสแกนเพี้ยนแล้วเทสต์ผ่านลอย ๆ)', () => {
    for (const key of [
      'note_type',
      'failed_checks',
      'source_module',
      'mapping_rule',
      // SV6-R-01 — camel/คำเดียว/ข้อมูลเสริม/คีย์ในเงื่อนไข/ตัวแปร audit*
      'batch_name',
      'redownload',
      'attachments',
      'requested_id',
      'teamChanged',
      'travelOrigin',
      'invoice_status',
    ]) {
      expect(sourceKeys.has(key), key).toBe(true)
    }
    for (const column of ['allowance_satang', 'holiday_date', 'supervisor_can_assign_outsource', 'account_name']) {
      expect(schemaColumns.includes(column), column).toBe(true)
    }
    // relation ไม่ใช่คอลัมน์
    expect(schemaColumns.includes('case_assignments')).toBe(false)
    expect(sourceKeys.size).toBeGreaterThan(450)
    expect(schemaColumns.length).toBeGreaterThan(500)
  })

  it('คีย์ที่โค้ดเขียนลง audit ไม่ตกหล่น', () => {
    const missing = untranslated(sourceKeys.keys()).map(
      (key) => `${key} → ${auditFieldLabel(key)} ← ${sourceKeys.get(key) ?? ''}`,
    )
    expect(missing).toEqual([])
  })

  it('คอลัมน์ทุกตัวในสคีมาไม่ตกหล่น', () => {
    expect(untranslated(schemaColumns).map((column) => `${column} → ${auditFieldLabel(column)}`)).toEqual([])
  })
})

/**
 * mytester6 SV6-03 — ค่า enum ที่บันทึกลง audit (snapshot แถว/diff ใช้ค่า enum ตรง ๆ) ต้องแปลเป็นไทยได้ทุกค่า
 * ไล่ทุกคอลัมน์ในสคีมาที่ชนิดเป็น enum (`auditEnumValueLabel(ค่า, คอลัมน์, ตาราง)`) · เพิ่ม enum/ค่าใหม่ ⇒ เพิ่มป้ายใน
 * `field-display.ts` (ใช้ชุดเดียวกับหน้าจอของโมดูลนั้น) · ยกเว้น `audit_logs` (ตัวบันทึกเอง ไม่ใช่เป้าหมายของ audit)
 */
const ENUM_SCAN_EXCLUDED_TABLES = new Set(['audit_logs'])

function collectEnumColumns(): { table: string; column: string; values: string[] }[] {
  const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8')
  const enums = new Map<string, string[]>()
  for (const match of schema.matchAll(/^enum (\w+) \{([^}]*)\}/gm)) {
    const values = (match[2] ?? '')
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0] ?? '')
      .filter((value) => /^[A-Za-z0-9_]+$/.test(value))
    enums.set(match[1] ?? '', values)
  }
  const found: { table: string; column: string; values: string[] }[] = []
  let lines: string[] | null = null
  for (const line of schema.split('\n')) {
    if (/^model \w+ \{/.test(line)) {
      lines = []
      continue
    }
    if (lines === null) continue
    if (!line.startsWith('}')) {
      lines.push(line)
      continue
    }
    const table = lines.map((item) => /^\s*@@map\("(\w+)"\)/.exec(item)?.[1]).find((name) => name !== undefined)
    for (const item of lines) {
      const field = /^\s+(\w+)\s+(\w+)/.exec(item)
      const values = field?.[2] === undefined ? undefined : enums.get(field[2])
      if (field?.[1] === undefined || values === undefined || table === undefined) continue
      const column = /@map\("(\w+)"\)/.exec(item)?.[1] ?? field[1].replace(/([A-Z])/g, '_$1').toLowerCase()
      found.push({ table, column, values })
    }
    lines = null
  }
  return found
}

describe('mytester6 SV6-03 — ค่า enum ของทุกคอลัมน์แปลเป็นไทยได้', () => {
  const columns = collectEnumColumns()

  it('ตัวเก็บเจอคอลัมน์ enum หลักจริง', () => {
    const keys = new Set(columns.map((item) => `${item.table}.${item.column}`))
    for (const key of ['payee_profiles.payee_type', 'cases.status', 'billing_payout_cycles.type', 'assets.condition']) {
      expect(keys.has(key), key).toBe(true)
    }
    expect(columns.length).toBeGreaterThan(80)
  })

  it('ทุกค่า enum มีป้าย', () => {
    const missing = columns
      .filter((item) => !ENUM_SCAN_EXCLUDED_TABLES.has(item.table))
      .flatMap((item) =>
        item.values
          .filter((value) => auditEnumValueLabel(value, item.column, item.table) === null)
          .map((value) => `${item.table}.${item.column} = ${value}`),
      )
    expect(missing).toEqual([])
  })
})

/**
 * mytester6 SV6-03 — ชื่อที่แปลทีละคำแล้วอ่านไม่รู้เรื่อง (ตัวอย่างจากหน้าบันทึกการใช้งานบน staging) ต้องมีป้ายเฉพาะ
 * ไม่ใช่ผลแปลทีละคำ — กันป้ายเฉพาะถูกลบแล้วกลับไปเป็น "ที่อยู่ รหัสไปรษณีย์ รหัส"
 */
describe('mytester6 SV6-03 — ฟิลด์ผู้รับเงิน/ที่อยู่/ภาษี/ค่าตั้ง ใช้ป้ายเฉพาะ', () => {
  it.each([
    'address_postal_code',
    'branch_code',
    'id_document_url',
    'income_category_override',
    'name_title',
    'legal_name',
    'tax_profile_id',
    'wht_40_2_pct',
    'national_id',
    'advance_max_amount_per_request_satang',
    'replaces_document_id',
    'last_readiness_checked_at',
    'last_readiness_passed_count',
    'legacy_case_ids',
  ])('%s', (field) => {
    expect(auditFieldLabel(field)).not.toBe(auditComposedFieldLabel(field))
  })
})

/** ตรวจซ้ำ staging SV6-R-01 — ตัวอย่างที่หลุดบน staging (ข้อมูลเสริมของการส่งออก · คีย์ camel · คำเดียวที่อ่านไม่รู้เรื่อง) */
describe('ตรวจซ้ำ staging SV6-R-01 — ป้ายเฉพาะของคีย์ที่เคยแปลทีละคำ/เป็นอังกฤษ', () => {
  it.each([
    ['batch_name', 'ชื่อรอบจ่าย'],
    ['batch_status', 'สถานะรอบจ่าย'],
    ['invoice_status', 'สถานะใบกำกับภาษี'],
    ['company_status', 'สถานะบริษัท'],
    ['teamChanged', 'เปลี่ยนทีมจากที่ระบบเสนอ'],
    ['travelOrigin', 'จุดเริ่มเดินทาง'],
    ['requested_id', 'รหัสที่ขอเปิด'],
    ['redownload', 'ดาวน์โหลดซ้ำ'],
    ['attachments', 'เอกสารแนบในชุด'],
  ])('%s ⇒ %s', (field, label) => {
    expect(auditFieldLabel(field)).toBe(label)
    expect(auditFieldLabelIsWordByWord(field)).toBe(false)
  })

  it('ตัวตรวจผลแปลทีละคำ: หลายคำ = จริง · คำเดียว + คำนำหน้าจากคำท้าย = ไม่ใช่', () => {
    expect(auditFieldLabelIsWordByWord('zz_payee_team')).toBe(false) // แปลไม่ได้ (คำแรกไม่รู้จัก)
    expect(auditFieldLabelIsWordByWord('payee_team')).toBe(true)
    expect(auditFieldLabelIsWordByWord('cancelled_at')).toBe(false)
  })
})
