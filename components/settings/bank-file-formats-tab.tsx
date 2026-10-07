'use client'

import { SettingHelp } from '@/components/settings/setting-help'
import { bankFileFormatsHelp } from '@/lib/settings/help'
import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  ACTIVE_BADGE_GROUP,
  BANK_FILE_TEST_BADGE,
  MANAGE_SETTINGS,
  STATUS_FILTER_LABEL,
  type StatusFilter,
} from '@/components/settings/shared'
import {
  Button,
  Card,
  Field,
  InlineAlert,
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
import { REASON_MAX, toFieldErrors } from '@/lib/api/validation'
import { fmtDate } from '@/lib/format/datetime'
import { THAI_BANK_CODES } from '@/lib/banks/thai-banks'
import type { BankFilePurpose } from '@/lib/generated/prisma/enums'
import {
  BANK_FILE_PURPOSES,
  BANK_FILE_PURPOSE_LABEL,
  bankFileColumnLabel,
  bankFileColumnOptions,
  toColumnMapping,
  type BankFileTestResult,
} from '@/lib/settings/bank-file'
import { bankFileFormatCreateSchema } from '@/lib/settings/schemas'
import type { BankFileFormatDto } from '@/lib/settings/types'

/**
 * แท็บ "รูปแบบไฟล์ธนาคาร" (`13` §6.8)
 *
 * **รูปแบบที่ยังไม่ผ่านการทดสอบใช้ตัดโอนจริงไม่ได้** (`BANK_FILE_NOT_TESTED` — gate อยู่ที่
 * `assertBankFileUsable()` ซึ่ง Phase 3.4 เรียกตอนสร้างไฟล์โอน) ⇒ ตารางแสดงสถานะทดสอบชัดเจน
 * และการแก้ mapping/ชนิดไฟล์/encoding จะรีเซ็ตสถานะกลับเป็น "ยังไม่ทดสอบ" เสมอ
 *
 * มติ PO U147 — "เลือกจากรายการทั้งหมด": ใช้สำหรับ (statement / ไฟล์โอน) · ธนาคารจากรายการธนาคารไทยมาตรฐาน ·
 * คอลัมน์เลือกทีละช่องตามลำดับจากคำศัพท์ของชนิดนั้น (ชุดเดียวกับตัวนำเข้า/ตัวสร้างไฟล์จริง) — ไม่มีช่องพิมพ์อิสระ
 */

type FileType = 'CSV' | 'TXT'
type Encoding = 'UTF_8' | 'TIS_620'

interface FormState {
  purpose: BankFilePurpose
  /** รหัสธนาคาร 3 หลัก — `''` = ยังไม่เลือก */
  bankCode: string
  fileType: FileType
  encoding: Encoding
  /** คอลัมน์ตามลำดับ — `''` = ช่องที่ยังไม่เลือก */
  columns: string[]
  reason: string
}

/** คอลัมน์เริ่มต้นของชนิดนั้น = คอลัมน์บังคับเรียงตามคำศัพท์ (statement เพิ่มเงินเข้า/เงินออกให้ทดสอบผ่านได้ทันที) */
function defaultColumns(purpose: BankFilePurpose): string[] {
  if (purpose === 'statement') return ['transaction_date', 'description', 'amount_in', 'amount_out']
  return bankFileColumnOptions('payment')
    .filter((option) => option.required)
    .map((option) => option.value)
}

const EMPTY_FORM: FormState = {
  purpose: 'payment',
  bankCode: '',
  fileType: 'CSV',
  encoding: 'UTF_8',
  columns: defaultColumns('payment'),
  reason: '',
}

const ENCODING_LABEL: Readonly<Record<Encoding, string>> = {
  UTF_8: 'UTF-8',
  TIS_620: 'TIS-620',
}

export function BankFileFormatsTab() {
  const { showToast } = useToast()
  const [items, setItems] = useState<readonly BankFileFormatDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [status, setStatus] = useState<StatusFilter>('active')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<BankFileFormatDto | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<BankFileFormatDto | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [testTarget, setTestTarget] = useState<BankFileFormatDto | null>(null)
  const [testReason, setTestReason] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ formatId: string; result: BankFileTestResult } | null>(null)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchItems = useCallback(
    async () => callApi<BankFileFormatDto[]>(`/api/settings/bank-file-formats?status=${status}`),
    [status],
  )

  const reload = useCallback(async () => {
    const result = await fetchItems()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setItems(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [fetchItems])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchItems()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setItems(result.data ?? [])
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchItems])

  function openForm(target: BankFileFormatDto | null): void {
    setEditing(target)
    setForm(
      target === null
        ? EMPTY_FORM
        : {
            purpose: target.purpose,
            bankCode: target.bankCode ?? '',
            fileType: target.fileType,
            encoding: target.encoding === 'TIS_620' ? 'TIS_620' : 'UTF_8',
            columns: target.columns.length === 0 ? [''] : [...target.columns],
            reason: '',
          },
    )
    setErrors({})
    setFormOpen(true)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  /** เปลี่ยนชนิด = คำศัพท์คอลัมน์คนละชุด ⇒ เริ่มคอลัมน์ใหม่จากค่าเริ่มต้นของชนิดนั้น */
  function setPurpose(purpose: BankFilePurpose): void {
    setForm((current) =>
      current.purpose === purpose
        ? current
        : {
            ...current,
            purpose,
            columns: defaultColumns(purpose),
            ...(purpose === 'statement' ? { fileType: 'CSV' as const, encoding: 'UTF_8' as const } : {}),
          },
    )
  }

  function setColumn(index: number, value: string): void {
    setForm((current) => ({ ...current, columns: current.columns.map((column, position) => (position === index ? value : column)) }))
  }

  function moveColumn(index: number, offset: -1 | 1): void {
    setForm((current) => {
      const target = index + offset
      if (target < 0 || target >= current.columns.length) return current
      const columns = [...current.columns]
      const moved = columns[index] ?? ''
      columns[index] = columns[target] ?? ''
      columns[target] = moved
      return { ...current, columns }
    })
  }

  function removeColumn(index: number): void {
    setForm((current) =>
      current.columns.length <= 1 ? current : { ...current, columns: current.columns.filter((_, position) => position !== index) },
    )
  }

  const columnOptions = bankFileColumnOptions(form.purpose)
  const columnMapping = toColumnMapping(form.columns)

  /** true = การแก้ครั้งนี้กระทบไฟล์ที่จะสร้าง ⇒ สถานะทดสอบจะถูกรีเซ็ตเป็น pending */
  const resetsTestStatus =
    editing !== null &&
    (columnMapping !== editing.columnMapping ||
      form.purpose !== editing.purpose ||
      form.bankCode !== (editing.bankCode ?? '') ||
      form.fileType !== editing.fileType ||
      form.encoding !== editing.encoding)

  async function save(): Promise<void> {
    const parsed = bankFileFormatCreateSchema.safeParse({
      purpose: form.purpose,
      bankCode: form.bankCode,
      fileType: form.fileType,
      encoding: form.encoding,
      columnMapping,
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<BankFileFormatDto>(
        editing === null ? '/api/settings/bank-file-formats' : `/api/settings/bank-file-formats/${editing.id}`,
        jsonRequest(editing === null ? 'POST' : 'PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: editing === null ? 'เพิ่มรูปแบบไฟล์แล้ว' : 'บันทึกรูปแบบไฟล์แล้ว',
        description: resetsTestStatus ? 'ต้องกด "ทดสอบ" ใหม่ก่อนใช้งานจริง' : parsed.data.columnMapping.split(',').length + ' คอลัมน์',
      })
      setFormOpen(false)
      setTestResult(null)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  async function confirmTest(): Promise<void> {
    if (testTarget === null) return
    setTesting(true)
    try {
      const result = await callApi<{ format: BankFileFormatDto; result: BankFileTestResult }>(
        `/api/settings/bank-file-formats/${testTarget.id}/test`,
        jsonRequest('POST', { reason: testReason.trim() }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      const outcome = result.data?.result
      if (outcome !== undefined) {
        setTestResult({ formatId: testTarget.id, result: outcome })
        showToast({
          tone: outcome.status === 'passed' ? 'success' : 'error',
          title: outcome.status === 'passed' ? 'ทดสอบผ่าน' : 'ทดสอบไม่ผ่าน',
          description:
            outcome.status === 'passed'
              ? `${testTarget.bankName} — ${testTarget.purpose === 'payment' ? 'ใช้สร้างไฟล์โอนเงินจริงได้แล้ว' : 'ใช้นำเข้า statement ได้แล้ว'}`
              : outcome.issues.join(' · '),
        })
      }
      setTestTarget(null)
      setTestReason('')
      await reload()
    } finally {
      setTesting(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === null) return
    setDeleting(true)
    try {
      const result = await callApi(
        `/api/settings/bank-file-formats/${deleteTarget.id}`,
        jsonRequest('DELETE', { reason: deleteReason.trim() }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: 'ปิดใช้งานรูปแบบไฟล์แล้ว', description: deleteTarget.bankName })
      setDeleteTarget(null)
      setDeleteReason('')
      await reload()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">รูปแบบไฟล์ธนาคาร (Bank File Format)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            โครงไฟล์ statement ที่นำเข้ากระทบยอด และไฟล์โอนเงินที่ส่งธนาคาร — <b>ไฟล์โอนต้องทดสอบผ่านก่อนจึงใช้จริงได้</b>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Select
              aria-label="กรองตามสถานะ"
              value={status}
              onChange={(event) => {
                setLoading(true)
                setStatus(event.target.value as StatusFilter)
              }}
            >
              {(Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_FILTER_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
          <Can action="manage" resource={MANAGE_SETTINGS}>
            <Button onClick={() => openForm(null)}>+ เพิ่มรูปแบบไฟล์</Button>
          </Can>
        </div>
      </div>

      <SettingHelp className="mb-3" help={bankFileFormatsHelp()} />

      <Table>
        <THead>
          <Tr>
            <Th>ธนาคาร</Th>
            <Th>ใช้สำหรับ</Th>
            <Th>ชนิดไฟล์ / Encoding</Th>
            <Th>คอลัมน์</Th>
            <Th>สถานะทดสอบ</Th>
            <Th className="text-right">สถานะ / จัดการ</Th>
          </Tr>
        </THead>
        {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
        <TableState
          colSpan={6}
          loading={loading}
          error={error}
          isEmpty={items.length === 0}
          emptyTitle="ยังไม่มีรูปแบบไฟล์ธนาคาร"
          emptyDescription="เพิ่มรูปแบบตามที่ธนาคารกำหนด แล้วกดทดสอบก่อนใช้งานจริง"
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
            items.map((item) => (
              <Tr key={item.id}>
                <Td>
                  <div className="font-semibold text-slate-900">{item.bankName}</div>
                  {item.bankCode === null ? (
                    <div className="mt-0.5 text-[10px] text-amber-600">ยังไม่ได้เลือกธนาคารจากรายการ — แก้ไขเพื่อเลือก</div>
                  ) : (
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500">รหัส {item.bankCode}</div>
                  )}
                  <div className="mt-0.5 text-[10px] text-slate-500">แก้ไขล่าสุด {fmtDate(item.updatedAt)}</div>
                </Td>
                <Td>
                  <span className="text-xs text-slate-700">{BANK_FILE_PURPOSE_LABEL[item.purpose]}</span>
                </Td>
                <Td>
                  <span className="font-mono text-xs text-slate-700">{item.fileType}</span>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                    {ENCODING_LABEL[item.encoding === 'TIS_620' ? 'TIS_620' : 'UTF_8']}
                  </div>
                </Td>
                <Td>
                  <div
                    className="max-w-[280px] truncate text-[10px] text-slate-500"
                    title={item.columns.map((column) => bankFileColumnLabel(item.purpose, column)).join(' → ')}
                  >
                    {item.columns.length} คอลัมน์ — {item.columns.map((column) => bankFileColumnLabel(item.purpose, column)).join(' → ')}
                  </div>
                </Td>
                <Td>
                  <StatusBadge
                    group={BANK_FILE_TEST_BADGE[item.testStatus].group}
                    label={BANK_FILE_TEST_BADGE[item.testStatus].label}
                  />
                  {!item.usable && item.purpose === 'payment' && (
                    <div className="mt-0.5 text-[10px] text-amber-600">ยังใช้ตัดโอนจริงไม่ได้</div>
                  )}
                  {testResult?.formatId === item.id && testResult.result.issues.length > 0 && (
                    <ul className="mt-1 list-inside list-disc text-[10px] text-red-600">
                      {testResult.result.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {testResult?.formatId === item.id && testResult.result.status === 'passed' && (
                    <div className="mt-1 max-w-[280px] truncate font-mono text-[10px] text-slate-400" title={testResult.result.samplePreview}>
                      ตัวอย่าง: {testResult.result.samplePreview}
                    </div>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <StatusBadge
                      group={ACTIVE_BADGE_GROUP[item.isActive ? 'active' : 'inactive']}
                      label={item.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    />
                    <Can action="manage" resource={MANAGE_SETTINGS}>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setTestTarget(item)
                          setTestReason('')
                        }}
                      >
                        ทดสอบ
                      </Button>
                      <Button variant="secondary" onClick={() => openForm(item)}>
                        แก้ไข
                      </Button>
                      {item.isActive && (
                        <Button
                          variant="danger"
                          onClick={() => {
                            setDeleteTarget(item)
                            setDeleteReason('')
                          }}
                        >
                          ปิดใช้งาน
                        </Button>
                      )}
                    </Can>
                  </div>
                </Td>
              </Tr>
            ))}
        </TBody>
      </Table>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title={editing === null ? 'เพิ่มรูปแบบไฟล์ธนาคาร' : `แก้ไขรูปแบบไฟล์ — ${editing.bankName}`}
        description="เลือกชนิดไฟล์ ธนาคาร และคอลัมน์ตามลำดับที่ธนาคารกำหนดจากรายการ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing === null ? 'เพิ่มรูปแบบไฟล์' : 'บันทึกการแก้ไข'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="bank-file-purpose" label="ใช้สำหรับ" required error={errors.purpose}>
              <Select
                id="bank-file-purpose"
                value={form.purpose}
                onChange={(event) => setPurpose(event.target.value as BankFilePurpose)}
              >
                {BANK_FILE_PURPOSES.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {BANK_FILE_PURPOSE_LABEL[purpose]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="bank-file-bank" label="ธนาคาร" required error={errors.bankCode}>
              <Select id="bank-file-bank" value={form.bankCode} onChange={(event) => set('bankCode', event.target.value)}>
                <option value="">— เลือกธนาคาร —</option>
                {THAI_BANK_CODES.map((bank) => (
                  <option key={bank.code} value={bank.code}>
                    {bank.name} ({bank.code})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="bank-file-type" label="ชนิดไฟล์" required error={errors.fileType}>
              <Select id="bank-file-type" value={form.fileType} onChange={(event) => set('fileType', event.target.value as FileType)}>
                <option value="CSV">CSV</option>
                <option value="TXT">TXT</option>
              </Select>
            </Field>
            <Field id="bank-file-encoding" label="Encoding" required error={errors.encoding}>
              <Select
                id="bank-file-encoding"
                value={form.encoding}
                onChange={(event) => set('encoding', event.target.value as Encoding)}
              >
                {(Object.keys(ENCODING_LABEL) as Encoding[]).map((value) => (
                  <option key={value} value={value}>
                    {ENCODING_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {form.purpose === 'statement' && (
            <div className="text-[10px] text-slate-500">ตัวนำเข้า statement อ่านไฟล์ CSV UTF-8 หรือ Excel (.xlsx)</div>
          )}

          <Field id="bank-file-columns" label="คอลัมน์ (ตามลำดับในไฟล์)" required error={errors.columnMapping}>
            <div id="bank-file-columns" className="space-y-2">
              {form.columns.map((column, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 font-mono text-[10px] font-semibold text-slate-500">ลำดับ {index + 1}</span>
                  <div className="flex-1">
                    <Select
                      aria-label={`คอลัมน์ลำดับที่ ${index + 1}`}
                      value={column}
                      onChange={(event) => setColumn(index, event.target.value)}
                    >
                      <option value="">— เลือกคอลัมน์ —</option>
                      {columnOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                          {option.required ? ' *' : ''}
                        </option>
                      ))}
                      {column !== '' && !columnOptions.some((option) => option.value === column) && (
                        <option value={column}>{column} (ไม่อยู่ในรายการ — เลือกใหม่)</option>
                      )}
                    </Select>
                  </div>
                  <button
                    type="button"
                    onClick={() => moveColumn(index, -1)}
                    disabled={index === 0}
                    aria-label={`เลื่อนคอลัมน์ลำดับที่ ${index + 1} ขึ้น`}
                    className="focus-ring rounded-md px-1.5 py-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(index, 1)}
                    disabled={index === form.columns.length - 1}
                    aria-label={`เลื่อนคอลัมน์ลำดับที่ ${index + 1} ลง`}
                    className="focus-ring rounded-md px-1.5 py-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  {form.columns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeColumn(index)}
                      aria-label={`ลบคอลัมน์ลำดับที่ ${index + 1}`}
                      className="focus-ring rounded-md px-1.5 py-1 text-xs text-slate-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {form.columns.length < columnOptions.length && (
                <Button variant="secondary" onClick={() => set('columns', [...form.columns, ''])}>
                  + เพิ่มคอลัมน์
                </Button>
              )}
              <div className="text-[10px] text-slate-500">
                {form.purpose === 'payment'
                  ? '* = คอลัมน์ที่ขาดไม่ได้ — ไม่ครบธนาคารตัดโอนไม่ได้'
                  : '* = คอลัมน์ที่ขาดไม่ได้ · ต้องมีคอลัมน์ยอดเงินอย่างน้อย 1 ช่อง (เงินเข้า / เงินออก / จำนวนเงิน)'}
              </div>
            </div>
          </Field>

          {resetsTestStatus && (
            <InlineAlert tone="warning" title="การแก้ครั้งนี้จะรีเซ็ตสถานะทดสอบ">
              เปลี่ยนชนิด ธนาคาร คอลัมน์ ชนิดไฟล์ หรือ encoding แล้ว ระบบจะตั้งสถานะกลับเป็น “ยังไม่ทดสอบ” — ต้องกดทดสอบใหม่ก่อนใช้งานจริง
            </InlineAlert>
          )}

          <Field id="bank-file-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              maxLength={500}
              id="bank-file-reason"
              value={form.reason}
              onChange={(event) => set('reason', event.target.value)}
              placeholder="เช่น ธนาคารแจ้งเปลี่ยนโครงไฟล์ตั้งแต่ 01/09/2569"
            />
          </Field>
        </div>
      </Modal>

      <ReasonConfirmModal
        maxLength={REASON_MAX}
        open={testTarget !== null}
        title={`ทดสอบรูปแบบไฟล์ "${testTarget?.bankName ?? ''}"`}
        description={
          testTarget?.purpose === 'statement'
            ? 'ระบบจะสร้างไฟล์ตัวอย่างตามลำดับคอลัมน์นี้แล้วอ่านด้วยตัวนำเข้า statement จริง — ผ่าน = นำเข้าไฟล์ของธนาคารที่เรียงแบบนี้ได้'
            : 'ระบบจะตรวจคอลัมน์ที่จำเป็นและสร้างตัวอย่างบรรทัดข้อมูล — ผ่านแล้วจึงใช้สร้างไฟล์โอนเงินจริงได้'
        }
        confirmLabel="เริ่มทดสอบ"
        confirmVariant="primary"
        loading={testing}
        reason={testReason}
        onReasonChange={setTestReason}
        onClose={() => setTestTarget(null)}
        onConfirm={() => void confirmTest()}
        placeholder="เช่น ทดสอบก่อนเปิดใช้กับรอบจ่ายเดือน 09/2569"
      />

      <ReasonConfirmModal
        maxLength={REASON_MAX}
        open={deleteTarget !== null}
        title={`ปิดใช้งานรูปแบบไฟล์ "${deleteTarget?.bankName ?? ''}"`}
        description="รูปแบบที่บัญชีธนาคารยังอ้างอยู่ปิดใช้งานไม่ได้ — เปลี่ยนรูปแบบของบัญชีก่อน · ไฟล์ที่สร้างไปแล้วยังอ้างรูปแบบเดิมได้"
        confirmLabel="ยืนยันปิดใช้งาน"
        loading={deleting}
        reason={deleteReason}
        onReasonChange={setDeleteReason}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        placeholder="เช่น เลิกใช้ช่องทางนี้กับธนาคารแล้ว"
      />
    </Card>
  )
}
