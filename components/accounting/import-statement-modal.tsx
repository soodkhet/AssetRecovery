'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Field, InlineAlert, Modal, Select, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { StatementImportResultDto } from '@/lib/bank-recon/types'
import { fmtCount } from '@/lib/format/money'
import type { BankAccountDto } from '@/lib/settings/types'

/**
 * Modal "นำเข้า Bank Statement" (`35` §8 · mockup `accounting.html` `import-statement`)
 *
 * เลือกบัญชีธนาคาร + ลากไฟล์ CSV มาวาง — **งวดบัญชีระบบผูกให้เองจากวันที่ในไฟล์** (ไม่ให้คนเลือก
 * เพื่อไม่ให้รายการไปอยู่ผิดงวด) · ไฟล์ถูกอ่านเป็นข้อความฝั่ง client แล้วส่งขึ้น API
 */
export function ImportStatementModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const { showToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [accounts, setAccounts] = useState<readonly BankAccountDto[]>([])
  const [bankAccountId, setBankAccountId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const result = await callApi<BankAccountDto[]>('/api/settings/bank-accounts')
      if (cancelled) return
      setAccounts(result.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const selected = accounts.find((account) => account.id === bankAccountId)
  const ready = bankAccountId !== '' && file !== null

  function pickFile(next: File | undefined): void {
    if (next === undefined) return
    setFile(next)
  }

  async function submit(): Promise<void> {
    if (!ready || file === null) return
    setSaving(true)
    const csv = await file.text()
    const result = await callApi<StatementImportResultDto>(
      '/api/bank-reconciliation/import',
      jsonRequest('POST', { bankAccountId, csv, fileName: file.name }),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }

    const data = result.data
    showToast({
      tone: 'success',
      title: 'นำเข้า statement แล้ว',
      description: `บันทึกใหม่ ${fmtCount(data?.imported ?? 0)} รายการ · จับคู่อัตโนมัติ ${fmtCount(
        data?.autoMatched ?? 0,
      )} · ซ้ำ ${fmtCount(data?.duplicates ?? 0)} · อ่านไม่ออก ${fmtCount(data?.skippedRows.length ?? 0)}`,
    })
    setFile(null)
    onImported()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="นำเข้า Bank Statement"
      description="ระบบจะจับคู่อัตโนมัติให้เฉพาะรายการที่ยอดตรงและมีคู่ที่เป็นไปได้เพียงรายการเดียว"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} disabled={!ready} onClick={() => void submit()}>
            อัปโหลดและประมวลผล
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="บัญชีธนาคาร" required>
          <Select value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}>
            <option value="">— เลือกบัญชีธนาคาร —</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.bankName} — {account.accountName} ({account.accountNumberMasked})
              </option>
            ))}
          </Select>
        </Field>

        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            pickFile(event.dataTransfer.files[0])
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragging ? 'border-slate-500 bg-slate-100' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
          }`}
        >
          <div className="text-sm font-bold text-slate-700">
            {file === null ? 'คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่' : file.name}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            รองรับไฟล์ CSV ตามรูปแบบ statement ที่ตั้งไว้กับบัญชีนั้น (ตั้งค่าที่หน้าตั้งค่าการเงิน)
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
        </div>

        <InlineAlert tone="info">
          ระบบจับคู่อัตโนมัติเมื่อยอดตรงเป๊ะและอยู่ในช่วง
          {selected === undefined ? ' tolerance ที่ตั้งไว้ต่อบัญชี' : ` ${selected.autoMatchToleranceDays} วัน`}
          หลังวันวางบิล/วันสร้างไฟล์โอน — ที่เหลือจะขึ้นเป็น <b>ยังไม่จับคู่</b> ให้จับคู่เอง ·
          แถวที่เคยนำเข้าแล้วจะถูกข้าม ไม่นับเงินซ้ำ
        </InlineAlert>
      </div>
    </Modal>
  )
}
