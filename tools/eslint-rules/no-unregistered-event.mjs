import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * กฎ ESLint — ห้ามใช้ชื่อ domain event ที่ไม่มีในทะเบียน (`lib/api/event-names.ts`)
 * ตาม Rule 04: "Event ชื่อตาม registry (`45` §7 + `27`) — เพิ่ม event ใหม่ต้องลง registry + lint ผ่าน"
 *
 * ตรวจ 2 จุดที่ชื่อ event โผล่ได้จริงในโค้ด:
 * 1. อาร์กิวเมนต์แรกของฟังก์ชันที่ส่ง event (`emitEvent` / `publishEvent` / `recordEvent` / `assertDomainEvent`)
 * 2. ค่าของ property ชื่อ `event` / `eventName` / `event_name`
 *
 * ทะเบียนถูกอ่านจากไฟล์ต้นทางด้วย regex (ไม่ import TS เข้ามาใน ESLint) — ไฟล์ทะเบียนจึงต้องคง
 * รูปแบบ string literal บรรทัดละตัวไว้เสมอ
 */

const REGISTRY_PATH = fileURLToPath(new URL('../../lib/api/event-names.ts', import.meta.url))
const EMITTER_NAMES = new Set(['emitEvent', 'publishEvent', 'recordEvent', 'assertDomainEvent'])
const EVENT_PROPERTY_NAMES = new Set(['event', 'eventName', 'event_name'])
/** ชื่อ event = `<entity>.<action>` ตัวพิมพ์เล็ก — กันไม่ให้ไปจับ path/ชื่อไฟล์/mime type */
const EVENT_SHAPE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

let cachedNames = null

function registeredEvents() {
  if (cachedNames !== null) return cachedNames
  const source = readFileSync(REGISTRY_PATH, 'utf8')
  const body = source.slice(source.indexOf('EVENT_NAMES = ['), source.indexOf('] as const'))
  cachedNames = new Set([...body.matchAll(/'([^']+)'/g)].map((match) => match[1]))
  return cachedNames
}

function checkNode(context, node) {
  if (node?.type !== 'Literal' || typeof node.value !== 'string') return
  if (!EVENT_SHAPE.test(node.value)) return
  if (registeredEvents().has(node.value)) return
  context.report({ node, messageId: 'unregistered', data: { name: node.value } })
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'ชื่อ domain event ต้องมีอยู่ใน lib/api/event-names.ts' },
    schema: [],
    messages: {
      unregistered:
        'event "{{name}}" ไม่มีในทะเบียน `lib/api/event-names.ts` — เพิ่มลงทะเบียน + ไฟล์ spec ต้นทาง (`45` §7) ในคอมมิตเดียวกัน',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        const name = callee.type === 'Identifier' ? callee.name : callee.property?.name
        if (name === undefined || !EMITTER_NAMES.has(name)) return
        checkNode(context, node.arguments[0])
      },
      Property(node) {
        const key = node.key
        const keyName = key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : undefined
        if (typeof keyName !== 'string' || !EVENT_PROPERTY_NAMES.has(keyName)) return
        checkNode(context, node.value)
      },
    }
  },
}

export default rule
