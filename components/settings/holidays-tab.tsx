'use client'

import { SettingHelp } from '@/components/settings/setting-help'
import { holidaysHelp } from '@/lib/settings/help'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import { MANAGE_HOLIDAYS } from '@/components/settings/shared'
import {
  Button,
  Card,
  Field,
  InlineAlert,
  Input,
  Modal,
  Select,
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
import { buddhistYear, fmtDate } from '@/lib/format/datetime'
import { MAX_HOLIDAY_IMPORT_ROWS, parseHolidayImport } from '@/lib/settings/holidays'
import { holidayCreateSchema, holidayImportSchema } from '@/lib/settings/schemas'
import type { HolidayMutationResultDto, PublicHolidayDto, PublicHolidayListDto } from '@/lib/settings/types'

/**
 * แท็บ "ปฏิทินวันหยุด" (มติ PO 06/10/2569 UAT U93 · `13` §6.15) — โครงตาม mockup `settings.html`
 * (`renderSettingsHolidays`)
 *
 * - ธุรการ/บัญชี/การเงินกรอกปีละครั้ง: เพิ่มทีละวัน หรือ **นำเข้าหลายวัน** (วางข้อความ/ไฟล์ CSV `YYYY-MM-DD,ชื่อ`)
 * - ลบ = soft delete พร้อมเหตุผล · ทุกการเพิ่ม/ลบลง audit และคิดกำหนดยื่น ภ.ง.ด. ของรอบที่ยังไม่ยื่นใหม่ทันที
 * - ช่องวันที่ใช้ `<input type="date">` (ค.ศ. — ข้อยกเว้นเดียวของ Rule 01) · รายการแสดง พ.ศ. ผ่าน `fmtDate()`
 * - ฟอร์มที่มีช่องวันที่ parse เพื่อโชว์ error รายฟิลด์เท่านั้น แล้วส่งค่าดิบ (string) ให้ API parse เอง (REUSE_INDEX 14/08)
 */

interface FormState {
  holidayDate: string
  name: string
  reason: string
}

const EMPTY_FORM: FormState = { holidayDate: '', name: '', reason: '' }
const ALL_YEARS = 'all'

function currentYearBe(): number {
  return buddhistYear(new Date()) ?? new Date().getFullYear() + 543
}

/** ข้อความสรุปรอบนำส่ง ภ.ง.ด. ที่กำหนดยื่นถูกคิดใหม่ — ต่อท้าย toast */
function refreshedText(result: HolidayMutationResultDto | undefined): string {
  if (result === undefined || result.refreshedFilings.length === 0) return ''
  const parts = result.refreshedFilings.map(
    (item) => `${item.periodLabel} ${fmtDate(item.fromDate)} → ${fmtDate(item.toDate)}`,
  )
  return ` · กำหนดยื่น ภ.ง.ด. เปลี่ยน ${parts.join(', ')}`
}

export function HolidaysTab() {
  const { showToast } = useToast()
  const [year, setYear] = useState<string>(String(currentYearBe()))
  const [data, setData] = useState<PublicHolidayListDto>({ items: [], years: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importReason, setImportReason] = useState('')
  const [importErrors, setImportErrors] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<PublicHolidayDto | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchItems = useCallback(
    async () =>
      callApi<PublicHolidayListDto>(year === ALL_YEARS ? '/api/settings/holidays' : `/api/settings/holidays?yearBe=${year}`),
    [year],
  )

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchItems>>) => {
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
    } else {
      setData(result.data ?? { items: [], years: [] })
      setError(null)
    }
    setLoading(false)
  }, [])

  const reload = useCallback(async () => apply(await fetchItems()), [apply, fetchItems])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchItems()
      if (!cancelled) apply(result)
    })()
    return () => {
      cancelled = true
    }
  }, [apply, fetchItems])

  /** ตัวเลือกปี = ปีที่มีข้อมูล + ปีปัจจุบัน + ปีหน้า (กรอกล่วงหน้าได้) */
  const yearOptions = useMemo(() => {
    const now = currentYearBe()
    return [...new Set([now + 1, now, ...data.years])].sort((a, b) => b - a)
  }, [data.years])

  const preview = useMemo(() => parseHolidayImport(importText), [importText])

  function openForm(): void {
    setForm(EMPTY_FORM)
    setErrors({})
    setFormOpen(true)
  }

  async function save(): Promise<void> {
    const raw = { holidayDate: form.holidayDate, name: form.name.trim(), reason: form.reason.trim() }
    const parsed = holidayCreateSchema.safeParse(raw)
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSaving(true)
    try {
      // ส่งค่าดิบ — `dateOnlySchema` แปลงเป็น Date แล้ว (ส่ง parsed.data จะได้ ISO เต็มที่ API ปฏิเสธ)
      const result = await callApi<HolidayMutationResultDto>('/api/settings/holidays', jsonRequest('POST', raw))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: 'เพิ่มวันหยุดแล้ว',
        description: `${fmtDate(form.holidayDate)} ${raw.name}${refreshedText(result.data)}`,
      })
      setFormOpen(false)
      setLoading(true)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  async function readFile(file: File | undefined): Promise<void> {
    if (file === undefined) return
    setImportText(await file.text())
  }

  async function runImport(): Promise<void> {
    const payload = { items: preview.items, reason: importReason.trim() }
    const parsed = holidayImportSchema.safeParse(payload)
    if (!parsed.success || preview.errors.length > 0) {
      setImportErrors(parsed.success ? {} : toFieldErrors(parsed.error))
      return
    }
    setImportErrors({})
    setImporting(true)
    try {
      const result = await callApi<HolidayMutationResultDto>('/api/settings/holidays/import', jsonRequest('POST', payload))
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      const created = result.data?.created.length ?? 0
      const skipped = result.data?.skippedDates.length ?? 0
      showToast({
        tone: 'success',
        title: `นำเข้าวันหยุด ${created} วัน`,
        description: `${skipped > 0 ? `ข้ามวันที่มีอยู่แล้ว ${skipped} วัน` : 'ไม่มีวันที่ซ้ำ'}${refreshedText(result.data)}`,
      })
      setImportOpen(false)
      setImportText('')
      setImportReason('')
      setLoading(true)
      await reload()
    } finally {
      setImporting(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === null) return
    setDeleting(true)
    try {
      const result = await callApi<HolidayMutationResultDto>(
        `/api/settings/holidays/${deleteTarget.id}`,
        jsonRequest('DELETE', { reason: deleteReason.trim() }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: 'ลบวันหยุดแล้ว',
        description: `${fmtDate(deleteTarget.holidayDate)} ${deleteTarget.name}${refreshedText(result.data)}`,
      })
      setDeleteTarget(null)
      setDeleteReason('')
      setLoading(true)
      await reload()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">ปฏิทินวันหยุด</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            วันหยุดราชการและวันหยุดของบริษัท — กำหนดยื่นภาษีที่ตรงวันหยุดหรือเสาร์-อาทิตย์จะเลื่อนเป็นวันทำการถัดไป
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36">
            <Select
              aria-label="กรองตามปี"
              value={year}
              onChange={(event) => {
                setLoading(true)
                setYear(event.target.value)
              }}
            >
              {yearOptions.map((value) => (
                <option key={value} value={String(value)}>
                  ปี {value}
                </option>
              ))}
              <option value={ALL_YEARS}>ทุกปี</option>
            </Select>
          </div>
          <Can action="manage" resource={MANAGE_HOLIDAYS}>
            <Button
              variant="secondary"
              onClick={() => {
                setImportErrors({})
                setImportOpen(true)
              }}
            >
              นำเข้าหลายวัน
            </Button>
            <Button onClick={openForm}>+ เพิ่มวันหยุด</Button>
          </Can>
        </div>
      </div>

      <InlineAlert tone="info" title="ใช้คำนวณกำหนดยื่น ภ.ง.ด. อัตโนมัติ">
        กำหนดยื่นวันที่ 15 (ออนไลน์) หรือวันที่ 7 (กระดาษ) ของเดือนถัดไป ถ้าตรงวันหยุดในปฏิทินนี้หรือเสาร์-อาทิตย์ ระบบเลื่อนเป็นวันทำการถัดไปให้
        — เพิ่มหรือลบวันหยุดแล้ว กำหนดยื่นของรอบที่ยังไม่ยื่นจะคำนวณใหม่ทันที
      </InlineAlert>

      <SettingHelp className="mt-3" help={holidaysHelp(data.items.map((item) => item.holidayDate))} />

      <div className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>วันที่</Th>
              <Th>วัน</Th>
              <Th>ชื่อวันหยุด</Th>
              <Th>ผู้บันทึก</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
          <TableState
            colSpan={5}
            loading={loading}
            error={error}
            isEmpty={data.items.length === 0}
            emptyTitle={year === ALL_YEARS ? 'ยังไม่มีวันหยุดในปฏิทิน' : `ยังไม่มีวันหยุดของปี ${year}`}
            emptyDescription="กรอกวันหยุดปีละครั้ง — กด “นำเข้าหลายวัน” แล้ววางรายการวันหยุดราชการทั้งปีได้ในครั้งเดียว (เช่น 2569-12-31,วันสิ้นปี)"
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
              data.items.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <span className="font-mono text-xs font-bold text-slate-900">{fmtDate(item.holidayDate)}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-500">{item.weekdayLabel}</span>
                  </Td>
                  <Td>
                    <span className="font-semibold text-slate-800">{item.name}</span>
                  </Td>
                  <Td>
                    <span className="text-xs text-slate-500">
                      {item.createdByName ?? '—'} · {fmtDate(item.createdAt)}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <Can action="manage" resource={MANAGE_HOLIDAYS}>
                      <Button
                        variant="danger"
                        onClick={() => {
                          setDeleteTarget(item)
                          setDeleteReason('')
                        }}
                      >
                        ลบ
                      </Button>
                    </Can>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="เพิ่มวันหยุด"
        description="วันที่ซ้ำกับที่มีอยู่แล้วเพิ่มไม่ได้ — ลบรายการเดิมก่อนถ้าต้องการเปลี่ยนชื่อ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              เพิ่มวันหยุด
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. (Rule 01) */}
          <Field id="holiday-date" label="วันที่" required error={errors.holidayDate}>
            <Input
              id="holiday-date"
              type="date"
              value={form.holidayDate}
              onChange={(event) => setForm((current) => ({ ...current, holidayDate: event.target.value }))}
            />
          </Field>
          <Field id="holiday-name" label="ชื่อวันหยุด" required error={errors.name}>
            <Input
              id="holiday-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="เช่น วันปิยมหาราช"
            />
          </Field>
          <Field id="holiday-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              id="holiday-reason"
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="เช่น ประกาศวันหยุดราชการประจำปี 2570"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        size="lg"
        title="นำเข้าวันหยุดหลายวัน"
        description={`วางรายการหรือเลือกไฟล์ CSV — บรรทัดละ 1 วัน รูปแบบ ปี-เดือน-วัน,ชื่อวันหยุด (ปี ค.ศ. หรือ พ.ศ. ก็ได้) · ครั้งละไม่เกิน ${MAX_HOLIDAY_IMPORT_ROWS} วัน · วันที่มีอยู่แล้วจะถูกข้าม`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)} disabled={importing}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => void runImport()}
              loading={importing}
              disabled={preview.items.length === 0 || preview.errors.length > 0}
            >
              นำเข้า {preview.items.length} วัน
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field id="holiday-import-file" label="ไฟล์ CSV (ไม่บังคับ)">
            <Input
              id="holiday-import-file"
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(event) => void readFile(event.target.files?.[0])}
            />
          </Field>
          <Field id="holiday-import-text" label="รายการวันหยุด" required error={importErrors.items}>
            <Textarea
              id="holiday-import-text"
              rows={8}
              className="font-mono"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={'2027-01-01,วันขึ้นปีใหม่\n2027-04-13,วันสงกรานต์\n2570-04-14,วันสงกรานต์'}
            />
          </Field>
          {preview.errors.length > 0 && (
            <InlineAlert tone="error" title={`พบรายการที่ใช้ไม่ได้ ${preview.errors.length} บรรทัด — แก้ก่อนนำเข้า`}>
              <ul className="list-disc pl-4">
                {preview.errors.slice(0, 10).map((item) => (
                  <li key={`${item.line}-${item.message}`}>
                    {item.line > 0 ? `บรรทัด ${item.line}: ` : ''}
                    {item.message}
                  </li>
                ))}
              </ul>
            </InlineAlert>
          )}
          {preview.items.length > 0 && preview.errors.length === 0 && (
            <InlineAlert tone="success" title={`พร้อมนำเข้า ${preview.items.length} วัน`}>
              {preview.items
                .slice(0, 5)
                .map((item) => `${fmtDate(item.holidayDate)} ${item.name}`)
                .join(' · ')}
              {preview.items.length > 5 ? ` · และอีก ${preview.items.length - 5} วัน` : ''}
            </InlineAlert>
          )}
          <Field id="holiday-import-reason" label="เหตุผล" required error={importErrors.reason}>
            <Textarea
              id="holiday-import-reason"
              value={importReason}
              onChange={(event) => setImportReason(event.target.value)}
              placeholder="เช่น นำเข้าวันหยุดราชการประจำปี 2570 ตามประกาศ"
            />
          </Field>
        </div>
      </Modal>

      <ReasonConfirmModal
        open={deleteTarget !== null}
        title={`ลบวันหยุด ${deleteTarget === null ? '' : fmtDate(deleteTarget.holidayDate)}`}
        description="ลบแล้วกำหนดยื่นภาษีของรอบที่ยังไม่ยื่นซึ่งเคยเลื่อนเพราะวันนี้จะกลับไปคิดใหม่"
        confirmLabel="ยืนยันลบวันหยุด"
        loading={deleting}
        reason={deleteReason}
        onReasonChange={setDeleteReason}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        placeholder="เช่น ใส่วันผิด / ยกเลิกวันหยุดพิเศษ"
      />
    </Card>
  )
}
