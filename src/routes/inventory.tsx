import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackagePlus, ArrowDownCircle, ArrowUpCircle, Search, History, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/lib/auth";
import { useMovements, useProducts, useReturns, useSaleItems, useSuppliers } from "@/lib/queries";
import { PKR, NUM, daysToExpiry, stockStatus, type Product } from "@/lib/pos";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory & Stock — Mian Ali Traders POS" },
      { name: "description", content: "Record new stock arrivals, adjust quantities and track stock value, expiry and single product ledgers per branch." },
      { property: "og:title", content: "Inventory & Stock — Mian Ali Traders POS" },
      { property: "og:description", content: "New inventory entry, live product search, product history ledgers and expiry tracking." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { activeBranch, profile, branches } = useAuth();
  const qc = useQueryClient();
  const { data: products = [] } = useProducts(activeBranch);
  const { data: suppliers = [] } = useSuppliers();
  const { data: movements = [] } = useMovements(activeBranch);
  const { data: saleItems = [] } = useSaleItems();
  const { data: returns = [] } = useReturns(activeBranch);

  // New stock entry states
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchEntryTerm, setSearchEntryTerm] = useState("");
  const [showEntryDropdown, setShowEntryDropdown] = useState(false);
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [supplierId, setSupplierId] = useState("none");
  const [note, setNote] = useState("");

  // Adjustment states
  const [selectedAdjustProduct, setSelectedAdjustProduct] = useState<Product | null>(null);
  const [searchAdjustTerm, setSearchAdjustTerm] = useState("");
  const [showAdjustDropdown, setShowAdjustDropdown] = useState(false);
  const [adjustQty, setAdjustQty] = useState(0);

  // Single Product History Modal state
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  const stockValueCost = products.reduce((a, p) => a + Number(p.purchase_price) * Number(p.stock_quantity), 0);
  const stockValueSale = products.reduce((a, p) => a + Number(p.selling_price) * Number(p.stock_quantity), 0);
  const low = products.filter((p) => stockStatus(p) === "low");
  const out = products.filter((p) => stockStatus(p) === "out");
  const expired = products.filter((p) => (daysToExpiry(p.expiry_date) ?? 1) < 0);
  const near = products.filter((p) => {
    const d = daysToExpiry(p.expiry_date);
    return d !== null && d >= 0 && d <= 90;
  });

  // Autocomplete suggestions for New Stock Entry
  const entrySuggestions = useMemo(() => {
    const q = searchEntryTerm.trim().toLowerCase();
    if (!q) return products.slice(0, 15);
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.generic_name && p.generic_name.toLowerCase().includes(q)) ||
        (p.company && p.company.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [products, searchEntryTerm]);

  // Autocomplete suggestions for Adjustment
  const adjustSuggestions = useMemo(() => {
    const q = searchAdjustTerm.trim().toLowerCase();
    if (!q) return products.slice(0, 15);
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.generic_name && p.generic_name.toLowerCase().includes(q)) ||
        (p.company && p.company.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [products, searchAdjustTerm]);

  const addStock = async () => {
    if (!selectedProduct || qty <= 0) {
      toast.error("Select a product and enter a valid quantity");
      return;
    }
    const p = selectedProduct;
    const branchId = p.branch_id;
    const { error: e1 } = await supabase
      .from("products")
      .update({ stock_quantity: Number(p.stock_quantity) + qty, ...(price > 0 ? { purchase_price: price } : {}) })
      .eq("id", p.id);
    const { error: e2 } = await supabase.from("stock_movements").insert({
      product_id: p.id,
      branch_id: branchId,
      movement_type: "purchase",
      quantity: qty,
      purchase_price: price || Number(p.purchase_price),
      supplier_id: supplierId === "none" ? null : supplierId,
      note: note || null,
    });
    if (e1 || e2) {
      toast.error(e1?.message ?? e2?.message ?? "Failed to record stock arrival");
      return;
    }
    toast.success(`Stock arrival recorded for ${p.name}`);
    setSelectedProduct(null);
    setSearchEntryTerm("");
    setQty(0);
    setPrice(0);
    setNote("");
    void qc.invalidateQueries();
  };

  const adjust = async (dir: 1 | -1) => {
    if (!selectedAdjustProduct || adjustQty <= 0) {
      toast.error("Select a product and enter quantity");
      return;
    }
    const p = selectedAdjustProduct;
    const next = Number(p.stock_quantity) + dir * adjustQty;
    if (next < 0) {
      toast.error("Stock quantity cannot go below zero");
      return;
    }
    await supabase.from("products").update({ stock_quantity: next }).eq("id", p.id);
    await supabase.from("stock_movements").insert({
      product_id: p.id,
      branch_id: p.branch_id,
      movement_type: dir === 1 ? "adjustment_in" : "adjustment_out",
      quantity: dir * adjustQty,
      note: "Manual stock adjustment",
    });
    toast.success(`Stock adjusted for ${p.name}`);
    setSelectedAdjustProduct(null);
    setSearchAdjustTerm("");
    setAdjustQty(0);
    void qc.invalidateQueries();
  };

  const prodName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

  // Product History Data Calculation
  const historyData = useMemo(() => {
    if (!historyProduct) return null;
    const pId = historyProduct.id;

    const prodMovements = movements.filter((m) => m.product_id === pId);
    const prodSales = saleItems.filter((i) => i.product_id === pId);
    const prodReturns = returns.filter((r) => r.product_id === pId);

    const totalPurchased = prodMovements
      .filter((m) => m.movement_type === "purchase" || m.movement_type === "adjustment_in")
      .reduce((sum, m) => sum + Number(m.quantity), 0);

    const totalSold = prodSales.reduce((sum, s) => sum + Number(s.quantity), 0);
    const totalReturned = prodReturns.reduce((sum, r) => sum + Number(r.quantity), 0);

    const timeline: Array<{
      id: string;
      date: string;
      type: "purchase" | "sale" | "return" | "adjustment_in" | "adjustment_out";
      qty: number;
      price: number;
      ref: string;
    }> = [];

    prodMovements.forEach((m) => {
      timeline.push({
        id: `mov-${m.id}`,
        date: m.created_at,
        type: m.movement_type as never,
        qty: Number(m.quantity),
        price: Number(m.purchase_price) || 0,
        ref: m.reference || m.note || "Stock Movement",
      });
    });

    prodSales.forEach((s) => {
      timeline.push({
        id: `sale-${s.id}`,
        date: s.created_at,
        type: "sale",
        qty: -Number(s.quantity),
        price: Number(s.price),
        ref: "Counter Sale",
      });
    });

    prodReturns.forEach((r) => {
      timeline.push({
        id: `ret-${r.id}`,
        date: r.created_at,
        type: "return",
        qty: Number(r.quantity),
        price: Number(r.unit_price),
        ref: `Return: ${r.invoice_number}`,
      });
    });

    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      totalPurchased,
      totalSold,
      totalReturned,
      currentStock: Number(historyProduct.stock_quantity),
      timeline,
    };
  }, [historyProduct, movements, saleItems, returns]);

  return (
    <AppShell title="Inventory" subtitle="Stock levels, live autocomplete search, entry and product ledgers">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stock Value (cost)" value={PKR(stockValueCost)} />
        <StatCard label="Stock Value (retail)" value={PKR(stockValueSale)} tone="success" />
        <StatCard label="Low Stock" value={low.length} tone="warning" />
        <StatCard label="Out of Stock" value={out.length} tone="destructive" />
        <StatCard label="Expired Items" value={expired.length} tone="destructive" />
        <StatCard label="Near Expiry (90d)" value={near.length} tone="warning" />
        <StatCard label="Total SKUs" value={products.length} />
        <StatCard label="Potential Profit" value={PKR(stockValueSale - stockValueCost)} tone="success" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Live Searchable New Stock Arrival Card */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">New Inventory Entry</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2 relative">
              <Label className="text-xs">Product (Live Search by Name, Company, Barcode)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Type medicine name, company or barcode..."
                  className="pl-9"
                  value={searchEntryTerm}
                  onFocus={() => setShowEntryDropdown(true)}
                  onChange={(e) => {
                    setSearchEntryTerm(e.target.value);
                    setSelectedProduct(null);
                    setShowEntryDropdown(true);
                  }}
                />
              </div>

              {showEntryDropdown && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
                  {entrySuggestions.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProduct(p);
                        setSearchEntryTerm(p.name);
                        setPrice(Number(p.purchase_price));
                        setShowEntryDropdown(false);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded p-2 text-xs hover:bg-accent"
                    >
                      <div>
                        <p className="font-medium text-foreground">{p.name}</p>
                        <p className="text-muted-foreground">{p.company || "General"} · {p.category || "Item"}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">{NUM(p.stock_quantity)} {p.unit}</Badge>
                        <p className="text-[10px] text-muted-foreground">{PKR(p.purchase_price)}</p>
                      </div>
                    </div>
                  ))}
                  {!entrySuggestions.length && <p className="p-3 text-center text-xs text-muted-foreground">No matching products found.</p>}
                </div>
              )}

              {selectedProduct && (
                <div className="flex items-center justify-between rounded bg-primary/10 p-2 text-xs text-primary font-medium">
                  <span>Selected: {selectedProduct.name} (Stock: {NUM(selectedProduct.stock_quantity)})</span>
                  <Check className="h-4 w-4" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Quantity received</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Purchase price (unit cost)</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supplier</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note / Reference</Label>
              <Input placeholder="e.g. Invoice #901" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button className="sm:col-span-2" onClick={() => void addStock()}>
              <PackagePlus className="mr-2 h-4 w-4" /> Record stock arrival
            </Button>
          </CardContent>
        </Card>

        {/* Live Searchable Stock Adjustment Card */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Stock Adjustment</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2 relative">
              <Label className="text-xs">Product (Live Search)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Type product name to adjust stock..."
                  className="pl-9"
                  value={searchAdjustTerm}
                  onFocus={() => setShowAdjustDropdown(true)}
                  onChange={(e) => {
                    setSearchAdjustTerm(e.target.value);
                    setSelectedAdjustProduct(null);
                    setShowAdjustDropdown(true);
                  }}
                />
              </div>

              {showAdjustDropdown && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
                  {adjustSuggestions.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedAdjustProduct(p);
                        setSearchAdjustTerm(p.name);
                        setShowAdjustDropdown(false);
                      }}
                      className="flex cursor-pointer items-center justify-between rounded p-2 text-xs hover:bg-accent"
                    >
                      <div>
                        <p className="font-medium text-foreground">{p.name}</p>
                        <p className="text-muted-foreground">{p.company || "General"}</p>
                      </div>
                      <Badge variant="outline">{NUM(p.stock_quantity)} {p.unit}</Badge>
                    </div>
                  ))}
                  {!adjustSuggestions.length && <p className="p-3 text-center text-xs text-muted-foreground">No products found.</p>}
                </div>
              )}

              {selectedAdjustProduct && (
                <div className="flex items-center justify-between rounded bg-primary/10 p-2 text-xs text-primary font-medium">
                  <span>Selected: {selectedAdjustProduct.name} (Stock: {NUM(selectedAdjustProduct.stock_quantity)})</span>
                  <Check className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Adjustment Quantity</Label>
              <Input type="number" min={1} value={adjustQty} onChange={(e) => setAdjustQty(Number(e.target.value) || 0)} />
            </div>
            <Button variant="outline" onClick={() => void adjust(1)}><ArrowUpCircle className="mr-2 h-4 w-4" /> Increase Stock</Button>
            <Button variant="outline" onClick={() => void adjust(-1)}><ArrowDownCircle className="mr-2 h-4 w-4" /> Decrease Stock</Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stock" className="mt-5">
        <TabsList>
          <TabsTrigger value="stock">Current Stock</TabsTrigger>
          <TabsTrigger value="expiry">Expiry Watch</TabsTrigger>
          <TabsTrigger value="movements">Stock Movement Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <Card><CardContent className="overflow-x-auto p-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Product</TableHead><TableHead>Branch</TableHead>
                <TableHead className="text-right">Available</TableHead><TableHead className="text-right">Cost value</TableHead>
                <TableHead className="text-right">Retail value</TableHead><TableHead>Status</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs">{branches.find((b) => b.id === p.branch_id)?.city}</TableCell>
                    <TableCell className="text-right">{NUM(p.stock_quantity)} {p.unit}</TableCell>
                    <TableCell className="text-right">{PKR(Number(p.purchase_price) * Number(p.stock_quantity))}</TableCell>
                    <TableCell className="text-right">{PKR(Number(p.selling_price) * Number(p.stock_quantity))}</TableCell>
                    <TableCell>
                      <Badge variant={stockStatus(p) === "out" ? "destructive" : stockStatus(p) === "low" ? "secondary" : "outline"}>
                        {stockStatus(p) === "out" ? "Out of stock" : stockStatus(p) === "low" ? "Low" : "In stock"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setHistoryProduct(p)}>
                        <History className="mr-1 h-3.5 w-3.5 text-primary" /> History
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="expiry">
          <Card><CardContent className="overflow-x-auto p-4">
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead>Expiry</TableHead><TableHead className="text-right">Days left</TableHead><TableHead className="text-right">Stock</TableHead></TableRow></TableHeader>
              <TableBody>
                {[...expired, ...near].map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.batch_number ?? "—"}</TableCell>
                    <TableCell>{p.expiry_date}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={(daysToExpiry(p.expiry_date) ?? 0) < 0 ? "destructive" : "secondary"}>{daysToExpiry(p.expiry_date)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{NUM(p.stock_quantity)}</TableCell>
                  </TableRow>
                ))}
                {![...expired, ...near].length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No expiring items in the next 90 days.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card><CardContent className="overflow-x-auto p-4">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{new Date(m.created_at).toLocaleString()}</TableCell>
                    <TableCell className="font-medium">{prodName(m.product_id)}</TableCell>
                    <TableCell><Badge variant="outline">{m.movement_type.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right">{NUM(m.quantity)}</TableCell>
                    <TableCell className="text-xs">{m.reference ?? m.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {!movements.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No stock movement yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Single Product History Ledger Modal */}
      <Dialog open={!!historyProduct} onOpenChange={(v) => !v && setHistoryProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> Product Stock History — {historyProduct?.name}
            </DialogTitle>
          </DialogHeader>

          {historyProduct && historyData && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-md border bg-card p-3">
                  <p className="text-muted-foreground">Stock Received</p>
                  <p className="text-lg font-bold text-emerald-600">+{NUM(historyData.totalPurchased)}</p>
                </div>
                <div className="rounded-md border bg-card p-3">
                  <p className="text-muted-foreground">Total Sold</p>
                  <p className="text-lg font-bold text-blue-600">-{NUM(historyData.totalSold)}</p>
                </div>
                <div className="rounded-md border bg-card p-3">
                  <p className="text-muted-foreground">Total Returned</p>
                  <p className="text-lg font-bold text-amber-600">+{NUM(historyData.totalReturned)}</p>
                </div>
                <div className="rounded-md border bg-card p-3">
                  <p className="text-muted-foreground">Current Stock</p>
                  <p className="text-lg font-bold text-foreground">{NUM(historyData.currentStock)} {historyProduct.unit}</p>
                </div>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Event Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Rate</TableHead>
                      <TableHead>Reference / Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyData.timeline.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground">{new Date(row.date).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={row.type === "sale" ? "secondary" : row.type === "purchase" ? "default" : "outline"}>
                            {row.type.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${row.qty > 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {row.qty > 0 ? `+${NUM(row.qty)}` : NUM(row.qty)}
                        </TableCell>
                        <TableCell className="text-right">{PKR(row.price)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.ref}</TableCell>
                      </TableRow>
                    ))}
                    {!historyData.timeline.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                          No history events recorded for this product yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
