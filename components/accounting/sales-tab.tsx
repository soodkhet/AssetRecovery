'use client'

import { useState } from 'react'
import { CreditNoteModal, type CreditNoteInvoice } from '@/components/accounting/credit-note-modal'
import { IssueTaxInvoiceModal } from '@/components/accounting/issue-tax-invoice-modal'
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
import { callApi, jsonRequest } from '@/lib/api/types'
import { AWAITING_CREDIT_NOTE_LABEL, netInvoiceAmounts, sumActiveCreditNotes } from '@/lib/credit-notes/credit-note'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import { BILLING_STATUS_LABEL } from '@/lib/revenue/revenue-ui'
import { MANAGE_TAX_INVOICE } from '@/lib/sales/sales'
import type { CreditNoteDto } from '@/lib/credit-notes/types'
import type { SalesRecordDto, TaxInvoiceDto } from '@/lib/sales/types'

/**
 * แท็บ "รายได้และขาย" (`31` §8 · mockup `accounting.html` แท็บ `sales`)
 *
 * ⚠️ **ไม่มีปุ่มสร้าง/แก้/ลบรายการขาย** โดยเจตนา — รายการเกิดอัตโนมัติเมื่อรอบวางบิลถูกส่ง (`31` §6.1)
 * ⚠️ ออก/ยกเลิกใบกำกับภาษี = สิทธิ์บัญชี (`manage_tax_invoice`) เท่านั้น · การเงินดูได้อย่างเดียว
 * ⚠️ ใบที่ยกเลิกยัง**แสดงในทะเบียน** เพื่อพิสูจน์ความต่อเนื่องของเลขที่ (`31` §9.1 — ห้ามลบ)
 * ใบลดหนี้ (มติ PO U14): ปุ่ม "ใบลดหนี้" ต่อใบกำกับ · ยอดสุทธิหลังหักใบลดหนี้ · ป้าย "รอใบลดหนี้"
 */

const INVOICE_FILTERS: readonly { value: SalesInvoiceFilter; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'awaiting', label: 'ยังไม่ออกใบกำกับ' },
  { value: 'issued', label: 'ออกใบกำกับแล้ว' },
]

