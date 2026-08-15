'use client'

import { useState } from 'react'
import { Button, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import type { AccountingPeriodDto, ExceptionDto } from '@/lib/accounting/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { ExceptionLevel } from '@/lib/generated/prisma/enums'
import { EXCEPTION_LEVEL_LABEL, EXCEPTION_MODULE_LABEL } from '@/lib/reports/dashboard'

/**
 * ฟอร์มสร้าง/แก้ไขข้อยกเว้น (`34` §8 · mockup `accounting.html` `new-exception`/`exception-form`)
 *
 * ⚠️ **ไม่มีช่อง "สถานะ"** ต่างจาก mockup โดยเจตนา — สถานะเปลี่ยนผ่าน `/resolve` หรือ `/authorize`
 *    เท่านั้น (`34` §14 · `23` §6.12) และ mockup ยังมี `in_progress` ที่ถูกตัดออกไปแล้ว (`34` §6.2)
 * ⚠️ **ไม่มีช่อง "ผู้รับผิดชอบ"** — `02` §9 ไม่มีคอลัมน์ owner (ตารางแสดงผู้บันทึกแทน)
 * ⚠️ แก้ไขได้เฉพาะรายการที่ยัง `open` — ปุ่มเรียกโมดัลนี้ถูกคุมด้วย `exceptionActionsFor()` แล้ว
 */

const LEVEL_HINT: Readonly<Record<ExceptionLevel, string>> = {
  info: 'บันทึกไว้เฉย ๆ ไม่บล็อกอะไร',
  warning: 'ควรแก้ แต่ยังส่งมอบ/ปิดงวดได้ (มีเตือนตลอด)',
  critical: 'บล็อกการส่งชุดเอกสารบัญชีจนกว่าจะแก้จริงหรือผู้บริหารอนุมัติยกเว้น',
}

const MODULE_OPTIONS = Object.entries(EXCEPTION_MODULE_LABEL)

export function ExceptionFormModal({
  open,
  editing,
  periods,
  onClose,
  onSaved,
}: {
  open: boolean
  /** `null` = สร้างใหม่ */
  editing: ExceptionDto | null
  periods: readonly AccountingPeriodDto[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [level, setLevel] = useState<ExceptionLevel>(editing?.level ?? 'warning')
  const [sourceModule, setSourceModule] = useState(editing?.sourceModule ?? 'expense')
  const [periodId, setPeriodId] = useState(editing?.periodId ?? '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [sourceRef, setSourceRef] = useState(editing?.sourceRef ?? '')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const isEdit = editing !== null
  const ready = title.trim() !== '' && description.trim() !== '' && sourceModule.trim() !== ''

  async function submit(): Promise<void> {
    if (!ready) return
    setSaving(true)
    const payload = {
      level,
      title: title.trim(),
      description: description.trim(),
      sourceModule,
      sourceRef: sourceRef.trim() === '' ? null : sourceRef.trim(),
    }
    const result = await callApi<ExceptionDto>(
      isEdit ? `/api/exceptions/${editing.id}` : '/api/exceptions',
      isEdit
        ? jsonRequest('PATCH', payload)
        : jsonRequest('POST', { ...payload, ...(periodId === '' ? {} : { periodId }) }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: isEdit ? 'บันทึกการแก้ไขข้อยกเว้นแล้ว' : 'บันทึกข้อยกเว้นใหม่แล้ว',
      description: result.data?.periodLabel,
    })
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `แก้ไขข้อยกเว้น — ${editing.periodLabel}` : 'บันทึกข้อยกเว้นใหม่'}
      description="ข้อยกเว้นผูกกับรอบบัญชีเสมอ และไม่สืบทอดข้ามรอบ — เดือนถัดไปที่ยังเจอปัญหาเดิมต้องบันทึกใหม่"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกข้อยกเว้น'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field id="exception-level" label="ระดับความสำคัญ" required hint={LEVEL_HINT[level]}>
          <Select
            id="exception-level"
            value={level}
            onChange={(event) => setLevel(event.target.value as ExceptionLevel)}
          >
            {(['info', 'warning', 'critical'] as const).map((value) => (
              <option key={value} value={value}>
                {EXCEPTION_LEVEL_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="exception-module" label="โมดูลต้นทาง" required>
          <Select
            id="exception-module"
            value={sourceModule}
            onChange={(event) => setSourceModule(event.target.value)}
          >
            {MODULE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {!isEdit && (
          <Field
            id="exception-period"
            label="รอบบัญชี"
            hint="ไม่เลือก = รอบของเดือนปัจจุบัน (ระบบเปิดรอบให้เองถ้ายังไม่มี)"
          >
            <Select id="exception-period" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              <option value="">รอบเดือนปัจจุบัน</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.periodLabel} · {period.statusLabel}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field id="exception-title" label="หัวข้อ" required>
          <Input
            id="exception-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="เช่น ใบเสร็จค่าที่พักหาย 3 รายการ"
          />
        </Field>

        <Field id="exception-description" label="รายละเอียดปัญหา" required>
          <Textarea
            id="exception-description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="อธิบายให้ชัดว่าเกิดกับรายการไหน ขาดอะไร และต้องทำอะไรถึงจะปิดได้"
          />
        </Field>

        <Field
          id="exception-ref"
          label="อ้างอิงรายการต้นทาง"
          hint="ไม่บังคับ — ใส่เลขอ้างอิงที่ตามกลับได้ เช่น เลขรอบจ่าย/เลขเคส"
        >
          <Input
            id="exception-ref"
            value={sourceRef}
            onChange={(event) => setSourceRef(event.target.value)}
            placeholder="เช่น PB-2569-0007"
          />
        </Field>
      </div>
    </Modal>
  )
}
