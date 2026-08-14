'use client'

import { useState } from 'react'
import {
  Badge,
  Button,
  Field,
  InlineAlert,
  Modal,
  RefText,
  Select,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  useToast,
} from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { IMPORT_COLUMNS, parseCsv, type ImportField } from '@/lib/cases/import'
import {
  applyHeaderMapping,
  autoMapping,
  collectHeaders,
  duplicateMappedFields,
  ignoredHeaders,
  importFieldLabel,
  missingRequiredFields,
} from '@/lib/cases/import-wizard'
import type { CaseImportResultDto } from '@/lib/cases/types'

/**
 * Import wizard (`38` §7.1 · §8 `import_cases`) — เลือกไฟล์ → mapping คอลัมน์ → preview → ยืนยัน
 *
 * - preview เรียก `POST /api/cases/import` ด้วย `dryRun: true` (ตรวจอย่างเดียว ไม่เขียน DB)
 * - ผลลัพธ์เป็น **success/error ต่อแถว** — แถวผิดไม่ทำให้ทั้งไฟล์ตก (`38` §12)
 * - mapping ใช้ `IMPORT_COLUMNS` ชุดเดียวกับ backend แล้วส่ง `rows` ที่หัวคอลัมน์ถูกแปลงเป็น
 *   label มาตรฐานแล้ว (ตรรกะ mapping มีชุดเดียวทั้งระบบ — ดู `lib/cases/import-wizard.ts`)
 *
 * ⚠️ รอบนี้อ่านได้เฉพาะ **CSV** — ไฟล์ `.xlsx` ต้องใช้ SheetJS (`96` §15) ซึ่งยังไม่ได้ติดตั้ง
 * ในโปรเจกต์ (มาพร้อมงานรายงาน/Export) · จุดเสียบอยู่ที่ `readRowsFromFile()` ที่เดียว
 */

type Step = 'file' | 'mapping' | 'preview'

