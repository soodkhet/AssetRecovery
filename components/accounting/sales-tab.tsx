'use client'

import { BillingStatusBadge } from '@/components/finance/billing-status-badge'
import { useState } from 'react'
import { CreditNoteModal, type CreditNoteInvoice } from '@/components/accounting/credit-note-modal'
import { IssueTaxInvoiceModal, type IssueTarget } from '@/components/accounting/issue-tax-invoice-modal'
import { useAwaitingCreditNotes, useCreditNotes } from '@/components/accounting/use-credit-notes'
import { useSalesRecords, type SalesInvoiceFilter } from '@/components/accounting/use-sales'
import { usePermission } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  Button,
  FilterGroup,
  InlineAlert,
  RefText,
  StatCard,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
  useToast,
} from '@/components/ui'
import { PERIOD_CLOSED_CANCEL_HINT } from '@/lib/accounting/period'
import { callApi, jsonRequest } from '@/lib/api/types'
import { AWAITING_NOTE_LABEL, netInvoiceAmounts, sumActiveCreditNotes, sumActiveDebitNotes } from '@/lib/credit-notes/credit-note'
import type { CreditNoteType } from '@/lib/credit-notes/schemas'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import { MANAGE_TAX_INVOICE } from '@/lib/sales/sales'
import type { CreditNoteDto } from '@/lib/credit-notes/types'
import type { SalesRecordDto, TaxInvoiceDto, TaxInvoiceSummaryDto } from '@/lib/sales/types'

/**
 * แท็บ "รายได้และขาย" (`31` §8 · mockup `accounting.html` แท็บ `sales`)
 *
 * ⚠️ **ไม่มีปุ่มสร้าง/แก้/ลบรายการขาย** โดยเจตนา — รายการเกิดอัตโนมัติเมื่อรอบวางบิลถูกส่ง (`31` §6.1)
 * ⚠️ มติ PO U95 — ตอนวางบิลมีแค่ **ใบแจ้งหนี้/ใบวางบิล** (ปุ่ม PDF) · **ใบเสร็จรับเงิน/ใบกำกับภาษี** ออกจากแท็บเงินรับ
 *    (1 เงินรับ = 1 ใบ · รับบางส่วนได้หลายใบต่อรอบ) · หน้านี้ยกเลิกใบ/ออกใบแทนใบกำกับแบบเดิมได้
 * ⚠️ ยกเลิก/ออกใบแทน = สิทธิ์บัญชี (`manage_tax_invoice`) เท่านั้น · การเงินดูได้อย่างเดียว
 * ⚠️ ใบที่ยกเลิกยัง**แสดงในทะเบียน** เพื่อพิสูจน์ความต่อเนื่องของเลขที่ (`31` §9.1 — ห้ามลบ)
 * ใบลดหนี้ (มติ PO U14): ปุ่ม "ใบลดหนี้" ต่อใบกำกับ · ยอดสุทธิหลังหักใบลดหนี้ · ป้าย "รอใบลดหนี้"
 */

const INVOICE_FILTERS: readonly { value: SalesInvoiceFilter; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'awaiting', label: 'ยังไม่มีเอกสารภาษี' },
  { value: 'issued', label: 'มีเอกสารภาษีแล้ว' },
]

