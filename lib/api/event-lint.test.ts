import { RuleTester } from 'eslint'
import rule from '../../tools/eslint-rules/no-unregistered-event.mjs'

/**
 * DoD ของ Phase 2.1 — "lint จับ event ชื่อนอก registry ได้จริง"
 * เทสต์นี้รันกฎจริงผ่าน `RuleTester` ของ ESLint (ไม่ใช่ mock)
 */

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 2024, sourceType: 'module' } })

ruleTester.run('assetrecovery/no-unregistered-event', rule, {
  valid: [
    { code: "emitEvent('lot.confirmed', { lotId })" },
    { code: "publishEvent('case.closed_success', payload)" },
    { code: "bus.emitEvent('asset.intake', payload)" },
    { code: "const job = { event: 'assignment.reassignment_timeout_resolved' }" },
    { code: "const meta = { eventName: 'expense.resubmitted' }" },
    // ไม่ใช่ชื่อ event — ห้ามฟ้องผิดจุด
    { code: "const file = { name: 'delivery.pdf' }" },
    { code: "fetch('/api/handover-lots')" },
    { code: "const label = { event: 'สร้าง Lot' }" },
  ],
  invalid: [
    {
      code: "emitEvent('lot.shipped', { lotId })",
      errors: [{ messageId: 'unregistered', data: { name: 'lot.shipped' } }],
    },
    {
      // ชื่อที่ `45` §7 เขียนไว้แต่ทะเบียนยึดไฟล์ต้นทาง 44 §14 (`asset.intake`)
      code: "emitEvent('asset.intake_confirmed', payload)",
      errors: 1,
    },
    {
      code: "await queue.add({ event_name: 'case.reopened' })",
      errors: 1,
    },
  ],
})
