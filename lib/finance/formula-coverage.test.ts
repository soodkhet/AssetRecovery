import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * ยามของ DoD Phase 3.1: **ทุกสูตรใน `docs/22` §6 ต้องมีบ้านใน `lib/finance/*` (หรือ `lib/field`)**
 *
 * เทสต์นี้อ่านหัวข้อ `### 6.x` จากเอกสารจริง แล้วเทียบกับตารางด้านล่าง — เพิ่มสูตรใหม่ใน `22`
 * โดยไม่ implement (หรือ implement โดยไม่ลงทะเบียนที่นี่) จะล้มทันที ไม่ปล่อยให้หลุดเงียบ ๆ
 */

const SPEC = readFileSync(
  fileURLToPath(new URL('../../docs/22-finance-calculation-spec.md', import.meta.url)),
  'utf8',
)

/** §6.x → ไฟล์ที่ implement สูตรนั้น (path จาก root repo) */
const FORMULA_HOME: Record<string, string> = {
  '6.1': 'lib/field/expense-calc.ts', // fuel PER_KM (re-export ที่ lib/finance/compensation-calc.ts)
  '6.2': 'lib/field/expense-calc.ts', // fuel DAILY_FLAT
  '6.3': 'lib/field/expense-calc.ts', // allowance × วันที่ลงพื้นที่จริง
  '6.4': 'lib/finance/compensation-calc.ts', // commission / no-success fee
  '6.5': 'lib/finance/service-fee-calc.ts', // SUCCESS_FEE
  '6.6': 'lib/finance/service-fee-calc.ts', // FLAT
  '6.7': 'lib/finance/service-fee-calc.ts', // HYBRID
  '6.8': 'lib/finance/vat-calc.ts', // VAT + snapshot อัตรา
  '6.9': 'lib/finance/wht-calc.ts', // WHT (Payee ชนะ Plan)
  '6.10': 'lib/finance/payout-calc.ts', // ยอดรวมรอบจ่าย
  '6.11': 'lib/finance/ar-calc.ts', // AR คงค้าง
  '6.12': 'lib/finance/gross-profit.ts', // กำไรขั้นต้น
  '6.13': 'lib/finance/advance-calc.ts', // ยอดคืนเงินทดรอง
}

function sectionNumbersInSpec(): string[] {
  const matches = SPEC.match(/^### (6\.\d+)/gm) ?? []
  return matches.map((line) => line.replace('### ', ''))
}

describe('`22` §6 — สูตรครบ 13 ตัว มีบ้านทุกตัว', () => {
  it('เอกสารมีสูตร 13 ตัวตามที่ Changelog v1 ระบุ', () => {
    expect(sectionNumbersInSpec()).toHaveLength(13)
  })

  it('ทุก §6.x ในเอกสารมีไฟล์ที่ implement ลงทะเบียนไว้', () => {
    expect(sectionNumbersInSpec().filter((section) => FORMULA_HOME[section] === undefined)).toEqual([])
  })

  it('ไม่มีรายการค้างในทะเบียนที่เอกสารไม่มีแล้ว', () => {
    const inSpec = new Set(sectionNumbersInSpec())
    expect(Object.keys(FORMULA_HOME).filter((section) => !inSpec.has(section))).toEqual([])
  })

  it('ไฟล์ที่ลงทะเบียนมีอยู่จริงและเป็น pure (ไม่ import prisma client / next)', () => {
    for (const [section, file] of Object.entries(FORMULA_HOME)) {
      const source = readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8')
      expect(source.length, `${section} → ${file}`).toBeGreaterThan(0)
      expect(source.includes("from '@/lib/prisma'"), `${section} → ${file} ต้องไม่แตะ Prisma`).toBe(false)
      expect(source.includes("from 'next/"), `${section} → ${file} ต้องไม่แตะ next runtime`).toBe(false)
    }
  })
})
