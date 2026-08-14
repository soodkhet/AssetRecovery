'use client'

import { useCallback, useEffect, useState } from 'react'
import { Can } from '@/components/auth/permission-provider'
import { ReasonConfirmModal } from '@/components/settings/reason-confirm-modal'
import {
  Button,
  Card,
  Field,
  InlineAlert,
  Input,
  Modal,
  Select,
  StatusBadge,
  TBody,
  THead,
  Table,
  TableState,
  Td,
  Textarea,
  Th,
  Tr,
  useToast,
} from '@/components/ui'
import { ACTIVE_BADGE_GROUP, MANAGE_SETTINGS, STATUS_FILTER_LABEL, type StatusFilter } from '@/components/settings/shared'
import { callApi, jsonRequest } from '@/lib/api/types'
import { toFieldErrors } from '@/lib/api/validation'
import { fmtDate } from '@/lib/format/datetime'
import { costCenterCreateSchema } from '@/lib/settings/schemas'
import type { CostCenterDto } from '@/lib/settings/types'

/**
 * แท็บ "ศูนย์ต้นทุน" (`13` §6.6) — รหัสศูนย์ต้นทุน (`CC-001`) **ระบบเดินให้อัตโนมัติ ห้ามกรอกเอง**
 * ⇒ ช่องรหัสในฟอร์มเป็น read-only และแสดงเฉพาะตอนแก้ไข
 *
 * ลบไม่ได้ถ้ามีรายการผูกอยู่ (`COST_CENTER_IN_USE`) — API ปฏิเสธเอง ปุ่มเป็นแค่ UX
 */

interface FormState {
  name: string
  description: string
  isActive: boolean
  reason: string
}

const EMPTY_FORM: FormState = { name: '', description: '', isActive: true, reason: '' }

