import * as XLSX from "xlsx";

export const PKR = (n: number | string | null | undefined) =>
  "Rs " + Number(n ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });

export const NUM = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });

export type Product = {
  id: string;
  name: string;
  generic_name: string | null;
  brand: string | null;
  company: string | null;
  category: string | null;
  purchase_price: number;
  selling_price: number;
  stock_quantity: number;
  unit: string;
  batch_number: string | null;
  expiry_date: string | null;
  supplier_id: string | null;
  branch_id: string;
  low_stock_level: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Sale = {
  id: string;
  invoice_number: string;
  branch_id: string;
  customer_id: string | null;
  customer_name: string | null;
  subtotal: number;
  discount: number;
  total: number;
  cost_total: number;
  profit: number;
  paid_amount: number;
  remaining_amount: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
};

export const stockStatus = (p: Product) =>
  p.stock_quantity <= 0 ? "out" : p.stock_quantity <= p.low_stock_level ? "low" : "ok";

export const daysToExpiry = (d: string | null) =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000) : null;

export const formatDateOnly = (dateStr?: string | null): string => {
  if (!dateStr) return "—";
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

export function printThermalReceipt(elementId: string) {
  const elem = document.getElementById(elementId);
  if (!elem) {
    window.print();
    return;
  }

  let iframe = document.getElementById("thermal-print-iframe") as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "thermal-print-iframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.style.zIndex = "-99999";
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  const clone = elem.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".no-print, button").forEach((el) => el.remove());

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt Print</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0mm;
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 80mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: ui-monospace, "Courier New", Courier, monospace !important;
          }
          body {
            padding: 2mm 3mm !important;
          }
          .receipt-container {
            width: 74mm;
            margin: 0 auto;
          }
          img {
            max-width: 50mm !important;
            height: auto !important;
            display: block;
            margin: 0 auto 4px auto;
            filter: grayscale(100%) contrast(140%);
          }
          table {
            width: 100% !important;
            border-collapse: collapse;
          }
          th, td {
            padding: 2px 0 !important;
            font-size: 10px !important;
            vertical-align: top;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-bold { font-weight: bold; }
          .flex { display: flex; justify-content: space-between; }
          .border-b { border-bottom: 1px dashed #000; }
          .border-t { border-top: 1px dashed #000; }
          .no-print { display: none !important; }
          .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .space-y-1 > * + * { margin-top: 0.25rem; }
          .space-y-3 > * + * { margin-top: 0.75rem; }
          .text-xs { font-size: 10px; }
          .text-sm { font-size: 12px; }
          .text-base { font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          ${clone.innerHTML}
        </div>
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe?.contentWindow?.focus();
    iframe?.contentWindow?.print();
  }, 250);
}

export function exportRows(rows: Record<string, unknown>[], fileName: string, format: "xlsx" | "csv" = "xlsx") {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: "No data" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${fileName}.${format}`, { bookType: format });
}

export async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const first = wb.SheetNames[0];
  if (!first) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first]!, { defval: null });
}

export const startOf = (kind: "day" | "week" | "month" | "year") => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (kind === "week") d.setDate(d.getDate() - 6);
  if (kind === "month") d.setDate(1);
  if (kind === "year") {
    d.setMonth(0);
    d.setDate(1);
  }
  return d;
};