export function SalesTab() {
  const { can } = usePermission()
  const canManageInvoice = can('manage', MANAGE_TAX_INVOICE)
  const { showToast } = useToast()

  const [invoiceState, setInvoiceState] = useState<SalesInvoiceFilter>('all')
  const { data, loading, error, reload } = useSalesRecords(invoiceState)

  const [issuing, setIssuing] = useState<IssueTarget | null>(null)
  const [cancelling, setCancelling] = useState<TaxInvoiceSummaryDto | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const activeInvoice = cancelling

  const creditNotes = useCreditNotes()
  const awaitingCreditNotes = useAwaitingCreditNotes()
  const [creditInvoice, setCreditInvoice] = useState<CreditNoteInvoice | null>(null)

  function openCreditNotes(row: SalesRecordDto, invoice: TaxInvoiceSummaryDto): void {
    // ยอดของ**ใบที่อ้างถึง** (ใบเสร็จรับเงิน/ใบกำกับภาษีหลายใบต่อรอบได้ — U95)
    setCreditInvoice({
      id: invoice.id,
      salesRecordId: row.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      companyName: row.companyName,
      totalBeforeVatSatang: invoice.totalBeforeVatSatang,
      vatSatang: invoice.vatSatang,
      totalSatang: invoice.totalSatang,
    })
  }

  function isReplaced(row: SalesRecordDto, invoice: TaxInvoiceSummaryDto): boolean {
    return row.taxInvoices.some((other) => other.replacesInvoiceNumber === invoice.invoiceNumber)
  }

  async function reloadCreditNotes(): Promise<void> {
    // ยอดค้างของรอบเปลี่ยนตามเอกสาร (U171 — ฟอร์มแสดงยอดที่ลดได้) ⇒ โหลดรายการขายใหม่ด้วย
    await Promise.all([creditNotes.reload(), awaitingCreditNotes.reload(), reload()])
  }

  async function runCancel(): Promise<void> {
    if (activeInvoice === null) return
    setSaving(true)
    const result = await callApi<TaxInvoiceDto>(
      `/api/accounting/tax-invoices/${activeInvoice.id}/cancel`,
      jsonRequest('PATCH', { reason: reason.trim() }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: `ยกเลิก${activeInvoice.docTitle}เลขที่ ${activeInvoice.invoiceNumber} แล้ว`,
      description:
        activeInvoice.docKind === 'receipt_tax_invoice'
          ? 'เลขที่เดิมยังอยู่ในทะเบียน — ออกใบแทนได้ที่แท็บเงินรับ (ใบใหม่ได้เลขถัดไป)'
          : 'เลขที่เดิมยังอยู่ในทะเบียน — กด "ออกใบแทน" ได้ (ใบใหม่ได้เลขถัดไป)',
    })
    setCancelling(null)
    setReason('')
    await reload()
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="มูลค่าก่อนภาษี" value={fmtSatangSymbol(data.totalBeforeVatSatang)} hint="ตามตัวกรองปัจจุบัน" />
        <StatCard label="ภาษีมูลค่าเพิ่ม" value={fmtSatangSymbol(data.vatSatang)} hint="ประมาณการ ณ วันวางบิล" />
        <StatCard label="รวมทั้งสิ้น" value={fmtSatangSymbol(data.totalSatang)} hint="ยอดตามใบแจ้งหนี้" />
        <StatCard
          label="ยังไม่มีเอกสารภาษี"
          value={fmtCount(data.awaitingInvoiceCount)}
          hint="ออกใบเสร็จรับเงิน/ใบกำกับภาษีเมื่อรับเงิน"
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">รายการขาย / รายได้ (Sales Records)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            เกิดอัตโนมัติเมื่อรอบวางบิลถูกส่งให้ลูกค้า (ใบแจ้งหนี้/ใบวางบิล) — ใบเสร็จรับเงิน/ใบกำกับภาษีออกเมื่อรับเงิน
          </p>
        </div>
        <FilterGroup options={INVOICE_FILTERS} value={invoiceState} onChange={setInvoiceState} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>รอบวางบิล</Th>
              <Th>บริษัทไฟแนนซ์</Th>
              <Th>รอบบัญชี</Th>
              <Th numeric>ก่อนภาษี</Th>
              <Th numeric>VAT</Th>
              <Th numeric>รวม</Th>
              <Th>เอกสารภาษี</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={data.items.length === 0}
            emptyTitle="ยังไม่มีรายการขายตามตัวกรองนี้"
            emptyDescription="รายการจะเกิดเองเมื่อรอบวางบิลถูกส่งให้บริษัทไฟแนนซ์"
            colSpan={8}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.items.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <RefText>{row.billingBatchNumber}</RefText>
                    <p className="mt-0.5 text-[10px] text-slate-500">{row.billingPeriod}</p>
                    <div className="mt-0.5">
                      <BillingStatusBadge status={row.billingStatus} outstandingSatang={row.billingOutstandingSatang} />
                    </div>
                  </Td>
                  <Td className="text-xs font-semibold text-slate-900">{row.companyName}</Td>
                  <Td className="text-xs text-slate-500">{row.periodLabel}</Td>
                  <Td numeric>{fmtSatangSymbol(row.totalBeforeVatSatang)}</Td>
                  <Td numeric className="text-slate-500">
                    {fmtSatangSymbol(row.vatSatang)}
                  </Td>
                  <Td numeric className="font-semibold">
                    {fmtSatangSymbol(row.totalSatang)}
                  </Td>
                  <Td>
                    {row.taxInvoices.filter((invoice) => invoice.status === 'active').length === 0 && (
                      <span className="text-xs text-slate-400">ยังไม่มี (ออกเมื่อรับเงิน)</span>
                    )}
                    {row.taxInvoices
                      .filter((invoice) => invoice.status === 'active')
                      .map((invoice) => (
                        <div key={invoice.id} className="mb-1.5">
                          <RefText className="text-blue-700">{invoice.invoiceNumber}</RefText>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {invoice.docTitle} · {fmtDate(invoice.invoiceDate)} · {fmtSatangSymbol(invoice.totalSatang)}
                          </div>
                          {invoice.replacesInvoiceNumber !== null && (
                            <div className="text-[10px] text-slate-500">ออกแทน {invoice.replacesInvoiceNumber}</div>
                          )}
                          <CreditNoteSummaryCell
                            notes={creditNotes.byInvoice.get(invoice.id) ?? []}
                            invoice={invoice}
                            awaiting={[
                              ...new Set(
                                awaitingCreditNotes.items
                                  .filter((item) => item.taxInvoiceId === invoice.id)
                                  .map((item) => item.noteType),
                              ),
                            ]}
                          />
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(`/api/accounting/tax-invoices/${invoice.id}/pdf`, '_blank', 'noreferrer')}
                            >
                              PDF
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openCreditNotes(row, invoice)}>
                              {canManageInvoice ? 'บันทึกใบลด/เพิ่มหนี้' : 'ใบลด/เพิ่มหนี้'}
                            </Button>
                            {canManageInvoice && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={invoice.periodClosed}
                                title={invoice.periodClosed ? PERIOD_CLOSED_CANCEL_HINT : undefined}
                                onClick={() => {
                                  setReason('')
                                  setCancelling(invoice)
                                }}
                              >
                                ยกเลิก
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    {row.taxInvoices
                      .filter((invoice) => invoice.status === 'cancelled')
                      .map((invoice) => (
                        <div key={invoice.id} className="mt-1 flex items-center gap-1.5 text-[10px] text-red-500">
                          <span className="font-mono line-through">{invoice.invoiceNumber}</span>
                          {canManageInvoice && invoice.docKind === 'tax_invoice' && !isReplaced(row, invoice) && (
                            <Button size="sm" variant="ghost" onClick={() => setIssuing({ kind: 'replace', invoice, record: row })}>
                              ออกใบแทน
                            </Button>
                          )}
                        </div>
                      ))}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`/api/billing-batches/${row.billingBatchId}/invoice-pdf`, '_blank', 'noreferrer')}
                    >
                      ใบแจ้งหนี้ PDF
                    </Button>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <InlineAlert tone="info" title="หลักการ">
        รายการขาย sync 1:1 จากรอบวางบิลที่ส่งแล้ว (ใบแจ้งหนี้ — ไม่ใช่เอกสารภาษี) · ใบเสร็จรับเงิน/ใบกำกับภาษีออกเมื่อรับเงิน
        ตามยอดที่รับ · เลขที่เดินต่อเนื่องห้ามขาดช่วง · ยกเลิกต้องมีเหตุผลและออกใบแทนเสมอ — ใบที่ยกเลิกยังอยู่ในทะเบียนตลอดไป
      </InlineAlert>

      <IssueTaxInvoiceModal
        key={`issue-${issuing?.kind === 'replace' ? issuing.invoice.id : 'none'}`}
        target={issuing}
        onClose={() => setIssuing(null)}
        onIssued={() => void reload()}
      />

      <CreditNoteModal
        key={`credit-${creditInvoice?.id ?? 'none'}`}
        invoice={creditInvoice}
        billingOutstandingSatang={
          data.items.find((row) => row.id === creditInvoice?.salesRecordId)?.billingOutstandingSatang ?? null
        }
        notes={creditInvoice === null ? [] : (creditNotes.byInvoice.get(creditInvoice.id) ?? [])}
        awaiting={awaitingCreditNotes.items.filter((item) => item.taxInvoiceId === creditInvoice?.id)}
        canManage={canManageInvoice}
        onClose={() => setCreditInvoice(null)}
        onChanged={() => void reloadCreditNotes()}
      />

      <ReasonConfirmModal
        open={cancelling !== null && activeInvoice !== null}
        title={`ยกเลิก${activeInvoice?.docTitle ?? ''}เลขที่ ${activeInvoice?.invoiceNumber ?? ''}`}
        description="ใช้เฉพาะกรณีออกผิดพลาดจริง — เลขที่เดิมจะไม่ถูกนำกลับมาใช้ และต้องออกใบแทน (ใบใหม่พิมพ์เลขเดิมและเหตุผล)"
        confirmLabel="ยืนยันยกเลิกเอกสาร"
        loading={saving}
        reason={reason}
        onReasonChange={setReason}
        onClose={() => setCancelling(null)}
        onConfirm={() => void runCancel()}
        placeholder="เช่น ระบุชื่อผู้ซื้อผิด ต้องออกใบใหม่ให้ถูกต้อง"
      />
    </div>
  )
}

