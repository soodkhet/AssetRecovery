'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toInputDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { SalesRecordDto, TaxInvoiceDto } from '@/lib/sales/types'

/**
 * Modal "ออกใบกำกับภาษี" (`31` §9.1 · mockup `accounting.html` `issue-tax-invoice`)
 *
 * ⚠️ **ไม่มีช่องเลขที่ใบกำกับ** — ระบบเดินเลขให้เองแบบไม่ขาดช่วง (`31` §10) ห้ามรับจากผู้ใช้
 * ⚠️ สร้าง = ออกทันที (`active`) ไม่มีขั้นร่าง — แก้ไม่ได้ ต้องยกเลิกแล้วออกใหม่เท่านั้น
 * `<input type="date">` เป็นข้อยกเว้นเดียวที่ใช้ ค.ศ. (Rule 01) — ที่อื่นแสดง พ.ศ. ทั้งหมด
 */
export function IssueTaxInvoiceModal({
  record,
  onClose,
  onIssued,
}: {
  record: SalesRecordDto | null
  onClose: () => void
  onIssued: () => void
}) {
  const { showToast } = useToast()
  const [invoiceDate, setInvoiceDate] = useState(toInputDate(new Date()))
  const [saving, setSaving] = useState(false)

  if (record === null) return null

  async function submit(): Promise<void> {
    if (record === null) return
    setSaving(true)
    const result = await callApi<TaxInvoiceDto>(
      '/api/accounting/tax-invoices',
      jsonRequest('POST', {
        salesRecordId: record.id,
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
      title: `ออกใบกำกับภาษีเลขที่ ${result.data?.invoiceNumber ?? ''} แล้ว`,
      description: 'เลขที่ถูกจองในระบบแล้ว — ยกเลิกได้แต่ห้ามลบ และเลขเดิมจะไม่ถูกนำกลับมาใช้',
    })
    onIssued()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`ออกใบกำกับภาษี — ${record.companyName}`}
      description={`${record.periodLabel} · รอบวางบิล ${record.billingPeriod}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            ยืนยันออกใบกำกับภาษี
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500">มูลค่าก่อนภาษี</span>
            <span className="font-mono font-semibold">{fmtSatangSymbol(record.totalBeforeVatSatang)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500">ภาษีมูลค่าเพิ่ม</span>
            <span className="font-mono font-semibold">{fmtSatangSymbol(record.vatSatang)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5">
            <span className="font-semibold text-slate-700">รวมทั้งสิ้น</span>
            <span className="font-mono font-bold text-slate-900">{fmtSatangSymbol(record.totalSatang)}</span>
          </div>
        </div>

        <Field
          id="invoice-date"
          label="วันที่ออกใบกำกับภาษี"
          hint="ไม่ระบุ = วันนี้ (เวลาไทย) · ช่องนี้ใช้ ค.ศ. ตามที่เบราว์เซอร์บังคับ"
        >
          <Input
            id="invoice-date"
            type="date"
            value={invoiceDate}
            onChange={(event) => setInvoiceDate(event.target.value)}
          />
        </Field>

        <InlineAlert tone="warning" title="ออกแล้วแก้ไม่ได้">
          ใบกำกับภาษีที่ออกแล้วห้ามแก้ — ถ้าผิดต้องยกเลิกพร้อมเหตุผลแล้วออกใบใหม่ (เลขที่เดิมคงอยู่ในทะเบียนเสมอ)
        </InlineAlert>
      </div>
    </Modal>
  )
}
