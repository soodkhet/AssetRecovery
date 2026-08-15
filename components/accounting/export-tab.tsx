'use client'

import { useState } from 'react'
import { ExportPackModal } from '@/components/accounting/export-pack-modal'
import { useExportHistory } from '@/components/accounting/use-exports'
import { usePermission } from '@/components/auth/permission-provider'
import {
  Button,
  ConfirmModal,
  InlineAlert,
  RefText,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Th,
  Tr,
  useToast,
} from '@/components/ui'
import { callApi, jsonRequest } from '@/lib/api/types'
import { EXPORT_ACCOUNTING_PACK, PACK_FILES } from '@/lib/exports/pack'
import type { ExportRecordDto } from '@/lib/exports/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtCount } from '@/lib/format/money'

/**
 * แท็บ "ส่งมอบ" (`37` §8 · mockup `accounting.html` แท็บ `export`)
 *
 * ตารางประวัติทุกเวอร์ชัน (ห้ามลบ — `37` §10) + ปุ่มสร้างชุดใหม่ + ปุ่มเดินสถานะ
 * `generated → sent → accepted` · ดาวน์โหลดซ้ำได้ทุกเวอร์ชัน (ไฟล์เดิม ไม่ประกอบใหม่)
 */
export function ExportTab() {
  const { can } = usePermission()
  const canManage = can('manage', EXPORT_ACCOUNTING_PACK)
  const { showToast } = useToast()

  const { data, periods, loading, error, reload } = useExportHistory()
  const [exporting, setExporting] = useState(false)
  const [pending, setPending] = useState<{ record: ExportRecordDto; action: 'mark-sent' | 'accept' } | null>(null)
  const [saving, setSaving] = useState(false)

  async function runTransition(): Promise<void> {
    if (pending === null) return
    setSaving(true)
    const result = await callApi<ExportRecordDto>(
      `/api/accounting/export-history/${pending.record.id}/${pending.action}`,
      jsonRequest('PATCH', {}),
    )
    setSaving(false)

    if (result.error !== undefined) {
      showToast({ tone: 'error', title: result.error.title, description: result.error.message })
      return
    }
    showToast({
      tone: 'success',
      title:
        pending.action === 'mark-sent'
          ? `บันทึกว่าส่ง ${pending.record.periodLabel} ${pending.record.versionLabel} ให้สำนักงานบัญชีแล้ว`
          : `บันทึกว่าสำนักงานบัญชีตอบรับ ${pending.record.periodLabel} ${pending.record.versionLabel} แล้ว`,
    })
    setPending(null)
    await reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            ประวัติการส่งมอบ Accounting Pack (Export History)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ทุกเวอร์ชันที่เคยส่งเก็บไว้ทั้งหมด — ดาวน์โหลดซ้ำได้ไฟล์เดิมที่ส่งจริง
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setExporting(true)}>
            สร้างชุดเอกสารใหม่
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <THead>
            <Tr>
              <Th>รอบบัญชี</Th>
              <Th>Version</Th>
              <Th>ไฟล์หลัก</Th>
              <Th>เอกสารแนบ</Th>
              <Th>ส่งโดย</Th>
              <Th>วันที่</Th>
              <Th>SHA-256</Th>
              <Th>สถานะ</Th>
              <Th className="text-right">จัดการ</Th>
            </Tr>
          </THead>
          <TableState
            loading={loading}
            error={error}
            isEmpty={data.items.length === 0}
            emptyTitle="ยังไม่เคยส่งมอบชุดเอกสารบัญชี"
            emptyDescription="กด “สร้างชุดเอกสารใหม่” เมื่อรอบบัญชีผ่าน Readiness Check แล้ว"
            colSpan={9}
          />
          <TBody>
            {!loading &&
              error === null &&
              data.items.map((row) => (
                <Tr key={row.id}>
                  <Td className="font-semibold">{row.periodLabel}</Td>
                  <Td>
                    <RefText>{row.versionLabel}</RefText>
                  </Td>
                  <Td className="text-slate-600">{fmtCount(row.fileCount)} ไฟล์</Td>
                  <Td className="text-slate-600">{fmtCount(row.attachmentCount)} ไฟล์</Td>
                  <Td className="text-slate-600">{row.generatedByName}</Td>
                  <Td className="text-xs text-slate-500">{fmtDateTime(row.generatedAt)}</Td>
                  <Td className="font-mono text-[10px] text-slate-400" title={row.fileHash}>
                    {row.fileHash.slice(0, 12)}…
                  </Td>
                  <Td>
                    <StatusBadge status={row.status} group={row.statusGroup} label={row.statusLabel} />
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          window.open(
                            `/api/accounting/export-history/${row.id}/download`,
                            '_blank',
                            'noreferrer',
                          )
                        }
                      >
                        ดาวน์โหลดซ้ำ
                      </Button>
                      {canManage && row.status === 'generated' && (
                        <Button size="sm" variant="ghost" onClick={() => setPending({ record: row, action: 'mark-sent' })}>
                          Mark ว่าส่งแล้ว
                        </Button>
                      )}
                      {canManage && row.status === 'sent' && (
                        <Button size="sm" variant="ghost" onClick={() => setPending({ record: row, action: 'accept' })}>
                          Mark ว่าตอบรับ
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
      </div>

      <InlineAlert tone="info" title="รายชื่อไฟล์มาตรฐานใน Accounting Pack (ไฟล์ 37 §6.1)">
        <div className="mt-1 grid grid-cols-1 gap-1 font-mono text-xs sm:grid-cols-2">
          {PACK_FILES.map((file) => (
            <div key={file.no}>
              {file.kind === 'xlsx' ? '📊' : '📄'} {file.fileName}
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs">
          Version Control: Export ซ้ำรอบเดียวกันได้ — ระบบเดินเวอร์ชันให้เอง (v1.0 → v1.1 → v1.2) ไม่เขียนทับของเดิม ·
          ระบบสร้างไฟล์ CSV/XLSX ตามรูปแบบที่กำหนด
        </div>
      </InlineAlert>

      <ExportPackModal
        open={exporting}
        periods={periods}
        onClose={() => setExporting(false)}
        onExported={() => void reload()}
      />

      <ConfirmModal
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void runTransition()}
        loading={saving}
        title={
          pending?.action === 'accept'
            ? `Mark ว่าสำนักงานบัญชีตอบรับแล้ว — ${pending.record.periodLabel}`
            : `Mark ว่าส่งให้สำนักงานบัญชีแล้ว — ${pending?.record.periodLabel ?? ''}`
        }
        confirmLabel={pending?.action === 'accept' ? 'ยืนยัน Accepted' : 'ยืนยันว่าส่งแล้ว'}
        description={
          pending === null
            ? ''
            : `${pending.record.periodLabel} · ${pending.record.versionLabel} · สร้างเมื่อ ${fmtDateTime(pending.record.generatedAt)} — การส่งจริงเกิดนอกระบบ ที่นี่บันทึกไว้เพื่อให้ตามสถานะได้`
        }
      />
    </div>
  )
}