export function CostCentersTab() {
  const { showToast } = useToast()
  const [items, setItems] = useState<readonly CostCenterDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [status, setStatus] = useState<StatusFilter>('active')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CostCenterDto | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<CostCenterDto | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  /** ตัวดึงข้อมูล **ไม่มี setState ในตัวเอง** (กฎ `react-hooks/set-state-in-effect`) */
  const fetchItems = useCallback(async () => callApi<CostCenterDto[]>(`/api/settings/cost-centers?status=${status}`), [status])

  const reload = useCallback(async () => {
    const result = await fetchItems()
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      setLoading(false)
      return
    }
    setItems(result.data ?? [])
    setError(null)
    setLoading(false)
  }, [fetchItems])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchItems()
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setItems(result.data ?? [])
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchItems])

  function openForm(target: CostCenterDto | null): void {
    setEditing(target)
    setForm(
      target === null
        ? EMPTY_FORM
        : { name: target.name, description: target.description ?? '', isActive: target.isActive, reason: '' },
    )
    setErrors({})
    setFormOpen(true)
  }

  async function save(): Promise<void> {
    const parsed = costCenterCreateSchema.safeParse({
      name: form.name.trim(),
      description: form.description.trim(),
      isActive: form.isActive,
      reason: form.reason.trim(),
    })
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error))
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const result = await callApi<CostCenterDto>(
        editing === null ? '/api/settings/cost-centers' : `/api/settings/cost-centers/${editing.id}`,
        jsonRequest(editing === null ? 'POST' : 'PATCH', parsed.data),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({
        tone: 'success',
        title: editing === null ? 'สร้างศูนย์ต้นทุนแล้ว' : 'บันทึกศูนย์ต้นทุนแล้ว',
        description: result.data?.code ?? form.name.trim(),
      })
      setFormOpen(false)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === null) return
    setDeleting(true)
    try {
      const result = await callApi(
        `/api/settings/cost-centers/${deleteTarget.id}`,
        jsonRequest('DELETE', { reason: deleteReason.trim() }),
      )
      if (result.error !== undefined) {
        showToast({ tone: 'error', title: result.error.title, description: result.error.message })
        return
      }
      showToast({ tone: 'success', title: 'ปิดใช้งานศูนย์ต้นทุนแล้ว', description: deleteTarget.code })
      setDeleteTarget(null)
      setDeleteReason('')
      await reload()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">ศูนย์ต้นทุน (Cost Center)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            ใช้จัดกลุ่มค่าใช้จ่ายตามหน่วยงาน — <span className="font-mono">รหัสระบบเดินให้อัตโนมัติ</span> แก้เองไม่ได้ (ไฟล์ 13 §6.6)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Select
              aria-label="กรองตามสถานะ"
              value={status}
              onChange={(event) => {
                setLoading(true)
                setStatus(event.target.value as StatusFilter)
              }}
            >
              {(Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((value) => (
                <option key={value} value={value}>
                  {STATUS_FILTER_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
          <Can action="manage" resource={MANAGE_SETTINGS}>
            <Button onClick={() => openForm(null)}>+ เพิ่มศูนย์ต้นทุน</Button>
          </Can>
        </div>
      </div>

      <Table>
        <THead>
          <Tr>
            <Th>รหัส</Th>
            <Th>ชื่อศูนย์ต้นทุน</Th>
            <Th>คำอธิบาย</Th>
            <Th>แก้ไขล่าสุด</Th>
            <Th className="text-right">สถานะ / จัดการ</Th>
          </Tr>
        </THead>
        {/* `TableState` เรนเดอร์ `<tbody>` ของตัวเอง — วางเป็นพี่น้องกับ `TBody` */}
        <TableState
          colSpan={5}
          loading={loading}
          error={error}
          isEmpty={items.length === 0}
          emptyTitle="ยังไม่มีศูนย์ต้นทุน"
          emptyDescription="เพิ่มศูนย์ต้นทุนแรกเพื่อใช้จัดกลุ่มค่าใช้จ่ายในรายงานกำไรขาดทุน"
          onRetry={
            <Button
              variant="secondary"
              onClick={() => {
                setLoading(true)
                void reload()
              }}
            >
              ลองใหม่
            </Button>
          }
        />
        <TBody>
          {!loading &&
            error === null &&
            items.map((item) => (
              <Tr key={item.id}>
                <Td>
                  <span className="font-mono text-xs font-bold text-slate-900">{item.code}</span>
                </Td>
                <Td>
                  <span className="font-semibold text-slate-800">{item.name}</span>
                </Td>
                <Td>
                  <span className="text-xs text-slate-500">{item.description ?? '—'}</span>
                </Td>
                <Td>
                  <span className="text-xs text-slate-500">{fmtDate(item.updatedAt)}</span>
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <StatusBadge
                      group={ACTIVE_BADGE_GROUP[item.isActive ? 'active' : 'inactive']}
                      label={item.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    />
                    <Can action="manage" resource={MANAGE_SETTINGS}>
                      <Button variant="secondary" onClick={() => openForm(item)}>
                        แก้ไข
                      </Button>
                      {item.isActive && (
                        <Button
                          variant="danger"
                          onClick={() => {
                            setDeleteTarget(item)
                            setDeleteReason('')
                          }}
                        >
                          ปิดใช้งาน
                        </Button>
                      )}
                    </Can>
                  </div>
                </Td>
              </Tr>
            ))}
        </TBody>
      </Table>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing === null ? 'เพิ่มศูนย์ต้นทุน' : `แก้ไขศูนย์ต้นทุน — ${editing.code}`}
        description="รหัสศูนย์ต้นทุนระบบเดินให้อัตโนมัติตามลำดับ (CC-001, CC-002, …) — แก้เองไม่ได้"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing === null ? 'เพิ่มศูนย์ต้นทุน' : 'บันทึกการแก้ไข'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {editing !== null && (
            <Field id="cost-center-code" label="รหัสศูนย์ต้นทุน">
              <Input id="cost-center-code" value={editing.code} readOnly disabled className="font-mono" />
            </Field>
          )}

          <Field id="cost-center-name" label="ชื่อศูนย์ต้นทุน" required error={errors.name}>
            <Input
              id="cost-center-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder='เช่น "ฝ่ายปฏิบัติการภาคสนาม"'
            />
          </Field>

          <Field id="cost-center-description" label="คำอธิบาย" error={errors.description}>
            <Textarea
              id="cost-center-description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="อธิบายว่าค่าใช้จ่ายแบบไหนควรลงศูนย์ต้นทุนนี้"
            />
          </Field>

          <Field id="cost-center-status" label="สถานะ" error={errors.isActive}>
            <Select
              id="cost-center-status"
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === 'active' }))}
            >
              <option value="active">ใช้งาน</option>
              <option value="inactive">ปิดใช้งาน</option>
            </Select>
          </Field>

          <Field id="cost-center-reason" label="เหตุผล" required error={errors.reason}>
            <Textarea
              id="cost-center-reason"
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="เช่น เพิ่มศูนย์ต้นทุนตามโครงสร้างองค์กรใหม่ปี 2569"
            />
          </Field>

          <InlineAlert tone="info" title="ทุกการแก้ไขถูกบันทึกลง Audit Log">
            การตั้งค่าการเงินกระทบตัวเลขในรายงาน — ระบบบันทึกผู้แก้ ค่าก่อน/หลัง และเหตุผลไว้ถาวร (ไฟล์ 90 §13)
          </InlineAlert>
        </div>
      </Modal>

      <ReasonConfirmModal
        open={deleteTarget !== null}
        title={`ปิดใช้งานศูนย์ต้นทุน "${deleteTarget?.code ?? ''}"`}
        description="ศูนย์ต้นทุนที่มีรายการค่าใช้จ่ายผูกอยู่ปิดไม่ได้ (COST_CENTER_IN_USE) — เอกสารเก่ายังอ้างชื่อเดิมได้เสมอ"
        confirmLabel="ยืนยันปิดใช้งาน"
        loading={deleting}
        reason={deleteReason}
        onReasonChange={setDeleteReason}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        placeholder="เช่น ยุบหน่วยงานตามโครงสร้างใหม่"
      />
    </Card>
  )
}
