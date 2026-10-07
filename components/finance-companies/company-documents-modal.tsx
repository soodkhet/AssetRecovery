'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { FileViewerModal, type ViewableFile } from '@/components/cases/file-viewer-modal'
import { REASON_MIN_LENGTH } from '@/components/settings/reason-confirm-modal'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  InlineAlert,
  Input,
  LoadingState,
  Modal,
  Select,
  Textarea,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { isAcceptedMime, MAX_UPLOAD_BYTES } from '@/lib/cases/document-upload'
import {
  COMPANY_DOCUMENT_HINT,
  COMPANY_DOCUMENT_LABEL,
  COMPANY_DOCUMENT_TYPES,
  isSingletonDocumentType,
  type CompanyDocumentType,
} from '@/lib/finance-companies/documents'
import type { CompanyDocumentDto, CompanyDocumentsDto, FinanceCompanyDto } from '@/lib/finance-companies/types'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { uploadToStorage } from '@/lib/uploads/client'

/**
 * Modal "เอกสารบริษัท" (มติ PO U132 · `10` §7.4 · mockup `reference/settings.html` ส่วนบริษัทไฟแนนซ์)
 *
 * - ทุกคนที่เห็นหน้าบริษัทดูรายการ/เปิดไฟล์ได้ (signed URL อายุสั้น + ลง audit การเปิด) · พอร์ทัลไม่แสดง
 * - แนบ/แนบเวอร์ชันใหม่ = Superadmin (`manage_companies`) — **ไม่มีปุ่มลบ** เก็บทุกเวอร์ชัน
 * - คำเตือน (ไม่มีหนังสือรับรอง/ภ.พ.20 · หนังสือรับรองเกิน 6 เดือน) ไม่บล็อกการทำงานใด ๆ
 * สิทธิ์บนปุ่มเป็นแค่ UX — API ตรวจซ้ำเสมอ (DEC-002)
 */

const MANAGE_RESOURCE = 'manage_companies'
const ACCEPT = 'application/pdf,image/*'

interface UploadForm {
  documentType: CompanyDocumentType
  /** แทนที่เวอร์ชันนี้ — null = เอกสารใหม่ */
  replaces: CompanyDocumentDto | null
  title: string
  issuedDate: string
  file: File | null
  reason: string
}

function emptyForm(documentType: CompanyDocumentType, replaces: CompanyDocumentDto | null): UploadForm {
  return { documentType, replaces, title: '', issuedDate: '', file: null, reason: '' }
}

function documentName(doc: CompanyDocumentDto): string {
  return doc.documentType === 'other' && doc.title !== null ? doc.title : COMPANY_DOCUMENT_LABEL[doc.documentType]
}

