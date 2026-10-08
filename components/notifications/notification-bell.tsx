'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { TOUCH_TARGET_CLASS } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { IconBell, IconClose } from '@/components/notifications/notification-icons'
import { callApi, jsonRequest } from '@/lib/api/types'
import { notificationHref, unreadBadgeText } from '@/lib/field/push-client'
import { notificationDisplay } from '@/lib/notifications/events'
import type { NotificationDto, NotificationListDto } from '@/lib/notifications/queries'
import { fmtDateTime } from '@/lib/format/datetime'

/**
 * กระดิ่งแจ้งเตือนบน header (`90` §6.3/§14 · `06` §8 · mockup `notifications.html`)
 * ใช้ร่วมกันทั้ง App Shell (หลังบ้าน) และ Field Tracker — **ตัวเดียวในระบบ ห้ามทำใหม่**
 *
 * - เปิด dropdown **ไม่** มาร์คว่าอ่านอัตโนมัติ (E11) — มาร์คตอนกดรายการ หรือกด "อ่านทั้งหมด"
 * - รายการที่มี `linkPath` ภายในแอปเท่านั้นที่พาไปหน้าอื่นได้ (กัน open redirect — `notificationHref()`)
 * - ยิง `GET /api/notifications` ตัวเดียวกันทุก role (ของผู้เรียกเองเสมอ) — ฝั่ง Field ยังมี
 *   `/api/field/notifications` ตามสเปค `45` §6.3 อยู่ แต่ UI ใช้เส้นกลางเส้นเดียวเพื่อไม่ให้ตรรกะแตกสองทาง
 */

const DROPDOWN_LIMIT = 10

/**
 * อ่านแล้ว/อ่านทั้งหมดจากที่ใดก็ตาม (หน้า /notifications หรือกระดิ่งอีกตัว) ⇒ กระดิ่งทุกตัวโหลดตัวเลขใหม่ทันที
 * — เดิมค้างได้ถึง 2 นาที (preship R8-007)
 */
const NOTIFICATIONS_CHANGED_EVENT = 'ar:notifications-changed'

export function announceNotificationsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
}

/** PATCH อ่านแล้ว/อ่านทั้งหมด — ล้มเหลวต้องบอกผู้ใช้ (เดิมเงียบ · R8-006) · สำเร็จแจ้งกระดิ่งทุกตัว */
export async function markNotificationsRead(
  path: string,
  onError: (error: { title: string; message: string }) => void,
): Promise<boolean> {
  const response = await callApi(path, jsonRequest('PATCH', {}))
  if (response.error !== undefined) {
    onError(response.error)
    return false
  }
  announceNotificationsChanged()
  return true
}

