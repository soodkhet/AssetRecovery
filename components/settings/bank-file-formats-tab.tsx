'use client'

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
import { fmtDate } from '@/lib/format/datetime'
import { REQUIRED_BANK_FILE_COLUMNS, SUPPORTED_BANK_FILE_COLUMNS, type BankFileTestResult } from '@/lib/settings/bank-file'
import { bankFileFormatCreateSchema } from '@/lib/settings/schemas'
import type { BankFileFormatDto } from '@/lib/settings/types'

/**
 * แท็บ "รูปแบบไฟล์ธนาคาร" (`13` §6.8)
 *
 * **รูปแบบที่ยังไม่ผ่านการทดสอบใช้ตัดโอนจริงไม่ได้** (`BANK_FILE_NOT_TESTED` — gate อยู่ที่
 * `assertBankFileUsable()` ซึ่ง Phase 3.4 เรียกตอนสร้างไฟล์โอน) ⇒ ตารางแสดงสถานะทดสอบชัดเจน
 * และการแก้ mapping/ชนิดไฟล์/encoding จะรีเซ็ตสถานะกลับเป็น "ยังไม่ทดสอบ" เสมอ
 */

type FileType = 'CSV' | 'TXT'
type Encoding = 'UTF_8' | 'TIS_620'

interface FormState {
  bankName: string
  fileType: FileType
  encoding: Encoding
  columnMapping: string
  reason: string
}

