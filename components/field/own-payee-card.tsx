'use client'

import { useEffect, useState } from 'react'
import { ErrorState, LoadingState, StatusBadge } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { fmtSatangSymbol } from '@/lib/format/money'
import type { OwnPayeeSummaryDto } from '@/lib/payees/self'

/**
 * หน้า "ข้อมูลรับเงิน" ของพนักงาน (staging E-035) — อ่านอย่างเดียว · เลขบัญชี/เลขผู้เสียภาษีปิดบัง
 * ไม่มีปุ่มแก้ไขโดยตั้งใจ: ข้อมูลธนาคาร/ภาษีต้องผ่านการยืนยันของการเงิน
 */
export function OwnPayeeCard() {
  const [data, setData] = useState<OwnPayeeSummaryDto | null>(null)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<OwnPayeeSummaryDto>(apiPath('field.mePayee'))
      if (cancelled) return
      if (result.error !== undefined) setError(result.error)
      else {
        setError(null)
        setData(result.data ?? null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [retryKey])

  if (error !== null) {
    return (
      <ErrorState
        title={error.title}
        message={error.message}
        onRetry={() => {
          setError(null)
          setRetryKey((key) => key + 1)
        }}
      />
    )
  }
  if (data === null) return <LoadingState message="กำลังโหลดข้อมูลรับเงิน..." />

  return (
    <div className="space-y-4 lg:max-w-[720px]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">{data.displayName}</h2>
            <p className="text-xs text-slate-500">ข้อมูลที่ใช้โอนค่าตอบแทนและออกหนังสือรับรองการหักภาษี</p>
          </div>
          {data.exists && (
            <StatusBadge
              status={data.isVerified ? 'verified' : 'pending'}
              group={data.isVerified ? 'success' : 'pending'}
              label={data.isVerified ? 'การเงินยืนยันแล้ว' : 'รอการเงินตรวจ'}
            />
          )}
        </div>
        {!data.exists ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ยังไม่มีข้อมูลรับเงิน — ติดต่อการเงินเพื่อบันทึกบัญชีธนาคารและข้อมูลภาษีก่อนรับค่าตอบแทน
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">ธนาคาร</dt>
            <dd className="text-right text-slate-800">{data.bankName ?? '—'}</dd>
            <dt className="text-slate-500">ชื่อบัญชี</dt>
            <dd className="text-right text-slate-800">{data.accountName ?? '—'}</dd>
            <dt className="text-slate-500">เลขบัญชี</dt>
            <dd className="text-right font-mono text-slate-800">{data.accountNumberMasked ?? '—'}</dd>
            <dt className="text-slate-500">เลขประจำตัวผู้เสียภาษี</dt>
            <dd className="text-right font-mono text-slate-800">{data.nationalIdMasked ?? '—'}</dd>
            <dt className="text-slate-500">เงื่อนไขการหักภาษี</dt>
            <dd className="text-right text-slate-800">{data.whtConditionLabel ?? '—'}</dd>
          </dl>
        )}
      </div>

      {(data.advanceReturnOutstandingSatang > 0 || data.recoveryOutstandingSatang > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="mb-1 font-bold">ยอดที่จะหักจากการโอนรอบถัดไป</p>
          {data.advanceReturnOutstandingSatang > 0 && (
            <p>คืนเงินทดรองค้าง {fmtSatangSymbol(data.advanceReturnOutstandingSatang)}</p>
          )}
          {data.recoveryOutstandingSatang > 0 && (
            <p>คืนค่าตอบแทนที่จ่ายเกิน {fmtSatangSymbol(data.recoveryOutstandingSatang)}</p>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        ต้องการเปลี่ยนบัญชีธนาคารหรือข้อมูลภาษี แจ้งการเงิน — ข้อมูลที่แก้ต้องผ่านการยืนยันก่อนใช้โอนเงิน
      </p>
    </div>
  )
}
