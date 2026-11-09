import { chromium } from '@playwright/test'
const F='/private/tmp/claude-501/-Users-beer-AssetRecovery/21ace236-7fe2-4d4d-a2aa-230db94fb870/scratchpad/mytester6/D-OUT/files'
const b = await chromium.launch({channel:'chrome'})
const p = await b.newPage({viewport:{width:480,height:640}})
const noise=()=>Array.from({length:40},()=>Math.random().toString(36).slice(2,6)).join(' ')
const scenes=['หน้าบ้านลูกหนี้ ประตูรั้วเหล็ก','ลูกหนี้ส่งมอบเครื่อง','บ้านเลขที่ 45/12 ป้ายหน้าบ้าน','ซอยหน้าบ้าน ไม่มีคนอยู่','ป้ายประกาศให้เช่า บ้านว่าง','ตัวเครื่องพร้อมกล่อง','ฉลาก IMEI ด้านหลังเครื่อง','หน้าจอแสดง *#06#']
for (let i=0;i<24;i++){
  await p.setContent('<body style="margin:0;font-family:sans-serif;background:#'+['94a3b8','a3e635','fbbf24','60a5fa','f472b6','34d399','c084fc','f87171'][i%8]+'"><div style="padding:40px"><h2>'+scenes[i%8]+'</h2><p>MT6 D-OUT รูปภาคสนาม '+(i+1)+' · 17/10/2569</p><p style="font-size:8px;word-break:break-all">'+noise()+'</p></div></body>')
  await p.screenshot({path:F+'/field'+(i+1)+'.jpg',type:'jpeg',quality:70})
}
for (let i=1;i<=6;i++){
  await p.setContent('<body style="font-family:sans-serif;padding:30px;background:#fff"><h2>ใบเสร็จรับเงิน โรงแรมสาครพาเลซ (MT6)</h2><p>เลขที่ RC-6910-'+String(i).padStart(3,'0')+' วันที่ 17/10/2569</p><p>ค่าห้องพัก 1 คืน 850.00 บาท</p><p>ได้รับเงินถูกต้องแล้ว</p><p style="font-size:8px">'+noise()+'</p></body>')
  await p.screenshot({path:F+'/receipt'+i+'.jpg',type:'jpeg',quality:70})
}
await b.close()
