import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Search, RotateCcw, Download, CheckCircle2 } from "lucide-react";
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
    return sales.filter((s) => s.invoice_number.toLowerCase().includes(q) || (s.customer_name && s.customer_name.toLowerCase().includes(q)));
  }, [sales, searchInvoice]);

  const itemsForSelectedSale = useMemo(() => {
    if (!selectedSale) return [];
    return saleItems.filter((i) => i.sales?.branch_id === selectedSale.branch_id && i.sales?.created_at === selectedSale.created_at);
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

  const totalRefundsValue = useMemo(() => returns.reduce((sum, r) => sum + Number(r.refund_amount), 0), [returns]);

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
          <StatCard title="Total Return Transactions" value={returns.length} sub="Returned items count" />
          <StatCard title="Total Refunded Amount" value={PKR(totalRefundsValue)} sub="Deducted from revenue" />
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-5">
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
                    placeholder="Enter Invoice # (e.g. INV-...) or Customer Name"
                    className="pl-9"
                    value={searchInvoice}
                    onChange={(e) => setSearchInvoice(e.target.value)}
                  />
                </div>
              </div>

              {searchInvoice.trim() && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
                  {filteredSales.map((s) => (
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
                        <p className="text-xs text-muted-foreground">{s.customer_name || "Walk-in Customer"}</p>
                      </div>
                      <Badge variant="outline">{PKR(s.total)}</Badge>
                    </button>
                  ))}
                  {!filteredSales.length && <p className="p-2 text-center text-xs text-muted-foreground">No matching invoices found.</p>}
                </div>
              )}

              {selectedSale && (
                <div className="rounded-md border bg-card p-3 space-y-3">
                  <div className="flex justify-between border-b pb-2 text-xs">
                    <span className="font-medium text-foreground">Selected Invoice: {selectedSale.invoice_number}</span>
                    <span className="text-muted-foreground">{new Date(selectedSale.created_at).toLocaleDateString()}</span>
                  </div>

                  <p className="text-xs font-semibold text-muted-foreground">Select Product to Return:</p>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {itemsForSelectedSale.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleSelectProductToReturn(item)}
                        className={`flex cursor-pointer items-center justify-between rounded-md border p-2 text-xs transition-colors ${
                          selectedItem?.id === item.id ? "border-primary bg-primary/5" : "hover:bg-accent"
                        }`}
                      >
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-muted-foreground">Qty Sold: {item.quantity} · Rate: {PKR(item.price)}</p>
                        </div>
                        {selectedItem?.id === item.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                    ))}
                    {!itemsForSelectedSale.length && <p className="text-xs text-muted-foreground">No line items recorded for this invoice.</p>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-7">
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

      <Dialog open={!!selectedItem} onOpenChange={(v) => !v && setSelectedItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Return — {selectedItem?.product_name}</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 pt-2">
              <div className="rounded-md bg-muted p-3 text-xs space-y-1">
                <p><strong>Original Invoice:</strong> {selectedSale?.invoice_number}</p>
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
                  placeholder="e.g. Expired medicine, Customer returned damaged box"
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
