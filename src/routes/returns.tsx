import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Search, RotateCcw, Download, Undo2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/lib/auth";
import { useReturns, useSaleItems, useSales } from "@/lib/queries";
import { PKR, NUM, exportRows } from "@/lib/pos";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/returns")({
  head: () => ({
    meta: [
      { title: "Returns & Refunds — Mian Ali Traders POS" },
      { name: "description", content: "Process product returns, refund cash to customers and automatically restore stock quantities." },
      { property: "og:title", content: "Returns & Refunds — Mian Ali Traders POS" },
      { property: "og:description", content: "Item returns management, stock restoration and refund tracking for medical stores." },
    ],
  }),
  component: ReturnsPage,
});

function ReturnsPage() {
  const { activeBranch, branches } = useAuth();
  const qc = useQueryClient();

  const { data: sales = [] } = useSales(activeBranch);
  const { data: saleItems = [] } = useSaleItems();
  const { data: returns = [], isLoading } = useReturns(activeBranch);

  const [searchInvoice, setSearchInvoice] = useState("");
  const [selectedSale, setSelectedSale] = useState<typeof sales[0] | null>(null);
  const [selectedItem, setSelectedItem] = useState<{ id: string; product_id: string | null; product_name: string; quantity: number; price: number } | null>(null);
  
  const [returnQty, setReturnQty] = useState(1);
  const [refundPrice, setRefundPrice] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [logSearch, setLogSearch] = useState("");

  const filteredSales = useMemo(() => {
    const q = searchInvoice.trim().toLowerCase();
    if (!q) return [];
    return sales.filter((s) => {
      const phone = (s as unknown as { customer_phone?: string }).customer_phone ?? "";
      return s.invoice_number.toLowerCase().includes(q) ||
        (s.customer_name && s.customer_name.toLowerCase().includes(q)) ||
        phone.toLowerCase().includes(q);
    });
  }, [sales, searchInvoice]);

  const itemsForSelectedSale = useMemo(() => {
    if (!selectedSale) return [];
    return saleItems.filter((i) => (i as unknown as { sale_id: string }).sale_id === selectedSale.id || (i.sales?.branch_id === selectedSale.branch_id && i.sales?.created_at === selectedSale.created_at));
  }, [saleItems, selectedSale]);

  const handleSelectProductToReturn = (item: typeof saleItems[0]) => {
    setSelectedItem(item);
    setReturnQty(1);
    setRefundPrice(Number(item.price));
  };

  const handleProcessReturn = async () => {
    if (!selectedSale || !selectedItem || !selectedItem.product_id) {
      toast.error("Please select a valid product to return");
      return;
    }
    if (returnQty <= 0 || returnQty > selectedItem.quantity) {
      toast.error(`Return quantity must be between 1 and ${selectedItem.quantity}`);
      return;
    }

    setBusy(true);
    const totalRefund = returnQty * refundPrice;
    const args = {
      _sale_id: selectedSale.id,
      _invoice_number: selectedSale.invoice_number,
      _branch_id: selectedSale.branch_id,
      _product_id: selectedItem.product_id,
      _product_name: selectedItem.product_name,
      _quantity: returnQty,
      _unit_price: refundPrice,
      _refund_amount: totalRefund,
      _reason: reason || "Customer return",
    };

    const { error } = await supabase.rpc("process_return", args as never);
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Successfully returned ${returnQty} x ${selectedItem.product_name}`);
    void qc.invalidateQueries({ queryKey: ["sales_returns"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["movements"] });
    void qc.invalidateQueries({ queryKey: ["sales"] });

    setSelectedItem(null);
    setReason("");
  };

  // Financial 7-Card Calculations
  const grossRevenue = useMemo(() => sales.reduce((sum, s) => sum + Number(s.total), 0), [sales]);
  const totalRefundsValue = useMemo(() => returns.reduce((sum, r) => sum + Number(r.refund_amount), 0), [returns]);
  const netRevenue = grossRevenue - totalRefundsValue;
  const totalOutstanding = useMemo(() => sales.reduce((sum, s) => sum + Number(s.remaining_amount), 0), [sales]);

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

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return returns;
    return returns.filter(
      (r) => r.invoice_number.toLowerCase().includes(q) || r.product_name.toLowerCase().includes(q) || (r.reason && r.reason.toLowerCase().includes(q))
    );
  }, [returns, logSearch]);

  const handleExport = () => {
    exportRows(
      filteredLogs.map((r) => ({
        "Invoice #": r.invoice_number,
        Date: new Date(r.created_at).toLocaleString(),
        "Product Name": r.product_name,
        "Returned Qty": NUM(r.quantity),
        "Unit Price": r.unit_price,
        "Refund Amount": r.refund_amount,
        Reason: r.reason || "N/A",
        Branch: branches.find((b) => b.id === r.branch_id)?.name || "Unknown",
      })),
      `sales_returns_${activeBranch}`
    );
  };

  return (
    <AppShell title="Returns & Refunds" subtitle="Process product returns, restore stock levels and track cash refunds">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Total Return Transactions" value={returns.length} hint="Returned items count" />
          <StatCard label="Total Refunded Amount" value={PKR(totalRefundsValue)} tone="destructive" hint="Deducted cash refunds" />
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Invoice Search & Return Processing Column */}
          <Card className="lg:col-span-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <RotateCcw className="h-5 w-5 text-primary" /> Process Item Return
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Search Original Invoice</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Enter Invoice #, Customer Name, or Phone Number"
                    className="pl-9"
                    value={searchInvoice}
                    onChange={(e) => setSearchInvoice(e.target.value)}
                  />
                </div>
              </div>

              {searchInvoice.trim() && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
                  {filteredSales.map((s) => {
                    const phone = (s as unknown as { customer_phone?: string }).customer_phone;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSale(s);
                          setSelectedItem(null);
                        }}
                        className={`flex w-full items-center justify-between rounded p-2 text-left transition-colors ${
                          selectedSale?.id === s.id ? "bg-primary/10 font-medium text-primary" : "hover:bg-accent"
                        }`}
                      >
                        <div>
                          <p className="font-semibold">{s.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">{s.customer_name || "Walk-in"}{phone ? ` · ${phone}` : ""}</p>
                        </div>
                        <Badge variant="outline">{PKR(s.total)}</Badge>
                      </button>
                    );
                  })}
                  {!filteredSales.length && <p className="p-2 text-center text-xs text-muted-foreground">No matching invoices found.</p>}
                </div>
              )}

              {/* Full Original Digital Invoice Preview Card */}
              {selectedSale && (
                <div className="rounded-md border bg-card p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-1.5">
                        <Receipt className="h-4 w-4 text-primary" /> Invoice {selectedSale.invoice_number}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {branches.find((b) => b.id === selectedSale.branch_id)?.name} · {new Date(selectedSale.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="secondary">Original Invoice</Badge>
                  </div>

                  <div className="rounded bg-muted/50 p-2 text-xs grid grid-cols-2 gap-2">
                    <p><strong>Customer:</strong> {selectedSale.customer_name || "Walk-in Customer"}</p>
                    <p><strong>Phone:</strong> {(selectedSale as unknown as { customer_phone?: string }).customer_phone || "—"}</p>
                    <p><strong>Payment Method:</strong> {selectedSale.payment_method}</p>
                    <p><strong>Discount Given:</strong> {PKR(selectedSale.discount)}</p>
                  </div>

                  <p className="text-xs font-semibold text-muted-foreground pt-1">Purchased Line Items:</p>

                  <div className="rounded border overflow-x-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Name</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemsForSelectedSale.map((item) => {
                          const returnedSoFar = returns
                            .filter(
                              (r) =>
                                (r.sale_id === selectedSale.id || r.invoice_number === selectedSale.invoice_number) &&
                                (r.product_id === item.product_id || r.product_name === item.product_name)
                            )
                            .reduce((sum, r) => sum + Number(r.quantity), 0);

                          const remainingReturnable = Math.max(0, Number(item.quantity) - returnedSoFar);

                          return (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.product_name}</TableCell>
                              <TableCell className="text-right">
                                {item.quantity}
                                {returnedSoFar > 0 && (
                                  <span className="block text-[10px] text-muted-foreground">Ret: {returnedSoFar}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">{PKR(item.price)}</TableCell>
                              <TableCell className="text-right font-semibold">{PKR(item.line_total)}</TableCell>
                              <TableCell className="text-right">
                                {remainingReturnable <= 0 ? (
                                  <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive text-[10px]">
                                    Already Returned
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 px-2 text-xs"
                                    onClick={() =>
                                      handleSelectProductToReturn({
                                        ...item,
                                        quantity: remainingReturnable,
                                      })
                                    }
                                  >
                                    <Undo2 className="mr-1 h-3 w-3" /> Return ({remainingReturnable})
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {!itemsForSelectedSale.length && (
                          <TableRow>
                            <TableCell colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                              No items recorded for this invoice.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-between border-t pt-2 text-xs font-medium">
                    <span>Subtotal: {PKR(selectedSale.subtotal)}</span>
                    <span>Paid: {PKR(selectedSale.paid_amount)}</span>
                    <span className="text-destructive">Due: {PKR(selectedSale.remaining_amount)}</span>
                    <span className="font-bold text-sm">Total: {PKR(selectedSale.total)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Returns History Log Column */}
          <Card className="lg:col-span-6">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold">Returns History & Log</CardTitle>
              <Button size="sm" variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> Export Excel
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter return history by invoice, product or reason..."
                  className="pl-9"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                />
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Refund Total</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.invoice_number}</TableCell>
                        <TableCell>{r.product_name}</TableCell>
                        <TableCell className="text-right">{NUM(r.quantity)}</TableCell>
                        <TableCell className="text-right font-semibold text-destructive">{PKR(r.refund_amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.reason || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                    {!filteredLogs.length && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          {isLoading ? "Loading returns..." : "No returns processed yet."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Return Action Confirmation Modal */}
      <Dialog open={!!selectedItem} onOpenChange={(v) => !v && setSelectedItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Return — {selectedItem?.product_name}</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 pt-2">
              <div className="rounded-md bg-muted p-3 text-xs space-y-1">
                <p><strong>Original Invoice:</strong> {selectedSale?.invoice_number}</p>
                <p><strong>Customer Name:</strong> {selectedSale?.customer_name || "Walk-in Customer"}</p>
                <p><strong>Max Quantity Sold:</strong> {selectedItem.quantity}</p>
                <p><strong>Original Unit Rate:</strong> {PKR(selectedItem.price)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Return Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    max={selectedItem.quantity}
                    value={returnQty}
                    onChange={(e) => setReturnQty(Math.min(selectedItem.quantity, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Refund Rate / Item</Label>
                  <Input
                    type="number"
                    value={refundPrice}
                    onChange={(e) => setRefundPrice(Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="rounded-md border p-3 text-right">
                <p className="text-xs text-muted-foreground">Total Refund Amount</p>
                <p className="text-lg font-bold text-destructive">{PKR(returnQty * refundPrice)}</p>
              </div>

              <div className="space-y-1.5">
                <Label>Return Reason / Note</Label>
                <Textarea
                  rows={2}
                  placeholder="e.g. Panadol box returned undamaged"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedItem(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" disabled={busy} onClick={handleProcessReturn}>
                  Confirm Return & Restock
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
