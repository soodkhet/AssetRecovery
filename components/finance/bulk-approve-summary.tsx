'use client'

import { useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import type { CompensationBulkPreviewDto } from '@/lib/compensation/approval-types'
import { fmtSatangSymbol } from '@/lib/format/money'

/** คำอธิบายใต้ยอดสุทธิ — บอกชัดว่าเป็นประมาณการและเพราะอะไร (mytester2 F2-01) */
export const BULK_APPROVE_ESTIMATE_NOTE =
  'ประมาณการรอบจ่ายถัดไป: คิดภาษีหัก ณ ที่จ่ายรวมต่อผู้รับ (รายการที่เลือก + รายการที่อนุมัติแล้วรอเข้ารอบ + ยอดสะสมของเดือน) ' +
  '— ยอดจริงอาจต่างได้ถ้ารายการยังเหลือขั้นอนุมัติหรือไม่เข้ารอบจ่ายเดียวกัน'

export type PreviewState =
  | { kind: 'loading' }
  | { kind: 'ready'; preview: CompensationBulkPreviewDto }
  | { kind: 'error' }

/** ผลที่โหลดแล้วผูกกับชุด id — ชุดเปลี่ยน ⇒ ถือว่ากำลังโหลด (ไม่ setState ตรงใน effect) */
type LoadedPreview = { key: string; state: Exclude<PreviewState, { kind: 'loading' }> }

/**
 * กล่องสรุปยอดในหน้าต่าง "อนุมัติที่เลือก (N)" (staging E-045 · mytester2 F2-01) — ใช้ร่วมคิวการเงินและคิวผู้จัดการ
 *
 * ยอดสุทธิมาจาก server (`GET /api/compensation/bulk-preview`) ที่คิดชุดที่เลือก**รวมกลุ่มต่อผู้รับ**แบบรอบจ่าย
 * — เดิมรวมยอดสุทธิรายแถว (แต่ละแถวไม่รู้ว่าแถวอื่นถูกเลือกด้วย) จึงหักภาษีน้อยกว่ารอบจริง · หน้าจอไม่คิดเงินเอง (Rule 01)
 */
export function BulkApproveSummary({ ids, grossSatang }: { ids: readonly string[]; grossSatang: number }) {
  const key = ids.join(',')
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null)
  const state: PreviewState = loaded !== null && loaded.key === key ? loaded.state : { kind: 'loading' }

  useEffect(() => {
    if (key === '') return
    let cancelled = false
    void callApi<CompensationBulkPreviewDto>(`/api/compensation/bulk-preview?ids=${encodeURIComponent(key)}`).then((result) => {
      if (cancelled) return
      setLoaded({ key, state: result.data === undefined ? { kind: 'error' } : { kind: 'ready', preview: result.data } })
    })
    return () => {
      cancelled = true
    }
  }, [key])

  return <BulkApproveSummaryView grossSatang={grossSatang} state={state} />
}

/** คำอธิบายเมื่อรายการเดิมของผู้รับถูกหักภาษีเพิ่มเพราะชุดที่เลือก (รีวิว F2-01) */
export const BULK_APPROVE_EXISTING_WHT_NOTE =
  'รายการที่อนุมัติแล้วรอเข้ารอบจ่ายของผู้รับคนเดียวกันเดิมยังไม่ถึงเกณฑ์ขั้นต่ำ — เมื่อรวมรายการที่เลือกแล้วถึงเกณฑ์ ' +
  'รายการเดิมจึงถูกหักภาษีเพิ่มตามยอดนี้ในรอบจ่ายถัดไป (ไม่ได้หักจากรายการที่เลือก)'

/** ส่วนแสดงผล (แยกให้ทดสอบได้) — รับยอดจาก server ตรง ๆ ไม่คิดเงินเอง */
export function BulkApproveSummaryView({ grossSatang, state }: { grossSatang: number; state: PreviewState }) {
  const existingIncrease = state.kind === 'ready' ? state.preview.existingWhtIncreaseSatang : 0
  return (
    <div className="space-y-1.5">
      <dl className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
        <dt className="text-slate-500">ยอดก่อนหักภาษีรวม</dt>
        <dd className="text-right font-semibold text-slate-800">{fmtSatangSymbol(grossSatang)}</dd>
        <dt className="text-slate-500">หักภาษี ณ ที่จ่ายของรายการที่เลือก (ประมาณการ)</dt>
        <dd className="text-right font-semibold text-slate-800">
          {state.kind === 'ready' ? fmtSatangSymbol(state.preview.whtDeductedSatang) : '—'}
        </dd>
        <dt className="text-slate-500">ยอดสุทธิของรายการที่เลือก (ประมาณการ)</dt>
        <dd className="text-right font-semibold text-emerald-700">
          {state.kind === 'ready' ? fmtSatangSymbol(state.preview.netSatang) : state.kind === 'loading' ? 'กำลังคำนวณ…' : '—'}
        </dd>
        {existingIncrease > 0 && (
          <>
            <dt className="text-amber-700">ภาษีที่รายการอนุมัติแล้วรอเข้ารอบถูกหักเพิ่ม</dt>
            <dd className="text-right font-semibold text-amber-700">{fmtSatangSymbol(existingIncrease)}</dd>
          </>
        )}
      </dl>
      {existingIncrease > 0 && <p className="text-[11px] text-amber-700">{BULK_APPROVE_EXISTING_WHT_NOTE}</p>}
      <p className="text-[11px] text-slate-500">
        {state.kind === 'error' ? 'คำนวณยอดภาษีรวมไม่สำเร็จ — อนุมัติต่อได้ ยอดจริงคำนวณตอนสร้างรอบจ่าย' : BULK_APPROVE_ESTIMATE_NOTE}
      </p>
    </div>
  )
}
