'use client'

import { RouteErrorFallback } from '@/components/shell/route-error'

/** Error boundary ของ Field Tracker — เดิมไม่มี ⇒ หน้า error ภาษาอังกฤษของ Next (Final Test ด่าน 5) */
export default function FieldError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="p-4">
      <RouteErrorFallback error={error} reset={reset} withHeader={false} />
    </div>
  )
}