export function CompanyDocumentsModal({
  company,
  onClose,
  onChanged,
}: {
  company: FinanceCompanyDto
  onClose: () => void
  onChanged: () => void
}) {
  const { showToast } = useToast()
  const [data, setData] = useState<CompanyDocumentsDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<UploadForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState<ViewableFile | null>(null)
  const [historyOpen, setHistoryOpen] = useState<ReadonlySet<string>>(new Set())

  const fetchDocuments = useCallback(
    async () => callApi<CompanyDocumentsDto>(`/api/finance-companies/${company.id}/documents`),
    [company.id],
  )

  const reload = useCallback(async () => {
    const result = await fetchDocuments()
    setLoading(false)
    if (result.error !== undefined) {
      setError(result.error.message)
      return
    }
    setError(null)
    setData(result.data ?? null)
  }, [fetchDocuments])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchDocuments()
      if (cancelled) return
      setLoading(false)
      if (result.error !== undefined) {
        setError(result.error.message)
        return
      }
      setError(null)
      setData(result.data ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchDocuments])

  const documents = data?.documents ?? []
  const current = documents.filter((doc) => doc.isCurrent)
  /** เวอร์ชันก่อน ๆ ของสายเดียวกัน (ไล่ replaces ย้อนกลับ) */
  function historyOf(doc: CompanyDocumentDto): CompanyDocumentDto[] {
    const result: CompanyDocumentDto[] = []
    let cursor = doc.replacesDocumentId
    while (cursor !== null) {
      const previous = documents.find((candidate) => candidate.id === cursor)
      if (previous === undefined) break
      result.push(previous)
      cursor = previous.replacesDocumentId
    }
    return result
  }

  function fileProblem(file: File | null): string | null {
    if (file === null) return 'เลือกไฟล์'
    if (!isAcceptedMime('other_doc', file.type)) return `รับเฉพาะ PDF หรือรูปภาพ — ไฟล์ ${file.name} ไม่รองรับ`
    if (file.size <= 0) return `ไฟล์ ${file.name} ว่างเปล่า`
    if (file.size > MAX_UPLOAD_BYTES) return `ไฟล์ ${file.name} ใหญ่เกิน ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`
    return null
  }

  const formProblem =
    form === null
      ? 'no-form'
      : (fileProblem(form.file) ??
        (form.documentType === 'other' && form.replaces === null && form.title.trim() === ''
          ? 'ระบุชื่อเอกสาร'
          : form.documentType === 'company_certificate' && form.issuedDate === ''
            ? 'ระบุวันที่ออกหนังสือรับรอง'
            : form.reason.trim().length < REASON_MIN_LENGTH
              ? `ระบุเหตุผลอย่างน้อย ${REASON_MIN_LENGTH} ตัวอักษร`
              : null))

  async function submit(): Promise<void> {
    if (form === null || form.file === null || formProblem !== null) return
    setSaving(true)
    try {
      let path: string
      try {
        path = await uploadToStorage(
          { kind: 'company_document', companyId: company.id, documentType: form.documentType },
          form.file,
        )
      } catch (uploadError) {
        showToast({
          tone: 'error',
          title: 'อัปโหลดไม่สำเร็จ',
          description: uploadError instanceof Error ? uploadError.message : 'ลองใหม่อีกครั้ง',
        })
        return
      }
      const result = await callApi<CompanyDocumentDto>(
        `/api/finance-companies/${company.id}/documents`,
        jsonRequest('POST', {
          documentType: form.documentType,
          title: form.documentType === 'other' ? form.title.trim() : '',
          issuedDate: form.documentType === 'company_certificate' ? form.issuedDate : '',
          path,
          originalName: form.file.name,
          replacesDocumentId: form.replaces?.id ?? null,
          reason: form.reason.trim(),
        }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: form.replaces === null ? 'แนบเอกสารแล้ว' : 'แนบเวอร์ชันใหม่แล้ว',
        description: `${COMPANY_DOCUMENT_LABEL[form.documentType]} — เวอร์ชันเดิมยังเก็บไว้ครบ`,
      })
      setForm(null)
      setLoading(true)
      await reload()
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  /** ชนิดที่ยังแนบเอกสารใหม่ได้ (ชนิดเดี่ยวที่มีแล้วต้อง "แนบเวอร์ชันใหม่" แทน) */
  const addableTypes = COMPANY_DOCUMENT_TYPES.filter(
    (type) => !isSingletonDocumentType(type) || !current.some((doc) => doc.documentType === type),
  )

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={`เอกสารบริษัท — ${company.name}`}
        description="เก็บทุกเวอร์ชัน ไม่มีการลบ — แนบใหม่จะเป็นเวอร์ชันใหม่และไฟล์เดิมยังเปิดดูได้"
        footer={
          <Button variant="secondary" onClick={onClose}>
            ปิด
          </Button>
        }
      >
        <div className="space-y-4">
          {loading && <LoadingState />}
          {!loading && error !== null && (
            <ErrorState
              message={error}
              action={
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
          )}

          {!loading && error === null && data !== null && (
            <>
              {data.warnings.length > 0 && (
                <InlineAlert tone="warning" title="เอกสารยังไม่ครบ (เตือนเท่านั้น ไม่บล็อกการทำงาน)">
                  <ul className="list-disc pl-4">
                    {data.warnings.map((warning) => (
                      <li key={warning.kind}>{warning.message}</li>
                    ))}
                  </ul>
                </InlineAlert>
              )}

              {current.length === 0 && (
                <EmptyState title="ยังไม่มีเอกสารบริษัท" description="แนบหนังสือรับรองบริษัทและ ภ.พ.20 เป็นอย่างน้อย" />
              )}

              {current.length > 0 && (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {current.map((doc) => {
                    const history = historyOf(doc)
                    const expanded = historyOpen.has(doc.id)
                    return (
                      <div key={doc.id} className="p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {documentName(doc)}{' '}
                              <Badge className="bg-slate-100 text-slate-700">เวอร์ชัน {doc.version}</Badge>
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {doc.originalName}
                              {doc.issuedDate !== null && ` · ออกเมื่อ ${fmtDate(doc.issuedDate)}`} · แนบเมื่อ{' '}
                              {fmtDateTime(doc.createdAt)} โดย {doc.createdByName}
                            </div>
                            <div className="mt-0.5 font-mono text-[10px] text-slate-400">SHA-256 {doc.fileSha256}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setViewing({
                                  fileUrl: doc.filePath,
                                  originalName: doc.originalName,
                                  mimeType: doc.mimeType,
                                  uploadedByName: doc.createdByName,
                                  uploadedAt: doc.createdAt,
                                })
                              }
                            >
                              เปิดดู
                            </Button>
                            <Can action="manage" resource={MANAGE_RESOURCE}>
                              <Button variant="secondary" onClick={() => setForm(emptyForm(doc.documentType, doc))}>
                                แนบเวอร์ชันใหม่
                              </Button>
                            </Can>
                          </div>
                        </div>
                        {history.length > 0 && (
                          <div className="mt-2">
                            <button
                              type="button"
                              className="text-xs font-semibold text-slate-600 underline"
                              onClick={() =>
                                setHistoryOpen((open) => {
                                  const next = new Set(open)
                                  if (next.has(doc.id)) next.delete(doc.id)
                                  else next.add(doc.id)
                                  return next
                                })
                              }
                            >
                              {expanded ? 'ซ่อนเวอร์ชันก่อนหน้า' : `ดูเวอร์ชันก่อนหน้า (${history.length})`}
                            </button>
                            {expanded && (
                              <ul className="mt-1 space-y-1">
                                {history.map((previous) => (
                                  <li key={previous.id} className="flex items-center justify-between gap-2 text-xs text-slate-500">
                                    <span>
                                      เวอร์ชัน {previous.version} · {previous.originalName}
                                      {previous.issuedDate !== null && ` · ออกเมื่อ ${fmtDate(previous.issuedDate)}`} · แนบเมื่อ{' '}
                                      {fmtDateTime(previous.createdAt)}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      onClick={() =>
                                        setViewing({
                                          fileUrl: previous.filePath,
                                          originalName: previous.originalName,
                                          mimeType: previous.mimeType,
                                          uploadedByName: previous.createdByName,
                                          uploadedAt: previous.createdAt,
                                        })
                                      }
                                    >
                                      เปิดดู
                                    </Button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <Can action="manage" resource={MANAGE_RESOURCE}>
                {form === null && addableTypes.length > 0 && (
                  <Button onClick={() => setForm(emptyForm(addableTypes[0] ?? 'other', null))}>+ แนบเอกสาร</Button>
                )}
              </Can>

              {form !== null && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-bold text-slate-900">
                    {form.replaces === null ? 'แนบเอกสารใหม่' : `แนบเวอร์ชันใหม่ของ ${documentName(form.replaces)}`}
                  </div>
                  {form.replaces === null && (
                    <Field id="company-doc-type" label="ชนิดเอกสาร" required hint={COMPANY_DOCUMENT_HINT[form.documentType]}>
                      <Select
                        id="company-doc-type"
                        value={form.documentType}
                        onChange={(event) =>
                          setForm(emptyForm(event.target.value as CompanyDocumentType, null))
                        }
                      >
                        {addableTypes.map((type) => (
                          <option key={type} value={type}>
                            {COMPANY_DOCUMENT_LABEL[type]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  {form.documentType === 'other' && (
                    <Field
                      id="company-doc-title"
                      label="ชื่อเอกสาร"
                      required={form.replaces === null}
                      hint={form.replaces === null ? undefined : 'เว้นว่าง = ใช้ชื่อเดิม'}
                    >
                      <Input
                        id="company-doc-title"
                        value={form.title}
                        onChange={(event) => setForm({ ...form, title: event.target.value })}
                        placeholder="เช่น หนังสือมอบอำนาจ"
                      />
                    </Field>
                  )}
                  {form.documentType === 'company_certificate' && (
                    <Field id="company-doc-issued" label="วันที่ออกหนังสือรับรอง" required>
                      <Input
                        id="company-doc-issued"
                        type="date"
                        value={form.issuedDate}
                        onChange={(event) => setForm({ ...form, issuedDate: event.target.value })}
                      />
                    </Field>
                  )}
                  <Field id="company-doc-file" label="ไฟล์ (PDF หรือรูปภาพ ไม่เกิน 10 MB)" required>
                    <input
                      id="company-doc-file"
                      type="file"
                      accept={ACCEPT}
                      className="block text-xs"
                      onChange={(event) => setForm({ ...form, file: event.target.files?.[0] ?? null })}
                    />
                  </Field>
                  <Field id="company-doc-reason" label="เหตุผล" required>
                    <Textarea
                      id="company-doc-reason"
                      value={form.reason}
                      onChange={(event) => setForm({ ...form, reason: event.target.value })}
                      placeholder="เช่น บริษัทส่งหนังสือรับรองฉบับใหม่ประจำปี"
                    />
                  </Field>
                  {formProblem !== null && form.file !== null && (
                    <p className="text-xs text-amber-700">{formProblem}</p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>
                      ยกเลิก
                    </Button>
                    <Button loading={saving} disabled={formProblem !== null} onClick={() => void submit()}>
                      {form.replaces === null ? 'แนบเอกสาร' : 'แนบเวอร์ชันใหม่'}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      <FileViewerModal open={viewing !== null} document={viewing} onClose={() => setViewing(null)} />
    </>
  )
}
