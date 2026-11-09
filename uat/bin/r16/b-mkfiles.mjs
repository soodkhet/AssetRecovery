import { chromium } from '@playwright/test'
const F='/private/tmp/claude-501/-Users-beer-AssetRecovery/21ace236-7fe2-4d4d-a2aa-230db94fb870/scratchpad/mytester6/B/files'
const b = await chromium.launch({channel:'chrome'})
const p = await b.newPage({viewport:{width:600,height:800}})
const noise=()=>Array.from({length:40},()=>Math.random().toString(36).slice(2,6)).join(' ')
const models=['iPhone 13 สีดำ','iPhone 14 สีม่วง','iPhone 15 สีฟ้า','Galaxy A54 สีเขียว','iPhone 15 สีชมพู','Galaxy A54 สีดำ','iPhone 13 สีขาว','iPhone 14 สีดำ']
for (let i=0;i<20;i++){
  await p.setContent('<body style="margin:0;background:#e2e8f0;font-family:sans-serif"><div style="margin:60px auto;width:260px;height:540px;border-radius:40px;background:#'+['111','6b21a8','0ea5e9','16a34a','ec4899','222','eee','333'][i%8]+';color:#f59e0b;display:flex;align-items:center;justify-content:center;flex-direction:column"><h2>'+models[i%8]+'</h2><p>MT6-1017 รูปเครื่อง '+(i+1)+'</p><p style="font-size:8px;word-break:break-all;padding:8px">'+noise()+'</p></div></body>')
  await p.screenshot({path:F+'/phone'+(i+1)+'.jpg',type:'jpeg',quality:70})
}
for (let i=1;i<=20;i++){
await p.setContent('<body style="font-family:sans-serif;padding:40px"><h1>บัตรประจำตัวประชาชน (สำเนา) '+i+'</h1><p>MT6-1017 ตัวอย่างทดสอบ — ไม่ใช่เอกสารจริง</p><p style="font-size:9px">'+noise()+'</p></body>')
await p.screenshot({path:F+'/idcard'+i+'.jpg',type:'jpeg',quality:70})}
for (let i=1;i<=20;i++){
 await p.setContent('<body style="font-family:sans-serif;padding:30px"><h2>สัญญาเช่าซื้อโทรศัพท์เคลื่อนที่ เลขที่ MT6-1017-'+String(i).padStart(2,'0')+'</h2><p>ทำที่ กรุงเทพมหานคร วันที่ 1 กันยายน 2569 ระหว่างบริษัทผู้ให้เช่าซื้อ และผู้เช่าซื้อ ตกลงผ่อนชำระ 12 งวด งวดละ 1,990.00 บาท</p><p>เอกสารทดสอบระบบ — ไม่ใช่เอกสารจริง</p><p style="font-size:8px;color:#999">'+noise()+'</p></body>')
 await p.pdf({path:F+'/contract'+i+'.pdf',format:'A4'})
}
await b.close()
// bundle PDFs + oversize files (valid PDF header + random padding after %%EOF)
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const b2 = await chromium.launch({channel:'chrome'}); const p2 = await b2.newPage()
for (const [name, mb] of [['bundle21',4],['bundle22',4],['bundle21-big',21],['big-11mb',11],['bundle-26mb',26]]) {
  await p2.setContent('<body style="font-family:sans-serif;padding:30px"><h2>เอกสารชุด (สแกนรวมเล่ม) '+name+' MT6-1017</h2><p>สัญญาเช่าซื้อ + สำเนาบัตรประชาชน — เอกสารทดสอบ ไม่ใช่เอกสารจริง</p><p style="font-size:8px">'+noise()+'</p></body>')
  await p2.pdf({path:F+'/'+name+'.pdf',format:'A4'})
  const base = readFileSync(F+'/'+name+'.pdf')
  const pad = Buffer.concat([Buffer.from('\n%'), randomBytes(Math.max(0, mb*1024*1024 - base.length - 3)).map(x => x === 10 || x === 13 ? 32 : x), Buffer.from('\n')])
  writeFileSync(F+'/'+name+'.pdf', Buffer.concat([base, pad]))
}
await b2.close()
