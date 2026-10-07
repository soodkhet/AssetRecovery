'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { SettingHelp } from '@/components/settings/setting-help'
import { MANAGE_INVOICE_NUMBERING } from '@/components/settings/shared'
import {
  Button,
  Card,
  Field,
  InlineAlert,
  Input,
  Modal,
  Select,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Textarea,
  Th,
  Tr,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import {
  MAX_DIGITS,
  MAX_PREFIX_LENGTH,
  MIN_DIGITS,
  describeDocumentNumberPattern,
  previewNextDocumentNumber,
} from '@/lib/document-numbering/format'
import type { DocumentNumberingDto } from '@/lib/document-numbering/types'
import { fmtCount } from '@/lib/format/money'
import { fmtDateTime } from '@/lib/format/datetime'
import { documentNumberingHelp } from '@/lib/settings/help'
import { documentNumberingUpdateSchema } from '@/lib/settings/schemas'

/**
 * แท็บ "เลขที่เอกสาร" (มติ PO 06/10/2569 U102 · `13` §6.12 · mockup `reference/settings.html` `renderSettingsNumbering`)
 * ตาราง ชนิด | รูปแบบ | ตัวอย่างเลขถัดไป | ออกล่าสุด | สถานะล็อก + modal แก้ไข
 *
 * · ตัวนับ (`currentSeq`) **ห้ามแก้มือ** — ตั้งได้แค่ "เลขลำดับถัดไป" ของเอกสารที่ไม่ใช่เอกสารภาษี (ห้ามต่ำกว่าเลขที่ใช้แล้ว)
 * · เอกสารภาษี (ใบกำกับภาษี/50 ทวิ) ล็อกรูปแบบหลังออกฉบับแรก — ปุ่มแก้ไขยังกดได้แต่ช่องรูปแบบปิด (API ตอบ
 *   `NUMBERING_FORMAT_LOCKED` อยู่แล้ว ที่นี่แค่ UX)
 * · ตัวอย่างเลขถัดไปคำนวณสดด้วย `previewNextDocumentNumber()` (pure module เดียวกับที่เทียบกับตัวเดินเลขจริง)
 * · capability = `manage_invoice_numbering` (ล็อก Superadmin) **ไม่ใช่** `manage_settings`
 */

interface FormState {
  prefix: string
  includeYear: boolean
  digits: string
  resetYearly: boolean
  nextSequence: string
  reason: string
}

const DIGIT_OPTIONS = Array.from({ length: MAX_DIGITS - MIN_DIGITS + 1 }, (_, index) => MIN_DIGITS + index)

function lockBadge(row: DocumentNumberingDto) {
  if (row.formatLocked) return <StatusBadge group="critical" label="ล็อกรูปแบบแล้ว" />
  if (row.isTaxDocument) return <StatusBadge group="pending" label="ล็อกเมื่อออกฉบับแรก" />
  return <StatusBadge group="success" label="เปลี่ยนได้ มีผลฉบับถัดไป" />
}

export function DocumentNumberingTab() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<DocumentNumberingDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const [editing, setEditing] = useState<DocumentNumberingDto | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchRows = useCallback(async () => callApi<DocumentNumberingDto[]>('/api/settings/document-numbering'), [])

  const reload = useCallback(async () => {
    const result = await fetchRows()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
    } else {
      setRows(result.data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [fetchRows])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchRows()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
      } else {
        setRows(result.data ?? [])
        setError(null)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchRows])

  function openForm(row: DocumentNumberingDto): void {
    setEditing(row)
    setForm({
      prefix: row.prefix,
      includeYear: row.includeYear,
      digits: String(row.digits),
      resetYearly: row.resetYearly,
      nextSequence: '',
      reason: '',
    })
    setErrors({})
  }

  function closeForm(): void {
    setEditing(null)
    setForm(null)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => {
      if (current === null) return current
      const next = { ...current, [key]: value }
      // รีเซ็ตทุกปีต้องมีปีในเลข — เอาปีออกแล้วปิดการรีเซ็ตให้ด้วย
      if (key === 'includeYear' && value === false) next.resetYearly = false
      return next
    })
  }

  async function save(): Promise<void> {
    if (form === null || editing === null) return
    const nextSequence = form.nextSequence.trim()
    const parsed = documentNumberingUpdateSchema.safeParse({
      prefix: form.prefix.trim().toUpperCase(),
      includeYear: form.includeYear,
      digits: Number(form.digits),
      resetYearly: form.resetYearly,
      ...(nextSequence === '' ? {} : { nextSequence: Number(nextSequence) }),
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<DocumentNumberingDto>(
        `/api/settings/document-numbering/${editing.docType}`,
        jsonRequest('PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        if (result.error.fields !== undefined) setErrors(result.error.fields)
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: `บันทึกเลขที่${editing.label}แล้ว`, description: 'มีผลกับเอกสารฉบับถัดไป' })
      closeForm()
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const preview =
    form === null || editing === null
      ? null
      : (() => {
          const digits = Number(form.digits)
          const typed = form.nextSequence.trim()
          const typedSeq = Number(typed)
          const useTyped = typed !== '' && Number.isInteger(typedSeq) && typedSeq >= 1
          const state = {
            prefix: form.prefix.trim().toUpperCase(),
            includeYear: form.includeYear,
            digits,
            resetYearly: form.resetYearly,
            currentSeq: useTyped ? typedSeq - 1 : editing.currentSeq,
            currentYear: useTyped ? null : editing.currentYear,
          }
          try {
            // พิมพ์เลขถัดไปเอง ⇒ แสดงตามเลขนั้น (ไม่สนการรีเซ็ตปี)
            return previewNextDocumentNumber(useTyped ? { ...state, resetYearly: false } : state, new Date())
          } catch {
            return '—'
          }
        })()

  const formatDisabled = editing?.formatLocked ?? false

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">เลขที่เอกสาร</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            คำนำหน้าและรูปแบบเลขของเอกสารทุกชนิดที่ระบบออก — ปีในเลขเอกสารเป็น พ.ศ. เสมอ
          </p>
        </div>
      </div>

      <InlineAlert tone="warning" title="เอกสารภาษีล็อกรูปแบบหลังออกฉบับแรก">
        ใบเสร็จรับเงิน/ใบกำกับภาษี และหนังสือรับรองการหักภาษี ณ ที่จ่าย ต้องมีเลขต่อเนื่องตามกฎหมาย — ตั้งรูปแบบก่อนออกฉบับแรก
        หลังจากนั้นเปลี่ยนไม่ได้ · เอกสารอื่นเปลี่ยนได้ มีผลกับฉบับถัดไป · ทุกการเปลี่ยนต้องระบุเหตุผลและบันทึกประวัติ
      </InlineAlert>

      {rows[0] !== undefined && (
        <SettingHelp
          className="mt-3"
          help={documentNumberingHelp({
            docType: rows[0].docType,
            state: rows[0],
            formatLocked: rows[0].formatLocked,
            at: new Date(),
          })}
        />
      )}

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>ชนิดเอกสาร</Th>
              <Th>รูปแบบ</Th>
              <Th>ตัวอย่างเลขถัดไป</Th>
              <Th>ออกล่าสุด</Th>
              <Th>สถานะล็อก</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TableState
            colSpan={6}
            loading={loading}
            error={error}
            isEmpty={rows.length === 0}
            emptyTitle="ยังไม่มีชุดเลขเอกสาร"
            onRetry={
              <Button
                variant="secondary"
                onClick={() => {
                  setLoading(true)
                  void reload()
                }}
              >
                ลองใหม่
              </Button>
            }
          />
          <TBody>
            {!loading &&
              error === null &&
              rows.map((row) => (
                <Tr key={row.docType}>
                  <Td>
                    <div className="font-semibold text-slate-900">{row.label}</div>
                    <div className="text-[11px] text-slate-400">ออกเลขเมื่อ{row.issuedWhen}</div>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-slate-700">{row.pattern}</span>
                    <div className="text-[11px] text-slate-400">
                      {row.resetYearly ? 'เริ่มนับใหม่ทุกปี พ.ศ.' : 'นับต่อเนื่อง'}
                    </div>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs font-bold text-emerald-700">{row.nextNumberPreview}</span>
                  </Td>
                  <Td>
                    {row.lastIssuedNumber === null ? (
                      <span className="text-xs text-slate-400">ยังไม่เคยออก</span>
                    ) : (
                      <>
                        <span className="font-mono text-xs font-bold text-slate-900">{row.lastIssuedNumber}</span>
                        {row.lastIssuedAt !== null && (
                          <div className="text-[11px] text-slate-400">{fmtDateTime(row.lastIssuedAt)}</div>
                        )}
                      </>
                    )}
                    {row.issuedCount !== null && row.issuedCount > 0 && (
                      <div className="text-[11px] text-slate-400">ออกแล้ว {fmtCount(row.issuedCount)} ฉบับ</div>
                    )}
                  </Td>
                  <Td>{lockBadge(row)}</Td>
                  <Td className="text-right">
                    <Can action="manage" resource={MANAGE_INVOICE_NUMBERING}>
                      <Button variant="secondary" onClick={() => openForm(row)}>
                        แก้ไข
                      </Button>
                    </Can>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <Modal
        open={editing !== null}
        onClose={closeForm}
        title={editing === null ? 'แก้ไขเลขที่เอกสาร' : `แก้ไขเลขที่${editing.label}`}
        description="มีผลกับเอกสารฉบับถัดไป — เอกสารที่ออกแล้วไม่เปลี่ยนเลข"
        footer={
          <>
            <Button variant="secondary" onClick={closeForm} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              บันทึกเลขที่เอกสาร
            </Button>
          </>
        }
      >
        {form !== null && editing !== null && (
          <div className="space-y-4">
            {formatDisabled && (
              <InlineAlert tone="warning" title="รูปแบบถูกล็อกแล้ว">
                ออกเอกสารภาษีชนิดนี้ไปแล้ว — เปลี่ยนคำนำหน้า/รูปแบบไม่ได้ เพื่อให้เลขต่อเนื่องตามกฎหมาย
              </InlineAlert>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="numbering-prefix"
                label="คำนำหน้า"
                error={errors.prefix}
                hint={`A-Z, 0-9 และขีดคั่นกลาง ไม่เกิน ${MAX_PREFIX_LENGTH} ตัว — ขีดระหว่างคำนำหน้า/ปี/ลำดับ ระบบใส่ให้`}
              >
                <Input
                  id="numbering-prefix"
                  value={form.prefix}
                  disabled={formatDisabled}
                  maxLength={MAX_PREFIX_LENGTH}
                  onChange={(event) => set('prefix', event.target.value.toUpperCase())}
                  className="font-mono"
                />
              </Field>
              <Field id="numbering-digits" label="จำนวนหลักของลำดับ" required error={errors.digits}>
                <Select
                  id="numbering-digits"
                  value={form.digits}
                  disabled={formatDisabled}
                  onChange={(event) => set('digits', event.target.value)}
                >
                  {DIGIT_OPTIONS.map((value) => (
                    <option key={value} value={String(value)}>
                      {value} หลัก
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.includeYear}
                  disabled={formatDisabled}
                  onChange={(event) => set('includeYear', event.target.checked)}
                  className="focus-ring h-4 w-4 rounded border-slate-300"
                />
                รวมปี พ.ศ. ในเลขเอกสาร
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.resetYearly}
                  disabled={formatDisabled || !form.includeYear}
                  onChange={(event) => set('resetYearly', event.target.checked)}
                  className="focus-ring h-4 w-4 rounded border-slate-300"
                />
                เริ่มนับลำดับใหม่ทุกปี พ.ศ.
              </label>
              {errors.resetYearly !== undefined && <p className="text-[11px] text-red-600">{errors.resetYearly}</p>}
            </div>

            {!editing.isTaxDocument && (
              <Field
                id="numbering-next"
                label="เลขลำดับถัดไป (ไม่บังคับ)"
                error={errors.nextSequence}
                hint={`เว้นว่าง = นับต่อจากเลขเดิม · ตั้งได้ตั้งแต่ ${fmtCount(editing.minNextSequence)} ขึ้นไป (ต่ำกว่าเลขที่ใช้แล้วไม่ได้)`}
              >
                <Input
                  id="numbering-next"
                  inputMode="numeric"
                  value={form.nextSequence}
                  onChange={(event) => set('nextSequence', event.target.value.replace(/[^0-9]/g, ''))}
                  placeholder={String(editing.minNextSequence)}
                />
              </Field>
            )}

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-[10px] font-bold uppercase text-emerald-700">ตัวอย่างเลขถัดไปตามรูปแบบที่เลือก</div>
              <div className="mt-1 font-mono text-sm font-bold text-emerald-900">{preview}</div>
              <div className="mt-0.5 font-mono text-[11px] text-emerald-700">
                {describeDocumentNumberPattern({
                  prefix: form.prefix.trim().toUpperCase(),
                  includeYear: form.includeYear,
                  digits: Number(form.digits),
                  resetYearly: form.resetYearly,
                })}
              </div>
            </div>

            <SettingHelp
              help={documentNumberingHelp({
                docType: editing.docType,
                state: {
                  prefix: form.prefix.trim().toUpperCase(),
                  includeYear: form.includeYear,
                  digits: Number(form.digits),
                  resetYearly: form.resetYearly,
                  currentSeq: editing.currentSeq,
                  currentYear: editing.currentYear,
                },
                formatLocked: editing.formatLocked,
                at: new Date(),
              })}
            />

            <Field id="numbering-reason" label="เหตุผล" required error={errors.reason}>
              <Textarea
                maxLength={500}
                id="numbering-reason"
                value={form.reason}
                onChange={(event) => set('reason', event.target.value)}
                placeholder="เช่น ปรับคำนำหน้าเลขที่เอกสารตามที่สำนักงานบัญชีแนะนำ"
              />
            </Field>
          </div>
        )}
      </Modal>
    </Card>
  )
}
