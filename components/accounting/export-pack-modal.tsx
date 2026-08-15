'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Modal, Select, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { AccountingPeriodDto } from '@/lib/accounting/types'
import { exportVersionLabel, PACK_FILES } from '@/lib/exports/pack'
import type { ExportRecordDto } from '@/lib/exports/types'
import { fmtCount } from '@/lib/format/money'

/**
 * Modal "Export Pack" (`37` §8 · mockup `accounting.html` `export-pack`)
 *
 * แถบเตือน Critical Exception + รายชื่อไฟล์ที่จะอยู่ในชุด (grid 2 คอลัมน์) + ปุ่มดาวน์โหลด `.zip`
 * · ปุ่มยัง**กดได้**แม้มี critical เพราะสิทธิ์บล็อกจริงอยู่ที่ API (`EXPORT_BLOCKED_CRITICAL`) —
 *   UI แค่บอกล่วงหน้าว่าจะไม่ผ่าน (Rule 03: UI hide/disable เป็น UX ไม่ใช่ security)
 */
export function ExportPackModal({
  open,
  periods,
  onClose,
  onExported,
}: {
  open: boolean
  periods: readonly AccountingPeriodDto[]
  onClose: () => void
  onExported: (record: ExportRecordDto) => void
}) {
  const { showToast } = useToast()
  const [periodId, setPeriodId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const selected = periods.find((period) => period.id === periodId) ?? periods[0]
  const targetId = selected?.id ?? ''
  const criticalCount = selected?.criticalCount ?? 0

  async function submit(): Promise<void> {
    if (targetId === '') return
    setSaving(true)
    const result = await callApi<ExportRecordDto>(
      '/api/accounting/export-pack',
      jsonRequest('POST', { periodId: targetId, ...(note.trim() === '' ? {} : { note: note.trim() }) }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    const record = result.data
    if (record === undefined) return

    showToast({
      tone: 'success',
      title: `สร้างชุดเอกสาร ${record.periodLabel} ${record.versionLabel} แล้ว`,
      description: 'กำลังดาวน์โหลดไฟล์ .zip — ชุดนี้ถูกเก็บไว้ในประวัติแล้ว ดาวน์โหลดซ้ำได้เสมอ',
    })
    window.open(`/api/accounting/export-history/${record.id}/download`, '_blank', 'noreferrer')
    onExported(record)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`ส่งออก Accounting Pack${selected === undefined ? '' : ` — ${selected.periodLabel}`}`}
      description="ระบบสร้างไฟล์ CSV/XLSX ตามรูปแบบที่กำหนด แล้วรวมเป็นไฟล์ .zip พร้อมหน้าปกและ SHA-256"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ปิด
          </Button>
          <Button loading={saving} disabled={targetId === ''} onClick={() => void submit()}>
            ดาวน์โหลดไฟล์ (.zip)
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <Field label="รอบบัญชี" required>
          <Select value={targetId} onChange={(event) => setPeriodId(event.target.value)}>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.periodLabel} · {period.statusLabel}
              </option>
            ))}
          </Select>
        </Field>

        {criticalCount > 0 ? (
          <InlineAlert tone="error" title={`ไม่สามารถ Export ได้ — มี ${fmtCount(criticalCount)} Critical Exception เปิดอยู่`}>
            แก้ไขให้เรียบร้อยหรือขอ Authorized Exception จากผู้บริหารก่อน (ไฟล์ 34)
          </InlineAlert>
        ) : (
          <InlineAlert tone="success" title="ไม่มี Critical Exception — พร้อม Export">
            รายการระดับ warning ไม่บล็อกการส่งมอบ แต่ยังแสดงไว้ในไฟล์ 08_Document_Checklist.xlsx
          </InlineAlert>
        )}

        <InlineAlert tone="warning" title="Export ซ้ำจะเพิ่มเวอร์ชัน ไม่เขียนทับของเดิม">
          ชุดถัดไปของรอบนี้จะเป็นเวอร์ชันหลังจาก {exportVersionLabel(1)} เรียงขึ้นเรื่อย ๆ (`37` §6.2) —
          ทุกเวอร์ชันเก็บไว้เป็นหลักฐานว่าเคยส่งอะไรไปบ้าง
        </InlineAlert>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ไฟล์ที่จะอยู่ใน .zip</div>
          <div className="grid grid-cols-1 gap-2 font-mono text-xs text-slate-600 sm:grid-cols-2">
            {PACK_FILES.map((file) => (
              <div key={file.no} className={file.kind === 'xlsx' ? 'text-emerald-600' : undefined}>
                {file.kind === 'xlsx' ? '📊' : '📄'} {file.fileName}
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px] text-slate-400">+ หน้าปกชุดเอกสาร (00_Cover_Sheet.pdf) พร้อมค่า SHA-256</div>
        </div>

        <Field label="บันทึกช่วยจำ" hint="ไม่บังคับ — เก็บลง audit log คู่กับรายชื่อไฟล์และเวอร์ชัน">
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="เช่น ส่งรอบแก้ไขหลังสำนักงานบัญชีทักเรื่องยอด VAT"
          />
        </Field>
      </div>
    </Modal>
  )
}
