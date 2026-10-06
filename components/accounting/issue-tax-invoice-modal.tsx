'use client'

import { useState } from 'react'
import { OrganizationProfileNotice } from '@/components/settings/organization-profile-notice'
import { Button, Field, InlineAlert, Input, Modal, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { CashReceiptDto, SalesRecordDto, TaxInvoiceDto, TaxInvoiceSummaryDto } from '@/lib/sales/types'

/**
 * Modal ออกเอกสารภาษี (มติ PO U95 · mockup `accounting.html` `issue-tax-invoice`)
 *
 * - `receipt` = ออก **ใบเสร็จรับเงิน/ใบกำกับภาษี** จากเงินรับ — ยอดตามเงินที่รับ (+ภาษีที่ลูกค้าหัก) ·
 *   VAT อัตรา ณ วันรับเงิน (คิดที่ server) · วันที่เอกสารเริ่มต้น = วันรับเงิน
 * - `replace` = ออกแทนใบกำกับแบบเดิมที่ยกเลิกแล้ว (ยอด/อัตราเดิม · พิมพ์ "ออกแทนฉบับเลขที่ …")
 *
 * ⚠️ **ไม่มีช่องเลขที่/ยอดเงิน** — ระบบเดินเลขให้เองแบบไม่ขาดช่วงและคิดยอดจากเงินรับ (`31` §10)
 * `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. (Rule 01) — ที่อื่นแสดง พ.ศ. ทั้งหมด
 */
export type IssueTarget =
  | { kind: 'receipt'; receipt: CashReceiptDto }
  | { kind: 'replace'; invoice: TaxInvoiceSummaryDto; record: SalesRecordDto }

export function IssueTaxInvoiceModal({
  target,
  onClose,
  onIssued,
}: {
  target: IssueTarget | null
  onClose: () => void
  onIssued: () => void
}) {
  const { showToast } = useToast()
  const [invoiceDate, setInvoiceDate] = useState(
    toInputDate(target?.kind === 'receipt' ? target.receipt.receivedDate : new Date()),
  )
  const [saving, setSaving] = useState(false)

  if (target === null) return null

  const title =
    target.kind === 'receipt'
      ? `ออกใบเสร็จรับเงิน/ใบกำกับภาษี — ${target.receipt.payerName}`
      : `ออกใบแทน ${target.invoice.invoiceNumber} — ${target.record.companyName}`
  const description =
    target.kind === 'receipt'
      ? `รับเงิน ${fmtDate(target.receipt.receivedDate)} · ใบแจ้งหนี้ ${target.receipt.billingBatchNumber} (${target.receipt.billingPeriod})`
      : `${target.record.periodLabel} · ใบแจ้งหนี้ ${target.record.billingBatchNumber}`

  async function submit(): Promise<void> {
    if (target === null) return
    setSaving(true)
    const result = await callApi<TaxInvoiceDto>(
      '/api/accounting/tax-invoices',
      jsonRequest('POST', {
        ...(target.kind === 'receipt' ? { cashReceiptId: target.receipt.id } : { replacesInvoiceId: target.invoice.id }),
        ...(invoiceDate === '' ? {} : { invoiceDate }),
      }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: `ออก${result.data?.docTitle ?? 'เอกสาร'}เลขที่ ${result.data?.invoiceNumber ?? ''} แล้ว`,
      description: 'เลขที่ถูกจองในระบบแล้ว — ยกเลิกได้แต่ห้ามลบ และเลขเดิมจะไม่ถูกนำกลับมาใช้',
    })
    onIssued()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            ยืนยันออกเอกสาร
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* มติ PO U99 — ข้อมูลผู้ขายยังเป็นค่าตัวอย่าง ⇒ เตือน (ไม่บล็อก) */}
        <OrganizationProfileNotice />
        {target.kind === 'receipt' ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">เงินโอนเข้า</span>
              <span className="font-mono font-semibold">{fmtSatangSymbol(target.receipt.amountSatang)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">ภาษีที่ลูกค้าหัก ณ ที่จ่าย (นับเป็นการรับชำระ)</span>
              <span className="font-mono font-semibold">{fmtSatangSymbol(target.receipt.whtWithheldByCustomerSatang)}</span>
            </div>
            {target.receipt.billingBankFeeWrittenOffSatang > 0 && (
              <div className="flex justify-between py-0.5">
                <span className="text-slate-500">ส่วนต่างที่ตัดเป็นค่าธรรมเนียมธนาคาร (เรารับภาระ)</span>
                <span className="font-mono font-semibold">
                  {fmtSatangSymbol(target.receipt.billingBankFeeWrittenOffSatang)}
                </span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5">
              <span className="font-semibold text-slate-700">ยอดรับชำระบนเอกสาร (รวม VAT)</span>
              <span className="font-mono font-bold text-slate-900">
                {fmtSatangSymbol(
                  target.receipt.amountSatang +
                    target.receipt.whtWithheldByCustomerSatang +
                    target.receipt.billingBankFeeWrittenOffSatang,
                )}
              </span>
            </div>
            <p className="mt-2 text-slate-500">
              {target.receipt.billingBankFeeWrittenOffSatang > 0
                ? 'บิลนี้ปิดด้วยการตัดส่วนต่างเป็นค่าธรรมเนียมธนาคาร ⇒ ใบที่ปิดยอดออกเต็มยอดใบแจ้งหนี้ สถานะรับชำระครบ · ภาษีมูลค่าเพิ่มคิดจากมูลค่าบริการเต็ม ณ วันรับเงิน'
                : 'ภาษีมูลค่าเพิ่มคิดตามอัตรา ณ วันรับเงิน · รับไม่ครบยอดใบแจ้งหนี้ = ออกตามยอดที่รับ (รับชำระบางส่วน)'}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">มูลค่าก่อนภาษี (ตามใบเดิม)</span>
              <span className="font-mono font-semibold">{fmtSatangSymbol(target.invoice.totalBeforeVatSatang)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">ภาษีมูลค่าเพิ่ม</span>
              <span className="font-mono font-semibold">{fmtSatangSymbol(target.invoice.vatSatang)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5">
              <span className="font-semibold text-slate-700">รวมทั้งสิ้น</span>
              <span className="font-mono font-bold text-slate-900">{fmtSatangSymbol(target.invoice.totalSatang)}</span>
            </div>
          </div>
        )}

        <Field
          id="invoice-date"
          label="วันที่เอกสาร"
          hint={
            target.kind === 'receipt'
              ? 'เริ่มต้น = วันรับเงิน · ต้องไม่ก่อนวันรับเงิน ไม่ก่อนใบเลขก่อนหน้า และไม่เกินวันนี้ · ช่องนี้ใช้ ค.ศ. ตามที่เบราว์เซอร์บังคับ'
              : 'ต้องไม่ก่อนใบเลขก่อนหน้าและไม่เกินวันนี้ · ช่องนี้ใช้ ค.ศ. ตามที่เบราว์เซอร์บังคับ'
          }
        >
          <Input id="invoice-date" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
        </Field>

        <InlineAlert tone="warning" title="ออกแล้วแก้ไม่ได้">
          เอกสารภาษีที่ออกแล้วห้ามแก้ — ถ้าผิดต้องยกเลิกพร้อมเหตุผลแล้วออกใบแทน (เลขที่เดิมคงอยู่ในทะเบียนเสมอ)
        </InlineAlert>
      </div>
    </Modal>
  )
}
