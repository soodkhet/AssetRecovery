import type { SVGProps } from 'react'

/**
 * ไอคอนของศูนย์แจ้งเตือน — inline SVG ล้วน (ไม่เพิ่ม dependency) เส้นทางตาม mockup
 * `reference/notifications.html` L60 · `currentColor` ทั้งหมดเพื่อให้สืบสีจาก parent
 *
 * แยกจาก `components/field/field-icons.tsx` เพราะกระดิ่งใช้ทั้งหลังบ้านและ Field Tracker
 * (ชุดไอคอนของ Field ผูกกับ mockup ไฟล์ 41 โดยเฉพาะ)
 */

type IconProps = SVGProps<SVGSVGElement>

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconBell(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
    </Base>
  )
}

export function IconClose(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Base>
  )
}
