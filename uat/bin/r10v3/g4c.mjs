// R10g.4 probe ลบเอกสารเคสที่ส่งตรวจแล้ว / ผู้ไม่มีสิทธิ์
import { sess, call, log, qa } from './_h.mjs'
const c901 = 'b976a24e-af0d-490c-a8be-e402f9b9ecd4'
const doc = qa(`select id from case_documents where case_id='${c901}' and deleted_at is null limit 1`)
for (const u of ['uat.admin', 'uat.approver', 'uat.co1.mgr', 'uat.agent.in1']) {
  const r = await call(await sess(u), 'DELETE', `/api/cases/${c901}/documents/${doc}`, { reason: 'probe R10g' })
  log('DELDOC 901(approved)', u, r.status, r.code, r.msg)
  if (r.status < 300) { log('!!! STOP'); process.exit(9) }
}
log('901 doc still active', qa(`select count(*) from case_documents where case_id='${c901}' and deleted_at is null`))
