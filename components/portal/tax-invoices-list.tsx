"use client";

import { Fragment, useCallback, useState } from "react";
import { usePortalApiUrl } from "@/components/portal/portal-scope";
import { usePortalData } from "@/components/portal/use-portal-data";
import { FetchTimeoutError, fetchWithTimeout } from "@/lib/api/fetch-with-timeout";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  PageHeader,
  RefText,
  StatusBadge,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from "@/components/ui";
import { readEnvelope } from "@/lib/api/envelope";
import { fmtDate } from "@/lib/format/datetime";
import { fmtCount, fmtSatangSymbol } from "@/lib/format/money";
import { downloadFile } from "@/lib/imports/download-client";
import {
  attachmentFileName,
  portalTaxInvoiceDownloadUrl,
} from "@/lib/portal/finance-ui";
import type { PortalTaxInvoiceDto } from "@/lib/portal/serializers";

interface DownloadError {
  invoiceNumber: string;
  title: string;
  message: string;
}

/**
 * หน้า "ใบกำกับภาษี" ของพอร์ทัล — `GET /api/portal/tax-invoices` (`97` §6.3 · mockup `renderInvoices()`)
 *
 * - ดาวน์โหลด PDF ผ่าน `GET /api/portal/tax-invoices/:id/download` (renderer เดียวกับฝ่ายบัญชี — มติ O43 D7)
 * - `canDownload = false` (ไม่มีสิทธิ์ดาวน์โหลด) ⇒ ซ่อนปุ่ม — API ยังตรวจซ้ำเสมอ (DEC-002)
 * - ใบที่ยกเลิกแล้ว: badge แดง + ยอดขีดฆ่า + ข้อความกำกับ · ยังดาวน์โหลดได้ (PDF มีแถบ "ยกเลิก")
 * - ใบลดหนี้ (มติ U14): ยอดหน้าใบไม่หัก · ใต้ใบแสดง "ลดหนี้ N ใบ · ยอดสุทธิ" + รายการใบลดหนี้ (ไม่มีไฟล์ให้ดาวน์โหลด)
 */
