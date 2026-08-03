import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useMovements, useProducts, useSaleItems, useSales } from "@/lib/queries";
import { exportRows, stockStatus, daysToExpiry } from "@/lib/pos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Excel Export — Mian Ali Traders POS" },
      { name: "description", content: "Download sales, stock, expiry, purchase and profit reports as Excel or CSV files for any date range." },
      { property: "og:title", content: "Reports & Excel Export — Mian Ali Traders POS" },
      { property: "og:description", content: "One-click Excel and CSV reports for sales, stock and profit." },
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");

  const inRange = (d: string) => {
    const t = new Date(d);
    if (from && t < new Date(`${from}T00:00:00`)) return false;
    if (to && t > new Date(`${to}T23:59:59`)) return false;
    return true;
  };
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";
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
            .filter((i) => inRange(i.created_at) && (activeBranch === "all" || i.sales?.branch_id === activeBranch))
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
          products.map((p) => ({
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
            .filter((p) => stockStatus(p) !== "ok")
            .map((p) => ({
              "Product Name": p.name,
              Company: p.company,
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
            .filter((p) => p.expiry_date)
            .map((p) => ({
              "Product Name": p.name,
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
          movements.filter((m) => inRange(m.created_at)).map((m) => ({
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
  ];

  return (
    <AppShell title="Reports & Excel" subtitle="Download any report as Excel or CSV">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
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
