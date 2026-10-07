import { describe, expect, it } from 'vitest'
import {
  LOGIN_ATTEMPT_BUSY,
  loginAttemptLockKey,
  pendingLoginAttemptKeys,
  withLoginAttemptLock,
} from '@/lib/auth/login-attempt-lock'

/** preship R3-001 / R3-008 — คิวตรวจรหัสต่อ บัญชี + IP ในโปรเซส (ไม่ถือ connection ของ DB) */

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('withLoginAttemptLock', () => {
  it('กุญแจเดียวกันทำทีละคำขอตามลำดับ · ตัวที่รอได้ waited=true', async () => {
    const gate = deferred()
    const order: string[] = []
    const first = withLoginAttemptLock('k1', async ({ waited }) => {
      order.push(`first-start:${waited}`)
      await gate.promise
      order.push('first-end')
      return 1
    })
    const second = withLoginAttemptLock('k1', async ({ waited }) => {
      order.push(`second-start:${waited}`)
      return 2
    })
    await tick()
    expect(order).toEqual(['first-start:false'])
    gate.resolve()
    expect(await first).toBe(1)
    expect(await second).toBe(2)
    expect(order).toEqual(['first-start:false', 'first-end', 'second-start:true'])
    expect(pendingLoginAttemptKeys()).toBe(0)
  })

  it('คนละกุญแจ (บัญชีเดียวกันคนละ IP) ไม่ต้องรอกัน — R3-008', async () => {
    const gate = deferred()
    const attackerIp = withLoginAttemptLock(loginAttemptLockKey('user:a', '203.0.113.5'), async () => {
      await gate.promise
      return 'attacker'
    })
    const ownerIp = await withLoginAttemptLock(loginAttemptLockKey('user:a', '198.51.100.7'), async ({ waited }) => `owner:${waited}`)
    expect(ownerIp).toBe('owner:false')
    gate.resolve()
    expect(await attackerIp).toBe('attacker')
  })

  it('คิวเต็ม ⇒ BUSY ทันที ไม่รัน fn', async () => {
    const gate = deferred()
    const running = withLoginAttemptLock('k2', () => gate.promise, { maxQueue: 2 })
    const queued = withLoginAttemptLock('k2', async () => 'queued', { maxQueue: 2 })
    let ran = false
    const overflow = await withLoginAttemptLock(
      'k2',
      async () => {
        ran = true
      },
      { maxQueue: 2 },
    )
    expect(overflow).toBe(LOGIN_ATTEMPT_BUSY)
    expect(ran).toBe(false)
    gate.resolve()
    await running
    expect(await queued).toBe('queued')
    expect(pendingLoginAttemptKeys()).toBe(0)
  })

  it('รอนานเกิน ⇒ BUSY และคิวยังเดินต่อได้หลังตัวก่อนหน้าจบ', async () => {
    const gate = deferred()
    const running = withLoginAttemptLock('k3', () => gate.promise)
    const timedOut = await withLoginAttemptLock('k3', async () => 'never', { maxWaitMs: 10 })
    expect(timedOut).toBe(LOGIN_ATTEMPT_BUSY)
    gate.resolve()
    await running
    await tick()
    expect(await withLoginAttemptLock('k3', async ({ waited }) => `next:${waited}`)).toBe('next:false')
    expect(pendingLoginAttemptKeys()).toBe(0)
  })

  it('fn throw ⇒ ปล่อยคิวให้ตัวถัดไป', async () => {
    await expect(withLoginAttemptLock('k4', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(await withLoginAttemptLock('k4', async () => 'ok')).toBe('ok')
    expect(pendingLoginAttemptKeys()).toBe(0)
  })

  it('ยิงพร้อมกัน 20 คำขอกุญแจเดียว — ไม่มีสองตัวทำงานซ้อนกัน', async () => {
    let active = 0
    let maxActive = 0
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        withLoginAttemptLock('k5', async () => {
          active += 1
          maxActive = Math.max(maxActive, active)
          await tick()
          active -= 1
          return i
        }),
      ),
    )
    expect(maxActive).toBe(1)
    expect(results.filter((r) => r !== LOGIN_ATTEMPT_BUSY)).toHaveLength(20)
  })
})

describe('withLoginAttemptLock — concurrency > 1 (คิวต่อ IP · R4-002)', () => {
  it('ทำงานพร้อมกันไม่เกิน concurrency · ตัวที่รอได้ waited=true · ไม่มีใครแทรกตอนส่งต่อช่อง', async () => {
    let active = 0
    let maxActive = 0
    const waitedFlags: boolean[] = []
    await Promise.all(
      Array.from({ length: 12 }, () =>
        withLoginAttemptLock(
          'ip|1.1.1.1',
          async ({ waited }) => {
            waitedFlags.push(waited)
            active += 1
            maxActive = Math.max(maxActive, active)
            await tick()
            active -= 1
          },
          { concurrency: 3 },
        ),
      ),
    )
    expect(maxActive).toBe(3)
    expect(waitedFlags.filter((flag) => !flag)).toHaveLength(3)
    expect(pendingLoginAttemptKeys()).toBe(0)
  })
})
