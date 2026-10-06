'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  Modal,
  PageHeader,
  RefText,
} from '@/components/ui'
import { callApi } from '@/lib/api/types'
import {
  DOCUMENT_SAMPLE_GROUP_LABEL,
  documentSampleFileName,
  type DocumentSampleGroup,
  type DocumentSampleListItemDto,
} from '@/lib/documents/samples/catalog'
import { downloadFile } from '@/lib/imports/download-client'

/**
 * หน้า "ตัวอย่างเอกสารทั้งหมด" (มติ PO U104 · mockup `reference/accounting.html` เมนูย่อย + `documents.html`)
 *
 * รายการเอกสารแบ่งกลุ่ม → การ์ดต่อชนิด (ใครได้รับ / ออกเมื่อ / จำนวนฉบับ / ผู้เซ็น / เลขตัวอย่าง)
 * → "ดูตัวอย่าง" เปิด PDF จริงจาก renderer ของระบบใน viewer · "ดาวน์โหลด PDF"
 * สิทธิ์จริงตรวจที่ API (`view_document_samples`) — หน้านี้อ่านอย่างเดียว
 */

const GROUP_ORDER: readonly DocumentSampleGroup[] = ['customer', 'payout', 'advance', 'internal']

export type PdfResult = { blob: Blob } | { error: { title: string; message: string } }

function pdfUrl(type: string): string {
  return `/api/accounting/document-samples/${encodeURIComponent(type)}/pdf`
}

/**
 * โหลด PDF ตัวอย่างเป็น Blob — ล้มเหลวคืนข้อความภาษาไทยจาก envelope ของ API
 * · ใช้ร่วมกับปุ่ม "ดูตัวอย่าง PDF" ของแท็บเทมเพลตเอกสาร (มติ PO U122)
 */
export async function fetchSamplePdf(type: string): Promise<PdfResult> {
  try {
    const response = await fetch(pdfUrl(type))
    if (response.ok) return { blob: await response.blob() }
    const body: unknown = await response.json().catch(() => null)
    const error =
      typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error: { title?: string; message?: string } | null }).error
        : null
    return {
      error: {
        title: error?.title ?? 'เปิดตัวอย่างไม่สำเร็จ',
        message: error?.message ?? 'กรุณาลองใหม่อีกครั้ง',
      },
    }
  } catch {
    return { error: { title: 'เชื่อมต่อระบบไม่สำเร็จ', message: 'กรุณาลองใหม่อีกครั้ง' } }
  }
}

function sampleTitle(item: DocumentSampleListItemDto): string {
  return item.variant === null ? item.title : `${item.title} — ${item.variant}`
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 text-xs">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="text-slate-700">{children}</dd>
    </div>
  )
}

