import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Printer, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/lib/auth";
import { useSaleItems, useSales } from "@/lib/queries";
import { PKR, exportRows, type Sale } from "@/lib/pos";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "Sales & Invoices — Mian Ali Traders POS" },
      { name: "description", content: "Search every invoice by number, customer or date, review line items and reprint receipts for both branches." },
      { property: "og:title", content: "Sales & Invoices — Mian Ali Traders POS" },
      { property: "og:description", content: "Complete invoice history with reprint and Excel export." },
    ],
  }),
  component: SalesPage,
});

function SalesPage() {
  const { activeBranch, branches, isAdmin } = useAuth();
  const { data: sales = [] } = useSales(activeBranch);
  const { data: items = [] } = useSaleItems();
  const [term, setTerm] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<Sale | null>(null);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return sales.filter((s) => {
      const matchTerm = !t || [s.invoice_number, s.customer_name].some((f) => (f ?? "").toLowerCase().includes(t));
      const d = new Date(s.created_at);
      const okFrom = !from || d >= new Date(`${from}T00:00:00`);
      const okTo = !to || d <= new Date(`${to}T23:59:59`);
      return matchTerm && okFrom && okTo;
    });
  }, [sales, term, from, to]);

  const revenue = filtered.reduce((a, s) => a + Number(s.total), 0);
  const profit = filtered.reduce((a, s) => a + Number(s.profit), 0);
  const due = filtered.reduce((a, s) => a + Number(s.remaining_amount), 0);

  const invoiceItems = open ? items.filter((i) => (i as unknown as { sale_id: string }).sale_id === open.id) : [];

  return (
    <AppShell
      title="Sales & Invoices"
      subtitle={`${filtered.length} invoices`}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportRows(
              filtered.map((s) => ({
                Invoice: s.invoice_number,
                Date: new Date(s.created_at).toLocaleString(),
                Customer: s.customer_name ?? "Walk-in",
                Branch: branches.find((b) => b.id === s.branch_id)?.name,
                Subtotal: s.subtotal,
                Discount: s.discount,
                Total: s.total,
                Profit: s.profit,
                Paid: s.paid_amount,
                Due: s.remaining_amount,
                Payment: s.payment_method,
              })),
              "sales-invoices",
            )
          }
        >
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Invoices" value={filtered.length} />
        <StatCard label="Revenue" value={PKR(revenue)} tone="success" />
        {isAdmin && <StatCard label="Profit" value={PKR(profit)} tone="success" />}
        <StatCard label="Outstanding" value={PKR(due)} tone={due > 0 ? "warning" : "default"} />
      </div>

      <Card className="mt-5">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search invoice number or customer…" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <Input type="date" className="w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" className="w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead>
                <TableHead>Branch</TableHead><TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Due</TableHead><TableHead>Payment</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpen(s)}>
                    <TableCell className="font-medium">{s.invoice_number}</TableCell>
                    <TableCell className="text-xs">{new Date(s.created_at).toLocaleString()}</TableCell>
                    <TableCell>{s.customer_name || "Walk-in"}</TableCell>
                    <TableCell className="text-xs">{branches.find((b) => b.id === s.branch_id)?.city}</TableCell>
                    <TableCell className="text-right font-medium">{PKR(s.total)}</TableCell>
                    <TableCell className="text-right">{Number(s.remaining_amount) > 0 ? <Badge variant="destructive">{PKR(s.remaining_amount)}</Badge> : "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{s.payment_method}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost">View</Button></TableCell>
                  </TableRow>
                ))}
                {!filtered.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No invoices found.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Invoice {open?.invoice_number}</DialogTitle></DialogHeader>
          {open && (
            <div id="invoice-print" className="space-y-3 text-sm">
              <div className="text-center">
                <img src="/logo.png" alt="Mian Ali Traders" className="mx-auto mb-2 h-14 w-auto object-contain" />

                <p className="text-xs text-muted-foreground">{branches.find((b) => b.id === open.branch_id)?.name}</p>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{new Date(open.created_at).toLocaleString()}</span>
                <span>{open.customer_name || "Walk-in customer"}</span>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                <TableBody>
                  {invoiceItems.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.product_name}</TableCell>
                      <TableCell className="text-right">{i.quantity}</TableCell>
                      <TableCell className="text-right">{PKR(i.price)}</TableCell>
                      <TableCell className="text-right">{PKR(i.line_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="space-y-1 border-t pt-2 text-right">
                <p>Subtotal: {PKR(open.subtotal)}</p>
                <p>Discount: {PKR(open.discount)}</p>
                <p className="text-base font-semibold">Total: {PKR(open.total)}</p>
                <p className="text-xs text-muted-foreground">Paid {PKR(open.paid_amount)} · Due {PKR(open.remaining_amount)}</p>
              </div>
              <Button className="no-print w-full" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print receipt</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
