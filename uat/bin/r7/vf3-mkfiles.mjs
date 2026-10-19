// VF3: ไฟล์ภาคสนาม noise สุ่ม — node uat/bin/r7/vf3-mkfiles.mjs <outdir> <srcdir ที่มี video1.mp4/audio1.m4a>
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const F = process.argv[2]; const S = process.argv[3]; mkdirSync(F, { recursive: true })
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 480, height: 640 } })
const noise = () => Array.from({ length: 40 }, () => Math.random().toString(36).slice(2, 6)).join(' ')
const shot = async (html, path) => { await p.setContent(`<body style="margin:0;font-family:sans-serif">${html}<p style="font-size:8px;word-break:break-all;padding:8px">${noise()}</p></body>`); await p.screenshot({ path, type: 'jpeg', quality: 70 }) }
const scenes = ['หน้าบ้านลูกหนี้', 'บ้านปิด ไม่พบลูกหนี้', 'ป้ายบ้านเลขที่', 'สอบถามเพื่อนบ้าน']
for (let i = 1; i <= 4; i++) await shot(`<div style="padding:40px;background:#${['94a3b8','fbbf24','60a5fa','f472b6'][i - 1]}"><h2>${scenes[i - 1]}</h2><p>MT7 VF3 ภาคสนาม ${i} · 19/10/2569</p></div>`, `${F}/field${i}.jpg`)
if (S) for (const n of ['video1.mp4', 'audio1.m4a']) if (existsSync(`${S}/${n}`)) writeFileSync(`${F}/${n}`, Buffer.concat([readFileSync(`${S}/${n}`), randomBytes(96)]))
await b.close(); console.log('ok', F)
