'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, Textarea, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { CustomerWhtDto, CustomerWhtReceiveResultDto } from '@/lib/customer-wht/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import { bahtInputError, fmtSatangSymbol, parseBahtInput, toBahtInput } from '@/lib/format/money'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'

/**
 * Modal "บันทึกรับหนังสือ 50 ทวิ จากลูกค้า" (มติ PO 05/10/2569 U40)
 *
 * เลขที่/วันที่/ยอดภาษีตามหนังสือ + ไฟล์สแกน (บังคับ — อัปโหลดผ่าน server ก่อนบันทึก DEC-014)
 * ยอดในหนังสือไม่ตรงยอดที่ลูกค้าหักไว้ ⇒ บันทึกได้ แล้วแสดง toast เตือนจาก `warnings` ของ server
 */
export function ReceiveCustomerWhtModal({
  certificate,
  onClose,
  onReceived,
}: {
  certificate: CustomerWhtDto | null
  onClose: () => void
  onReceived: () => void
}) {
  const { showToast } = useToast()
  const [certificateNumber, setCertificateNumber] = useState('')
  const [certificateDate, setCertificateDate] = useState(toInputDate(new Date()))
  // ค่าเริ่มต้น = ยอดที่ถูกหักจริง (ส่วนใหญ่ตรงกัน) — แก้ได้ตามหนังสือ
  const [whtText, setWhtText] = useState(toBahtInput(certificate?.withheldSatang))
  const [grossText, setGrossText] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  if (certificate === null) return null

  const whtError = bahtInputError(whtText, 'ยอดภาษีตามหนังสือ')
  const grossError = grossText.trim() === '' ? null : bahtInputError(grossText, 'ยอดเงินได้ตามหนังสือ')
  const whtSatang = parseBahtInput(whtText)
  const grossSatang = grossText.trim() === '' ? null : parseBahtInput(grossText)
  const mismatch = whtError === null && whtSatang !== null && whtSatang !== certificate.withheldSatang
  const ready =
    certificateNumber.trim() !== '' &&
    certificateDate !== '' &&
    whtError === null &&
    grossError === null &&
    whtSatang !== null &&
    whtSatang > 0 &&
    file !== null

  async function submit(): Promise<void> {
    if (!ready || certificate === null || file === null) return
    setSaving(true)
    let filePath: string
    try {
      filePath = await uploadToStorage({ kind: 'customer_wht', certificateId: certificate.id }, file)
    } catch (error) {
      setSaving(false)
      const message = error instanceof StorageUploadError ? error.message : 'อัปโหลดไฟล์ไม่สำเร็จ'
      showToast({ tone: 'error', title: 'แนบไฟล์ไม่สำเร็จ', description: message })
      return
    }

    const result = await callApi<CustomerWhtReceiveResultDto>(
      `/api/accounting/customer-wht-certificates/${certificate.id}/receive`,
      jsonRequest('PATCH', {
        certificateNumber: certificateNumber.trim(),
        certificateDate,
        whtSatang,
        grossSatang,
        filePath,
        note: note.trim() === '' ? null : note.trim(),
      }),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: `บันทึกรับหนังสือเลขที่ ${result.data?.certificate.certificateNumber ?? ''} แล้ว`,
      description: `${certificate.companyName} · ${fmtSatangSymbol(result.data?.certificate.whtSatang ?? 0)}`,
    })
    for (const warning of result.data?.warnings ?? []) {
      showToast({ tone: 'warning', title: 'ยอดในหนังสือไม่ตรงยอดที่ถูกหัก', description: warning })
    }
    onReceived()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="บันทึกรับหนังสือรับรอง 50 ทวิ จากลูกค้า"
      description="กรอกตามหนังสือที่ลูกค้าออกให้ และแนบไฟล์สแกน"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            บันทึกได้รับหนังสือ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">ลูกค้า:</span>
            <span className="font-semibold">{certificate.companyName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">รอบวางบิล / ใบกำกับ:</span>
            <span className="font-mono">
              {certificate.billingRef ?? '—'}
              {certificate.taxInvoiceNumbers.length > 0 ? ` · ${certificate.taxInvoiceNumbers.join(', ')}` : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">วันที่รับเงิน:</span>
            <span className="font-mono">{fmtDate(certificate.withheldDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">ยอดที่ลูกค้าหักไว้:</span>
            <span className="font-bold text-slate-900">{fmtSatangSymbol(certificate.withheldSatang)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="เลขที่หนังสือ" required>
            <Input value={certificateNumber} onChange={(event) => setCertificateNumber(event.target.value)} />
          </Field>
          <Field label="วันที่ในหนังสือ" required>
            <Input type="date" value={certificateDate} onChange={(event) => setCertificateDate(event.target.value)} />
          </Field>
          <Field label="ยอดภาษีที่หักตามหนังสือ (บาท)" required error={whtError ?? undefined}>
            <Input inputMode="decimal" value={whtText} onChange={(event) => setWhtText(event.target.value)} />
          </Field>
          <Field label="ยอดเงินได้ตามหนังสือ (บาท)" hint="ไม่บังคับ" error={grossError ?? undefined}>
            <Input inputMode="decimal" value={grossText} onChange={(event) => setGrossText(event.target.value)} />
          </Field>
        </div>

        {mismatch && (
          <InlineAlert tone="warning" title="ยอดไม่ตรงยอดที่ลูกค้าหักไว้ตอนโอน">
            บันทึกได้ แต่ควรตรวจกับลูกค้าหรือแจ้งสำนักงานบัญชี
          </InlineAlert>
        )}

        <Field label="ไฟล์สแกนหนังสือรับรอง" required hint="PDF หรือรูปภาพ ไม่เกิน 10 MB">
          <input
            type="file"
            accept="application/pdf,image/*"
            className="block w-full text-xs text-slate-600"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>

        <Field label="หมายเหตุ" hint="ไม่บังคับ">
          <Textarea maxLength={1000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
