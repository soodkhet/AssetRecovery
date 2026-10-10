'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, InlineAlert, TBody, THead, Table, Td, Th, Tr, useToast } from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import type { MatchProposalDto, MatchResultDto } from '@/lib/bank-recon/types'
import { matchSuccessToast } from '@/lib/bank-recon/matching'
import { fmtDate } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * "คู่ที่ระบบเสนอ" — จับคู่ทางกลับ (มติ PO 07/10/2569 U137 · mockup `accounting.html` แท็บ `bank`)
 *
 * เอกสารที่เกิด/เปลี่ยนสถานะหลัง statement ถูกนำเข้า (รอบวางบิลส่งทีหลัง · รอบจ่ายยืนยันจ่ายเอง) จะไม่ถูก
 * จับคู่อัตโนมัติอีก ⇒ ระบบเสนอรายการเดินบัญชีที่ยอด+วันตรงให้ **กดยืนยันทีละคู่** (ไม่จับคู่เงียบ)
 * · ยืนยัน = endpoint จับคู่มือเดิม (สิทธิ์ manage · audit บอกที่มาว่าเป็นคู่ที่เสนอ)
 * · แผงนี้ซ่อนเมื่อไม่มีคู่ที่เสนอ (ไม่ใช่ข้อมูลหลักของหน้า) · โหลดไม่สำเร็จ = แสดงข้อความ error
 */
export function MatchProposalsPanel({
  canManage,
  version,
  onMatched,
}: {
  canManage: boolean
  /** เปลี่ยนค่าเมื่อรายการเดินบัญชีเปลี่ยน (นำเข้า/จับคู่/ปิดรายการ) ⇒ โหลดคู่ที่เสนอใหม่ */
  version: number
  onMatched: () => void
}) {
  const { showToast } = useToast()
  const [items, setItems] = useState<MatchProposalDto[]>([])
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const fetchProposals = useCallback(
    () => callApi<MatchProposalDto[]>('/api/bank-reconciliation/match-proposals'),
    [],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchProposals()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        return
      }
      setItems(result.data ?? [])
      setError(null)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchProposals, version, reloadTick])

  async function confirm(proposal: MatchProposalDto): Promise<void> {
    const key = `${proposal.transaction.id}:${proposal.target.id}`
    setSavingId(key)
    const result = await callApi<MatchResultDto | null>(
      `/api/bank-reconciliation/transactions/${proposal.transaction.id}/match`,
      jsonRequest('PATCH', {
        targetKind: proposal.target.kind,
        targetId: proposal.target.id,
        matchNote: null,
        confirmRematch: false,
        fromProposal: true,
      }),
    )
    setSavingId(null)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      setReloadTick((tick) => tick + 1)
      return
    }
    if (result.warning !== undefined) {
      // มีคนจับคู่รายการนี้ไปก่อนแล้ว — ไม่ทับให้เอง ให้ไปจัดการที่ "จับคู่ Manual"
      showToast({ tone: 'warning', title: result.warning.title, description: result.warning.message })
      setReloadTick((tick) => tick + 1)
      onMatched()
      return
    }
    // staging E-056 — ข้อความเดียวกับจับคู่ Manual (บอกผลที่เกิดจริง)
    showToast({ tone: 'success', ...matchSuccessToast(result.data?.effect, proposal.target.ref) })
    setReloadTick((tick) => tick + 1)
    onMatched()
  }

  if (error !== null) {
    return (
      <InlineAlert tone="error" title="โหลดคู่ที่ระบบเสนอไม่สำเร็จ">
        {error.message}
      </InlineAlert>
    )
  }
  if (items.length === 0) return null

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-emerald-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">คู่ที่ระบบเสนอ ({items.length})</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            รอบวางบิล/รอบจ่ายที่มีรายการเดินบัญชียังไม่จับคู่ซึ่งยอดและวันที่ตรงกัน — ระบบไม่จับคู่ให้เอง
            ตรวจแล้วกดยืนยันทีละคู่
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <Tr>
              <Th>เอกสาร</Th>
              <Th>รายการเดินบัญชี</Th>
              <Th numeric>ยอดที่ตรง</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TBody>
            {items.map((proposal) => {
              const key = `${proposal.transaction.id}:${proposal.target.id}`
              return (
                <Tr key={key}>
                  <Td>
                    <div className="font-mono text-xs font-semibold text-slate-900">{proposal.target.ref}</div>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {proposal.target.kind === 'billing' ? 'รอบวางบิล' : 'รอบจ่าย'}
                      {proposal.target.statusLabel === '' ? '' : ` · ${proposal.target.statusLabel}`} · วันที่{' '}
                      {fmtDate(proposal.target.referenceDate)}
                    </p>
                  </Td>
                  <Td>
                    <div className="text-sm text-slate-900">{proposal.transaction.description}</div>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {fmtDate(proposal.transaction.transactionDate)} · {proposal.transaction.bankAccountLabel}
                    </p>
                    {proposal.ambiguous && (
                      <p className="mt-1 text-[10px] font-semibold text-amber-700">
                        มีคู่ที่เป็นไปได้มากกว่าหนึ่ง — ตรวจให้แน่ใจก่อนยืนยัน
                      </p>
                    )}
                  </Td>
                  <Td
                    numeric
                    className={proposal.transaction.amountSatang > 0 ? 'font-bold text-emerald-600' : 'font-bold text-rose-600'}
                  >
                    {proposal.transaction.amountSatang > 0 ? '+' : '-'}
                    {fmtSatangSymbol(proposal.matchedAmountSatang)}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    {canManage ? (
                      <Button
                        size="sm"
                        loading={savingId === key}
                        disabled={savingId !== null}
                        onClick={() => void confirm(proposal)}
                      >
                        ยืนยันจับคู่
                      </Button>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">รอฝ่ายบัญชียืนยัน</span>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </Table>
      </div>
    </div>
  )
}
