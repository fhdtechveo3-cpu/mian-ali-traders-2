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
  
  // Filter mode: "all" or "udhaar"
  const [filterMode, setFilterMode] = useState<"all" | "udhaar">("all");

  // Mark Invoice Paid Dialog state
  const [payModalSale, setPayModalSale] = useState<Sale | null>(null);

  // Reschedule Due Date Dialog state
  const [rescheduleSale, setRescheduleSale] = useState<Sale | null>(null);
  const [newDueDate, setNewDueDate] = useState("");

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
      const okUdhaar = filterMode === "all" || Number(s.remaining_amount) > 0;
      return matchTerm && okFrom && okTo && okUdhaar;
    });
  }, [sales, term, from, to, filterMode]);

  const handleMarkPaid = async () => {
    if (!payModalSale) return;
    setBusy(true);
    const dueVal = Number(payModalSale.remaining_amount);

    const { error: saleErr } = await supabase
      .from("sales")
      .update({
        remaining_amount: 0,
        paid_amount: Number(payModalSale.total),
      })
      .eq("id", payModalSale.id);

    if (saleErr) {
      setBusy(false);
      toast.error(saleErr.message);
      return;
    }

    if (payModalSale.customer_id && dueVal > 0) {
      await supabase.from("customer_payments").insert({
        customer_id: payModalSale.customer_id,
        branch_id: payModalSale.branch_id,
        amount: dueVal,
        payment_method: "Cash",
        notes: `Full clearance of Invoice ${payModalSale.invoice_number}`,
      });
    }

    setBusy(false);
    toast.success(`Invoice ${payModalSale.invoice_number} marked as FULLY PAID!`);
    setPayModalSale(null);
    void qc.invalidateQueries({ queryKey: ["sales"] });
    void qc.invalidateQueries({ queryKey: ["customer_payments"] });
  };

  const handleRescheduleDueDate = async () => {
    if (!rescheduleSale || !newDueDate) return;
    setBusy(true);

    const { error } = await supabase
      .from("sales")
      .update({ due_date: newDueDate })
      .eq("id", rescheduleSale.id);

    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Due date for Invoice ${rescheduleSale.invoice_number} updated to ${newDueDate}`);
    setRescheduleSale(null);
    setNewDueDate("");
    void qc.invalidateQueries({ queryKey: ["sales"] });
  };

  const filteredReturns = useMemo(() => {
    return returns.filter((r) => {
      const d = new Date(r.created_at);
      const okFrom = !from || d >= new Date(`${from}T00:00:00`);
      const okTo = !to || d <= new Date(`${to}T23:59:59`);
      return okFrom && okTo;
    });
  }, [returns, from, to]);

  const grossRevenue = filtered.reduce((a, s) => a + Number(s.total), 0);
  const totalRefunds = filteredReturns.reduce((a, r) => a + Number(r.refund_amount), 0);
  const netRevenue = grossRevenue - totalRefunds;
  const profit = filtered.reduce((a, s) => a + Number(s.profit), 0) - totalRefunds;
  const due = filtered.reduce((a, s) => a + Number(s.remaining_amount), 0);

  const todayNet = useMemo(() => {
    const now = new Date();
    const isToday = (dStr: string) => {
      const d = new Date(dStr);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    };
    const todaySales = sales.filter((s) => isToday(s.created_at)).reduce((sum, s) => sum + Number(s.total), 0);
    const todayReturns = returns.filter((r) => isToday(r.created_at)).reduce((sum, r) => sum + Number(r.refund_amount), 0);
    return todaySales - todayReturns;
  }, [sales, returns]);

  const weekNet = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const isThisWeek = (dStr: string) => new Date(dStr) >= startOfWeek;
    const weekSales = sales.filter((s) => isThisWeek(s.created_at)).reduce((sum, s) => sum + Number(s.total), 0);
    const weekReturns = returns.filter((r) => isThisWeek(r.created_at)).reduce((sum, r) => sum + Number(r.refund_amount), 0);
    return weekSales - weekReturns;
  }, [sales, returns]);

  const monthNet = useMemo(() => {
    const now = new Date();
    const isThisMonth = (dStr: string) => {
      const d = new Date(dStr);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
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
        <StatCard label="Gross Sales" value={PKR(grossRevenue)} hint="Total original sales" />
        <StatCard label="Total Refunds" value={PKR(totalRefunds)} tone="destructive" hint="Deducted returns" />
        <StatCard label="Net Revenue" value={PKR(netRevenue)} tone="success" hint="After returns" />
        <StatCard label="Outstanding" value={PKR(due)} tone={due > 0 ? "warning" : "default"} hint="Customer due" />
        <StatCard label="Today's Sales" value={PKR(todayNet)} tone="success" hint="Net sales today" />
        <StatCard label="This Week" value={PKR(weekNet)} tone="success" hint="Net sales this week" />
        <StatCard label="This Month" value={PKR(monthNet)} tone="success" hint="Net sales this month" />
      </div>

      <Card className="mt-5">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b mb-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={filterMode === "all" ? "default" : "outline"}
                onClick={() => setFilterMode("all")}
              >
                All Invoices ({sales.length})
              </Button>
              <Button
                size="sm"
                variant={filterMode === "udhaar" ? "destructive" : "outline"}
                className={filterMode === "udhaar" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                onClick={() => setFilterMode("udhaar")}
              >
                🔴 Udhaar / Credit Sales ({sales.filter((s) => Number(s.remaining_amount) > 0).length})
              </Button>
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              Showing {filtered.length} of {sales.length} invoices
            </div>
          </div>

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
                  <TableHead>Due Date</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Quick Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const phone = (s as unknown as { customer_phone?: string }).customer_phone;
                  const dueDateVal = (s as unknown as { due_date?: string }).due_date;
                  const isUdhaar = Number(s.remaining_amount) > 0;
                  const invoiceReturns = returns.filter((r) => r.sale_id === s.id || r.invoice_number === s.invoice_number);
                  const hasReturn = invoiceReturns.length > 0;
                  const refundedSum = invoiceReturns.reduce((sum, r) => sum + Number(r.refund_amount), 0);

                  return (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpen(s)}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span>{s.invoice_number}</span>
                            {hasReturn && (
                              <Badge variant="destructive" className="bg-red-600 text-white hover:bg-red-700 px-1.5 py-0 text-[10px]">
                                RETURNED
                              </Badge>
                            )}
                          </div>
                          {isUdhaar && (
                            <Badge variant="destructive" className="w-fit bg-red-600 text-white font-bold text-[9px] px-1 py-0">
                              UNPAID UDHAAR
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{new Date(s.created_at).toLocaleString()}</TableCell>
                      <TableCell className="font-medium">{s.customer_name || "Walk-in"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{phone || "—"}</TableCell>
                      <TableCell className="text-xs">{branches.find((b) => b.id === s.branch_id)?.city}</TableCell>
                      <TableCell className="text-right font-medium">
                        {PKR(s.total)}
                        {hasReturn && (
                          <span className="block text-[10px] text-destructive font-semibold">Ref: -{PKR(refundedSum)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isUdhaar ? (
                          <Badge variant="destructive" className="bg-red-600 text-white font-bold">{PKR(s.remaining_amount)}</Badge>
                        ) : (
                          <span className="text-xs text-emerald-600 font-semibold">Paid (Rs 0)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {dueDateVal ? (
                          <Badge variant="outline" className="font-medium text-amber-700 dark:text-amber-400">
                            {dueDateVal}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline">{s.payment_method}</Badge></TableCell>
                      <TableCell className="text-right flex items-center justify-end gap-1">
                        {isUdhaar && (
                          <>
                            <Button
                              size="xs"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPayModalSale(s);
                              }}
                            >
                              Mark Paid
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRescheduleSale(s);
                                setNewDueDate(dueDateVal || "");
                              }}
                            >
                              Reschedule
                            </Button>
                          </>
                        )}
                        <Button size="xs" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpen(s); }}>
                          <Printer className="mr-1 h-3.5 w-3.5" /> Print
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filtered.length && <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">No invoices found.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Invoice {open?.invoice_number}
              {open && returns.some((r) => r.sale_id === open.id || r.invoice_number === open.invoice_number) && (
                <Badge variant="destructive" className="bg-red-600 text-white text-xs">RETURNED</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
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

      {/* Mark Invoice Paid Dialog */}
      <Dialog open={!!payModalSale} onOpenChange={(v) => !v && setPayModalSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              Clear Udhaar & Mark Invoice Paid
            </DialogTitle>
          </DialogHeader>
          {payModalSale && (
            <div className="space-y-4 text-xs pt-2">
              <div className="rounded border bg-card p-3 space-y-1">
                <p><span className="font-semibold">Invoice #:</span> {payModalSale.invoice_number}</p>
                <p><span className="font-semibold">Customer:</span> {payModalSale.customer_name || "Walk-in"}</p>
                <p className="font-bold text-red-600 text-sm pt-1">
                  Outstanding Due to Clear: {PKR(payModalSale.remaining_amount)}
                </p>
              </div>
              <p className="text-muted-foreground">
                Marking this invoice paid will clear the remaining balance of {PKR(payModalSale.remaining_amount)} and log cash received in today's revenue.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayModalSale(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => void handleMarkPaid()}>
              Confirm Payment Received
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Due Date Dialog */}
      <Dialog open={!!rescheduleSale} onOpenChange={(v) => !v && setRescheduleSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule Promised Udhaar Due Date</DialogTitle>
          </DialogHeader>
          {rescheduleSale && (
            <div className="space-y-4 text-xs pt-2">
              <div className="rounded border bg-card p-3 space-y-1">
                <p><span className="font-semibold">Invoice #:</span> {rescheduleSale.invoice_number}</p>
                <p><span className="font-semibold">Customer:</span> {rescheduleSale.customer_name}</p>
                <p><span className="font-semibold">Current Due Date:</span> {(rescheduleSale as unknown as { due_date?: string }).due_date || "None"}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">New Promised Due Date *</Label>
                <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleSale(null)}>Cancel</Button>
            <Button className="bg-primary text-white" disabled={busy || !newDueDate} onClick={() => void handleRescheduleDueDate()}>
              Update Promised Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
