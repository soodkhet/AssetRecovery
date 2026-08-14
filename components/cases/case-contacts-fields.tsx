'use client'

import { Button, Field, Input } from '@/components/ui'
import { digitsOnly } from '@/lib/cases/case'
import { emptyContact, type CaseContactForm } from '@/lib/cases/case-form'

/**
 * ผู้ติดต่ออื่น (`38` §6.1.3 · §7.3) — dynamic list พร้อมปุ่ม "+ เพิ่มผู้ติดต่อ" และปุ่มลบต่อแถว
 *
 * - ไม่จำกัดจำนวนแถว · 0 คนก็บันทึกได้ · แถวที่เพิ่มแล้วต้องกรอกครบทั้ง 3 ช่อง (บังคับที่ Zod ชุดกลาง)
 * - เบอร์ผู้ติดต่อกรองอักขระที่ไม่ใช่ตัวเลขทิ้งตั้งแต่ตอนพิมพ์ และจำกัด 10 หลัก (`38` §7.3)
 */
export function CaseContactsFields({
  contacts,
  onChange,
  errors,
}: {
  contacts: readonly CaseContactForm[]
  onChange: (next: CaseContactForm[]) => void
  /** error รายช่อง คีย์เป็น `contacts.<index>.<field>` (รูปแบบเดียวกับ Zod path) */
  errors: Readonly<Record<string, string>>
}) {
  function patch(index: number, next: Partial<CaseContactForm>): void {
    onChange(contacts.map((contact, position) => (position === index ? { ...contact, ...next } : contact)))
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
        <h3 className="text-sm font-bold text-slate-800">ผู้ติดต่ออื่น</h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange([...contacts, emptyContact(crypto.randomUUID())])}
        >
          + เพิ่มผู้ติดต่อ
        </Button>
      </div>

      {contacts.length === 0 ? (
        <p className="text-xs text-slate-400">
          ยังไม่มีผู้ติดต่ออื่น — ไม่บังคับ แต่ช่วยให้พนักงานภาคสนามติดต่อลูกหนี้ได้หลายทาง
        </p>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact, index) => (
            <div
              key={contact.key}
              className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <Field
                id={`contact-name-${contact.key}`}
                label="ชื่อ-นามสกุล"
                required
                error={errors[`contacts.${index}.contactName`]}
              >
                <Input
                  id={`contact-name-${contact.key}`}
                  value={contact.contactName}
                  invalid={errors[`contacts.${index}.contactName`] !== undefined}
                  onChange={(event) => patch(index, { contactName: event.target.value })}
                />
              </Field>
              <Field
                id={`contact-relationship-${contact.key}`}
                label="ความสัมพันธ์"
                required
                error={errors[`contacts.${index}.relationship`]}
              >
                <Input
                  id={`contact-relationship-${contact.key}`}
                  value={contact.relationship}
                  placeholder="เช่น บุตร, คู่สมรส, นายจ้าง"
                  invalid={errors[`contacts.${index}.relationship`] !== undefined}
                  onChange={(event) => patch(index, { relationship: event.target.value })}
                />
              </Field>
              <Field
                id={`contact-phone-${contact.key}`}
                label="เบอร์โทร"
                required
                error={errors[`contacts.${index}.contactPhone`]}
              >
                <Input
                  id={`contact-phone-${contact.key}`}
                  className="font-mono"
                  value={contact.contactPhone}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10 หลัก"
                  invalid={errors[`contacts.${index}.contactPhone`] !== undefined}
                  onChange={(event) => patch(index, { contactPhone: digitsOnly(event.target.value).slice(0, 10) })}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`ลบผู้ติดต่อแถวที่ ${index + 1}`}
                  onClick={() => onChange(contacts.filter((_, position) => position !== index))}
                >
                  🗑 ลบ
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
