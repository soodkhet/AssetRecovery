'use client'

import { useState } from 'react'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  Button,
  Field,
  InlineAlert,
  Input,
  Modal,
  RefText,
  Select,
  StatusBadge,
  TBody,
  THead,
  Table,
  Td,
  Textarea,
  Th,
  Tr,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { netInvoiceAmounts } from '@/lib/credit-notes/credit-note'
import type { AwaitingCreditNoteDto, CreditNoteDto } from '@/lib/credit-notes/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import { bahtInputError, fmtSatangSymbol, parseBahtInput } from '@/lib/format/money'
import { signedFileUrl, StorageUploadError, uploadToStorage } from '@/lib/uploads/client'

/**
 * Modal "ใบลดหนี้" ต่อใบกำกับภาษี (มติ PO 05/10/2569 U14 + มติบัญชี B1)
 *
 * - รายการใบลดหนี้ของใบนี้ + ยอดสุทธิหลังหักใบลดหนี้ที่ใช้งาน
 * - ฟอร์ม "บันทึกใบลดหนี้" (เฉพาะบัญชี) — ใบลดหนี้ออกโดยสำนักงานบัญชี ระบบแค่บันทึกตามเอกสาร
 *   เลขที่กรอกตามเอกสาร · VAT ไม่กรอก = ระบบคิดจากอัตราของใบกำกับเดิม · แนบไฟล์สแกนผ่าน server (DEC-014)
 * - ยกเลิกใบที่บันทึกผิดพร้อมเหตุผล (ห้ามลบ)
 * ยอดสุทธิใช้ `netInvoiceAmounts()` (pure SSOT) — ไม่คำนวณเงินเองบนจอ (Rule 01)
 */

export interface CreditNoteInvoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  companyName: string
  totalBeforeVatSatang: number
  vatSatang: number
  totalSatang: number
}

