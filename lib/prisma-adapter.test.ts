import { describe, expect, it } from 'vitest'
import { serializeConnectionQueries, type QueryableConnection } from '@/lib/prisma-adapter'

/**
 * staging S-022 — ตัวต่อคิว query ต่อ connection (ไม่แตะ DB · ของจริงกับ Prisma อยู่ใน `prisma-adapter.db.test.ts`)
 */

function fakeConnection(): QueryableConnection & { maxInFlight: number; log: string[] } {
  let inFlight = 0
  const conn = {
    maxInFlight: 0,
    log: [] as string[],
    query: (...args: unknown[]): unknown => {
      const label = String(args[0])
      if (typeof args[args.length - 1] === 'function') {
        conn.log.push(`cb:${label}`)
        return undefined
      }
      inFlight += 1
      conn.maxInFlight = Math.max(conn.maxInFlight, inFlight)
      conn.log.push(`start:${label}`)
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          inFlight -= 1
          conn.log.push(`end:${label}`)
          if (label === 'boom') reject(new Error('boom'))
          else resolve(`ok:${label}`)
        }, 2)
      })
    },
  }
  return conn
}

describe('serializeConnectionQueries', () => {
  it('query แบบ promise ที่ยิงพร้อมกันถูกส่งทีละตัวตามลำดับ และได้ผลลัพธ์ของตัวเองครบ', async () => {
    const conn = fakeConnection()
    serializeConnectionQueries(conn)
    const results = await Promise.all(['a', 'b', 'c'].map((q) => conn.query(q)))
    expect(results).toEqual(['ok:a', 'ok:b', 'ok:c'])
    expect(conn.maxInFlight).toBe(1)
    expect(conn.log).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c'])
  })

  it('ตัวที่ล้มคืน error ของตัวเองและไม่ขวางตัวถัดไป (เหมือนคิวภายในของ pg)', async () => {
    const conn = fakeConnection()
    serializeConnectionQueries(conn)
    const [first, second] = await Promise.allSettled([conn.query('boom'), conn.query('next')])
    expect(first.status).toBe('rejected')
    expect(second).toEqual({ status: 'fulfilled', value: 'ok:next' })
    expect(conn.maxInFlight).toBe(1)
  })

  it('callback-style ผ่านตรง · ห่อซ้ำไม่ซ้อนคิว', async () => {
    const conn = fakeConnection()
    serializeConnectionQueries(conn)
    const wrapped = conn.query
    serializeConnectionQueries(conn)
    expect(conn.query).toBe(wrapped)
    conn.query('x', [], () => undefined)
    expect(conn.log).toEqual(['cb:x'])
  })
})