export function PortalTaxInvoices({ canDownload }: { canDownload: boolean }) {
  const state = usePortalData<PortalTaxInvoiceDto[]>(
    "/api/portal/tax-invoices",
  );
  const apiUrl = usePortalApiUrl();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<DownloadError | null>(
    null,
  );

  const download = useCallback(async (invoice: PortalTaxInvoiceDto) => {
    setDownloadingId(invoice.id);
    setDownloadError(null);
    try {
      // มี timeout — server ค้างแล้วปุ่มไม่หมุนค้าง (preship R2-017)
      const response = await fetchWithTimeout(
        apiUrl(portalTaxInvoiceDownloadUrl(invoice.id)),
      );
      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && contentType.includes("application/pdf")) {
        const blob = await response.blob();
        downloadFile(
          attachmentFileName(
            response.headers.get("content-disposition"),
            `${invoice.invoiceNumber}.pdf`,
          ),
          blob,
          "application/pdf",
        );
        return;
      }
      let title = "ดาวน์โหลดไม่สำเร็จ";
      let message = "กรุณาลองใหม่อีกครั้ง หากยังไม่ได้ กรุณาติดต่อเจ้าหน้าที่";
      if (contentType.includes("application/json")) {
        const envelope = readEnvelope<unknown>(
          await response.json(),
          response.ok,
        );
        if (!envelope.success) {
          title = envelope.error.title;
          message = envelope.error.message;
        }
      }
      setDownloadError({
        invoiceNumber: invoice.invoiceNumber,
        title,
        message,
      });
    } catch (error) {
      const timedOut = error instanceof FetchTimeoutError;
      setDownloadError({
        invoiceNumber: invoice.invoiceNumber,
        title: timedOut ? "ระบบตอบช้า" : "เชื่อมต่อระบบไม่สำเร็จ",
        message: timedOut ? "ระบบตอบช้าเกินไป กรุณาลองใหม่อีกครั้ง" : "กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
      });
    } finally {
      setDownloadingId(null);
    }
  }, [apiUrl]);

  const rows = state.data ?? [];
  const ready = !state.loading && state.error === null && state.data !== null;

  return (
    <div>
      <PageHeader
        title="ใบเสร็จรับเงิน/ใบกำกับภาษี"
        description="ออกให้เมื่อได้รับชำระเงิน (ใบแจ้งหนี้/ใบวางบิลดาวน์โหลดได้ที่หน้ารอบวางบิล)"
      />

      {downloadError !== null && (
        <InlineAlert
          tone="error"
          title={`${downloadError.title} — ${downloadError.invoiceNumber}`}
          className="mb-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{downloadError.message}</span>
            <Button variant="ghost" onClick={() => setDownloadError(null)}>
              ปิด
            </Button>
          </div>
        </InlineAlert>
      )}

      {ready && rows.length > 0 && !canDownload && (
        <InlineAlert tone="info" className="mb-4">
          บัญชีของท่านดูรายการได้ แต่ยังไม่ได้รับสิทธิ์ดาวน์โหลดเอกสาร —
          หากต้องการ กรุณาติดต่อเจ้าหน้าที่ AssetRecovery
        </InlineAlert>
      )}

      <Card padded={ready}>
        {state.loading ? (
          <LoadingState />
        ) : state.error !== null ? (
          <ErrorState
            title={state.error.title}
            message={state.error.message}
            {...(state.error.code === undefined
              ? {}
              : { code: state.error.code })}
            action={
              <Button variant="secondary" onClick={state.reload}>
                ลองใหม่
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="ยังไม่มีใบเสร็จรับเงิน/ใบกำกับภาษี"
            description="เมื่อบริษัทของท่านชำระเงินและมีการออกเอกสาร รายการจะแสดงที่นี่"
          />
        ) : (
          <>
            <div className="mb-4 text-right text-xs text-slate-400">
              ทั้งหมด {fmtCount(rows.length)} รายการ
            </div>
            <InvoiceTable
              rows={rows}
              canDownload={canDownload}
              downloadingId={downloadingId}
              onDownload={download}
            />
            <InvoiceCards
              rows={rows}
              canDownload={canDownload}
              downloadingId={downloadingId}
              onDownload={download}
            />
          </>
        )}
      </Card>
    </div>
  );
}

interface ListProps {
  rows: readonly PortalTaxInvoiceDto[];
  canDownload: boolean;
  downloadingId: string | null;
  onDownload: (invoice: PortalTaxInvoiceDto) => Promise<void>;
}

function isCancelled(invoice: PortalTaxInvoiceDto): boolean {
  return invoice.statusDisplay.code === "cancelled";
}

function DownloadIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}

function DownloadButton({
  invoice,
  downloadingId,
  onDownload,
  fullWidth = false,
}: {
  invoice: PortalTaxInvoiceDto;
  downloadingId: string | null;
  onDownload: ListProps["onDownload"];
  fullWidth?: boolean;
}) {
  return (
    <Button
      variant="info"
      fullWidth={fullWidth}
      loading={downloadingId === invoice.id}
      disabled={downloadingId !== null && downloadingId !== invoice.id}
      onClick={() => void onDownload(invoice)}
      aria-label={`ดาวน์โหลด PDF ${invoice.documentTitle} ${invoice.invoiceNumber}`}
    >
      {downloadingId !== invoice.id && <DownloadIcon />}
      ดาวน์โหลด PDF
    </Button>
  );
}

function Amount({
  satang,
  cancelled,
  className,
}: {
  satang: number;
  cancelled: boolean;
  className?: string;
}) {
  return (
    <span className={cn(cancelled && "text-slate-400 line-through", className)}>
      {fmtSatangSymbol(satang)}
    </span>
  );
}

