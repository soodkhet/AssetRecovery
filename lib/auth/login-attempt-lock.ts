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

/**
 * ตรวจรหัสพร้อมกันได้สูงสุดต่อ IP (ทุกบัญชีรวมกัน) — preship R4-002: เดิมคิวแยกตาม บัญชี+IP เท่านั้น
 * ยิงพร้อมกันหลาย username จาก IP เดียวจึงทะลุเพดาน 30 ครั้ง/IP (60 พร้อมกัน ⇒ ตรวจจริง 55)
 * ตัวที่รอคิวตรวจเพดานซ้ำก่อนทำงาน ⇒ เกินเพดานได้ไม่เกินค่านี้ · สำนักงานที่ใช้ NAT เดียวกัน login พร้อมกันรอสั้นๆ
 */
export const LOGIN_IP_CONCURRENCY = 4
/** คิวต่อ IP ยาวสุด — เกิน ⇒ ตอบแบบถูกพัก (เฉพาะ IP นั้น) */
export const LOGIN_IP_MAX_QUEUE = 100

/** กุญแจคิวต่อ IP — `null` = ไม่รู้ IP (dev/proxy ไม่ส่ง) ⇒ ไม่ใช้คิวต่อ IP */
export function loginIpLockKey(ipAddress: string | null): string | null {
  return ipAddress === null ? null : `ip|${ipAddress}`
}

/** กุญแจคิว = กุญแจนับครั้งที่ผิดของบัญชี + IP (`null` = ไม่รู้ IP ⇒ ใช้คิวร่วมของบัญชี) */
export function loginAttemptLockKey(throttleKey: string, ipAddress: string | null): string {
  return `${throttleKey}|${ipAddress ?? '-'}`
}

interface Slot {
  active: number
  /** ผู้รอ — เรียกแล้ว = ได้ช่องที่ผู้ปล่อยส่งต่อให้ตรงๆ (active ไม่ลด/ไม่เพิ่ม กันคนใหม่แทรก) */
  waiters: Array<() => void>
}

const slots = new Map<string, Slot>()

export interface LoginAttemptContext {
  /** ต้องรอคำขอก่อนหน้าของกุญแจเดียวกัน — ผู้เรียกควรตรวจเพดานซ้ำ (ครั้งที่ผิดของตัวก่อนหน้าเพิ่งลง audit) */
  waited: boolean
}

export interface LoginConcurrencyOptions {
  /** ทำงานพร้อมกันได้สูงสุดกี่คำขอต่อกุญแจ (ค่าเริ่มต้น 1 = ทีละคำขอ) */
  concurrency?: number
  /** จำนวนคำขอสูงสุดต่อกุญแจ รวมตัวที่กำลังทำงาน — เกิน ⇒ BUSY ทันที */
  maxQueue?: number
  maxWaitMs?: number
}

/**
 * รัน `fn` ได้พร้อมกันไม่เกิน `concurrency` คำขอต่อกุญแจ — ที่เกินรอคิว (ไม่ถือ connection ของ DB)
 * ค่าเริ่มต้น = ทีละคำขอ (คิวต่อ บัญชี+IP) · ใช้ซ้อนกับคิวต่อ IP ได้ ({@link LOGIN_IP_CONCURRENCY} — R4-002)
 */
export async function withLoginAttemptLock<T>(
  key: string,
  fn: (context: LoginAttemptContext) => Promise<T>,
  options: LoginConcurrencyOptions = {},
): Promise<T | typeof LOGIN_ATTEMPT_BUSY> {
  const concurrency = options.concurrency ?? 1
  const maxQueue = options.maxQueue ?? LOGIN_ATTEMPT_MAX_QUEUE
  const maxWaitMs = options.maxWaitMs ?? LOGIN_ATTEMPT_MAX_WAIT_MS

  const slot = slots.get(key) ?? { active: 0, waiters: [] }
  if (slot.active + slot.waiters.length >= maxQueue) return LOGIN_ATTEMPT_BUSY
  slots.set(key, slot)

  let waited = false
  if (slot.active >= concurrency) {
    waited = true
    const granted = await new Promise<boolean>((resolve) => {
      const waiter = () => {
        clearTimeout(timer)
        resolve(true)
      }
      const timer = setTimeout(() => {
        const index = slot.waiters.indexOf(waiter)
        if (index >= 0) slot.waiters.splice(index, 1)
        resolve(false)
      }, maxWaitMs)
      slot.waiters.push(waiter)
    })
    if (!granted) {
      if (slot.active === 0 && slot.waiters.length === 0 && slots.get(key) === slot) slots.delete(key)
      return LOGIN_ATTEMPT_BUSY
    }
  } else {
    slot.active += 1
  }

  try {
    return await fn({ waited })
  } finally {
    const next = slot.waiters.shift()
    if (next !== undefined) {
      next() // ส่งช่องต่อให้ผู้รอตรงๆ — active คงเดิม
    } else {
      slot.active -= 1
      if (slot.active === 0 && slots.get(key) === slot) slots.delete(key)
    }
  }
}

/** สำหรับเทสต์ — จำนวนกุญแจที่ยังมีคิวค้าง (ต้องกลับเป็น 0 เมื่อทุกคำขอจบ) */
export function pendingLoginAttemptKeys(): number {
  return slots.size
}
