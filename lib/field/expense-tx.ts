import type { prisma } from '@/lib/prisma'

/**
 * ชนิด tx ของ client ที่ต่อ extension แล้ว (ใช้ในงานรายการเบิก) — แยกจาก `lib/field/expense-queries.ts`
 * ให้โมดูลที่ expense-queries เรียก (ตรวจใบซ้ำ · ใบรับรองแทนใบเสร็จ) อ้างได้โดยไม่ import กลับ (staging S-008)
 */
export type ExpenseTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>
