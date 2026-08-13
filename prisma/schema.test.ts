import { readFileSync } from 'node:fs'
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

  it('Decimal ใช้ได้เฉพาะ rate_pct / wht_pct และต้องเป็น Decimal(5,2)', () => {
    const decimals = fieldLines.filter((l) => /\sDecimal\??\s/.test(l))
    expect(decimals.length).toBeGreaterThan(0)
    for (const line of decimals) {
      expect(line, `Decimal ต้องเป็น @db.Decimal(5, 2): ${line}`).toMatch(/@db\.Decimal\(5, 2\)/)
      expect(line, `Decimal ใช้ได้เฉพาะ pct: ${line}`).toMatch(/^(ratePct|whtPct|whtWithheldByCustomerPct)\s/)
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
    expect(enums.length).toBe(55) // 54 ตามสเปค + due_rule_type (มติ PO A5)
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
})
