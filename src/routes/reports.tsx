import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useMovements, useProducts, useReturns, useSaleItems, useSales } from "@/lib/queries";
import { exportRows, stockStatus, daysToExpiry } from "@/lib/pos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Excel Export — Mian Ali Traders POS" },
      { name: "description", content: "Download sales, stock, expiry, purchase and profit reports as Excel or CSV files with company and category filters." },
      { property: "og:title", content: "Reports & Excel Export — Mian Ali Traders POS" },
      { property: "og:description", content: "One-click Excel and CSV reports for sales, stock, company and profit." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { activeBranch, branches, isAdmin } = useAuth();
  const { data: sales = [] } = useSales(activeBranch);
  const { data: items = [] } = useSaleItems();
  const { data: products = [] } = useProducts(activeBranch);
  const { data: movements = [] } = useMovements(activeBranch);
  const { data: returns = [] } = useReturns(activeBranch);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [company, setCompany] = useState("all");
  const [category, setCategory] = useState("all");
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");

  const companies = Array.from(new Set(products.map((p) => p.company).filter(Boolean))) as string[];
  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];

  const inRange = (d: string) => {
    const t = new Date(d);
    if (from && t < new Date(`${from}T00:00:00`)) return false;
    if (to && t > new Date(`${to}T23:59:59`)) return false;
    return true;
  };
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";
  
  const matchProd = (p?: typeof products[0] | null) => {
    if (!p) return true;
    const matchC = company === "all" || p.company === company;
    const matchCat = category === "all" || p.category === category;
    return matchC && matchCat;
  };

  const scopedSales = sales.filter((s) => inRange(s.created_at));

  const reports = [
    {
      title: "Sales Report",
      desc: "Every invoice with totals, discount, payment method and profit.",
      run: () =>
        exportRows(
          scopedSales.map((s) => ({
            Invoice: s.invoice_number,
            Date: new Date(s.created_at).toLocaleString(),
            Branch: branchName(s.branch_id),
            Customer: s.customer_name ?? "Walk-in",
            Subtotal: s.subtotal,
            Discount: s.discount,
            Total: s.total,
            ...(isAdmin ? { Cost: s.cost_total, Profit: s.profit } : {}),
            Paid: s.paid_amount,
            Due: s.remaining_amount,
            Payment: s.payment_method,
          })),
          "sales-report",
          format,
        ),
    },
    {
      title: "Item-wise Sales",
      desc: "Product level sales lines with quantity, rate and amount.",
      run: () =>
        exportRows(
          items
            .filter((i) => {
              const inR = inRange(i.created_at);
              const bOk = activeBranch === "all" || i.sales?.branch_id === activeBranch;
              const p = products.find((x) => x.id === i.product_id || x.name === i.product_name);
              return inR && bOk && matchProd(p);
            })
            .map((i) => ({
              Date: new Date(i.created_at).toLocaleString(),
              Product: i.product_name,
              Quantity: i.quantity,
              Rate: i.price,
              Amount: i.line_total,
              ...(isAdmin ? { Profit: (Number(i.price) - Number(i.purchase_price)) * Number(i.quantity) } : {}),
            })),
          "item-wise-sales",
          format,
        ),
    },
    {
      title: "Stock Report",
      desc: "Full inventory with available quantity, cost and retail value.",
      run: () =>
        exportRows(
          products.filter((p) => matchProd(p)).map((p) => ({
            "Product Name": p.name,
            "Generic Name": p.generic_name,
            Company: p.company,
            Category: p.category,
            Branch: branchName(p.branch_id),
            Stock: p.stock_quantity,
            Unit: p.unit,
            "Purchase Price": p.purchase_price,
            "Selling Price": p.selling_price,
            "Stock Value": Number(p.purchase_price) * Number(p.stock_quantity),
            Status: stockStatus(p),
          })),
          "stock-report",
          format,
        ),
    },
    {
      title: "Low & Out of Stock",
      desc: "Reorder list for items at or below the low stock level.",
      run: () =>
        exportRows(
          products
            .filter((p) => stockStatus(p) !== "ok" && matchProd(p))
            .map((p) => ({
              "Product Name": p.name,
              Company: p.company,
              Category: p.category,
              Branch: branchName(p.branch_id),
              Stock: p.stock_quantity,
              "Low Stock Level": p.low_stock_level,
              Status: stockStatus(p),
            })),
          "low-stock-report",
          format,
        ),
    },
    {
      title: "Expiry Report",
      desc: "Expired and near-expiry batches with days remaining.",
      run: () =>
        exportRows(
          products
            .filter((p) => p.expiry_date && matchProd(p))
            .map((p) => ({
              "Product Name": p.name,
              Company: p.company,
              Batch: p.batch_number,
              Expiry: p.expiry_date,
              "Days Left": daysToExpiry(p.expiry_date),
              Stock: p.stock_quantity,
              Branch: branchName(p.branch_id),
            })),
          "expiry-report",
          format,
        ),
    },
    {
      title: "Purchase & Stock Movement",
      desc: "All stock arrivals, sales deductions and manual adjustments.",
      run: () =>
        exportRows(
          movements
            .filter((m) => {
              const inR = inRange(m.created_at);
              const p = products.find((x) => x.id === m.product_id);
              return inR && matchProd(p);
            })
            .map((m) => ({
              Date: new Date(m.created_at).toLocaleString(),
              Product: products.find((p) => p.id === m.product_id)?.name ?? m.product_id,
              Type: m.movement_type,
              Quantity: m.quantity,
              "Purchase Price": m.purchase_price,
              Branch: branchName(m.branch_id),
              Reference: m.reference ?? m.note,
            })),
          "stock-movement-report",
          format,
        ),
    },
    {
      title: "Returns & Refunds Report",
      desc: "All item return transactions with refund amounts and reasons.",
      run: () =>
        exportRows(
          returns
            .filter((r) => {
              const inR = inRange(r.created_at);
              const p = products.find((x) => x.id === r.product_id || x.name === r.product_name);
              return inR && matchProd(p);
            })
            .map((r) => ({
              "Invoice #": r.invoice_number,
              Date: new Date(r.created_at).toLocaleString(),
              Product: r.product_name,
              "Returned Qty": r.quantity,
              "Unit Price": r.unit_price,
              "Refund Amount": r.refund_amount,
              Reason: r.reason ?? "N/A",
              Branch: branchName(r.branch_id),
            })),
          "returns-refunds-report",
          format,
        ),
    },
  ];

  return (
    <AppShell title="Reports & Excel" subtitle="Download any report as Excel or CSV">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Report Filters</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label className="text-xs">From Date</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">To Date</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-1.5 min-w-[160px]">
            <Label className="text-xs">Company</Label>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[160px]">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant={format === "xlsx" ? "default" : "outline"} size="sm" onClick={() => setFormat("xlsx")}>Excel (.xlsx)</Button>
            <Button variant={format === "csv" ? "default" : "outline"} size="sm" onClick={() => setFormat("csv")}>CSV</Button>
          </div>
          <p className="text-xs text-muted-foreground">Reports follow the branch selected in the header.</p>
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.title}>
            <CardContent className="flex h-full flex-col gap-3 p-5">
              <div>
                <p className="font-semibold">{r.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
              </div>
              <Button className="mt-auto w-full" variant="outline" onClick={r.run}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Download
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
