import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EVENT_NAMES, type DomainEventName } from '@/lib/api/event-names'
import { assertDomainEvent, EVENT_NAME_DIFFS, EVENT_REGISTRY, isDomainEvent } from '@/lib/api/events'

/**
 * ทะเบียน event ต้องครอบคลุมทุกชื่อที่ **ไฟล์ต้นทางของโมดูล** ประกาศไว้
 * (`38` §17.2 · `40` §17.2 · `41` §17.2 · `44` §14) — ส่วนที่ `45` §7 เขียนไม่ตรง ต้องถูกบันทึกไว้
 * ที่ `EVENT_NAME_DIFFS` ไม่ใช่หายไปเงียบ ๆ (PLAN §2.1)
 */

const EVENT_PREFIXES = ['case', 'assignment', 'expense', 'reassignment', 'asset', 'lot']
const EVENT_PATTERN = new RegExp(`\\b(?:${EVENT_PREFIXES.join('|')})\\.[a-z][a-z0-9_]*`, 'g')

function doc(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../docs/${file}`, import.meta.url)), 'utf8')
}

function sectionOf(file: string, from: string, to: string): string {
  const source = doc(file)
  const start = source.indexOf(from)
  const end = source.indexOf(to, start + 1)
  expect(start, `${file}: หา "${from}" ไม่เจอ`).toBeGreaterThan(-1)
  expect(end, `${file}: หา "${to}" ไม่เจอ`).toBeGreaterThan(start)
  return source.slice(start, end)
}

function eventsIn(file: string, from: string, to: string): string[] {
  return [...new Set(sectionOf(file, from, to).match(EVENT_PATTERN) ?? [])]
}

const SOURCE_EVENTS: Record<string, string[]> = {
  '38 §17.2': eventsIn('38-case-submission.md', '### 17.2 Events', '## 18.'),
  '40 §17.2': eventsIn('40-case-assignment-routing.md', '### 17.2 Events', '## 18.'),
  '41 §17.2': eventsIn('41-field-tracker-mobile.md', '### 17.2 Events', '## 18.'),
  '44 §14': eventsIn('44-asset-custody-handover.md', '## 14. Audit Log Requirements', '## 15.'),
}

const REFERENCE_EVENTS = eventsIn('45-case-warehouse-api-contracts.md', '## 7. Events', '## 8.')

describe('event registry ↔ ไฟล์ต้นทาง', () => {
  it.each(Object.entries(SOURCE_EVENTS))('ครอบคลุม event ทุกตัวของ %s', (_source, events) => {
    expect(events.length).toBeGreaterThan(0)
    expect(events.filter((name) => !isDomainEvent(name))).toEqual([])
  })

  it('event ที่มีเฉพาะใน `45` §7 ต้องถูกบันทึกส่วนต่างไว้ ไม่ใช่หายเงียบ', () => {
    const documented = new Set<string>(
      EVENT_NAME_DIFFS.flatMap((diff) => [diff.canonical, diff.alsoWrittenAs].filter((name) => name !== null)),
    )
    for (const name of REFERENCE_EVENTS) {
      if (isDomainEvent(name)) continue
      expect(documented.has(name), `\`45\` §7 มี "${name}" แต่ไม่มีในทะเบียนและไม่มีบันทึกส่วนต่าง`).toBe(true)
    }
  })

  it('ทุกส่วนต่างที่บันทึกไว้ ชี้ไปยังชื่อที่อยู่ในทะเบียนจริง', () => {
    for (const diff of EVENT_NAME_DIFFS) {
      expect(isDomainEvent(diff.canonical), diff.canonical).toBe(true)
      expect(diff.note.length).toBeGreaterThan(10)
    }
  })

  it('`45` §7 เขียน `asset.intake_confirmed` แต่ทะเบียนยึด `asset.intake` ตามไฟล์ต้นทาง 44 §14', () => {
    expect(REFERENCE_EVENTS).toContain('asset.intake_confirmed')
    expect(isDomainEvent('asset.intake_confirmed')).toBe(false)
    expect(isDomainEvent('asset.intake')).toBe(true)
  })
})

describe('ทะเบียน event', () => {
  it('ชื่อไม่ซ้ำและอยู่ในรูป <entity>.<action>', () => {
    expect(new Set<string>(EVENT_NAMES).size).toBe(EVENT_NAMES.length)
    for (const name of EVENT_NAMES) expect(name).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
  })

  it('ทุกชื่อมี metadata ครบ (module/source/description)', () => {
    for (const name of EVENT_NAMES) {
      const contract = EVENT_REGISTRY[name]
      expect(contract, name).toBeDefined()
      expect(contract.source.length, name).toBeGreaterThan(0)
      expect(contract.description.length, name).toBeGreaterThan(0)
    }
    expect(Object.keys(EVENT_REGISTRY)).toHaveLength(EVENT_NAMES.length)
  })

  it('assertDomainEvent ปฏิเสธชื่อนอกทะเบียน', () => {
    expect(assertDomainEvent('lot.confirmed')).toBe<DomainEventName>('lot.confirmed')
    // eslint-disable-next-line assetrecovery/no-unregistered-event -- ตั้งใจใช้ชื่อนอกทะเบียนเพื่อทดสอบตัวยาม
    expect(() => assertDomainEvent('lot.shipped')).toThrow(/ไม่มีในทะเบียน/)
  })
})
