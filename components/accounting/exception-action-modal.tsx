'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Modal, RefText, Textarea, useToast } from '@/components/ui'
import type { ExceptionDto } from '@/lib/accounting/types'
import { callApi, jsonRequest } from '@/lib/api/types'
import { exceptionModuleLabel } from '@/lib/reports/dashboard'

/**
 * ปิดข้อยกเว้น (`resolve`) หรืออนุมัติยกเว้น (`authorize`) — `34` §14 · mockup `authorize-exception`
 *
 * ⚠️ สองปุ่มนี้ **คนละความหมายและห้ามปนกัน** (`34` §6.3): `resolved` = แก้ต้นทางจริงแล้ว ·
 *    `authorized` = ผู้บริหารรับความเสี่ยงให้ข้ามได้ **เฉพาะรอบบัญชีนี้รอบเดียว** ปัญหายังอยู่
 * ⚠️ เหตุผลบังคับทั้งคู่ — ไม่กรอกฝั่ง authorize จะได้ `AUTHORIZED_EXCEPTION_REASON_REQUIRED` จาก API
 */

export type ExceptionActionKind = 'resolve' | 'authorize'

const COPY: Readonly<
  Record<ExceptionActionKind, { title: string; confirm: string; label: string; hint: string; placeholder: string }>
> = {
  resolve: {
    title: 'ปิดข้อยกเว้น (แก้ต้นทางแล้ว)',
    confirm: 'ยืนยันปิดข้อยกเว้น',
    label: 'แก้ไขอย่างไร',
    hint: 'ระบุให้ชัดว่าไปแก้อะไรที่โมดูลไหน เพื่อให้ตรวจย้อนได้ตอนสำนักงานบัญชีถามกลับ',
    placeholder: 'เช่น ขอใบเสร็จตัวจริงจากพนักงานแล้วแนบเข้ารายการเบิก PB-2569-0007 ครบทั้ง 3 ใบ',
  },
  authorize: {
    title: 'อนุมัติยกเว้น (ผู้บริหารเท่านั้น)',
    confirm: 'ยืนยันอนุมัติยกเว้น',
    label: 'เหตุผลที่ต้องยกเว้น',
    hint: 'บังคับกรอก — ระบบบันทึก audit พร้อมชื่อผู้อนุมัติ',
    placeholder: 'เช่น ต้องส่งชุดเอกสารให้ทันกำหนดยื่นภาษี จะตามใบเสร็จให้ครบภายในรอบถัดไป',
  },
}

export function ExceptionActionModal({
  exception,
  kind,
  onClose,
  onDone,
}: {
  exception: ExceptionDto | null
  kind: ExceptionActionKind
  onClose: () => void
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  if (exception === null) return null

  const copy = COPY[kind]
  const ready = note.trim() !== ''

  async function submit(): Promise<void> {
    if (exception === null || !ready) return
    setSaving(true)
    const result = await callApi<ExceptionDto>(
      `/api/exceptions/${exception.id}/${kind}`,
      kind === 'resolve'
        ? jsonRequest('PATCH', { resolutionNote: note.trim() })
        : jsonRequest('POST', { authorizeNote: note.trim() }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: kind === 'resolve' ? 'ปิดข้อยกเว้นแล้ว' : `อนุมัติยกเว้นสำหรับ ${exception.periodLabel} แล้ว`,
      description:
        kind === 'authorize'
          ? 'ปลดบล็อกเฉพาะรอบบัญชีนี้ — เดือนถัดไปถ้ายังไม่แก้จริงต้องบันทึกเป็นข้อยกเว้นใหม่'
          : undefined,
    })
    onDone()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      description={`${exception.periodLabel} · ${exceptionModuleLabel(exception.sourceModule)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            loading={saving}
            disabled={!ready}
            variant={kind === 'authorize' ? 'danger' : 'primary'}
            onClick={() => void submit()}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">{exception.title}</div>
          <p className="mt-1 text-xs text-slate-600">{exception.description}</p>
          {exception.sourceRef !== null && (
            <p className="mt-1 text-xs text-slate-400">
              อ้างอิง: <RefText>{exception.sourceRef}</RefText>
            </p>
          )}
        </div>

        {kind === 'authorize' && (
          <InlineAlert tone="error" title="นี่ไม่ใช่การแก้ปัญหา">
            อนุมัติยกเว้น = ยอมให้ส่งชุดเอกสารได้ทั้งที่ปัญหายังอยู่ และปลดบล็อกเฉพาะรอบบัญชีนี้เท่านั้น
            — ระบบจะแสดงแยกจากรายการที่ “แก้ไขแล้ว” เสมอ
          </InlineAlert>
        )}

        <Field id="exception-note" label={copy.label} required hint={copy.hint}>
          <Textarea
            id="exception-note"
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={copy.placeholder}
          />
        </Field>
      </div>
    </Modal>
  )
}
