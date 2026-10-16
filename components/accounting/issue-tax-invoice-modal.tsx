'use client'

import { useEffect, useState } from 'react'
import { OrganizationProfileNotice } from '@/components/settings/organization-profile-notice'
import {
  Button,
  Field,
  InlineAlert,
  Input,
  LoadingState,
  Modal,
  ModalCancelButton,
  StatusBadge,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest, type ApiCallError } from '@/lib/api/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import { fmtRatePct, fmtSatangSymbol } from '@/lib/format/money'
import type {
  CashReceiptDto,
  SalesRecordDto,
  TaxInvoiceDto,
  TaxInvoicePreviewDto,
  TaxInvoiceSummaryDto,
} from '@/lib/sales/types'

/**
 * Modal ออกเอกสารภาษี (มติ PO U95 · mockup `accounting.html` `issue-tax-invoice`)
 *
 * - `receipt` = ออก **ใบเสร็จรับเงิน/ใบกำกับภาษี** จากเงินรับ — ยอดตามเงินที่รับ (+ภาษีที่ลูกค้าหัก + เครดิตใบลดหนี้ +
 *   ค่าธรรมเนียมที่ตัด) · VAT อัตรา ณ วันรับเงิน · วันที่เอกสารเริ่มต้น = วันรับเงิน
 * - mytester3 LR3-02 — ยอด/ป้ายทั้งหมดมาจาก `GET /api/accounting/tax-invoices/preview` (สูตรเดียวกับตอนออก)
 *   **ห้ามคิดยอดซ้ำฝั่ง client** · ยืนยันได้เมื่อพรีวิวสำเร็จเท่านั้น
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
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' })
  const previewQuery =
    target === null
      ? null
      : target.kind === 'receipt'
        ? `cashReceiptId=${encodeURIComponent(target.receipt.id)}`
        : `replacesInvoiceId=${encodeURIComponent(target.invoice.id)}`

  // เปลี่ยนเป้าหมาย = remount ด้วย `key` จากผู้เรียก ⇒ ไม่ต้องรีเซ็ต state ใน effect
  useEffect(() => {
    if (previewQuery === null) return
    let cancelled = false
    void (async () => {
      const result = await callApi<TaxInvoicePreviewDto>(`/api/accounting/tax-invoices/preview?${previewQuery}`)
      if (cancelled) return
      setPreview(
        result.error !== undefined || result.data === undefined
          ? { status: 'error', error: result.error ?? { title: 'คำนวณยอดไม่สำเร็จ', message: 'กรุณาลองใหม่อีกครั้ง' } }
          : { status: 'ready', data: result.data },
      )
    })()
    return () => {
      cancelled = true
    }
  }, [previewQuery])

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
          <ModalCancelButton onClose={onClose}>
            ยกเลิก
          </ModalCancelButton>
          <Button loading={saving} disabled={preview.status !== 'ready'} onClick={() => void submit()}>
            ยืนยันออกเอกสาร
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* มติ PO U99 — ข้อมูลผู้ขายยังเป็นค่าตัวอย่าง ⇒ เตือน (ไม่บล็อก) */}
        <OrganizationProfileNotice />
        <TaxInvoicePreviewSummary preview={preview} />

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

export type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; error: Pick<ApiCallError, 'title' | 'message'> }
  | { status: 'ready'; data: TaxInvoicePreviewDto }

function Row({ label, value, sign = '' }: { label: string; value: number; sign?: '' | '−' }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono font-semibold whitespace-nowrap">
        {sign}
        {fmtSatangSymbol(value)}
      </span>
    </div>
  )
}

/**
 * สรุปยอดที่จะออกจริง (mytester3 LR3-02) — แสดงตามผลจาก server ล้วน ไม่คำนวณเงินเอง
 * · ใบเสร็จฯ: เงินโอน + ภาษีที่ลูกค้าหัก + เครดิตจากใบลดหนี้ + ค่าธรรมเนียม − ส่วนที่รับเกิน = ยอดบนเอกสาร
 * · ใบแทนแบบเดิม: มูลค่าก่อนภาษี/VAT/รวม ตามใบเดิม
 */
