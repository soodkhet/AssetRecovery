import { Children, type ComponentProps, type ReactNode } from 'react'
import { Text as PdfText } from '@react-pdf/renderer'

/**
 * แยกสระอำ (U+0E33) เป็น นิคหิต + สระอา (U+0E4D U+0E32) ก่อนส่งให้ `@react-pdf/renderer`
 *
 * ⚠️ ตัวจัดบรรทัดของ react-pdf นับตำแหน่งอักษรจาก string เดิม แต่ฟอนต์แตก "ำ" เป็น 2 glyph
 *    ⇒ ทุกข้อความที่มี "ำ" **อักษรท้ายหายไปเท่าจำนวน "ำ"** โดยไม่มี error
 *    (UAT R7cv3-B06: "จำนวนเงินที่จ่าย (บาท" · "ค่าจ้างทำของ มาตรา 40(8" ในหนังสือรับรอง 50 ทวิ)
 * รูปที่พิมพ์ออกมาเหมือนเดิมทุกประการ (ฟอนต์วาดสระอำด้วย 2 glyph นี้อยู่แล้ว)
 */
export function pdfSafeThai(value: string): string {
  return value.replace(/\u0E33/g, '\u0E4D\u0E32')
}

function normalize(children: ReactNode): ReactNode {
  if (typeof children === 'string') return pdfSafeThai(children)
  if (!Array.isArray(children)) return children
  return Children.map(children, (child: ReactNode) => (typeof child === 'string' ? pdfSafeThai(child) : child))
}

type PageRender = (props: {
  pageNumber: number
  totalPages: number
  subPageNumber: number
  subPageTotalPages: number
}) => ReactNode

/** props ของ `<Text>` ดิบเป็น union กับ `<Text>` ของ SVG ⇒ ระบุ `render`/`children` ให้ชัด */
type PdfTextProps = ComponentProps<typeof PdfText> & {
  render?: PageRender
  children?: ReactNode
  hyphenationPenalty?: number
}

/**
 * mytester7 S7-AG1-06/S7-AG4-01 — ค่าโทษ "ห้ามตัด" ของตัวจัดบรรทัด react-pdf (= `linebreak.infinity`)
 * ตัวแบ่งคำไทย (`thai-line-break.ts`) ให้จุดตัดเป็น "ช่องว่างกว้าง 0" แต่ react-pdf ยังแทรกจุดตัดพยางค์ (ตัดแล้วเติม `-`)
 * หน้าจุดนั้นด้วย ⇒ ปิดจุดตัดพยางค์ทั้งหมด ให้ตัดได้เฉพาะช่องว่าง/จุดตัดคำไทย (ภาษาไทยไม่ใช้ขีดตัดคำ)
 */
const NO_HYPHEN_BREAK_PENALTY = 10_000

/**
 * `<Text>` ของเอกสาร PDF ทุกใบ — ใช้แทน `Text` จาก `@react-pdf/renderer` เสมอ (ห้าม import ตัวดิบในเอกสาร)
 * ข้อความลูกที่เป็น string และผลของ `render` ผ่าน {@link pdfSafeThai} ก่อนเรนเดอร์
 */
export function Text({ children, render, hyphenationPenalty, ...props }: PdfTextProps): ReactNode {
  const safeRender: PageRender | undefined =
    render === undefined
      ? undefined
      : (args) => {
          const output = render(args)
          return typeof output === 'string' ? pdfSafeThai(output) : output
        }
  return (
    <PdfText
      {...props}
      hyphenationPenalty={hyphenationPenalty ?? NO_HYPHEN_BREAK_PENALTY}
      {...(safeRender === undefined ? {} : { render: safeRender })}
    >
      {normalize(children)}
    </PdfText>
  )
}
