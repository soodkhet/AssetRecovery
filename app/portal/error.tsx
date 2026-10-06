'use client'

import { RouteErrorFallback } from '@/components/shell/route-error'

/** Error boundary ของ Client Portal — เดิมไม่มี ⇒ หน้า error ภาษาอังกฤษของ Next (Final Test ด่าน 5) */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-5xl p-4">
      <RouteErrorFallback error={error} reset={reset} />
    </div>
  )
}