export function TaxInvoicePreviewSummary({ preview }: { preview: PreviewState }) {
  if (preview.status === 'loading') return <LoadingState message="กำลังคำนวณยอดที่จะออก..." className="py-4" />
  if (preview.status === 'error') {
    return (
      <InlineAlert tone="error" title={preview.error.title}>
        {preview.error.message}
      </InlineAlert>
    )
  }
  const { data } = preview
  const breakdown = data.breakdown
  const vatLabel = data.vatRatePct === null ? 'ภาษีมูลค่าเพิ่ม' : `ภาษีมูลค่าเพิ่ม ${fmtRatePct(data.vatRatePct)}`

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
      {breakdown !== null && (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="font-semibold text-slate-700">{data.docTitle}</span>
            {breakdown.coversRemainder ? (
              <StatusBadge group="success" label="ครบยอด" />
            ) : (
              <StatusBadge group="partial" label="รับชำระบางส่วน" />
            )}
          </div>
          <Row label="เงินโอนเข้า" value={breakdown.transferSatang} />
          <Row label="ภาษีที่ลูกค้าหัก ณ ที่จ่าย (นับเป็นการรับชำระ)" value={breakdown.customerWhtSatang} />
          {breakdown.creditAppliedSatang > 0 && (
            <Row label="เครดิตจากใบลดหนี้ (เงินที่ลูกค้าชำระไว้แล้ว) นำมาชำระ" value={breakdown.creditAppliedSatang} />
          )}
          {breakdown.bankFeeSatang > 0 && (
            <Row label="ส่วนต่างที่ตัดเป็นค่าธรรมเนียมธนาคาร (เรารับภาระ)" value={breakdown.bankFeeSatang} />
          )}
          {breakdown.excessSatang > 0 && (
            <Row label="ส่วนที่รับเกินยอดคงเหลือ (ไม่นำมาออกเอกสาร)" value={breakdown.excessSatang} sign="−" />
          )}
        </>
      )}
      <div className={breakdown === null ? '' : 'mt-1 border-t border-slate-200 pt-1.5'}>
        <Row label="มูลค่าก่อนภาษี" value={data.totalBeforeVatSatang} />
        <Row label={vatLabel} value={data.vatSatang} />
      </div>
      <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5">
        <span className="font-semibold text-slate-700">
          {breakdown === null ? 'รวมทั้งสิ้น' : 'ยอดบนเอกสาร (รวมภาษีมูลค่าเพิ่ม)'}
        </span>
        <span className="font-mono font-bold text-slate-900">{fmtSatangSymbol(data.totalSatang)}</span>
      </div>
      {breakdown !== null && (
        <div className="mt-2 space-y-1 text-slate-500">
          {breakdown.uninvoicedReductionTotalSatang > 0 && (
            <p>
              รอบนี้ปรับลดยอด {fmtSatangSymbol(breakdown.uninvoicedReductionTotalSatang)} ในส่วนที่ยังไม่ออกใบกำกับภาษี — ไม่นำมาออกใบ
              และไม่ต้องออกใบลดหนี้
            </p>
          )}
          <p>
            {breakdown.coversRemainder
              ? 'ใบนี้ปิดยอดคงเหลือของรอบ ⇒ รับชำระครบ · ภาษีมูลค่าเพิ่มคิดตามอัตรา ณ วันรับเงิน'
              : 'ยอดที่รับยังไม่ครบยอดคงเหลือของรอบ ⇒ ออกตามยอดที่รับ (รับชำระบางส่วน) · ภาษีมูลค่าเพิ่มคิดตามอัตรา ณ วันรับเงิน'}
          </p>
        </div>
      )}
    </div>
  )
}
