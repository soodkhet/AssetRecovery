'use client'

import { RouteErrorFallback } from '@/components/shell/route-error'

/** Error boundary ของทุกหน้าใน App Shell (Rule 05 · Final Test ด่าน 5) */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback error={error} reset={reset} />
}