export function NotificationBell({
  /** ลิงก์ "ดูทั้งหมด" ท้าย dropdown — ไม่ส่ง = ไม่แสดง (Field Tracker ไม่มีหน้ารายการเต็มของตัวเอง) */
  allHref,
}: {
  allHref?: string
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<NotificationListDto>({ items: [], unreadCount: 0, totalCount: 0 })
  // Rule 05 — ต้องแยก "กำลังโหลด" / "ว่างจริง" / "โหลดไม่สำเร็จ" ออกจากกัน
  // (ก่อนหน้านี้ทั้งสามกรณีขึ้นข้อความ "ยังไม่มีการแจ้งเตือน" เหมือนกันหมด = ปิดบังปัญหา)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const response = await callApi<NotificationListDto>(`/api/notifications?limit=${DROPDOWN_LIMIT}`)
    // data เป็น null (ตอบผิดรูป) ⇒ ถือว่าโหลดไม่สำเร็จ ไม่ใช่อ่าน null แล้วทั้งแอปพัง (preship R3-029)
    if (response.data !== undefined && response.data !== null && Array.isArray(response.data.items)) {
      setData(response.data)
      setFailed(false)
    } else {
      setFailed(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void (async () => {
      await load()
    })()
    // เปิดแอปค้างไว้ทั้งวันได้ ⇒ รีเฟรชเบา ๆ ทุก 2 นาที (ไม่ใช่ช่องทางเดียว จึงไม่ต้องถี่กว่านี้)
    const timer = setInterval(() => void load(), 120_000)
    const onChanged = () => void load()
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    return () => {
      clearInterval(timer)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    }
  }, [load])

  const showError = (error: { title: string; message: string }) =>
    showToast({ tone: 'error', title: error.title, description: error.message })

  async function markOneRead(id: string): Promise<void> {
    // สำเร็จ ⇒ event โหลดกระดิ่งทุกตัว (รวมตัวนี้) · ล้มเหลว ⇒ toast + โหลดใหม่ให้ตัวเลขตรงจริง
    if (!(await markNotificationsRead(`/api/notifications/${id}/read`, showError))) await load()
  }

  async function markAllRead(): Promise<void> {
    if (!(await markNotificationsRead('/api/notifications/read-all', showError))) await load()
  }

  function openItem(item: NotificationDto): void {
    void markOneRead(item.id)
    const href = notificationHref(item.linkPath)
    if (href !== null) {
      setOpen(false)
      router.push(href)
    }
  }

  const badge = unreadBadgeText(data.unreadCount)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          // เปิด dropdown ⇒ โหลดรายการล่าสุด (ไม่รอรอบ 2 นาที · R8-007)
          if (!open) void load()
          setOpen((current) => !current)
        }}
        aria-label={`การแจ้งเตือน${badge === null ? '' : ` (ยังไม่อ่าน ${badge})`}`}
        aria-expanded={open}
        className="focus-ring relative inline-flex items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 rounded-lg p-2 text-slate-700 hover:bg-slate-100"
      >
        <IconBell className="h-5 w-5" />
        {badge !== null && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          {/* มือถือ (< sm): ยึดกับขอบจอซ้าย-ขวาใต้แถบหัว 64px — เดิมยึดขอบขวาของปุ่มกระดิ่ง (มีปุ่มเมนูอยู่ทางขวาอีก)
              แผงกว้าง 88vw จึงล้นขอบซ้าย 13–81px หัวข้อ/เลขเคสถูกตัด (preship R9-001) */}
          <div className="fixed inset-x-2 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-1 sm:max-h-none sm:w-[340px] sm:overflow-visible">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-xs font-bold text-slate-700">แจ้งเตือนล่าสุด</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400">{data.unreadCount} ยังไม่อ่าน</span>
                {data.unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="focus-ring rounded px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    อ่านทั้งหมด
                  </button>
                )}
                <button
                  type="button"
                  aria-label="ปิด"
                  onClick={() => setOpen(false)}
                  // จอสัมผัสได้พื้นที่แตะ ≥ 44px (preship R2-011)
                  className={cn(
                    'focus-ring inline-flex items-center justify-center rounded p-1 text-slate-400 hover:bg-slate-100',
                    TOUCH_TARGET_CLASS,
                  )}
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {loading ? (
                <p className="px-3 py-6 text-center text-xs text-slate-400">กำลังโหลด...</p>
              ) : failed ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs text-rose-600">โหลดการแจ้งเตือนไม่สำเร็จ</p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="focus-ring mt-1 rounded px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    ลองใหม่
                  </button>
                </div>
              ) : data.items.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-slate-400">ยังไม่มีการแจ้งเตือน</p>
              ) : (
                data.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      'focus-ring block w-full border-b border-slate-50 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50',
                      item.readAt === null && 'bg-blue-50/50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {item.readAt === null && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-slate-800">{item.title}</span>
                        {item.body !== null && (
                          <span className="mt-0.5 block text-[11px] text-slate-500">{item.body}</span>
                        )}
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          {notificationDisplay(item.eventCode).module} · {fmtDateTime(item.createdAt)}
                        </span>
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {allHref !== undefined && (
              <Link
                href={allHref}
                onClick={() => setOpen(false)}
                className="focus-ring block border-t border-slate-100 px-4 py-2 text-center text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
              >
                ดูทั้งหมด
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
