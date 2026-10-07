'use client'

import { BillingStatusBadge } from '@/components/finance/billing-status-badge'
import { useState } from 'react'
import { IssueTaxInvoiceModal, type IssueTarget } from '@/components/accounting/issue-tax-invoice-modal'
import { useCashReceipts } from '@/components/accounting/use-sales'
import { usePermission } from '@/components/auth/permission-provider'
import {
  Button,
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
} from '@/components/ui'
import { BANK_MATCH_STATUS_LABEL } from '@/lib/bank-recon/matching'
import { fmtDate, fmtDateTime } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import { MANAGE_TAX_INVOICE } from '@/lib/sales/sales'

/**
 * แท็บ "เงินรับ" (`31` §8 · mockup `accounting.html` แท็บ `receipts`)
 *
 * ⚠️ เงินรับสร้าง/แก้/ลบที่นี่ไม่ได้ — เกิดจากการจับคู่รายการเดินบัญชีเท่านั้น (`31` §6.3/§10)
 *    จับคู่รายการที่ยังค้างให้ไปที่แท็บ “กระทบยอด” (ไฟล์ 35)
 * มติ PO U95 — คอลัมน์ "ใบเสร็จรับเงิน/ใบกำกับภาษี": บัญชี (`manage_tax_invoice`) กดออกเอกสารของเงินรับแต่ละรายการ
 * (ยอดตามเงินที่รับ · VAT ณ วันรับเงิน · ใบที่ยกเลิกแล้ว ⇒ ใบใหม่เป็นใบแทนอัตโนมัติ) · เลขที่ = ชุดเดียวกับใบกำกับภาษี
 */
