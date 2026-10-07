/**
 * คิวตรวจรหัสต่อ "บัญชี + IP" ในโปรเซส — preship R3-001 / R3-008 (แทนล็อก advisory ของ R2-002)
 *
 * เดิมใช้ `pg_try_advisory_xact_lock` ใน `$transaction` ⇒ ถือ connection ของ pool ไว้ตลอดการเรียก Supabase
 * แล้วงานข้างในยังขอ connection เพิ่ม ⇒ login พร้อมกันเท่าขนาด pool ทำ pool ตันทั้ง instance (R3-001)
 * และคำขอที่ชนล็อกของบัญชีเดียวกันได้ 429 ทันทีไม่ว่ามาจาก IP ไหน ⇒ ยิงซ้อนจาก IP ที่ถูกพักแล้ว
 * ทำให้เจ้าของบัญชีจาก IP อื่นเข้าไม่ได้ (R3-008)
 *
 * ตอนนี้: คำขอของกุญแจเดียวกันเข้าคิวรอกันในหน่วยความจำ (ไม่ถือ connection ระหว่างรอ/ระหว่างเรียก Supabase)
 * - กุญแจรวม IP ({@link loginAttemptLockKey}) ⇒ คำขอจาก IP หนึ่งไม่ทำให้ IP อื่นต้องรอหรือถูกพัก
 * - คิวเต็ม ({@link LOGIN_ATTEMPT_MAX_QUEUE}) / รอนานเกิน ⇒ {@link LOGIN_ATTEMPT_BUSY} (กระทบเฉพาะบัญชี+IP นั้น)
 * ⚠️ กันได้ภายใน instance เดียว — หลาย instance พร้อมกันอาจเกินเพดานได้ไม่เกินจำนวน instance ที่รับคำขอพร้อมกัน
 *    (ยอมรับได้: เพดานรวมของบัญชี/IP ยังนับจาก audit ทุกครั้ง · กันชั้นนอกด้วย rate limit ของ edge)
 */

/** ผล {@link withLoginAttemptLock} เมื่อคิวของกุญแจนี้เต็ม/รอนานเกิน — ตอบแบบถูกพัก */
export const LOGIN_ATTEMPT_BUSY = Symbol('login-attempt-busy')

/** จำนวนคำขอสูงสุดที่รอ/ทำงานพร้อมกันต่อกุญแจ (รวมตัวที่กำลังทำงาน) */
export const LOGIN_ATTEMPT_MAX_QUEUE = 20
/** รอคิวนานสุดก่อนตอบ BUSY */
export const LOGIN_ATTEMPT_MAX_WAIT_MS = 15_000

/** กุญแจคิว = กุญแจนับครั้งที่ผิดของบัญชี + IP (`null` = ไม่รู้ IP ⇒ ใช้คิวร่วมของบัญชี) */
export function loginAttemptLockKey(throttleKey: string, ipAddress: string | null): string {
  return `${throttleKey}|${ipAddress ?? '-'}`
}

interface QueueEntry {
  tail: Promise<void>
  pending: number
}

const queues = new Map<string, QueueEntry>()

export interface LoginAttemptContext {
  /** ต้องรอคำขอก่อนหน้าของกุญแจเดียวกัน — ผู้เรียกควรตรวจเพดานซ้ำ (ครั้งที่ผิดของตัวก่อนหน้าเพิ่งลง audit) */
  waited: boolean
}

/**
 * รัน `fn` ทีละคำขอต่อกุญแจ — ตัวถัดไปเริ่มหลัง `fn` ของตัวก่อนจบ (รวมการเขียน audit ที่ commit แล้ว)
 */
export async function withLoginAttemptLock<T>(
  key: string,
  fn: (context: LoginAttemptContext) => Promise<T>,
  options: { maxQueue?: number; maxWaitMs?: number } = {},
): Promise<T | typeof LOGIN_ATTEMPT_BUSY> {
  const maxQueue = options.maxQueue ?? LOGIN_ATTEMPT_MAX_QUEUE
  const maxWaitMs = options.maxWaitMs ?? LOGIN_ATTEMPT_MAX_WAIT_MS

  const entry = queues.get(key) ?? { tail: Promise.resolve(), pending: 0 }
  if (entry.pending >= maxQueue) return LOGIN_ATTEMPT_BUSY
  const waited = entry.pending > 0
  entry.pending += 1
  queues.set(key, entry)

  const previous = entry.tail
  let release: () => void = () => undefined
  const mine = new Promise<void>((resolve) => {
    release = resolve
  })
  entry.tail = previous.then(() => mine)

  const done = () => {
    release()
    entry.pending -= 1
    if (entry.pending === 0 && queues.get(key) === entry) queues.delete(key)
  }

  if (waited) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = await Promise.race([
      previous.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), maxWaitMs)
      }),
    ])
    clearTimeout(timer)
    if (timedOut) {
      // ปล่อยช่องของตัวเองต่อจากตัวก่อนหน้า ให้คิวเดินต่อได้เมื่อตัวก่อนหน้าจบ
      void previous.then(done)
      return LOGIN_ATTEMPT_BUSY
    }
  }

  try {
    return await fn({ waited })
  } finally {
    done()
  }
}

/** สำหรับเทสต์ — จำนวนกุญแจที่ยังมีคิวค้าง (ต้องกลับเป็น 0 เมื่อทุกคำขอจบ) */
export function pendingLoginAttemptKeys(): number {
  return queues.size
}
