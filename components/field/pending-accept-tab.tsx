'use client'

import { useState } from 'react'
import { FieldCaseDetailModal } from '@/components/field/field-case-detail'
import { IconMapPin } from '@/components/field/field-icons'
import { Button, EmptyState, ErrorState, LoadingState, RefText, useToast } from '@/components/ui'
import { useFieldCases } from '@/components/field/field-cases-provider'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest } from '@/lib/api/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'
import { assetSummary, fieldCardAction } from '@/lib/field/field-ui'
import type { FieldActionResultDto, FieldCaseListItemDto } from '@/lib/field/types'

/**
 * แท็บ "รอรับงาน" (`41` §7.2) + Agent Accept UI ของไฟล์ 40 (§8 `accept_case`)
 * กดรับงานจากปุ่มบนการ์ดหรือจาก modal รายละเอียดก็ได้ผลเดียวกัน — `pending_accept → accepted_unscheduled`
 */
export function PendingAcceptTab() {
  const { items, loading, error, reload } = useFieldCases()
  const { showToast } = useToast()
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)

  const cases = items.filter((item) => item.status === 'pending_accept')

  async function accept(item: FieldCaseListItemDto): Promise<void> {
    setAccepting(item.caseId)
    try {
      const response = await callApi<FieldActionResultDto>(
        apiPath('field.acceptCase', { id: item.caseId }),
        jsonRequest('POST', {}),
      )
      if (response.error !== undefined) {
        showToast({ tone: 'error', title: response.error.title, description: response.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: 'รับงานแล้ว',
        description: `${item.caseRef} — ไปจัดวันที่ติดตามได้ที่แท็บ "รับงานแล้ว"`,
      })
      await reload()
    } finally {
      setAccepting(null)
    }
  }

  if (loading) return <LoadingState message="กำลังโหลดเคสที่รอรับงาน..." />
  if (error !== null) return <ErrorState title={error.title} message={error.message} code={error.code} />

  return (
    <>
      {cases.length === 0 ? (
        <EmptyState title="ไม่มีเคสรอรับงาน" description="เคสใหม่ที่ผู้จัดการมอบหมายจะแสดงที่นี่" />
      ) : (
        <div className="space-y-3">
          {cases.map((item) => {
            const action = fieldCardAction(item)
            return (
              <div key={item.assignmentId} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                <div className="mb-2">
                  <div className="text-base font-bold text-slate-800">{item.debtorName ?? '—'}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <IconMapPin className="h-4 w-4" />
                    {[item.district, item.province].filter((part) => part !== null).join(', ') || '—'}
                  </div>
                </div>
                <div className="mb-3 text-xs text-slate-500">
                  <RefText>{item.caseRef}</RefText> · {assetSummary({ assetDescription: item.assetDescription })} ·
                  มูลหนี้{' '}
                  <span className="font-mono">
                    {item.debtAmountSatang === null ? '—' : fmtSatangSymbol(item.debtAmountSatang)}
                  </span>{' '}
                  · มอบหมายเมื่อ {fmtDateTime(item.assignedAt)}
                </div>
                {item.commissionSatang !== null && (
                  <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    จะได้รับถ้าจบงานสำเร็จ{' '}
                    <span className="font-mono">{fmtSatangSymbol(item.commissionSatang)}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setDetailCaseId(item.caseId)}>
                    ดูรายละเอียด
                  </Button>
                  {action?.kind === 'accept' && (
                    <Button
                      className="flex-1"
                      loading={accepting === item.caseId}
                      onClick={() => {
                        void accept(item)
                      }}
                    >
                      {action.label}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <FieldCaseDetailModal
        open={detailCaseId !== null}
        caseId={detailCaseId}
        onClose={() => setDetailCaseId(null)}
        onChanged={() => {
          showToast({ tone: 'success', title: 'รับงานแล้ว', description: 'ไปจัดวันที่ติดตามได้ที่แท็บ "รับงานแล้ว"' })
          void reload()
        }}
      />
    </>
  )
}