export function ReceiptsTab() {
  const { data, loading, error, reload } = useCashReceipts()
  const { can } = usePermission()
  const canManageInvoice = can('manage', MANAGE_TAX_INVOICE)
  const [issuing, setIssuing] = useState<IssueTarget | null>(null)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="เงินรับรวม" value={fmtSatangSymbol(data.totalSatang)} hint="ยอดที่เข้าบัญชีจริง" />
        <StatCard
          label="ลูกค้าหัก ณ ที่จ่าย"
          value={fmtSatangSymbol(data.totalWhtWithheldByCustomerSatang)}
          hint="เครดิตภาษีของบริษัท — ต้องมีหนังสือรับรองจากลูกค้า"
        />
        <StatCard label="จำนวนรายการ" value={fmtCount(data.items.length)} hint="ตามรอบที่แสดงอยู่" />
        <StatCard
          label="ยังไม่ออกใบเสร็จรับเงิน/ใบกำกับภาษี"
          value={fmtCount(data.awaitingTaxInvoiceCount)}
          hint="ภาษีขายเกิดในเดือนที่รับเงิน — ควรออกให้ครบก่อนปิดงวด"
        />
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900">เงินรับ (Cash Receipts)</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          เกิดอัตโนมัติเมื่อจับคู่รายการเดินบัญชีกับรอบวางบิลสำเร็จ — แก้ยอดที่นี่ไม่ได้ · ออกใบเสร็จรับเงิน/ใบกำกับภาษีได้ต่อรายการ
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>วันที่รับเงิน</Th>
              <Th>ผู้จ่าย</Th>
              <Th numeric>ยอดรับ</Th>
              <Th numeric>ลูกค้าหัก ณ ที่จ่าย</Th>
              <Th>อ้างอิงธนาคาร</Th>
              <Th>รอบวางบิล</Th>
              <Th>สถานะจับคู่</Th>
              <Th>บันทึกเมื่อ</Th>
              <Th>ใบเสร็จรับเงิน/ใบกำกับภาษี</Th>
            </Tr>
          </THead>
          <TableState
            onRetry={() => void reload()}
            loading={loading}
            error={error}
            isEmpty={data.items.length === 0}
            emptyTitle="ยังไม่มีเงินรับ"
            emptyDescription="รายการจะเกิดเองเมื่อจับคู่เงินเข้ากับรอบวางบิลในแท็บ “กระทบยอด”"
            colSpan={9}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.items.map((row) => (
                <Tr key={row.id}>
                  <Td className="text-xs text-slate-500">{fmtDate(row.receivedDate)}</Td>
                  <Td className="text-xs font-semibold text-slate-900">{row.payerName}</Td>
                  <Td numeric className="font-semibold text-emerald-700">
                    {fmtSatangSymbol(row.amountSatang)}
                  </Td>
                  <Td
                    numeric
                    className={row.whtWithheldByCustomerSatang > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}
                  >
                    {fmtSatangSymbol(row.whtWithheldByCustomerSatang)}
                  </Td>
                  <Td>
                    {row.bankRef === null ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <RefText>{row.bankRef}</RefText>
                    )}
                  </Td>
                  <Td>
                    <RefText>{row.billingBatchNumber}</RefText>
                    <p className="mt-0.5 text-[10px] text-slate-500">{row.billingPeriod}</p>
                    <div className="mt-0.5">
                      <BillingStatusBadge status={row.billingStatus} outstandingSatang={row.billingOutstandingSatang} />
                    </div>
                  </Td>
                  <Td>
                    {row.bankMatchStatus === null ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <StatusBadge status={row.bankMatchStatus} label={BANK_MATCH_STATUS_LABEL[row.bankMatchStatus]} />
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{fmtDateTime(row.createdAt)}</Td>
                  <Td className="whitespace-nowrap">
                    {row.taxInvoice !== null ? (
                      <div>
                        <RefText className="text-blue-700">{row.taxInvoice.invoiceNumber}</RefText>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {fmtDate(row.taxInvoice.invoiceDate)} · {fmtSatangSymbol(row.taxInvoice.totalSatang)}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            window.open(`/api/accounting/tax-invoices/${row.taxInvoice?.id ?? ''}/pdf`, '_blank', 'noreferrer')
                          }
                        >
                          PDF
                        </Button>
                      </div>
                    ) : row.coveredByLegacyInvoice ? (
                      <span className="text-xs text-slate-500">ออกใบกำกับภาษีตอนวางบิลแล้ว (แบบเดิม)</span>
                    ) : (
                      <div className="space-y-1">
                        <StatusBadge group="pending" label="ยังไม่ออก" />
                        {row.cancelledTaxInvoices.length > 0 && (
                          <div className="text-[10px] text-red-500 line-through">
                            {row.cancelledTaxInvoices.map((invoice) => invoice.invoiceNumber).join(', ')}
                          </div>
                        )}
                        {canManageInvoice && (
                          <div>
                            <Button size="sm" variant="ghost" onClick={() => setIssuing({ kind: 'receipt', receipt: row })}>
                              {row.cancelledTaxInvoices.length > 0 ? 'ออกใบแทน' : 'ออกใบเสร็จรับเงิน/ใบกำกับภาษี'}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <InlineAlert tone="info" title="ทำไมแก้ยอดที่นี่ไม่ได้">
        เงินรับต้องตรงกับเงินที่เข้าบัญชีจริงเสมอ — สร้างมือได้เมื่อไหร่ ยอดในระบบกับ statement จะเริ่มไม่ตรงกัน ·
        ถ้าจับคู่ผิด ให้แก้ที่แท็บ “กระทบยอด” (เงินรับที่ออกใบเสร็จรับเงิน/ใบกำกับภาษีแล้วต้องยกเลิกเอกสารก่อน) และยอดที่อยู่ในงวดที่ล็อกแล้วต้องผ่านรายการปรับปรุง
      </InlineAlert>

      <IssueTaxInvoiceModal
        key={`issue-${issuing?.kind === 'receipt' ? issuing.receipt.id : 'none'}`}
        target={issuing}
        onClose={() => setIssuing(null)}
        onIssued={() => void reload()}
      />
    </div>
  )
}
