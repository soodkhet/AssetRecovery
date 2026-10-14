import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DocumentSlotField } from '@/components/warehouse/attach-doc-modal'
import { LOT_DOCUMENT_LABEL, lotDocumentSlots } from '@/lib/warehouse/lot-documents'

/**
 * ตรวจซ้ำ staging SV5-A11Y-A2-04 — ช่องไฟล์ของแต่ละเอกสารได้ชื่อ = ชื่อเอกสาร + คำบนปุ่ม (ไม่ใช่แค่ "เลือกไฟล์")
 * ⇒ ล็อตจัดส่งที่มี 2 ช่องชื่อไม่ซ้ำกัน · คำแนะนำของเอกสารเป็นคำอธิบายของช่อง
 */
function accessibleName(html: string): string {
  const input = html.match(/<input[^>]*type="file"[^>]*>/)?.[0] ?? ''
  const ids = input.match(/aria-labelledby="([^"]+)"/)?.[1]?.split(' ') ?? []
  return ids
    .map((id) => html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`))?.[1] ?? '')
    .join(' ')
    .trim()
}

describe('ช่องไฟล์เอกสารล็อตมีชื่อเอกสาร', () => {
  const slots = lotDocumentSlots({ type: 'we_deliver', status: 'pending_attach' })

  it('ล็อตจัดส่งมีหลายช่อง — แต่ละช่องชื่อขึ้นต้นด้วยชื่อเอกสาร และไม่ซ้ำกัน', () => {
    expect(slots.length).toBeGreaterThan(1)
    const names = slots.map((slot) =>
      accessibleName(
        renderToStaticMarkup(
          <DocumentSlotField slot={slot} uploading={false} disabled={false} onPick={() => {}} onView={() => {}} />,
        ),
      ),
    )
    slots.forEach((slot, index) => {
      expect(names[index]).toBe(`${LOT_DOCUMENT_LABEL[slot.document]} เลือกไฟล์`)
    })
    expect(new Set(names).size).toBe(names.length)
  })

  it('คำแนะนำผูกเป็นคำอธิบาย + บังคับแนบ', () => {
    const html = renderToStaticMarkup(
      <DocumentSlotField slot={slots[0]!} uploading={false} disabled={false} onPick={() => {}} onView={() => {}} />,
    )
    const describedBy = html.match(/<input[^>]*aria-describedby="([^"]+)"/)?.[1]
    expect(describedBy).toBeDefined()
    expect(html).toContain(`id="${describedBy}"`)
    expect(html).toMatch(/<input[^>]*aria-required="true"/)
  })
})
