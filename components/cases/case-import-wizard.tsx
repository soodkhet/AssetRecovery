'use client'

import { buttonClass } from '@/components/ui/button'
import { useState } from 'react'
import {
  Badge,
  Button,
  Field,
  InlineAlert,
  Modal,
  ModalCancelButton,
  RefText,
  Select,
  StatusBadge,
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
import { ImportTemplateHelp } from '@/components/imports/import-template-help'
import { FileDropzone } from '@/components/uploads/file-dropzone'
import {
  buildCaseImportTemplate,
  CASE_IMPORT_TEMPLATE_COLUMNS,
  CASE_IMPORT_TEMPLATE_DOCS,
  CASE_IMPORT_TEMPLATE_FILE_NAME,
  CASE_IMPORT_TEMPLATE_XLSX_FILE_NAME,
  IMPORT_COLUMNS,
  MAX_CASE_IMPORT_ROWS,
  parseCsv,
  type ImportField,
} from '@/lib/cases/import'
import {
  downloadTextFile,
  downloadXlsxTemplate,
  IMPORT_FILE_ACCEPT,
  readImportFileAsCsv,
} from '@/lib/imports/download-client'
import {
  applyHeaderMapping,
  autoMapping,
  collectHeaders,
  duplicateMappedFields,
  ignoredHeaders,
  importErrorFieldLabel,
  importFieldLabel,
  importResultToastDescription,
  importableRowCount,
  missingRequiredFields,
  reconcileLostImport,
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
 * - รับไฟล์ **.xlsx และ .csv** (มติผู้ใช้ 04/10/2569) — .xlsx แปลงเป็นข้อความ CSV ด้วย SheetJS แล้วเข้า
 *   `parseCsv()` ทางเดียวกับ .csv · จุดอ่านไฟล์อยู่ที่ `readRowsFromFile()` ที่เดียว
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
    // ไล่ตรวจโมดัลค้าง mount 16/10/2569 — ทิ้งข้อมูล/นำเข้าเสร็จแล้วเปิดใหม่ ห้ามค้างบริษัทเดิม (กันนำเข้าไฟล์ถัดไปผิดบริษัท)
    setCompanyId('')
    setFileName(null)
    setRows([])
    setMapping({})
    setResult(null)
    setError(null)
  }

  async function readRowsFromFile(file: File): Promise<void> {
    setError(null)
    let text: string
    try {
      text = await readImportFileAsCsv(file, { maxDataRows: MAX_CASE_IMPORT_ROWS })
    } catch (readError) {
      setError({
        title: 'อ่านไฟล์ไม่ได้',
        message: readError instanceof Error ? readError.message : 'กรุณาลองใหม่',
      })
      return
    }
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

  function postImport(dryRun: boolean) {
    return callApi<CaseImportResultDto>(
      apiPath('case.import'),
      jsonRequest('POST', {
        financeCompanyId: companyId,
        rows: applyHeaderMapping(rows, mapping),
        dryRun,
      }),
    )
  }

  /**
   * mytester7 S7-AG6-01 — ยืนยันนำเข้าแล้วไม่ได้รับคำตอบ ⇒ ตรวจซ้ำด้วย preview (ไม่เขียนอะไร) แล้วบอกผลตามจริง
   * แทน "เชื่อมต่อไม่สำเร็จ" (server อาจนำเข้าเสร็จแล้วแต่คำตอบหาย) · คืน `false` = ตรวจซ้ำไม่ได้ ให้ใช้ข้อความเดิม
   */
  async function recoverLostImport(preview: CaseImportResultDto): Promise<boolean> {
    const recheck = await postImport(true)
    if (recheck.data === undefined) return false
    const outcome = reconcileLostImport(preview, recheck.data)
    setResult(outcome.result)
    setStep('preview')
    if (outcome.importedCount === 0) {
      setError({
        title: 'ยังไม่ได้นำเข้า',
        message: 'ไม่ได้รับคำตอบจากระบบ — ตรวจแล้วยังไม่มีเคสจากไฟล์นี้ในระบบ กดยืนยันนำเข้าอีกครั้งได้',
      })
      return true
    }
    onImported()
    if (outcome.remainingCount > 0) {
      setError({
        title: 'นำเข้าไปแล้วบางส่วน',
        message: `ไม่ได้รับคำตอบจากระบบ — ตรวจแล้วนำเข้าแล้ว ${outcome.importedCount} รายการ ยังเหลือ ${outcome.remainingCount} รายการที่นำเข้าได้ กดยืนยันนำเข้าอีกครั้งเพื่อนำเข้าส่วนที่เหลือ`,
      })
      return true
    }
    showToast({
      tone: 'success',
      title: `นำเข้าเคสแล้ว ${outcome.importedCount} รายการ`,
      description: 'ไม่ได้รับคำตอบจากระบบ แต่ตรวจแล้วพบเคสจากไฟล์นี้ในระบบครบ',
    })
    return true
  }

  async function runImport(dryRun: boolean): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const response = await postImport(dryRun)
      if (response.error !== undefined || response.data === undefined) {
        const preview = result
        if (!dryRun && response.error?.outcomeUnknown === true && preview !== null && (await recoverLostImport(preview))) {
          return
        }
        setError(response.error ?? { title: 'นำเข้าไม่สำเร็จ', message: 'กรุณาลองใหม่' })
        return
      }
      setResult(response.data)
      setStep('preview')
      if (!dryRun) {
        showToast({
          tone: response.data.failedCount === 0 ? 'success' : 'warning',
          title: `นำเข้าเคสแล้ว ${response.data.createdCount} รายการ`,
          description: importResultToastDescription(response.data),
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
      // นำเข้าเสร็จแล้ว (หน้าผลลัพธ์) ⇒ ปิดได้ทันที ไม่ถามทิ้งข้อมูล (staging E-051)
      confirmDiscard={result === null}
      size="lg"
      title="นำเข้าเคสจากไฟล์"
      description="อัปโหลดไฟล์ → จับคู่คอลัมน์ → ตรวจสอบผลก่อนยืนยัน — เคสที่นำเข้าได้จะเป็นสถานะ “ร่าง” ทั้งหมด"
      footer={
        <>
          <ModalCancelButton
            disabled={busy}
            onClose={() => {
              reset()
              onClose()
            }}
          >
            ปิดหน้าต่าง
          </ModalCancelButton>
          {step === 'mapping' && (
            <Button loading={busy} disabled={!canPreview} onClick={() => void runImport(true)}>
              ตรวจสอบข้อมูล (ไม่บันทึก)
            </Button>
          )}
          {step === 'preview' && result?.dryRun === true && (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setStep('mapping')}>
                ย้อนกลับไปแก้การจับคู่คอลัมน์
              </Button>
              {/* mytester7 S7-AG6-02 — ไม่มีแถวที่นำเข้าได้ ⇒ ปิดปุ่ม (คำบนปุ่มต้องตรง action) */}
              <Button loading={busy} disabled={importableRowCount(result) === 0} onClick={() => void runImport(false)}>
                ยืนยันนำเข้า {importableRowCount(result)} รายการ
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
          <FileDropzone
            accept={IMPORT_FILE_ACCEPT}
            title="เลือกไฟล์ Excel (.xlsx) หรือ CSV ที่จะนำเข้า"
            description="แถวแรกต้องเป็นหัวคอลัมน์ · ระบบรู้จักหัวคอลัมน์ทั้งภาษาไทยและอังกฤษ · สูงสุด 1,000 แถวต่อครั้ง"
            onPick={(file) => void readRowsFromFile(file)}
            className="bg-white p-6 hover:bg-slate-50"
          >
            {/* หน้าตาปุ่มเดิม — ทั้งกล่องเป็นปุ่มเดียว (SV5-A11Y-A2-01) */}
            <span aria-hidden="true" className={buttonClass('primary', 'sm', 'mt-3')}>
              เลือกไฟล์
            </span>
          </FileDropzone>
        )}

        {step === 'file' && (
          <ImportTemplateHelp
            columns={CASE_IMPORT_TEMPLATE_DOCS}
            onDownload={() =>
              void downloadXlsxTemplate(CASE_IMPORT_TEMPLATE_XLSX_FILE_NAME, CASE_IMPORT_TEMPLATE_COLUMNS).catch(() =>
                showToast({ tone: 'error', title: 'สร้างไฟล์ตัวอย่างไม่สำเร็จ', description: 'ลองดาวน์โหลดแบบ CSV แทน' }),
              )
            }
            onDownloadCsv={() => downloadTextFile(CASE_IMPORT_TEMPLATE_FILE_NAME, buildCaseImportTemplate())}
            note="หัวคอลัมน์ในไฟล์ตัวอย่างเป็นภาษาไทยที่ระบบรู้จัก · มีข้อมูลสมมติ 2 แถว ลบแล้วกรอกข้อมูลจริงแทน · มูลหนี้กรอกเป็นบาท"
          />
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
              <Badge>ทั้งหมด {result.totalRows} แถว</Badge>
              <StatusBadge group="success" label={`${result.dryRun ? 'ผ่าน' : 'สร้างแล้ว'} ${result.createdCount}`} />
              {result.failedCount > 0 && (
                <StatusBadge group="critical" label={`ไม่ผ่าน ${result.failedCount}`} />
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
                        <StatusBadge group="success" label={result.dryRun ? 'พร้อมนำเข้า' : 'สร้างแล้ว'} />
                      ) : (
                        <StatusBadge group="critical" label="ไม่ผ่าน" />
                      )}
                    </Td>
                    <Td>
                      <div className="text-xs text-slate-600">{row.errorMessage ?? '—'}</div>
                      {/* เลขที่สัญญาซ้ำเคสเดิม ⇒ ลิงก์เปิดเคสนั้นในแท็บใหม่ (ไม่ทิ้งผลตรวจไฟล์ — mytester B-10) */}
                      {row.existingCaseId !== undefined && (
                        <a
                          href={`/cases/submit?case=${encodeURIComponent(row.existingCaseId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="focus-ring text-xs font-semibold text-sky-700 underline"
                        >
                          เปิดเคสเดิม ↗
                        </a>
                      )}
                      {row.fields !== null && (
                        <div className="text-[11px] text-red-600">
                          {Object.entries(row.fields)
                            .map(([field, message]) => `${importErrorFieldLabel(field)}: ${message}`)
                            .join(' · ')}
                        </div>
                      )}
                      {/* เตือน ไม่ทำให้แถวตก — เช่น Serial ที่ดูเหมือน IMEI พิมพ์ผิด (มติ PO U54) */}
                      {row.warnings !== null && (
                        <div className="text-[11px] font-semibold text-amber-600">
                          {Object.entries(row.warnings)
                            .map(([field, message]) => `${importErrorFieldLabel(field)}: ${message}`)
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
