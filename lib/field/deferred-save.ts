/**
 * ตัวหน่วง autosave ของฟอร์มปิดงาน (mytester2 DO2-01)
 *
 * ต้นเหตุ: กด "ยืนยันปิดงาน" ขณะเคอร์เซอร์อยู่ในช่องบันทึกเพิ่มเติม ⇒ blur ยิง close-draft ก่อน click ⇒ server ปิดงาน
 * ไปแล้วจึงตอบ 400 `ASSIGNMENT_INVALID_STATUS` (เห็นใน console ทุกครั้ง) — หน่วงไว้สั้น ๆ แล้วให้การกดปิดงาน `cancel()`
 * งานที่ค้าง ⇒ ไม่มีคำขอ draft หลังปิดงานเลย · ทำเฉพาะงานล่าสุด (งานก่อนหน้าถูกแทน)
 */
export const CLOSE_DRAFT_AUTOSAVE_DELAY_MS = 500

export interface DeferredSave {
  /** ตั้งงานใหม่ (แทนงานที่ค้าง) ให้ทำหลังหน่วงเวลา */
  schedule(task: () => void): void
  /** ทิ้งงานที่ค้าง — ใช้ตอนเริ่มส่งปิดงาน/บันทึก draft ด้วยปุ่ม */
  cancel(): void
  /** ทำงานที่ค้างทันที (ถ้ามี) — ใช้ตอนปิดหน้าต่าง ไม่ให้ข้อความที่พิมพ์หาย */
  flush(): void
  hasPending(): boolean
}

export function createDeferredSave(delayMs: number = CLOSE_DRAFT_AUTOSAVE_DELAY_MS): DeferredSave {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: (() => void) | null = null

  function clear(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function run(): void {
    clear()
    const task = pending
    pending = null
    task?.()
  }

  return {
    schedule(task) {
      clear()
      pending = task
      timer = setTimeout(run, delayMs)
    },
    cancel() {
      clear()
      pending = null
    },
    flush: run,
    hasPending: () => pending !== null,
  }
}

type ListenerTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

/**
 * รีวิว DO2-01 — ผู้ใช้สลับแอป/ปิดแท็บ/ล็อกจอระหว่างที่ autosave ยังหน่วงอยู่ ⇒ unmount ของ React ไม่เกิด ข้อความหาย
 * ⇒ ฟัง `pagehide` + `visibilitychange` (เมื่อ hidden) แล้ว `flush()` ทันที · `shouldFlush()` = false (เช่น ส่งปิดงานแล้ว)
 * ⇒ ทิ้งงานที่ค้างแทน · คืนฟังก์ชันถอด listener (เรียกตอน unmount)
 */
export function flushOnPageHide(
  saver: Pick<DeferredSave, 'flush' | 'cancel'>,
  win: ListenerTarget,
  doc: ListenerTarget & { readonly visibilityState: DocumentVisibilityState },
  shouldFlush: () => boolean = () => true,
): () => void {
  const handle = (): void => {
    if (shouldFlush()) saver.flush()
    else saver.cancel()
  }
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') handle()
  }
  win.addEventListener('pagehide', handle)
  doc.addEventListener('visibilitychange', onVisibility)
  return () => {
    win.removeEventListener('pagehide', handle)
    doc.removeEventListener('visibilitychange', onVisibility)
  }
}