/** เปิดใหม่ทุกครั้งที่เปลี่ยนชนิด (`key` = ชนิดเอกสาร) ⇒ state เริ่มที่ "กำลังโหลด" เสมอ */
function SampleViewerModal({ item, onClose }: { item: DocumentSampleListItemDto; onClose: () => void }) {
  const [state, setState] = useState<{ url: string; blob: Blob } | { error: { title: string; message: string } } | null>(
    null,
  )
  const type = item.type

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    void (async () => {
      const result = await fetchSamplePdf(type)
      if (cancelled) return
      if ('error' in result) {
        setState({ error: result.error })
        return
      }
      objectUrl = URL.createObjectURL(result.blob)
      setState({ url: objectUrl, blob: result.blob })
    })()
    return () => {
      cancelled = true
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [type])

  const ready = state !== null && 'url' in state ? state : null

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={sampleTitle(item)}
      description="ตัวอย่างจากแบบเอกสารจริงของระบบ ด้วยข้อมูลสมมติ — ไม่ใช่เอกสารจริง"
      footer={
        <>
          {ready !== null && (
            <Button
              variant="secondary"
              onClick={() => downloadFile(documentSampleFileName(item.type), ready.blob, 'application/pdf')}
            >
              ดาวน์โหลด PDF
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            ปิดหน้าต่าง
          </Button>
        </>
      }
    >
      {state === null ? (
        <LoadingState message="กำลังสร้างตัวอย่างเอกสาร..." />
      ) : 'error' in state ? (
        <ErrorState title={state.error.title} message={state.error.message} />
      ) : (
        <iframe
          src={state.url}
          title={sampleTitle(item)}
          className="h-[72vh] w-full rounded-lg border border-slate-200"
        />
      )}
    </Modal>
  )
}

function SampleCard({
  item,
  onView,
  onDownload,
  downloading,
}: {
  item: DocumentSampleListItemDto
  onView: () => void
  onDownload: () => void
  downloading: boolean
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
        {item.variant !== null && <Badge className="shrink-0">{item.variant}</Badge>}
      </div>
      <dl className="flex-1 space-y-1.5">
        <InfoRow label="ใครได้รับ">{item.recipients}</InfoRow>
        <InfoRow label="ออกเมื่อ">{item.issuedWhen}</InfoRow>
        <InfoRow label="จำนวนฉบับ">{item.copies}</InfoRow>
        <InfoRow label="ผู้เซ็น">{item.signers}</InfoRow>
        {item.sampleNumber !== null && (
          <InfoRow label="เลขตัวอย่าง">
            <RefText>{item.sampleNumber}</RefText>
            {item.numberPattern !== null && <span className="ml-1 text-slate-400">(รูปแบบ {item.numberPattern})</span>}
          </InfoRow>
        )}
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <Button onClick={onView}>ดูตัวอย่าง</Button>
        <Button variant="secondary" onClick={onDownload} disabled={downloading}>
          {downloading ? 'กำลังเตรียมไฟล์...' : 'ดาวน์โหลด PDF'}
        </Button>
      </div>
    </Card>
  )
}

export function DocumentSamplesView() {
  const [items, setItems] = useState<DocumentSampleListItemDto[] | null>(null)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [viewing, setViewing] = useState<DocumentSampleListItemDto | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await callApi<DocumentSampleListItemDto[]>('/api/accounting/document-samples')
    if (result.error !== undefined) {
      setError({ title: result.error.title, message: result.error.message })
      return
    }
    setError(null)
    setItems(result.data ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await callApi<DocumentSampleListItemDto[]>('/api/accounting/document-samples')
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        return
      }
      setItems(result.data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function download(item: DocumentSampleListItemDto): Promise<void> {
    setDownloading(item.type)
    setDownloadError(null)
    const result = await fetchSamplePdf(item.type)
    setDownloading(null)
    if ('error' in result) {
      setDownloadError(`${result.error.title} — ${result.error.message}`)
      return
    }
    downloadFile(documentSampleFileName(item.type), result.blob, 'application/pdf')
  }

  return (
    <>
      <PageHeader
        title="ตัวอย่างเอกสารทั้งหมด"
        description="หน้าตาเอกสารทุกชนิดที่ระบบออก — สร้างจากแบบเอกสารจริงของระบบ ด้วยข้อมูลสมมติและหัวเอกสารขององค์กร"
      />

      <InlineAlert tone="info" className="mb-5">
        ทุกหน้าของตัวอย่างพิมพ์ลายน้ำและข้อความ &ldquo;ตัวอย่าง — ไม่ใช่เอกสารจริง&rdquo; · เลขที่บนตัวอย่างคือเลขถัดไปตามค่าตั้งเลขที่เอกสาร
        (การเปิดดูตัวอย่างไม่ทำให้เลขที่เอกสารจริงเดิน)
      </InlineAlert>

      {downloadError !== null && (
        <InlineAlert tone="error" className="mb-5">
          {downloadError}
        </InlineAlert>
      )}

      {error !== null ? (
        <Card>
          <ErrorState
            title={error.title}
            message={error.message}
            action={
              <Button variant="secondary" onClick={() => void load()}>
                ลองใหม่
              </Button>
            }
          />
        </Card>
      ) : items === null ? (
        <Card>
          <LoadingState message="กำลังโหลดรายการเอกสาร..." />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title="ยังไม่มีตัวอย่างเอกสาร" />
        </Card>
      ) : (
        <div className="space-y-8">
          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((item) => item.group === group)
            if (groupItems.length === 0) return null
            return (
              <section key={group} aria-labelledby={`samples-${group}`}>
                <h2 id={`samples-${group}`} className="mb-3 text-sm font-bold text-slate-700">
                  {DOCUMENT_SAMPLE_GROUP_LABEL[group]}
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {groupItems.map((item) => (
                    <SampleCard
                      key={item.type}
                      item={item}
                      onView={() => setViewing(item)}
                      onDownload={() => void download(item)}
                      downloading={downloading === item.type}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {viewing !== null && <SampleViewerModal key={viewing.type} item={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}