export function CreditNoteModal({
  invoice,
  notes,
  awaiting,
  canManage,
  onClose,
  onChanged,
}: {
  invoice: CreditNoteInvoice | null
  notes: readonly CreditNoteDto[]
  awaiting: readonly AwaitingCreditNoteDto[]
  canManage: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const { showToast } = useToast()
  const [creditNoteNumber, setCreditNoteNumber] = useState('')
  const [issueDate, setIssueDate] = useState(toInputDate(new Date()))
  const [amountText, setAmountText] = useState('')
  const [vatText, setVatText] = useState('')
  const [adjustmentId, setAdjustmentId] = useState('')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState<CreditNoteDto | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  if (invoice === null) return null

  const net = netInvoiceAmounts(invoice, notes)
  const amountError = bahtInputError(amountText, 'มูลค่าที่ลด')
  const vatError = bahtInputError(vatText, 'ภาษีที่ลด')
  const amountSatang = parseBahtInput(amountText)
  const vatSatang = parseBahtInput(vatText)
  const canSubmit =
    creditNoteNumber.trim() !== '' &&
    issueDate !== '' &&
    reason.trim() !== '' &&
    amountError === null &&
    vatError === null &&
    amountSatang !== null &&
    amountSatang > 0

  async function submit(): Promise<void> {
    if (invoice === null || !canSubmit) return
    setSaving(true)
    let filePath: string | null = null
    try {
      if (file !== null) filePath = await uploadToStorage({ kind: 'credit_note', taxInvoiceId: invoice.id }, file)
    } catch (error) {
      setSaving(false)
      const message = error instanceof StorageUploadError ? error.message : 'อัปโหลดไฟล์ไม่สำเร็จ'
      showToast({ tone: 'error', title: 'แนบไฟล์ไม่สำเร็จ', description: message })
      return
    }

    const result = await callApi<CreditNoteDto>(
      '/api/accounting/credit-notes',
      jsonRequest('POST', {
        taxInvoiceId: invoice.id,
        creditNoteNumber: creditNoteNumber.trim(),
        issueDate,
        amountBeforeVatSatang: amountSatang,
        vatSatang: vatSatang === null ? null : vatSatang,
        adjustmentId: adjustmentId === '' ? null : adjustmentId,
        reason: reason.trim(),
        filePath,
      }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: `บันทึกใบลดหนี้เลขที่ ${result.data?.creditNoteNumber ?? ''} แล้ว`,
      description: `ลด ${fmtSatangSymbol(result.data?.totalSatang ?? 0)} จากใบกำกับ ${invoice.invoiceNumber}`,
    })
    setCreditNoteNumber('')
    setAmountText('')
    setVatText('')
    setAdjustmentId('')
    setReason('')
    setFile(null)
    onChanged()
  }

  async function runCancel(): Promise<void> {
    if (cancelling === null) return
    setSaving(true)
    const result = await callApi<CreditNoteDto>(
      `/api/accounting/credit-notes/${cancelling.id}/cancel`,
      jsonRequest('PATCH', { reason: cancelReason.trim() }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({ tone: 'success', title: `ยกเลิกใบลดหนี้เลขที่ ${cancelling.creditNoteNumber} แล้ว` })
    setCancelling(null)
    setCancelReason('')
    onChanged()
  }

  async function openFile(path: string): Promise<void> {
    const signed = await signedFileUrl(path)
    if (signed === null) {
      showToast({ tone: 'error', title: 'เปิดไฟล์ไม่ได้', description: 'ไม่พบไฟล์หรือคุณไม่มีสิทธิ์เปิดไฟล์นี้' })
      return
    }
    window.open(signed, '_blank', 'noreferrer')
  }

  return (
    <>
      <Modal
        open={cancelling === null}
        onClose={onClose}
        size="lg"
        title={`ใบลดหนี้ — ใบกำกับ ${invoice.invoiceNumber}`}
        description={`${invoice.companyName} · ออกเมื่อ ${fmtDate(invoice.invoiceDate)}`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              ปิด
            </Button>
            {canManage && (
              <Button loading={saving} disabled={!canSubmit} onClick={() => void submit()}>
                บันทึกใบลดหนี้
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2">
            <div className="flex justify-between">
              <span className="text-slate-500">ยอดตามใบกำกับ</span>
              <span className="font-mono font-semibold">{fmtSatangSymbol(invoice.totalSatang)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ยอดสุทธิหลังหักใบลดหนี้</span>
              <span className="font-mono font-bold text-slate-900">{fmtSatangSymbol(net.totalSatang)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">คงเหลือก่อนภาษี (ลดได้อีก)</span>
              <span className="font-mono">{fmtSatangSymbol(net.totalBeforeVatSatang)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ภาษีขายคงเหลือ</span>
              <span className="font-mono">{fmtSatangSymbol(net.vatSatang)}</span>
            </div>
          </div>

          {awaiting.length > 0 && (
            <InlineAlert tone="warning" title="รอใบลดหนี้">
              มีรายการปรับปรุงลดยอดที่อนุมัติแล้ว {awaiting.length} รายการของใบกำกับนี้ที่ยังไม่มีใบลดหนี้ — ขอให้สำนักงานบัญชีออก
              ใบลดหนี้แล้วบันทึกที่นี่ ลูกค้าจะเห็นยอดลดลงเมื่อบันทึกใบลดหนี้แล้วเท่านั้น
            </InlineAlert>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <Table>
              <THead>
                <Tr>
                  <Th>เลขที่ / วันที่</Th>
                  <Th numeric>ก่อนภาษี</Th>
                  <Th numeric>ภาษี</Th>
                  <Th numeric>รวม</Th>
                  <Th>เหตุผล</Th>
                  <Th className="text-right">จัดการ</Th>
                </Tr>
              </THead>
              <TBody>
                {notes.length === 0 && (
                  <Tr>
                    <Td colSpan={6} className="py-6 text-center text-xs text-slate-400">
                      ยังไม่มีใบลดหนี้ของใบกำกับนี้
                    </Td>
                  </Tr>
                )}
                {notes.map((note) => (
                  <Tr key={note.id}>
                    <Td>
                      <RefText className={note.status === 'cancelled' ? 'line-through text-red-500' : undefined}>
                        {note.creditNoteNumber}
                      </RefText>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {fmtDate(note.issueDate)} · บันทึกโดย {note.createdByName}
                      </div>
                      <div className="mt-0.5">
                        <StatusBadge status={note.status} label={note.statusLabel} />
                      </div>
                    </Td>
                    <Td numeric>{fmtSatangSymbol(note.amountBeforeVatSatang)}</Td>
                    <Td numeric className="text-slate-500">
                      {fmtSatangSymbol(note.vatSatang)}
                    </Td>
                    <Td numeric className="font-semibold">
                      {fmtSatangSymbol(note.totalSatang)}
                    </Td>
                    <Td className="max-w-[16rem] text-xs text-slate-600">
                      {note.reason}
                      {note.cancelReason !== null && (
                        <div className="mt-0.5 text-[10px] text-red-500">
                          ยกเลิก {fmtDate(note.cancelledAt)}: {note.cancelReason}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {note.filePath !== null && (
                          <Button size="sm" variant="ghost" onClick={() => void openFile(note.filePath ?? '')}>
                            ดูไฟล์
                          </Button>
                        )}
                        {canManage && note.status === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCancelReason('')
                              setCancelling(note)
                            }}
                          >
                            ยกเลิก
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          {canManage && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">บันทึกใบลดหนี้ที่สำนักงานบัญชีออกแล้ว</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id="cn-number" label="เลขที่ใบลดหนี้" hint="ตามเอกสารที่สำนักงานบัญชีออก">
                  <Input
                    id="cn-number"
                    className="font-mono"
                    value={creditNoteNumber}
                    maxLength={50}
                    onChange={(event) => setCreditNoteNumber(event.target.value)}
                  />
                </Field>
                <Field
                  id="cn-date"
                  label="วันที่ออกใบลดหนี้"
                  hint="ภาษีขายลดในเดือนที่ออก — งวดที่ปิดแล้วบันทึกไม่ได้ · ช่องนี้ใช้ ค.ศ. ตามที่เบราว์เซอร์บังคับ"
                >
                  <Input id="cn-date" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
                </Field>
                <Field id="cn-amount" label="มูลค่าที่ลด (ก่อนภาษี, บาท)" error={amountError ?? undefined}>
                  <Input
                    id="cn-amount"
                    numeric
                    inputMode="decimal"
                    value={amountText}
                    invalid={amountError !== null}
                    onChange={(event) => setAmountText(event.target.value)}
                  />
                </Field>
                <Field
                  id="cn-vat"
                  label="ภาษีมูลค่าเพิ่มที่ลด (บาท)"
                  hint="เว้นว่าง = คำนวณจากอัตราภาษีของใบกำกับเดิม · กรอกตามเอกสารได้ (คลาดได้ไม่เกิน 1 สตางค์)"
                  error={vatError ?? undefined}
                >
                  <Input
                    id="cn-vat"
                    numeric
                    inputMode="decimal"
                    value={vatText}
                    invalid={vatError !== null}
                    onChange={(event) => setVatText(event.target.value)}
                  />
                </Field>
              </div>
              {awaiting.length > 0 && (
                <Field id="cn-adjustment" label="รายการปรับปรุงที่เป็นต้นเหตุ (ถ้ามี)">
                  <Select id="cn-adjustment" value={adjustmentId} onChange={(event) => setAdjustmentId(event.target.value)}>
                    <option value="">— ไม่ระบุ —</option>
                    {awaiting.map((row) => (
                      <option key={row.adjustmentId} value={row.adjustmentId}>
                        ลดยอด {fmtSatangSymbol(row.amountSatang)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field id="cn-reason" label="เหตุผล">
                <Textarea
                  id="cn-reason"
                  rows={2}
                  value={reason}
                  maxLength={1000}
                  placeholder="เช่น ลดค่าบริการตามที่ตกลงกับลูกค้า"
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <Field id="cn-file" label="ไฟล์สแกนใบลดหนี้ (PDF/รูป)" hint="ไม่บังคับ แต่ควรแนบเพื่อเป็นหลักฐาน">
                <Input
                  id="cn-file"
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </Field>
              <InlineAlert tone="info" title="บันทึกแล้วแก้ไม่ได้">
                ถ้าบันทึกผิดให้ยกเลิกพร้อมเหตุผลแล้วบันทึกใหม่ — ใบที่ยกเลิกยังอยู่ในทะเบียนเสมอ
              </InlineAlert>
            </div>
          )}
        </div>
      </Modal>

      <ReasonConfirmModal
        open={cancelling !== null}
        title={`ยกเลิกใบลดหนี้เลขที่ ${cancelling?.creditNoteNumber ?? ''}`}
        description="ใช้เมื่อบันทึกผิดหรือสำนักงานบัญชียกเลิกเอกสาร — ยอดจะกลับไปเป็นของใบกำกับตามเดิม"
        confirmLabel="ยืนยันยกเลิกใบลดหนี้"
        loading={saving}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onClose={() => setCancelling(null)}
        onConfirm={() => void runCancel()}
        placeholder="เช่น กรอกยอดผิดจากเอกสาร"
      />
    </>
  )
}
