'use client'

import { Button, ErrorState } from '@/components/ui'
import { portalErrorView, type PortalErrorInput } from '@/lib/portal/error-view'

/** staging E-071 — error state กลางของพอร์ทัล: ปุ่ม "ลองใหม่" เฉพาะกรณีที่ลองใหม่แล้วมีโอกาสสำเร็จ */
export function PortalErrorState({ error, onRetry }: { error: PortalErrorInput; onRetry: () => void }) {
  const view = portalErrorView(error)
  return (
    <ErrorState
      title={view.title}
      message={view.message}
      {...(error.code === undefined ? {} : { code: error.code })}
      action={
        view.retryable ? (
          <Button variant="secondary" onClick={onRetry}>
            ลองใหม่
          </Button>
        ) : undefined
      }
    />
  )
}
