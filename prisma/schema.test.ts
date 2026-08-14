import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * ยามของ `prisma/schema.prisma` — จับการละเมิดกติกาที่ไม่มีอะไรอื่นจับได้
 *
 * ทำไมต้องเทสต์ที่ระดับไฟล์ schema: กติกาเงิน/วันเวลาเป็นเรื่อง **ชนิดคอลัมน์** ซึ่ง typecheck
 * จับไม่ได้ (Prisma generate ให้ type ตามที่เขียนไว้เสมอ) และกว่าจะรู้ว่าผิดคือตอนตัวเลขเพี้ยน
 * บน production แล้ว — เช่น `Float` กับเงิน = ปัดเศษเพี้ยนแบบไล่ย้อนไม่ได้ (`02` §2.2)
 */
const schema = readFileSync(new URL('./schema.prisma', import.meta.url), 'utf8')

/** บรรทัดที่เป็นนิยาม field จริง (ตัด comment / บรรทัดว่าง / directive ของ block) */
const fieldLines = schema
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('//') && !l.startsWith('///') && !l.startsWith('@@') && !l.startsWith('}'))

describe('schema.prisma — กติกาเงิน (`02` §2.2 · Rule 01)', () => {
  it('ทุก field ที่ลงท้าย Satang ต้องเป็น Int เท่านั้น', () => {
    const money = fieldLines.filter((l) => /^\w*[Ss]atang\s/.test(l))
    expect(money.length).toBeGreaterThan(0)
    for (const line of money) {
      expect(line, `money field ต้องเป็น Int: ${line}`).toMatch(/^\w+\s+Int\??\s/)
    }
  })

  it('ห้ามมี field ชนิด Float เลยแม้แต่ช่องเดียว', () => {
    // ตรวจเฉพาะบรรทัดนิยาม field — comment เตือนที่หัวไฟล์มีคำว่า Float ได้
    const floats = fieldLines.filter((l) => /^\w+\s+Float\??(\s|$)/.test(l))
    expect(floats, `ห้ามใช้ Float: ${floats.join(' | ')}`).toEqual([])
  })

  /**
   * Decimal อนุญาต 2 กรณีเท่านั้น (`02` §2.2): อัตราร้อยละ = `Decimal(5,2)` · พิกัด GPS = `Decimal(10,7)`
   * เงินห้ามเป็น Decimal เด็ดขาด — ดักที่ชื่อ field ไม่ให้มี Decimal ตัวใหม่หลุดมาโดยไม่ตั้งใจ
   */
  it('Decimal ใช้ได้เฉพาะ pct (5,2) และพิกัด GPS (10,7)', () => {
    const decimals = fieldLines.filter((l) => /\sDecimal\??\s/.test(l))
    expect(decimals.length).toBeGreaterThan(0)
    for (const line of decimals) {
      const isPct = /^\w*[Pp]ct\w*\s/.test(line)
      const isGeo = /^(latitude|longitude|\w+(Lat|Lng))\s/.test(line)
      expect(isPct || isGeo, `Decimal ใช้ได้เฉพาะ pct/พิกัด: ${line}`).toBe(true)
      expect(line, `${isPct ? 'pct ต้องเป็น @db.Decimal(5, 2)' : 'พิกัดต้องเป็น @db.Decimal(10, 7)'}: ${line}`).toMatch(
        isPct ? /@db\.Decimal\(5, 2\)/ : /@db\.Decimal\(10, 7\)/,
      )
    }
  })
})

describe('schema.prisma — กติกาวันเวลา (`02` §2.3 · Rule 01)', () => {
  it('ทุก DateTime ต้องระบุ @db.Timestamptz(6) หรือ @db.Date', () => {
    const dates = fieldLines.filter((l) => /^\w+\s+DateTime\??\s/.test(l))
    expect(dates.length).toBeGreaterThan(0)
    for (const line of dates) {
      expect(line, `DateTime ต้องระบุชนิดใน DB: ${line}`).toMatch(/@db\.(Timestamptz\(6\)|Date)/)
    }
  })
})