const EMPTY_FORM: FormState = {
  bankName: '',
  fileType: 'CSV',
  encoding: 'UTF_8',
  columnMapping: REQUIRED_BANK_FILE_COLUMNS.join(', '),
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
            bankName: target.bankName,
            fileType: target.fileType,
            encoding: target.encoding === 'TIS_620' ? 'TIS_620' : 'UTF_8',
            columnMapping: target.columnMapping,
            reason: '',
          },
    )
    setErrors({})
    setFormOpen(true)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  /** true = การแก้ครั้งนี้กระทบไฟล์ที่จะสร้าง ⇒ สถานะทดสอบจะถูกรีเซ็ตเป็น pending */
  const resetsTestStatus =
    editing !== null &&
    (form.columnMapping !== editing.columnMapping ||
      form.fileType !== editing.fileType ||
      form.encoding !== editing.encoding)

  async function save(): Promise<void> {
    const parsed = bankFileFormatCreateSchema.safeParse({
      bankName: form.bankName.trim(),
      fileType: form.fileType,
      encoding: form.encoding,
      columnMapping: form.columnMapping.trim(),
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
        description: resetsTestStatus ? 'ต้องกด "ทดสอบ" ใหม่ก่อนใช้ตัดโอนจริง' : form.bankName.trim(),
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
              ? `${testTarget.bankName} — ใช้สร้างไฟล์โอนเงินจริงได้แล้ว`
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
            โครงไฟล์ที่ใช้ส่งให้ธนาคารตัดโอนเงินเป็นชุด — <b>ต้องทดสอบผ่านก่อนจึงใช้สร้างไฟล์โอนจริงได้</b> (ไฟล์ 13 §6.8)
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

      <Table>
        <THead>
          <Tr>
            <Th>ธนาคาร</Th>
            <Th>ชนิดไฟล์ / Encoding</Th>
            <Th>คอลัมน์</Th>
            <Th>สถานะทดสอบ</Th>
            <Th className="text-right">สถานะ / จัดการ</Th>
          </Tr>
        </THead>
        {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
        <TableState
          colSpan={5}
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
                  <div className="mt-0.5 text-[10px] text-slate-500">แก้ไขล่าสุด {fmtDate(item.updatedAt)}</div>
                </Td>
                <Td>
                  <span className="font-mono text-xs text-slate-700">{item.fileType}</span>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                    {ENCODING_LABEL[item.encoding === 'TIS_620' ? 'TIS_620' : 'UTF_8']}
                  </div>
                </Td>
                <Td>
                  <div className="max-w-[280px] truncate font-mono text-[10px] text-slate-500" title={item.columns.join(', ')}>
                    {item.columns.length} คอลัมน์ — {item.columns.join(', ')}
                  </div>
                </Td>
                <Td>
                  <StatusBadge
                    group={BANK_FILE_TEST_BADGE[item.testStatus].group}
                    label={BANK_FILE_TEST_BADGE[item.testStatus].label}
                  />
                  {!item.usable && (
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
        description="ระบุรายชื่อคอลัมน์ตามลำดับที่ธนาคารกำหนด คั่นด้วยเครื่องหมายจุลภาคหรือขึ้นบรรทัดใหม่"
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
          <Field id="bank-file-bank" label="ธนาคาร" required error={errors.bankName}>
            <Input
              id="bank-file-bank"
              value={form.bankName}
              onChange={(event) => set('bankName', event.target.value)}
              placeholder='เช่น "ธนาคารกสิกรไทย (K-Cash Connect)"'
            />
          </Field>

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

          <Field id="bank-file-columns" label="รายชื่อคอลัมน์ (ตามลำดับ)" required error={errors.columnMapping}>
            <Textarea
              id="bank-file-columns"
              className="font-mono"
              rows={4}
              value={form.columnMapping}
              onChange={(event) => set('columnMapping', event.target.value)}
              placeholder={REQUIRED_BANK_FILE_COLUMNS.join(', ')}
            />
          </Field>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="text-[10px] font-semibold text-slate-600">คอลัมน์ที่ระบบรองรับ (คลิกเพื่อเพิ่มต่อท้าย)</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUPPORTED_BANK_FILE_COLUMNS.map((column) => {
                const required = REQUIRED_BANK_FILE_COLUMNS.includes(column)
                return (
                  <button
                    key={column}
                    type="button"
                    onClick={() =>
                      set('columnMapping', form.columnMapping.trim() === '' ? column : `${form.columnMapping.trim()}, ${column}`)
                    }
                    className={
                      required
                        ? 'focus-ring rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] font-semibold text-slate-800 hover:border-slate-500'
                        : 'focus-ring rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-500 hover:border-slate-400'
                    }
                  >
                    {column}
                    {required && <span className="ml-1 text-red-500">*</span>}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">* = คอลัมน์ที่ขาดไม่ได้ — ไม่ครบธนาคารตัดโอนไม่ได้</div>
          </div>

          {resetsTestStatus && (
            <InlineAlert tone="warning" title="การแก้ครั้งนี้จะรีเซ็ตสถานะทดสอบ">
              เปลี่ยนคอลัมน์ ชนิดไฟล์ หรือ encoding แล้ว ระบบจะตั้งสถานะกลับเป็น “ยังไม่ทดสอบ” — ต้องกดทดสอบใหม่ก่อนใช้ตัดโอนจริง
            </InlineAlert>
          )}

          <Field id="bank-file-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              id="bank-file-reason"
              value={form.reason}
              onChange={(event) => set('reason', event.target.value)}
              placeholder="เช่น ธนาคารแจ้งเปลี่ยนโครงไฟล์ตั้งแต่ 01/09/2569"
            />
          </Field>
        </div>
      </Modal>

      <ReasonConfirmModal
        open={testTarget !== null}
        title={`ทดสอบรูปแบบไฟล์ "${testTarget?.bankName ?? ''}"`}
        description="ระบบจะตรวจคอลัมน์ที่จำเป็นและสร้างตัวอย่างบรรทัดข้อมูล — ผ่านแล้วจึงใช้สร้างไฟล์โอนเงินจริงได้"
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
        open={deleteTarget !== null}
        title={`ปิดใช้งานรูปแบบไฟล์ "${deleteTarget?.bankName ?? ''}"`}
        description="รูปแบบที่ถูกใช้ในรอบจ่ายที่ยังไม่ปิดจะปิดใช้งานไม่ได้ — ไฟล์ที่สร้างไปแล้วยังอ้างรูปแบบเดิมได้"
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
