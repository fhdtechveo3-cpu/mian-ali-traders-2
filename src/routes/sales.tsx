import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Printer, Download, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/lib/auth";
import { useSaleItems, useSales, useReturns } from "@/lib/queries";
import { PKR, exportRows, type Sale } from "@/lib/pos";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "Sales & Invoices — Mian Ali Traders POS" },
      { name: "description", content: "Search every invoice by number, customer name or phone number, edit invoices as admin, and review daily, weekly and monthly sales." },
      { property: "og:title", content: "Sales & Invoices — Mian Ali Traders POS" },
      { property: "og:description", content: "Complete invoice history with multi-field search, admin invoice editing and daily/weekly/monthly revenue summary." },
    ],
  }),
  component: SalesPage,
});

function SalesPage() {
  const { activeBranch, branches, isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: sales = [] } = useSales(activeBranch);
  const { data: items = [] } = useSaleItems();
  const { data: returns = [] } = useReturns(activeBranch);
  
  const [term, setTerm] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<Sale | null>(null);
  
  // Edit Invoice Dialog state (Admin only)
  const [editingInvoice, setEditingInvoice] = useState<Sale | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDiscount, setEditDiscount] = useState(0);
  const [editPaid, setEditPaid] = useState(0);
  const [editMethod, setEditMethod] = useState("Cash");
  const [editNotes, setEditNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return sales.filter((s) => {
      const phone = (s as unknown as { customer_phone?: string }).customer_phone ?? "";
      const matchTerm = !t || [s.invoice_number, s.customer_name, phone].some((f) => (f ?? "").toLowerCase().includes(t));
      const d = new Date(s.created_at);
      const okFrom = !from || d >= new Date(`${from}T00:00:00`);
      const okTo = !to || d <= new Date(`${to}T23:59:59`);
      return matchTerm && okFrom && okTo;
    });
  }, [sales, term, from, to]);

  const grossRevenue = filtered.reduce((a, s) => a + Number(s.total), 0);
  const totalRefunds = returns.reduce((a, r) => a + Number(r.refund_amount), 0);
  const netRevenue = grossRevenue - totalRefunds;
  const profit = filtered.reduce((a, s) => a + Number(s.profit), 0) - totalRefunds;
  const due = filtered.reduce((a, s) => a + Number(s.remaining_amount), 0);

  const todayNet = useMemo(() => {
    const today = new Date().toDateString();
    const todaySales = sales.filter((s) => new Date(s.created_at).toDateString() === today).reduce((sum, s) => sum + Number(s.total), 0);
    const todayReturns = returns.filter((r) => new Date(r.created_at).toDateString() === today).reduce((sum, r) => sum + Number(r.refund_amount), 0);
    return todaySales - todayReturns;
  }, [sales, returns]);

  const weekNet = useMemo(() => {
    const now = new Date().getTime();
    const weekSales = sales.filter((s) => (now - new Date(s.created_at).getTime()) <= 7 * 86400000).reduce((sum, s) => sum + Number(s.total), 0);
    const weekReturns = returns.filter((r) => (now - new Date(r.created_at).getTime()) <= 7 * 86400000).reduce((sum, r) => sum + Number(r.refund_amount), 0);
    return weekSales - weekReturns;
  }, [sales, returns]);

  const monthNet = useMemo(() => {
    const now = new Date();
    const isThisMonth = (d: string) => {
      const t = new Date(d);
      return t.getMonth() === now.getMonth() && t.getFullYear() === now.getFullYear();
    };
    const monthSales = sales.filter((s) => isThisMonth(s.created_at)).reduce((sum, s) => sum + Number(s.total), 0);
    const monthReturns = returns.filter((r) => isThisMonth(r.created_at)).reduce((sum, r) => sum + Number(r.refund_amount), 0);
    return monthSales - monthReturns;
  }, [sales, returns]);

  const invoiceItems = open ? items.filter((i) => (i as unknown as { sale_id: string }).sale_id === open.id) : [];

  const startEditing = (sale: Sale) => {
    setEditingInvoice(sale);
    setEditName(sale.customer_name || "Walk-in Customer");
    setEditPhone((sale as unknown as { customer_phone?: string }).customer_phone || "");
    setEditDiscount(Number(sale.discount) || 0);
    setEditPaid(Number(sale.paid_amount) || 0);
    setEditMethod(sale.payment_method || "Cash");
    setEditNotes(sale.notes || "");
  };

  const handleSaveInvoiceEdit = async () => {
    if (!editingInvoice) return;
    setBusy(true);

    const args = {
      _sale_id: editingInvoice.id,
      _customer_name: editName.trim() || "Walk-in Customer",
      _customer_phone: editPhone.trim() || null,
      _discount: editDiscount,
      _paid_amount: editPaid,
      _payment_method: editMethod,
      _notes: editNotes || null,
    };

    const { error } = await supabase.rpc("update_invoice", args as never);
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Invoice updated successfully");
    void qc.invalidateQueries({ queryKey: ["sales"] });
    setEditingInvoice(null);
    setOpen(null);
  };

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
                Phone: (s as unknown as { customer_phone?: string }).customer_phone ?? "—",
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard title="Gross Sales" value={PKR(grossRevenue)} sub="Total original sales" />
        <StatCard title="Total Refunds" value={PKR(totalRefunds)} tone="destructive" sub="Deducted returns" />
        <StatCard title="Net Revenue" value={PKR(netRevenue)} tone="success" sub="After returns" />
        {isAdmin && <StatCard title="Total Profit" value={PKR(profit)} tone="success" sub="Net profit" />}
        <StatCard title="Today's Sales" value={PKR(todayNet)} tone="success" sub="Net sales today" />
        <StatCard title="This Week" value={PKR(weekNet)} tone="success" sub="Net sales 7 days" />
        <StatCard title="This Month" value={PKR(monthNet)} tone="success" sub="Net sales this month" />
      </div>

      <Card className="mt-5">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by invoice #, customer name or phone..." value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <Input type="date" className="w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" className="w-[160px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const phone = (s as unknown as { customer_phone?: string }).customer_phone;
                  return (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpen(s)}>
                      <TableCell className="font-medium">{s.invoice_number}</TableCell>
                      <TableCell className="text-xs">{new Date(s.created_at).toLocaleString()}</TableCell>
                      <TableCell>{s.customer_name || "Walk-in"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{phone || "—"}</TableCell>
                      <TableCell className="text-xs">{branches.find((b) => b.id === s.branch_id)?.city}</TableCell>
                      <TableCell className="text-right font-medium">{PKR(s.total)}</TableCell>
                      <TableCell className="text-right">{Number(s.remaining_amount) > 0 ? <Badge variant="destructive">{PKR(s.remaining_amount)}</Badge> : "—"}</TableCell>
                      <TableCell className="text-xs capitalize">{s.payment_method}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="ghost">View</Button></TableCell>
                    </TableRow>
                  );
                })}
                {!filtered.length && <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">No invoices found.</TableCell></TableRow>}
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
                <span>
                  {open.customer_name || "Walk-in customer"}
                  {(open as unknown as { customer_phone?: string }).customer_phone ? ` (${(open as unknown as { customer_phone?: string }).customer_phone})` : ""}
                </span>
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
                {open.notes && <p className="text-xs text-muted-foreground">Note: {open.notes}</p>}
              </div>

              <div className="no-print grid grid-cols-2 gap-2 pt-2">
                <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print receipt</Button>
                {isAdmin && (
                  <Button variant="default" onClick={() => startEditing(open)}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit Invoice
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin Edit Invoice Dialog */}
      <Dialog open={!!editingInvoice} onOpenChange={(v) => !v && setEditingInvoice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Invoice — {editingInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {editingInvoice && (
            <div className="space-y-3 text-sm pt-2">
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Customer Phone Number</Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="03001234567" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Discount Amount</Label>
                  <Input type="number" value={editDiscount} onChange={(e) => setEditDiscount(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Paid Amount</Label>
                  <Input type="number" value={editPaid} onChange={(e) => setEditPaid(Number(e.target.value) || 0)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={editMethod} onValueChange={setEditMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Cash", "Card", "Easypaisa", "JazzCash", "Bank Transfer", "Credit"].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setEditingInvoice(null)}>Cancel</Button>
                <Button disabled={busy} onClick={handleSaveInvoiceEdit}>Save Changes</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
