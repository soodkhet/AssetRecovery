import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // build ต้องล้มถ้ามี type error (กติกา CLAUDE.md ข้อ 13 — TypeScript strict ห้าม any)
    ignoreBuildErrors: false,
  },
  // ⚠️ ไม่ตั้ง process.env.TZ ที่นี่โดยเจตนา — server เก็บ/คำนวณเป็น UTC เสมอ
  //    การแปลงเป็น Asia/Bangkok + พ.ศ. ทำที่ display layer ผ่าน utils กลาง (Rule 01 · Phase 1.5)
}

export default nextConfig
