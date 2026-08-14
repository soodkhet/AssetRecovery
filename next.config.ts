import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // build ต้องล้มถ้ามี type error (กติกา CLAUDE.md ข้อ 13 — TypeScript strict ห้าม any)
    ignoreBuildErrors: false,
    // ขั้น build ใช้ tsconfig.build.json = tsconfig.json ที่ exclude ไฟล์เทสต์เพิ่ม
    // เหตุผล: `.vercelignore` ตัด `tools/` ออกจาก build context แต่เทสต์บางตัว import จาก `tools/`
    //         → typecheck ตอน build บน Vercel พังด้วย TS2307 ทั้งที่ CI เขียว (CI เห็น repo เต็ม)
    // ความเข้มไม่ลด: `pnpm typecheck` (CI/local) ยังใช้ `tsconfig.json` กวาดไฟล์เทสต์เต็ม + vitest รันเทสต์จริง
    // dev ยังใช้ tsconfig.json ตามเดิม (Next watch เฉพาะ tsconfig.json ในโหมด dev)
    tsconfigPath: isProd ? 'tsconfig.build.json' : 'tsconfig.json',
  },
  // ใบส่งมอบ PDF อ่านฟอนต์ไทยจากดิสก์ตอน render (`44` §6.4 · `28` §7) — ตัว trace ของ Next
  // มองไม่เห็นการอ่านไฟล์นี้เอง ต้องบอกให้ผูกเข้า bundle ของ route ไม่งั้นบน Vercel ฟอนต์หาย
  // (ผลคือ PDF ออกมาแต่ **ตัวอักษรไทยหายทั้งใบโดยไม่มี error**)
  outputFileTracingIncludes: {
    '/api/handover-lots/**': ['./public/fonts/**'],
  },
  // ⚠️ ไม่ตั้ง process.env.TZ ที่นี่โดยเจตนา — server เก็บ/คำนวณเป็น UTC เสมอ
  //    การแปลงเป็น Asia/Bangkok + พ.ศ. ทำที่ display layer ผ่าน utils กลาง (Rule 01 · Phase 1.5)
}

export default nextConfig
