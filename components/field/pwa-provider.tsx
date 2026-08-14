'use client'

import { useCallback, useEffect, useState } from 'react'
import { IconClose, IconPlus } from '@/components/field/field-icons'
import { useToast } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, jsonRequest } from '@/lib/api/types'
import {
  A2HS_DISMISS_KEY,
  detectIOS,
  shouldOfferPushPrompt,
  shouldShowA2hsBanner,
  toPushSubscribeInput,
  urlBase64ToUint8Array,
  type PushEnvironment,
} from '@/lib/field/push-client'

/**
 * PWA + Web Push ฝั่งอุปกรณ์ (`41` §15) — ตรรกะการตัดสินใจทั้งหมดอยู่ที่ `lib/field/push-client.ts` (pure)
 * ที่นี่ทำแค่ "อ่านของจริงจากเบราว์เซอร์" แล้วลงมือตามผลลัพธ์
 *
 * - ลงทะเบียน service worker (`/sw.js`) ทุกครั้งที่เปิดแอปภาคสนาม
 * - **ไม่ขอสิทธิ์แจ้งเตือนเองอัตโนมัติ** — ต้องเป็นการกดของผู้ใช้ (เบราว์เซอร์บล็อกคำขอที่ไม่ได้มาจาก gesture
 *   และ §15 ก็ระบุว่าเป็นการ "แนะนำ" ไม่ใช่บังคับ)
 * - iOS ที่ยังไม่ A2HS เห็นแบนเนอร์แนะนำ (ปิดแล้วจำไว้ที่ `localStorage` ไม่กวนซ้ำ)
 * - ทุกความล้มเหลวเงียบเสมอ — in-app notification เป็น fallback หลักอยู่แล้ว
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function readEnvironment(): PushEnvironment {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true

  return {
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    isIOS: detectIOS(navigator.userAgent, navigator.maxTouchPoints),
    isStandalone,
  }
}

export function FieldPwaProvider() {
  const { showToast } = useToast()
  const [environment, setEnvironment] = useState<PushEnvironment | null>(null)
  const [permission, setPermission] = useState<'default' | 'granted' | 'denied'>('default')
  const [subscribed, setSubscribed] = useState(true)
  const [a2hsDismissed, setA2hsDismissed] = useState(true)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const env = readEnvironment()
      if (cancelled) return
      setEnvironment(env)
      setA2hsDismissed(window.localStorage.getItem(A2HS_DISMISS_KEY) === '1')
      if (env.hasNotification) setPermission(Notification.permission)

      if (!env.hasServiceWorker) return
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        if (cancelled) return
        const existing = env.hasPushManager ? await registration.pushManager.getSubscription() : null
        if (!cancelled) setSubscribed(existing !== null)
      } catch {
        // ลงทะเบียนไม่สำเร็จ (โหมดส่วนตัว/บล็อก) — แอปยังใช้ได้ครบ แค่ไม่มี push
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const enablePush = useCallback(async () => {
    if (working) return
    setWorking(true)
    try {
      const granted = await Notification.requestPermission()
      setPermission(granted)
      if (granted !== 'granted') return

      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      if (applicationServerKey === null) {
        // ยังไม่ได้ตั้งคีย์ VAPID บน environment นี้ — แจ้งเตือนในแอปยังทำงานปกติ
        showToast({ tone: 'info', title: 'ระบบยังไม่เปิดการแจ้งเตือนแบบ push บนเซิร์ฟเวอร์นี้' })
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })
      const payload = toPushSubscribeInput(subscription.toJSON() as { endpoint?: string })
      if (payload === null) return

      const response = await callApi(apiPath('field.pushSubscribe'), jsonRequest('POST', payload))
      if (response.error !== undefined) {
        showToast({ tone: 'error', title: response.error.title, description: response.error.message })
        return
      }
      setSubscribed(true)
      showToast({ tone: 'success', title: 'เปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว' })
    } catch {
      showToast({ tone: 'error', title: 'เปิดการแจ้งเตือนไม่สำเร็จ', description: 'ลองใหม่อีกครั้งภายหลัง' })
    } finally {
      setWorking(false)
    }
  }, [showToast, working])

  if (environment === null) return null

  const showA2hs = shouldShowA2hsBanner(environment, a2hsDismissed)
  const showPushPrompt = shouldOfferPushPrompt(environment, permission, subscribed)
  if (!showA2hs && !showPushPrompt) return null

  return (
    <div className="mb-3 space-y-2">
      {showA2hs && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
          <IconPlus className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <div className="font-bold">เพิ่มแอปนี้ลงหน้าจอโฮมเพื่อรับการแจ้งเตือนทันที</div>
            <div className="mt-0.5 text-blue-600">
              กดปุ่มแชร์ใน Safari แล้วเลือก &ldquo;เพิ่มไปยังหน้าจอโฮม&rdquo; — ไม่ทำก็ใช้แอปได้ตามปกติ
            </div>
          </div>
          <button
            type="button"
            aria-label="ปิดคำแนะนำ"
            onClick={() => {
              window.localStorage.setItem(A2HS_DISMISS_KEY, '1')
              setA2hsDismissed(true)
            }}
            className="focus-ring rounded p-1 text-blue-400 hover:bg-blue-100"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}

      {showPushPrompt && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600">
          <span>เปิดการแจ้งเตือนเพื่อรู้ทันทีเมื่อมีเคสใหม่หรือคำขอเปลี่ยนผู้รับผิดชอบ</span>
          <button
            type="button"
            onClick={() => void enablePush()}
            disabled={working}
            className="focus-ring shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {working ? 'กำลังเปิด...' : 'เปิดการแจ้งเตือน'}
          </button>
        </div>
      )}
    </div>
  )
}