export function SalesTab() {
  const { can } = usePermission()
  const canManageInvoice = can('manage', MANAGE_TAX_INVOICE)
  const { showToast } = useToast()

  const [invoiceState, setInvoiceState] = useState<SalesInvoiceFilter>('all')
  const { data, loading, error, reload } = useSalesRecords(invoiceState)

  const [issuing, setIssuing] = useState<SalesRecordDto | null>(null)
  const [cancelling, setCancelling] = useState<SalesRecordDto | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const activeInvoice = cancelling?.activeTaxInvoice ?? null

  const creditNotes = useCreditNotes()
  const awaitingCreditNotes = useAwaitingCreditNotes()
  const [creditInvoice, setCreditInvoice] = useState<CreditNoteInvoice | null>(null)

  function openCreditNotes(row: SalesRecordDto): void {
    const invoice = row.activeTaxInvoice
    if (invoice === null) return
    setCreditInvoice({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      companyName: row.companyName,
      totalBeforeVatSatang: row.totalBeforeVatSatang,
      vatSatang: row.vatSatang,
      totalSatang: row.totalSatang,
    })
  }

  async function reloadCreditNotes(): Promise<void> {
    await Promise.all([creditNotes.reload(), awaitingCreditNotes.reload()])
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
      title: `ยกเลิกใบกำกับภาษีเลขที่ ${activeInvoice.invoiceNumber} แล้ว`,
      description: 'เลขที่เดิมยังอยู่ในทะเบียน — ออกใบใหม่จะได้เลขถัดไป',
    })
    setCancelling(null)
    setReason('')
    await reload()
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="มูลค่าก่อนภาษี" value={fmtSatangSymbol(data.totalBeforeVatSatang)} hint="ตามตัวกรองปัจจุบัน" />
        <StatCard label="ภาษีมูลค่าเพิ่ม" value={fmtSatangSymbol(data.vatSatang)} hint="อัตราจากวันที่รับรู้รายได้" />
        <StatCard label="รวมทั้งสิ้น" value={fmtSatangSymbol(data.totalSatang)} hint="ยอดที่ต้องเรียกเก็บ" />
        <StatCard
          label="ยังไม่ออกใบกำกับ"
          value={fmtCount(data.awaitingInvoiceCount)}
          hint="ควรออกให้ครบก่อนปิดงวด"
        />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">รายการขาย / รายได้ (Sales Records)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            เกิดอัตโนมัติเมื่อรอบวางบิลถูกส่งให้ลูกค้า — หน้านี้ทำได้แค่ออก/ยกเลิกใบกำกับภาษี
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
              <Th>ใบกำกับภาษี</Th>
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
                    <RefText>{row.billingPeriod}</RefText>
                    <div className="mt-0.5">
                      <StatusBadge status={row.billingStatus} label={BILLING_STATUS_LABEL[row.billingStatus]} />
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
                    {row.activeTaxInvoice === null ? (
                      <span className="text-xs text-slate-400">ยังไม่ออก</span>
                    ) : (
                      <>
                        <RefText className="text-blue-700">{row.activeTaxInvoice.invoiceNumber}</RefText>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {fmtDate(row.activeTaxInvoice.invoiceDate)}
                        </div>
                        <CreditNoteSummaryCell
                          notes={creditNotes.byInvoice.get(row.activeTaxInvoice.id) ?? []}
                          invoice={row}
                          awaiting={awaitingCreditNotes.items.some(
                            (item) => item.taxInvoiceId === row.activeTaxInvoice?.id,
                          )}
                        />
                      </>
                    )}
                    {row.taxInvoices
                      .filter((invoice) => invoice.status === 'cancelled')
                      .map((invoice) => (
                        <div key={invoice.id} className="mt-1 text-[10px] text-red-500 line-through">
                          {invoice.invoiceNumber}
                        </div>
                      ))}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {row.activeTaxInvoice !== null && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            window.open(
                              `/api/accounting/tax-invoices/${row.activeTaxInvoice?.id}/pdf`,
                              '_blank',
                              'noreferrer',
                            )
                          }
                        >
                          พิมพ์ PDF
                        </Button>
                      )}
                      {row.activeTaxInvoice !== null && (
                        <Button size="sm" variant="ghost" onClick={() => openCreditNotes(row)}>
                          {canManageInvoice ? 'บันทึกใบลดหนี้' : 'ใบลดหนี้'}
                        </Button>
                      )}
                      {canManageInvoice && row.activeTaxInvoice === null && (
                        <Button size="sm" variant="ghost" onClick={() => setIssuing(row)}>
                          ออกใบกำกับภาษี
                        </Button>
                      )}
                      {canManageInvoice && row.activeTaxInvoice !== null && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setReason('')
                            setCancelling(row)
                          }}
                        >
                          ยกเลิกใบกำกับ
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <InlineAlert tone="info" title="หลักการ">
        รายการขาย sync 1:1 จากรอบวางบิลที่ส่งแล้ว · เลขที่ใบกำกับภาษีเดินต่อเนื่องห้ามขาดช่วง ·
        ยกเลิกต้องมีเหตุผลและออกใบใหม่เสมอ — ใบที่ยกเลิกยังอยู่ในทะเบียนตลอดไป
      </InlineAlert>

      <IssueTaxInvoiceModal
        key={`issue-${issuing?.id ?? 'none'}`}
        record={issuing}
        onClose={() => setIssuing(null)}
        onIssued={() => void reload()}
      />

      <CreditNoteModal
        key={`credit-${creditInvoice?.id ?? 'none'}`}
        invoice={creditInvoice}
        notes={creditInvoice === null ? [] : (creditNotes.byInvoice.get(creditInvoice.id) ?? [])}
        awaiting={awaitingCreditNotes.items.filter((item) => item.taxInvoiceId === creditInvoice?.id)}
        canManage={canManageInvoice}
        onClose={() => setCreditInvoice(null)}
        onChanged={() => void reloadCreditNotes()}
      />

      <ReasonConfirmModal
        open={cancelling !== null && activeInvoice !== null}
        title={`ยกเลิกใบกำกับภาษีเลขที่ ${activeInvoice?.invoiceNumber ?? ''}`}
        description="ใช้เฉพาะกรณีออกผิดพลาดจริง — เลขที่เดิมจะไม่ถูกนำกลับมาใช้ และต้องออกใบใหม่แทน"
        confirmLabel="ยืนยันยกเลิกใบกำกับ"
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

/** ยอดใบลดหนี้ + ยอดสุทธิของใบกำกับในตาราง (ยอดจาก pure SSOT — ไม่คำนวณเงินบนจอเอง) */
function CreditNoteSummaryCell({
  notes,
  invoice,
  awaiting,
}: {
  notes: readonly CreditNoteDto[]
  invoice: SalesRecordDto
  awaiting: boolean
}) {
  const active = notes.filter((note) => note.status === 'active')
  if (active.length === 0 && !awaiting) return null
  const used = sumActiveCreditNotes(active)
  const net = netInvoiceAmounts(invoice, active)
  return (
    <div className="mt-1 space-y-0.5">
      {active.length > 0 && (
        <>
          <div className="text-[10px] text-amber-700">
            ลดหนี้ {fmtCount(active.length)} ใบ −{fmtSatangSymbol(used.totalSatang)}
          </div>
          <div className="text-[10px] font-semibold text-slate-700">สุทธิ {fmtSatangSymbol(net.totalSatang)}</div>
        </>
      )}
      {awaiting && <StatusBadge group="pending" label={AWAITING_CREDIT_NOTE_LABEL} />}
    </div>
  )
}
