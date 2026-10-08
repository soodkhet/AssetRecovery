'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { markNotificationsRead } from '@/components/notifications/notification-bell'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterGroup,
  LoadingState,
  PageHeader,
  StatusBadge,
  cn,
  useToast,
} from '@/components/ui'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { notificationHref } from '@/lib/field/push-client'
import { fmtDateTime } from '@/lib/format/datetime'
import { notificationDisplay } from '@/lib/notifications/events'
import type { NotificationDto, NotificationListDto } from '@/lib/notifications/queries'
import type { NotificationFilter } from '@/lib/notifications/schemas'

/**
 * ศูนย์แจ้งเตือน หน้ารายการเต็ม (`90` §6.3/§14 · mockup `reference/notifications.html`)
 *
 * โครงตาม mockup: แท็บ ทั้งหมด/ยังไม่อ่าน + ปุ่ม "อ่านทั้งหมด" → การ์ดรายการ (จุดสถานะอ่าน/ไม่อ่าน,
 * ป้ายโมดูล, `event_code` แบบ mono, `link_path`, เวลา พ.ศ.) → ปุ่ม "เปิดรายการ"/"อ่านแล้ว" ต่อแถว
 *
 * - ระดับสีของป้ายโมดูลมาจากแค็ตตาล็อกกลาง (`lib/notifications/events.ts`) ไม่ใช่สีที่เขียนในหน้านี้
 * - deep link ผ่าน `notificationHref()` เท่านั้น (path ภายในแอป — กัน open redirect)
 * - มี loading / empty / error ครบสามสถานะตาม `04` §9
 */

const FILTERS: readonly { value: NotificationFilter; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'unread', label: 'ยังไม่อ่าน' },
]

const PAGE_LIMIT = 100

export function NotificationCenter() {
  const router = useRouter()
  const { showToast } = useToast()
  const [filter, setFilter] = useState<NotificationFilter>('all')
  /** รายการ + ตัวกรองที่รายการนี้เป็นของ — ตัวกรองไม่ตรงกับที่เลือก = กำลังโหลด (R8-005) */
  const [loaded, setLoaded] = useState<{ filter: NotificationFilter; list: NotificationListDto } | null>(null)
  const [error, setError] = useState<ApiCallError | null>(null)
  const [busy, setBusy] = useState(false)
  /** ลำดับคำขอล่าสุด — คำตอบของคำขอเก่าที่มาช้าห้ามทับรายการของตัวกรองปัจจุบัน (R8-005) */
  const requestSeq = useRef(0)

  const load = useCallback(async (next: NotificationFilter) => {
    const seq = ++requestSeq.current
    const response = await callApi<NotificationListDto>(`/api/notifications?filter=${next}&limit=${PAGE_LIMIT}`)
    if (seq !== requestSeq.current) return
    setError(response.error ?? null)
    if (response.data !== undefined) setLoaded({ filter: next, list: response.data })
  }, [])

  // ตัวเลขบนแท็บใช้ของรายการล่าสุดได้แม้กำลังโหลดตัวกรองใหม่ · ตารางแสดง loading จนกว่าจะเป็นของตัวกรองนี้
  const data = loaded?.list ?? null
  const listReady = loaded !== null && loaded.filter === filter

  useEffect(() => {
    void (async () => {
      await load(filter)
    })()
  }, [filter, load])

  const showError = (failure: { title: string; message: string }) =>
    showToast({ tone: 'error', title: failure.title, description: failure.message })

  // ล้มเหลว ⇒ toast (เดิมเงียบ · R8-006) · สำเร็จ ⇒ กระดิ่งบนหัวจอโหลดตัวเลขใหม่ด้วย (R8-007)
  async function markOneRead(id: string): Promise<void> {
    setBusy(true)
    await markNotificationsRead(`/api/notifications/${id}/read`, showError)
    await load(filter)
    setBusy(false)
  }

  async function markAllRead(): Promise<void> {
    setBusy(true)
    await markNotificationsRead('/api/notifications/read-all', showError)
    await load(filter)
    setBusy(false)
  }

  function openItem(item: NotificationDto): void {
    const href = notificationHref(item.linkPath)
    void markOneRead(item.id)
    if (href !== null) router.push(href)
  }

  const options = FILTERS.map((option) => ({
    value: option.value,
    label:
      data === null
        ? option.label
        : `${option.label} (${option.value === 'unread' ? data.unreadCount : data.totalCount})`,
  }))

  return (
    <>
      <PageHeader
        title="การแจ้งเตือน"
        description="แจ้งเตือนในแอปของคุณ — ทุกการเปลี่ยนสถานะสำคัญของเคสและงานการเงิน"
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <FilterGroup options={options} value={filter} onChange={setFilter} />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || data === null || data.unreadCount === 0}
          onClick={() => void markAllRead()}
        >
          อ่านทั้งหมด
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {error !== null ? (
          <ErrorState
            title={error.title}
            message={error.message}
            code={error.code}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load(filter)}>
                ลองใหม่
              </Button>
            }
          />
        ) : data === null || !listReady ? (
          <LoadingState message="กำลังโหลดการแจ้งเตือน..." />
        ) : data.items.length === 0 ? (
          <EmptyState
            title={filter === 'unread' ? 'ไม่มีการแจ้งเตือนที่ยังไม่อ่าน' : 'ยังไม่มีการแจ้งเตือน'}
            description="งานของคุณเรียบร้อยดี"
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                busy={busy}
                onOpen={() => openItem(item)}
                onMarkRead={() => void markOneRead(item.id)}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function NotificationRow({
  item,
  busy,
  onOpen,
  onMarkRead,
}: {
  item: NotificationDto
  busy: boolean
  onOpen: () => void
  onMarkRead: () => void
}) {
  const display = notificationDisplay(item.eventCode)
  const unread = item.readAt === null

  return (
    <li className={cn('flex gap-3 p-4', unread && 'bg-blue-50/40')}>
      <span
        aria-hidden="true"
        className={cn('mt-1.5 block h-2 w-2 shrink-0 rounded-full', unread ? 'bg-blue-500' : 'bg-slate-200')}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{item.title}</span>
          <StatusBadge group={display.level} label={display.module} />
          <span className="font-mono text-[10px] text-slate-400">{item.eventCode}</span>
        </div>
        {item.body !== null && <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.body}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          <span>{fmtDateTime(item.createdAt)}</span>
          {item.linkPath !== null && <span className="font-mono text-blue-500">{item.linkPath}</span>}
          {item.readAt !== null && <span>อ่านแล้ว {fmtDateTime(item.readAt)}</span>}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {notificationHref(item.linkPath) !== null && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onOpen}>
            เปิดรายการ
          </Button>
        )}
        {unread && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onMarkRead}>
            อ่านแล้ว
          </Button>
        )}
      </div>
    </li>
  )
}