/** มีใบลดหนี้/ใบเพิ่มหนี้ active อ้างถึงใบนี้ไหม (มติ U14/U19) */
function hasAdjustmentNotes(invoice: PortalTaxInvoiceDto): boolean {
  return invoice.creditNotes.length > 0 || invoice.debitNotes.length > 0;
}

/**
 * ใบลดหนี้/ใบเพิ่มหนี้ที่อ้างถึงใบกำกับ — สรุป "ลดหนี้ N ใบ · เพิ่มหนี้ M ใบ · ยอดสุทธิ" + รายการ
 * (ชนิด/เลขที่/วันที่/ก่อน VAT/VAT/รวม) · ยอดสุทธิมาจาก server (ไม่คำนวณบนจอ)
 */
function CreditNoteBlock({ invoice }: { invoice: PortalTaxInvoiceDto }) {
  if (!hasAdjustmentNotes(invoice)) return null;
  const summary = [
    invoice.creditNotes.length > 0 ? `ลดหนี้ ${fmtCount(invoice.creditNotes.length)} ใบ` : null,
    invoice.debitNotes.length > 0 ? `เพิ่มหนี้ ${fmtCount(invoice.debitNotes.length)} ใบ` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
  const rows = [
    ...invoice.creditNotes.map((note) => ({ note, label: "ใบลดหนี้" })),
    ...invoice.debitNotes.map((note) => ({ note, label: "ใบเพิ่มหนี้" })),
  ];
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs">
      <div className="font-semibold text-amber-800">
        {summary} · ยอดสุทธิ{" "}
        {fmtSatangSymbol(invoice.netTotalSatang)}
        <span className="ml-1 font-normal text-slate-500">
          (ก่อน VAT {fmtSatangSymbol(invoice.netBeforeVatSatang)} · VAT{" "}
          {fmtSatangSymbol(invoice.netVatSatang)})
        </span>
      </div>
      <ul className="mt-1 space-y-0.5">
        {rows.map(({ note, label }) => (
          <li
            key={note.id}
            className="flex flex-wrap items-baseline gap-x-2 text-slate-600"
          >
            <span>{label}</span>
            <RefText className="font-semibold text-slate-700">
              {note.creditNoteNumber}
            </RefText>
            <span className="text-slate-500">{fmtDate(note.issueDate)}</span>
            <span className="text-slate-500">{note.branchLabel}</span>
            <span className="font-mono">
              ก่อน VAT {fmtSatangSymbol(note.amountBeforeVatSatang)} · VAT{" "}
              {fmtSatangSymbol(note.vatSatang)} · รวม{" "}
              <span className="font-semibold">
                {fmtSatangSymbol(note.totalSatang)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** desktop — ตาราง (md+) */
function InvoiceTable({
  rows,
  canDownload,
  downloadingId,
  onDownload,
}: ListProps) {
  return (
    <Table className="hidden md:block">
      <THead>
        <tr>
          <Th>เลขที่ใบกำกับภาษี</Th>
          <Th>วันที่ออก</Th>
          <Th numeric>ยอดก่อน VAT</Th>
          <Th numeric>VAT</Th>
          <Th numeric>ยอดรวม</Th>
          <Th>รูปแบบเอกสาร</Th>
          <Th>สถานะ</Th>
          {canDownload && <Th className="text-right">เอกสาร</Th>}
        </tr>
      </THead>
      <TBody>
        {rows.map((invoice) => {
          const cancelled = isCancelled(invoice);
          return (
            <Fragment key={invoice.id}>
              <Tr className={cancelled ? "bg-red-50/40" : undefined}>
                <Td className="whitespace-nowrap">
                  <RefText
                    className={cn(
                      "text-xs font-semibold",
                      cancelled && "text-slate-400 line-through",
                    )}
                  >
                    {invoice.invoiceNumber}
                  </RefText>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {invoice.documentTitle}
                    {invoice.billingBatchNumber === null ? "" : ` · ใบแจ้งหนี้ ${invoice.billingBatchNumber}`}
                  </p>
                </Td>
                <Td className="text-xs whitespace-nowrap text-slate-500">
                  {fmtDate(invoice.issueDate)}
                </Td>
                <Td numeric>
                  <Amount
                    satang={invoice.totalBeforeVatSatang}
                    cancelled={cancelled}
                  />
                </Td>
                <Td numeric>
                  <Amount satang={invoice.vatSatang} cancelled={cancelled} />
                </Td>
                <Td numeric>
                  <Amount
                    satang={invoice.totalSatang}
                    cancelled={cancelled}
                    className="font-semibold"
                  />
                </Td>
                <Td className="text-xs whitespace-nowrap">
                  {invoice.deliveryFormatLabel}
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-0.5">
                    <StatusBadge
                      group={invoice.statusDisplay.tone}
                      label={invoice.statusDisplay.label}
                    />
                    {cancelled && (
                      <span className="text-[11px] text-red-600">
                        ใบนี้ถูกยกเลิกแล้ว
                      </span>
                    )}
                  </div>
                </Td>
                {canDownload && (
                  <Td className="text-right whitespace-nowrap">
                    <DownloadButton
                      invoice={invoice}
                      downloadingId={downloadingId}
                      onDownload={onDownload}
                    />
                  </Td>
                )}
              </Tr>
              {hasAdjustmentNotes(invoice) && (
                <Tr>
                  <Td colSpan={canDownload ? 8 : 7} className="pt-0">
                    <CreditNoteBlock invoice={invoice} />
                  </Td>
                </Tr>
              )}
            </Fragment>
          );
        })}
      </TBody>
    </Table>
  );
}

/** มือถือ — การ์ดต่อใบ (mockup มือถือ `renderFinance()` แท็บย่อยใบกำกับภาษี) */
function InvoiceCards({
  rows,
  canDownload,
  downloadingId,
  onDownload,
}: ListProps) {
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map((invoice) => {
        const cancelled = isCancelled(invoice);
        return (
          <li
            key={invoice.id}
            className={cn(
              "rounded-xl border bg-white p-3.5",
              cancelled ? "border-red-200 bg-red-50/40" : "border-slate-200",
            )}
          >
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <RefText
                className={cn(
                  "text-xs font-bold text-slate-800",
                  cancelled && "text-slate-400 line-through",
                )}
              >
                {invoice.invoiceNumber}
              </RefText>
              <span className="text-[10px] text-slate-500">{invoice.documentTitle}</span>
              <StatusBadge
                group={invoice.statusDisplay.tone}
                label={invoice.statusDisplay.label}
              />
            </div>
            <Amount
              satang={invoice.totalSatang}
              cancelled={cancelled}
              className="text-sm font-semibold text-slate-700"
            />
            <div className="mt-1 text-[13px] text-slate-400">
              ก่อน VAT {fmtSatangSymbol(invoice.totalBeforeVatSatang)} · VAT{" "}
              {fmtSatangSymbol(invoice.vatSatang)}
            </div>
            <div className="mt-0.5 text-[13px] text-slate-400">
              ออกเมื่อ {fmtDate(invoice.issueDate)} ·{" "}
              {invoice.deliveryFormatLabel}
            </div>
            {cancelled && (
              <div className="mt-1 text-xs font-semibold text-red-600">
                ใบนี้ถูกยกเลิกแล้ว
              </div>
            )}
            {hasAdjustmentNotes(invoice) && (
              <div className="mt-2">
                <CreditNoteBlock invoice={invoice} />
              </div>
            )}
            {canDownload && (
              <div className="mt-2.5">
                <DownloadButton
                  invoice={invoice}
                  downloadingId={downloadingId}
                  onDownload={onDownload}
                  fullWidth
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