export function CaseImportWizard({
  open,
  companies,
  onClose,
  onImported,
}: {
  open: boolean
  companies: ReadonlyArray<{ id: string; name: string }>
  onClose: () => void
  onImported: () => void
}) {
  const { showToast } = useToast()

  const [step, setStep] = useState<Step>('file')
  const [companyId, setCompanyId] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [mapping, setMapping] = useState<Record<string, ImportField | ''>>({})
  const [result, setResult] = useState<CaseImportResultDto | null>(null)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [busy, setBusy] = useState(false)

  const headers = Object.keys(mapping)
  const missing = missingRequiredFields(mapping)
  const duplicated = duplicateMappedFields(mapping)
  const ignored = ignoredHeaders(mapping)
  const canPreview = companyId !== '' && rows.length > 0 && missing.length === 0 && duplicated.length === 0

  function reset(): void {
    setStep('file')
    setFileName(null)
    setRows([])
    setMapping({})
    setResult(null)
    setError(null)
  }

  async function readRowsFromFile(file: File): Promise<void> {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError({
        title: 'ไฟล์นี้ยังอ่านไม่ได้',
        message: 'รอบนี้รองรับเฉพาะไฟล์ .csv — เปิดไฟล์ Excel แล้ว “บันทึกเป็น CSV UTF-8” ก่อนนำเข้า',
      })
      return
    }
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length === 0) {
      setError({ title: 'ไฟล์ว่าง', message: 'ไม่พบแถวข้อมูลในไฟล์ (แถวแรกต้องเป็นหัวคอลัมน์)' })
      return
    }
    setFileName(file.name)
    setRows(parsed)
    setMapping(autoMapping(collectHeaders(parsed)))
    setStep('mapping')
  }

  async function runImport(dryRun: boolean): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const response = await callApi<CaseImportResultDto>(
        apiPath('case.import'),
        jsonRequest('POST', {
          financeCompanyId: companyId,
          rows: applyHeaderMapping(rows, mapping),
          dryRun,
        }),
      )
      if (response.error !== undefined || response.data === undefined) {
        setError(response.error ?? { title: 'นำเข้าไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        return
      }
      setResult(response.data)
      setStep('preview')
      if (!dryRun) {
        showToast({
          tone: response.data.failedCount === 0 ? 'success' : 'warning',
          title: `นำเข้าเคสแล้ว ${response.data.createdCount} รายการ`,
          description:
            response.data.failedCount === 0
              ? 'ทุกแถวผ่านการตรวจสอบ'
              : `มี ${response.data.failedCount} แถวที่นำเข้าไม่ได้ — ดูรายละเอียดในตาราง`,
        })
        onImported()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      size="lg"
      title="นำเข้าเคสจากไฟล์"
      description="อัปโหลดไฟล์ → จับคู่คอลัมน์ → ตรวจสอบผลก่อนยืนยัน — เคสที่นำเข้าได้จะเป็นสถานะ “ร่าง” ทั้งหมด"
      footer={
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              reset()
              onClose()
            }}
          >
            ปิดหน้าต่าง
          </Button>
          {step === 'mapping' && (
            <Button loading={busy} disabled={!canPreview} onClick={() => void runImport(true)}>
              ตรวจสอบข้อมูล (ไม่บันทึก)
            </Button>
          )}
          {step === 'preview' && result?.dryRun === true && (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setStep('mapping')}>
                ย้อนกลับไปแก้ mapping
              </Button>
              <Button loading={busy} disabled={result.totalRows === 0} onClick={() => void runImport(false)}>
                ยืนยันนำเข้า {result.totalRows - result.failedCount} รายการ
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {error !== null && (
          <InlineAlert tone="error" title={error.title}>
            {error.message}
          </InlineAlert>
        )}

        <Field id="import-company" label="บริษัทไฟแนนซ์ของไฟล์นี้" required hint="1 ไฟล์ = 1 บริษัทไฟแนนซ์">
          <Select
            id="import-company"
            value={companyId}
            disabled={step !== 'file' && step !== 'mapping'}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            <option value="">— เลือกบริษัทไฟแนนซ์ —</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
        </Field>

        {step === 'file' && (
          <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm font-semibold text-slate-700">เลือกไฟล์ CSV ที่จะนำเข้า</p>
            <p className="mt-1 text-xs text-slate-500">
              แถวแรกต้องเป็นหัวคอลัมน์ · ระบบรู้จักหัวคอลัมน์ทั้งภาษาไทยและอังกฤษ · สูงสุด 1,000 แถวต่อครั้ง
            </p>
            <label className="focus-ring mt-3 inline-block cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
              เลือกไฟล์
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file !== undefined) void readRowsFromFile(file)
                }}
              />
            </label>
          </div>
        )}

        {step === 'mapping' && (
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-800">จับคู่คอลัมน์</h3>
              <span className="text-[11px] text-slate-500">
                {fileName} · {rows.length} แถว
              </span>
            </div>

            {missing.length > 0 && (
              <div className="mb-2">
                <InlineAlert tone="warning" title="ยังจับคู่ข้อมูลบังคับไม่ครบ">
                  ต้องเลือกคอลัมน์สำหรับ: {missing.map(importFieldLabel).join(', ')}
                </InlineAlert>
              </div>
            )}
            {duplicated.length > 0 && (
              <div className="mb-2">
                <InlineAlert tone="error" title="มีคอลัมน์ที่จับคู่ซ้ำกัน">
                  {duplicated.map(importFieldLabel).join(', ')} ถูกจับคู่มากกว่า 1 คอลัมน์ — ค่าจะทับกัน
                </InlineAlert>
              </div>
            )}
            {ignored.length > 0 && (
              <p className="mb-2 text-[11px] text-slate-500">
                คอลัมน์ที่จะไม่ถูกนำเข้า: {ignored.join(', ')}
              </p>
            )}

            <Table>
              <THead>
                <Tr>
                  <Th>คอลัมน์ในไฟล์</Th>
                  <Th>ตัวอย่างค่าแถวแรก</Th>
                  <Th>นำเข้าเป็น</Th>
                </Tr>
              </THead>
              <TBody>
                {headers.map((header) => (
                  <Tr key={header}>
                    <Td>
                      <span className="font-mono text-xs">{header}</span>
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-500">{String(rows[0]?.[header] ?? '')}</span>
                    </Td>
                    <Td>
                      <Select
                        aria-label={`จับคู่คอลัมน์ ${header}`}
                        value={mapping[header] ?? ''}
                        onChange={(event) =>
                          setMapping((current) => ({
                            ...current,
                            [header]: event.target.value as ImportField | '',
                          }))
                        }
                      >
                        <option value="">— ไม่นำเข้า —</option>
                        {IMPORT_COLUMNS.map((column) => (
                          <option key={column.field} value={column.field}>
                            {column.label}
                          </option>
                        ))}
                      </Select>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </section>
        )}

        {step === 'preview' && result !== null && (
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">
                {result.dryRun ? 'ผลการตรวจสอบ (ยังไม่บันทึก)' : 'ผลการนำเข้า'}
              </h3>
              <Badge className="bg-slate-100 text-slate-600">ทั้งหมด {result.totalRows} แถว</Badge>
              <Badge className="bg-emerald-50 text-emerald-700">
                {result.dryRun ? 'ผ่าน' : 'สร้างแล้ว'} {result.createdCount}
              </Badge>
              {result.failedCount > 0 && (
                <Badge className="bg-red-50 text-red-700">ไม่ผ่าน {result.failedCount}</Badge>
              )}
            </div>

            {result.unmappedHeaders.length > 0 && (
              <p className="mb-2 text-[11px] text-slate-500">
                คอลัมน์ที่ระบบไม่รู้จัก (ถูกข้าม): {result.unmappedHeaders.join(', ')}
              </p>
            )}

            <Table>
              <THead>
                <Tr>
                  <Th>แถว</Th>
                  <Th>เลขที่สัญญา</Th>
                  <Th>ผล</Th>
                  <Th>รายละเอียด</Th>
                </Tr>
              </THead>
              <TBody>
                {result.rows.map((row) => (
                  <Tr key={row.rowNumber}>
                    <Td>{row.rowNumber}</Td>
                    <Td>
                      <RefText>{row.caseRef ?? '—'}</RefText>
                    </Td>
                    <Td>
                      {row.status === 'created' ? (
                        <Badge className="bg-emerald-50 text-emerald-700">{result.dryRun ? 'พร้อมนำเข้า' : 'สร้างแล้ว'}</Badge>
                      ) : (
                        <Badge className="bg-red-50 text-red-700">ไม่ผ่าน</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="text-xs text-slate-600">{row.errorMessage ?? '—'}</div>
                      {row.fields !== null && (
                        <div className="text-[11px] text-red-600">
                          {Object.entries(row.fields)
                            .map(([field, message]) => `${field}: ${message}`)
                            .join(' · ')}
                        </div>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </section>
        )}
      </div>
    </Modal>
  )
}