/** ยอดใบลดหนี้/ใบเพิ่มหนี้ + ยอดสุทธิของใบกำกับในตาราง (ยอดจาก pure SSOT — ไม่คำนวณเงินบนจอเอง) */
function CreditNoteSummaryCell({
  notes,
  invoice,
  awaiting,
}: {
  notes: readonly CreditNoteDto[]
  /** ยอดของใบที่อ้างถึง (ไม่ใช่ยอดทั้งรอบ — U95) */
  invoice: TaxInvoiceSummaryDto
  /** ชนิดเอกสารที่ยังรอ (ป้าย "รอใบลดหนี้" / "รอใบเพิ่มหนี้") */
  awaiting: readonly CreditNoteType[]
}) {
  const active = notes.filter((note) => note.status === 'active')
  if (active.length === 0 && awaiting.length === 0) return null
  const credits = active.filter((note) => note.noteType === 'credit')
  const debits = active.filter((note) => note.noteType === 'debit')
  const net = netInvoiceAmounts(invoice, active)
  return (
    <div className="mt-1 space-y-0.5">
      {credits.length > 0 && (
        <div className="text-[10px] text-amber-700">
          ลดหนี้ {fmtCount(credits.length)} ใบ −{fmtSatangSymbol(sumActiveCreditNotes(credits).totalSatang)}
        </div>
      )}
      {debits.length > 0 && (
        <div className="text-[10px] text-blue-700">
          เพิ่มหนี้ {fmtCount(debits.length)} ใบ +{fmtSatangSymbol(sumActiveDebitNotes(debits).totalSatang)}
        </div>
      )}
      {active.length > 0 && (
        <div className="text-[10px] font-semibold text-slate-700">สุทธิ {fmtSatangSymbol(net.totalSatang)}</div>
      )}
      {awaiting.map((type) => (
        <StatusBadge key={type} group="pending" label={AWAITING_NOTE_LABEL[type]} />
      ))}
    </div>
  )
}
