import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EMPTY_PAYEE_FIELDS, PayeeFieldsSection } from '@/components/payees/payee-fields-section'
import type { TaxProfileDto } from '@/lib/settings/types'

/** มติ PO U164 — ช่อง "กติกาภาษี (Tax Profile)" ในฟอร์มผู้ใช้/ผู้รับเงิน (ข้อความตามกรณีอยู่ใน `team-tax-rule.test.ts`) */
describe('<PayeeFieldsSection> ช่องกติกาภาษี', () => {
  const profile = { id: 'tp-1', name: 'ลดอัตรา 1%', whtPct: 1 } as TaxProfileDto

  function render(): string {
    return renderToStaticMarkup(
      <PayeeFieldsSection
        form={EMPTY_PAYEE_FIELDS}
        onChange={() => undefined}
        errors={{}}
        taxProfiles={[profile]}
        allowGrossUp={false}
        originalCondition={null}
        payoutSide="outsource"
      />,
    )
  }

  it('คำอธิบายใต้ช่องบอกว่าไม่ต้องเลือก + ตัวเลือกอื่นติดป้าย "(กำหนดเฉพาะคนนี้)"', () => {
    const html = render()
    expect(html).toContain('ไม่ต้องเลือก — เลือกเฉพาะกรณีคนนี้มีอัตราพิเศษ เช่น มีหนังสือลดอัตรา')
    expect(html).toContain('ลดอัตรา 1% · 1.00% (กำหนดเฉพาะคนนี้)')
  })

  it('ข้อความระบบเดิมหายไป — ระหว่างโหลดค่าตั้งแสดงสถานะโหลดแทน', () => {
    const html = render()
    expect(html).not.toContain('ยังไม่ผูก (ใช้ค่าเริ่มต้นตามประเภทผู้รับ')
    expect(html).toContain('กำลังโหลดค่าเริ่มต้น…')
    expect(html).not.toMatch(/§|ไฟล์ \d/)
  })
})
