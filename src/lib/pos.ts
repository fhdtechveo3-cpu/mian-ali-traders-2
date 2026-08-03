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
