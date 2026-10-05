'use client'

import { useState } from 'react'
import { Button, Field, InlineAlert, Input, Modal, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { BankTransactionDto } from '@/lib/bank-recon/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import { StorageUploadError, uploadToStorage } from '@/lib/uploads/client'

/**
 * Modal ของ "เงินรับรอตรวจสอบ" (มติ PO 05/10/2569 U41)
 *
 * - `mode = 'suspend'` — ย้ายเงินเข้าไม่ทราบที่มาเป็นเงินรับรอตรวจสอบ (เหตุผลบังคับ) · **ไม่สร้างเงินรับ ไม่ลดยอดค้างชำระ**
 * - `mode = 'refund'` — คืนเงินผู้โอน: วันที่ + หลักฐาน (อัปโหลดผ่าน server) + เหตุผล · เป็นสถานะสุดท้าย
 * ทราบที่มาภายหลัง ⇒ ใช้ปุ่ม "จับคู่ Manual" ตามสายปกติ (ไม่ใช่ Modal นี้)
 */
export function SuspenseModal({
  transaction,
  mode,
  onClose,
  onDone,
}: {
  transaction: BankTransactionDto | null
  mode: 'suspend' | 'refund'
  onClose: () => void
  onDone: () => void
}) {
  const { showToast } = useToast()
  const [reason, setReason] = useState('')
  const [refundDate, setRefundDate] = useState(toInputDate(new Date()))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  if (transaction === null) return null

  const isRefund = mode === 'refund'
  const ready = reason.trim() !== '' && (!isRefund || (refundDate !== '' && file !== null))

  async function submit(): Promise<void> {
    if (!ready || transaction === null) return
    setSaving(true)

    let body: Record<string, unknown> = { reason: reason.trim() }
    if (isRefund) {
      if (file === null) return
      let filePath: string
      try {
        filePath = await uploadToStorage({ kind: 'bank_refund', transactionId: transaction.id }, file)
      } catch (error) {
        setSaving(false)
        const message = error instanceof StorageUploadError ? error.message : 'อัปโหลดไฟล์ไม่สำเร็จ'
        showToast({ tone: 'error', title: 'แนบหลักฐานไม่สำเร็จ', description: message })
        return
      }
      body = { ...body, refundDate, filePath }
    }

    const result = await callApi<BankTransactionDto>(
      `/api/bank-reconciliation/transactions/${transaction.id}/${isRefund ? 'refund' : 'suspense'}`,
      jsonRequest('PATCH', body),
    )
    setSaving(false)
    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title: isRefund ? 'บันทึกคืนเงินผู้โอนแล้ว' : 'ย้ายเป็นเงินรับรอตรวจสอบแล้ว',
      description: isRefund
        ? 'รายการนี้ปิดแล้ว — ไม่มีผลกับยอดค้างชำระหรือรายได้'
        : 'ยังไม่รับรู้เป็นรายได้และไม่ลดยอดค้างชำระ — ทราบที่มาแล้วให้จับคู่กับรอบวางบิล',
    })
    onDone()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isRefund ? 'คืนเงินผู้โอน' : 'ย้ายเป็นเงินรับรอตรวจสอบ'}
      description={
        isRefund
          ? 'บันทึกการโอนเงินคืนให้ผู้โอนของเงินรับรอตรวจสอบรายการนี้'
          : 'ใช้กับเงินเข้าที่ยังไม่ทราบว่าลูกค้ารายใดโอนหรือโอนเพื่ออะไร'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant={isRefund ? 'danger' : 'primary'} loading={saving} disabled={!ready} onClick={() => void submit()}>
            {isRefund ? 'ยืนยันคืนเงินผู้โอน' : 'ยืนยันย้ายเป็นเงินรับรอตรวจสอบ'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">รายการ:</span>
            <span className="font-semibold">{transaction.description}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">วันที่ / บัญชี:</span>
            <span className="font-mono">
              {fmtDate(transaction.transactionDate)} · {transaction.bankAccountLabel}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">ยอดเงินเข้า:</span>
            <span className="font-bold text-emerald-600">+{fmtSatangSymbol(transaction.amountSatang)}</span>
          </div>
          {transaction.suspenseNote !== null && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">เหตุผลที่รอตรวจสอบ:</span>
              <span className="text-right">{transaction.suspenseNote}</span>
            </div>
          )}
        </div>

        {isRefund && (
          <>
            <Field label="วันที่โอนคืน" required>
              <Input type="date" value={refundDate} onChange={(event) => setRefundDate(event.target.value)} />
            </Field>
            <Field label="หลักฐานการโอนคืน" required hint="PDF หรือรูปภาพ (สลิปโอนคืน/หนังสือแจ้ง) ไม่เกิน 10 MB">
              <input
                type="file"
                accept="application/pdf,image/*"
                className="block w-full text-xs text-slate-600"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </Field>
          </>
        )}

        <Field label={isRefund ? 'เหตุผลที่คืนเงิน' : 'เหตุผล'} required hint="บังคับกรอกเสมอ — บันทึกลง audit log">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              isRefund
                ? 'เช่น ผู้โอนแจ้งว่าโอนผิดบัญชี ขอคืนพร้อมหลักฐาน'
                : 'เช่น โอนเข้าไม่ระบุผู้โอน ยอดไม่ตรงบิลใด — รอสอบถามธนาคาร/ลูกค้า'
            }
          />
        </Field>

        <InlineAlert tone={isRefund ? 'warning' : 'info'} title={isRefund ? 'เป็นสถานะสุดท้าย' : 'ผลของการย้าย'}>
          {isRefund
            ? 'คืนเงินแล้วจะจับคู่กับรอบวางบิลไม่ได้อีก — ตรวจหลักฐานการโอนคืนให้ถูกต้องก่อนยืนยัน'
            : 'ระบบจะไม่สร้างเงินรับ ไม่ลดยอดค้างชำระ และไม่รับรู้รายได้ · ยอดจะแสดงเป็นเงินรับรอตรวจสอบคงค้างจนกว่าจะจับคู่หรือคืนเงิน'}
        </InlineAlert>
      </div>
    </Modal>
  )
}
