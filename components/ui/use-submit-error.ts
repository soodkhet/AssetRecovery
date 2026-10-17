'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * ข้อผิดจากการกดส่งของฟอร์มใน modal (มติผู้ใช้ 15/10/2569) — ข้อความขึ้น `<FormSubmitFooter>` ติดจอเหนือปุ่มส่ง
 * + ข้อผิดรายช่องจาก API (`fields`) ผูกใต้ `<Field error>` แล้วเลื่อน/โฟกัสช่องที่ผิด
 * · `tick` = ตัวนับครั้งที่ส่งไม่ผ่าน (ส่งให้ `<FormSubmitFooter tick>` ให้ screen reader อ่านซ้ำ)
 */
export interface SubmitErrorState {
  message: string | null
  fields: Readonly<Record<string, string>>
  tick: number
}

export const NO_SUBMIT_ERROR: SubmitErrorState = { message: null, fields: {}, tick: 0 }

/** ส่งไม่ผ่าน ⇒ ข้อความ + ข้อผิดรายช่องชุดใหม่ (ไม่ค้างของครั้งก่อน) · tick เดินต่อ */
export function submitErrorFrom(
  previous: SubmitErrorState,
  error: { message: string; fields?: Readonly<Record<string, string>> },
): SubmitErrorState {
  return { message: error.message, fields: { ...(error.fields ?? {}) }, tick: previous.tick + 1 }
}

/**
 * ข้อความ footer เมื่อตรวจฟอร์มฝั่งหน้าจอไม่ผ่าน — ข้อผิดจริงอยู่ใต้ช่อง (ฟอร์มที่เก็บ `errors` ของตัวเอง
 * แล้วใช้ `fail({ message: fieldErrorsSummary(fields) })` แค่ให้ footer มีข้อความ + เลื่อน/โฟกัสช่องแรก — mytester6 T-004)
 */
export function fieldErrorsSummary(fields: Readonly<Record<string, string>>): string {
  const count = Object.keys(fields).length
  return count > 1
    ? `ข้อมูลยังไม่ถูกต้อง ${count} ช่อง — แก้ช่องที่มีข้อความสีแดงแล้วบันทึกอีกครั้ง`
    : 'ข้อมูลยังไม่ถูกต้อง — แก้ช่องที่มีข้อความสีแดงแล้วบันทึกอีกครั้ง'
}

/** ข้อความ footer เมื่อ API ตอบ error / เชื่อมต่อไม่ได้ — หัวข้อ + รายละเอียดในบรรทัดเดียว (mytester6 T-004/T-010) */
export function apiFailureSummary(error: { title: string; message: string }): string {
  return `${error.title} — ${error.message}`
}

/** ผู้ใช้แก้ช่องที่ผิดแล้ว ⇒ ล้างข้อความใต้ช่องนั้น (ข้อความ footer คงไว้จนกดส่งใหม่/ปิด) — คืน state เดิมถ้าไม่มีอะไรเปลี่ยน */
export function clearSubmitErrorField(state: SubmitErrorState, field: string): SubmitErrorState {
  if (!(field in state.fields)) return state
  const fields = { ...state.fields }
  delete fields[field]
  return { ...state, fields }
}

/**
 * ใช้คู่ `useClearOnClose(open, clear)` (modal ที่ค้าง mount) + `useRevealFieldError()` — ส่ง `reveal` เข้ามา
 * (ใส่ `ref` ของมันที่ body ของฟอร์ม · ไม่รวม ref ไว้ในค่าที่คืน — กติกา react-hooks/refs)
 * `fail(error)` หลังตรวจไม่ผ่าน/API ตอบ error (toast เดิมคงไว้) ⇒ เลื่อน/โฟกัสช่องที่ผิด · `clear()` ก่อนส่งใหม่/ทิ้งข้อมูล
 */
export function useSubmitError(reveal?: () => void): {
  message: string | null
  fields: Readonly<Record<string, string>>
  tick: number
  fail: (error: { message: string; fields?: Readonly<Record<string, string>> }) => void
  clear: () => void
  clearField: (field: string) => void
} {
  const [state, setState] = useState<SubmitErrorState>(NO_SUBMIT_ERROR)
  // ฟังก์ชันที่คืนคงที่ข้าม render (ใส่ deps ของ useCallback/useEffect ได้) — `reveal` ล่าสุดอ่านผ่าน ref
  const revealRef = useRef(reveal)
  useEffect(() => {
    revealRef.current = reveal
  })
  const fail = useCallback((error: { message: string; fields?: Readonly<Record<string, string>> }) => {
    setState((previous) => submitErrorFrom(previous, error))
    revealRef.current?.()
  }, [])
  // tick คงไว้ — ข้อความเดิมขึ้นซ้ำครั้งหน้ายังได้ key ใหม่
  const clear = useCallback(() => setState((previous) => ({ ...NO_SUBMIT_ERROR, tick: previous.tick })), [])
  const clearField = useCallback((field: string) => setState((previous) => clearSubmitErrorField(previous, field)), [])
  return { ...state, fail, clear, clearField }
}