describe('schema.prisma — convention (`02` §2.1)', () => {
  it('ทุก model map ไปตารางชื่อ snake_case', () => {
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    expect(models.length).toBeGreaterThan(0)
    for (const model of models) {
      const name = model[1] ?? ''
      const map = (model[2] ?? '').match(/@@map\("([^"]+)"\)/)
      expect(map, `model ${name} ต้องมี @@map`).not.toBeNull()
      expect(map?.[1], `ชื่อตารางต้อง snake_case: ${map?.[1]}`).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('ทุก enum map ไปชื่อ snake_case', () => {
    const enums = [...schema.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    // 54 ตามสเปค + due_rule_type (มติ PO A5) + invoice_delivery_format (มติ PO 14/08/2569 — Phase 1.8)
    // + debtor_nationality / asset_kind (`38` §6.1.1/§6.2 — Phase 2.2)
    // + pending_reassignment_status / reassignment_resolution (`40` §6.1/§6.1.1 — Phase 2.6)
    // + travel_origin_source (`41` §6.4.1 — Phase 2.8)
    expect(enums.length).toBe(61)
    for (const enumBlock of enums) {
      const name = enumBlock[1] ?? ''
      const map = (enumBlock[2] ?? '').match(/@@map\("([^"]+)"\)/)
      expect(map, `enum ${name} ต้องมี @@map`).not.toBeNull()
      expect(map?.[1], `ชื่อ enum ต้อง snake_case: ${map?.[1]}`).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('ทุก field ที่ไม่ใช่ relation ต้อง map เป็น snake_case ถ้าชื่อเป็น camelCase', () => {
    const offenders = fieldLines
      .filter((l) => /^[a-z]+[A-Z]\w*\s+(String|Int|Boolean|DateTime|Decimal|Json)\??(\s|$)/.test(l))
      .filter((l) => !/@map\("/.test(l))
    expect(offenders, `field camelCase ต้องมี @map: ${offenders.join(' | ')}`).toEqual([])
  })

  /**
   * ทุกตารางต้องมี `organization_id` สำหรับ multi-tenant filter (`02` §2.4/§2.5)
   * ยกเว้นตามที่ `02` ระบุไว้เอง: root table, junction, ตาราง global, ตารางที่ PK = organization_id
   */
  it('ทุก model ต้องมี organizationId ยกเว้นรายการที่ `02` §2.4 ยกเว้นไว้', () => {
    const allowed = new Set(['Organization', 'Capability', 'RoleCapability', 'TeamManager', 'FinancePolicySettings'])
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    const offenders = models
      .filter((m) => !allowed.has(m[1] ?? ''))
      .filter((m) => !/^\s*organizationId\s/m.test(m[2] ?? ''))
      .map((m) => m[1])
    expect(offenders, `model ที่ขาด organizationId: ${offenders.join(' | ')}`).toEqual([])
  })
})

describe('migrations — constraint ที่ Prisma ไม่รองรับ (Rule 02)', () => {
  /**
   * CHECK / partial unique / generated column หลุดได้ง่ายมาก: `prisma migrate dev` เขียนไฟล์ใหม่ทับ
   * แล้วส่วนที่เติมด้วยมือหายไปเงียบๆ — ตารางยังสร้างได้ปกติ แต่กติกาเงิน/สถานะหลุดทั้งระบบ
   */
  const migrationsDir = new URL('./migrations/', import.meta.url)
  const sql = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(new URL(`${entry.name}/migration.sql`, migrationsDir), 'utf8'))
    .join('\n')

  it.each([
    // ห้ามเบิก Advance ซ้อน (`15` §9.2 — DEC-006/D7)
    'uniq_active_advance_per_payee',
    // A6 — IMEI ซ้ำได้เมื่อส่งมอบไปแล้ว แต่ห้ามซ้ำระหว่างที่ยังถืออยู่
    'uniq_assets_active_imei',
    'assets_identifier_required',
    // DEC-004 — polymorphic = separate FK + exactly-one non-null
    'adjustments_one_target',
    'bank_tx_one_match',
    'bank_tx_status_fk_shape',
    // A4 — payout item มาจาก expense หรือ advance อย่างใดอย่างหนึ่ง
    'pbi_one_source',
    // A2 — credit ↔ billing batch
    'bank_tx_alloc_shape',
    'bank_tx_alloc_amount_positive',
    // 1.1
    'cycles_cutoff_shape',
    'cycles_due_rule_shape',
    // 2.2 — `38` §11 กันเลขที่สัญญาซ้ำภายในบริษัทไฟแนนซ์เดียวกัน (ชั้นที่ 1 ของการกันซ้ำ 2 ชั้น)
    'uniq_cases_company_case_ref',
    // 2.6 — `40` §12 ห้ามมีคำขอเปลี่ยนผู้รับผิดชอบค้างซ้อนกันในเคสเดียว (REASSIGNMENT_ALREADY_PENDING)
    'uniq_pending_reassignment_active',
  ])('constraint `%s` ต้องอยู่ใน migration', (name) => {
    expect(sql).toContain(name)
  })

  it('advances.return_satang ต้องเป็น generated column (ห้ามให้ app เขียนค่าเอง)', () => {
    expect(sql).toMatch(/"return_satang" INTEGER GENERATED ALWAYS AS \(GREATEST\(0, COALESCE/)
  })

  it('updated_at ต้องมี DB default (Prisma @updatedAt ไม่ออก default ให้)', () => {
    expect(sql).toContain('ALTER COLUMN updated_at SET DEFAULT NOW()')
  })

  /**
   * `audit_logs` ห้าม UPDATE/DELETE เด็ดขาด (`02` §13 · `90` §17) — ต้องกันที่ DB ไม่ใช่แค่ service
   * trigger ต้องเป็น **STATEMENT-level** เพื่อให้ยิงแม้คำสั่งไม่ match แถวไหน และต้องคลุม TRUNCATE ด้วย
   */
  it.each(['trg_audit_logs_no_update', 'trg_audit_logs_no_delete', 'trg_audit_logs_no_truncate'])(
    'trigger `%s` ต้องอยู่ใน migration',
    (name) => {
      expect(sql).toContain(name)
    },
  )

  it('trigger ของ audit_logs ต้องเป็น FOR EACH STATEMENT ทั้งหมด', () => {
    const statements = sql.match(/CREATE TRIGGER trg_audit_logs_no_\w+[\s\S]*?;/g) ?? []
    expect(statements).toHaveLength(3)
    for (const statement of statements) {
      expect(statement, `trigger ต้องเป็น statement-level: ${statement}`).toContain('FOR EACH STATEMENT')
    }
  })
})
