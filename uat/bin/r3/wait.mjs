// poll ทุก 60 วินาที จน expires_at < now() (สูงสุด ~8.5 นาทีต่อการรัน)
import { q, log } from './_h.mjs'
const end = Date.now() + 8.5 * 60 * 1000
while (true) {
  const r = q(`select (now() > expires_at)::text||' '||(expires_at - now())::text from pending_reassignments where status='waiting_consent'`).split('\n')[2]?.trim()
  log('poll', new Date().toISOString(), r)
  if (!r || r.startsWith('true')) break
  if (Date.now() + 60000 > end) break
  await new Promise(res => setTimeout(res, 60000))
}
