import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackagePlus, ArrowDownCircle, ArrowUpCircle, Search, History, Check, FileText, Printer, Download, ArrowRightLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/lib/auth";
import { useMovements, useProducts, useProductBatches, useReturns, useSaleItems, useStockTransfers, useSuppliers } from "@/lib/queries";
import { PKR, NUM, exportRows, daysToExpiry, stockStatus, type Product } from "@/lib/pos";
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
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [supplierId, setSupplierId] = useState("none");
  const [note, setNote] = useState("");

  const { data: batches = [] } = useProductBatches(activeBranch);

  // Adjustment states
  const [selectedAdjustProduct, setSelectedAdjustProduct] = useState<Product | null>(null);
  const [searchAdjustTerm, setSearchAdjustTerm] = useState("");
  const [showAdjustDropdown, setShowAdjustDropdown] = useState(false);
  const [adjustQty, setAdjustQty] = useState(0);

  // Single Product History Modal state
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  // Supplier Order Sheet Modal state
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  // Store Transfer states
  const { data: stockTransfers = [] } = useStockTransfers();
  const [trfFromBranch, setTrfFromBranch] = useState(branches[0]?.id ?? "");
  const [trfToBranch, setTrfToBranch] = useState(branches[1]?.id ?? "");
  const [trfProduct, setTrfProduct] = useState<Product | null>(null);
  const [trfSearch, setTrfSearch] = useState("");
  const [trfShowDropdown, setTrfShowDropdown] = useState(false);
  const [trfQty, setTrfQty] = useState(1);
  const [trfNotes, setTrfNotes] = useState("");
  const [trfBusy, setTrfBusy] = useState(false);

  const sourceBranchProducts = useMemo(() => {
    return products.filter((p) => trfFromBranch === "all" || p.branch_id === trfFromBranch);
  }, [products, trfFromBranch]);

  const trfSuggestions = useMemo(() => {
    const q = trfSearch.trim().toLowerCase();
    if (!q) return sourceBranchProducts.slice(0, 6);
    return sourceBranchProducts.filter((p) =>
      [p.name, p.company, p.category, p.barcode].some((f) => (f ?? "").toLowerCase().includes(q)),
    ).slice(0, 6);
  }, [sourceBranchProducts, trfSearch]);

  const handleExecuteTransfer = async () => {
    if (!trfProduct || trfQty <= 0) {
      toast.error("Select a product and valid transfer quantity");
      return;
    }
    if (trfFromBranch === trfToBranch) {
      toast.error("Source and target branches must be different");
      return;
    }
    if (Number(trfProduct.stock_quantity) < trfQty) {
      toast.error(`Insufficient stock in source branch (Available: ${trfProduct.stock_quantity})`);
      return;
    }

    setTrfBusy(true);
    const { error } = await supabase.rpc("process_stock_transfer", {
      _from_branch_id: trfFromBranch,
      _to_branch_id: trfToBranch,
      _product_id: trfProduct.id,
      _quantity: trfQty,
      _notes: trfNotes || null,
    });

    setTrfBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    const fromName = branches.find((b) => b.id === trfFromBranch)?.name ?? "Source";
    const toName = branches.find((b) => b.id === trfToBranch)?.name ?? "Target";
    toast.success(`Transferred ${trfQty} ${trfProduct.unit} of ${trfProduct.name} from ${fromName} to ${toName}`);

    setTrfProduct(null);
    setTrfSearch("");
    setTrfQty(1);
    setTrfNotes("");
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["movements"] });
    void qc.invalidateQueries({ queryKey: ["stock_transfers"] });
  };

  const stockValueCost = products.reduce((a, p) => a + Number(p.purchase_price) * Number(p.stock_quantity), 0);
  const stockValueSale = products.reduce((a, p) => a + Number(p.selling_price) * Number(p.stock_quantity), 0);
  const low = products.filter((p) => stockStatus(p) === "low");
  const out = products.filter((p) => stockStatus(p) === "out");
  const expired = products.filter((p) => (daysToExpiry(p.expiry_date) ?? 1) < 0);
  const near = products.filter((p) => {
    const d = daysToExpiry(p.expiry_date);
    return d !== null && d >= 0 && d <= 90;
  });

  const supplierOrderList = useMemo(() => {
    const reorderItems = products.filter((p) => Number(p.stock_quantity) <= Number(p.low_stock_level));
    const grouped = new Map<string, Array<{ product: Product; reorderQty: number; estCost: number }>>();

    reorderItems.forEach((p) => {
      const companyKey = p.company || p.brand || "General Medicines";
      const targetStock = Math.max(10, Number(p.low_stock_level) * 3);
      const reorderQty = Math.max(1, targetStock - Math.max(0, Number(p.stock_quantity)));
      const estCost = reorderQty * Number(p.purchase_price);

      const existing = grouped.get(companyKey) ?? [];
      existing.push({ product: p, reorderQty, estCost });
      grouped.set(companyKey, existing);
    });

    return grouped;
  }, [products]);

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
      note: note || (batchNumber ? `Batch: ${batchNumber}` : null),
    });

    // Record batch entry
    await supabase.from("product_batches").insert({
      product_id: p.id,
      branch_id: branchId,
      batch_number: batchNumber.trim() || ("B-" + Math.floor(Math.random() * 90000 + 10000)),
      expiry_date: expiryDate || null,
      purchase_price: price || Number(p.purchase_price),
      selling_price: Number(p.selling_price),
      stock_quantity: qty,
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
    setBatchNumber("");
    setExpiryDate("");
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
    <AppShell
      title="Inventory"
      subtitle="Stock levels, live autocomplete search, entry and product ledgers"
      actions={
        <Button size="sm" variant="default" className="bg-primary" onClick={() => setOrderModalOpen(true)}>
          <FileText className="mr-2 h-4 w-4" /> Generate Supplier Order Sheet
        </Button>
      }
    >
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
              <Label className="text-xs">Batch Number (Optional)</Label>
              <Input placeholder="e.g. B-101" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expiry Date (Optional)</Label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
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

        {/* Store to Store Stock Transfer Card */}
        <Card className="lg:col-span-2 border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" /> Store to Store Stock Transfer (Multi-Branch)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Source Branch (From)</Label>
              <Select value={trfFromBranch} onValueChange={setTrfFromBranch}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.city})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Destination Branch (To)</Label>
              <Select value={trfToBranch} onValueChange={setTrfToBranch}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.city})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2 relative">
              <Label className="text-xs">Product to Transfer</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search medicine name in source branch..."
                  className="pl-9"
                  value={trfSearch}
                  onFocus={() => setTrfShowDropdown(true)}
                  onChange={(e) => {
                    setTrfSearch(e.target.value);
                    setTrfProduct(null);
                    setTrfShowDropdown(true);
                  }}
                />
              </div>

              {trfShowDropdown && !trfProduct && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                  {trfSuggestions.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setTrfProduct(p);
                        setTrfSearch(p.name);
                        setTrfShowDropdown(false);
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
                  {!trfSuggestions.length && <p className="p-3 text-center text-xs text-muted-foreground">No products in source branch.</p>}
                </div>
              )}

              {trfProduct && (
                <div className="mt-1 flex items-center justify-between rounded bg-primary/10 p-2 text-xs text-primary font-medium">
                  <span>Selected: {trfProduct.name} (Source Stock: {NUM(trfProduct.stock_quantity)} {trfProduct.unit})</span>
                  <Check className="h-4 w-4" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Transfer Quantity</Label>
              <Input type="number" min={1} value={trfQty} onChange={(e) => setTrfQty(Number(e.target.value) || 1)} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Transfer Note / Reference</Label>
              <Input placeholder="e.g. Urgent stock transfer to Kasur" value={trfNotes} onChange={(e) => setTrfNotes(e.target.value)} />
            </div>

            <div className="flex items-end">
              <Button className="w-full bg-primary" disabled={trfBusy} onClick={() => void handleExecuteTransfer()}>
                <ArrowRightLeft className="mr-2 h-4 w-4" /> Execute Store Transfer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stock" className="mt-5">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="stock">Current Stock</TabsTrigger>
          <TabsTrigger value="expiry">Expiry Watch</TabsTrigger>
          <TabsTrigger value="movements">Stock Movement Logs</TabsTrigger>
          <TabsTrigger value="transfers">
            <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" /> Inter-Branch Transfers ({stockTransfers.length})
          </TabsTrigger>
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

        <TabsContent value="transfers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Inter-Branch Stock Transfer Financial Ledger</CardTitle>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  exportRows(
                    stockTransfers.map((t) => ({
                      "Transfer #": t.transfer_number,
                      Date: new Date(t.created_at).toLocaleString(),
                      "From Branch": branches.find((b) => b.id === t.from_branch_id)?.name ?? "—",
                      "To Branch": branches.find((b) => b.id === t.to_branch_id)?.name ?? "—",
                      Product: t.product_name,
                      Quantity: Number(t.quantity),
                      "Unit Cost (Rs)": Number(t.unit_cost),
                      "Total Value (Rs)": Number(t.total_value),
                      Notes: t.notes ?? "—",
                    })),
                    "inter_branch_stock_transfers_ledger",
                  )
                }
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export Ledger
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto p-4">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Transfer #</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>From Branch</TableHead>
                    <TableHead>To Branch</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="text-right">Qty Transferred</TableHead>
                    <TableHead className="text-right">Unit Rate</TableHead>
                    <TableHead className="text-right font-bold">Total Transfer Value</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockTransfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-semibold text-primary">{t.transfer_number}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{branches.find((b) => b.id === t.from_branch_id)?.name}</Badge></TableCell>
                      <TableCell><Badge variant="default" className="bg-emerald-600 text-white">{branches.find((b) => b.id === t.to_branch_id)?.name}</Badge></TableCell>
                      <TableCell className="font-medium">{t.product_name}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-700">+{NUM(t.quantity)}</TableCell>
                      <TableCell className="text-right">{PKR(t.unit_cost)}</TableCell>
                      <TableCell className="text-right font-bold text-foreground">{PKR(t.total_value)}</TableCell>
                      <TableCell className="text-muted-foreground">{t.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!stockTransfers.length && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                        No inter-branch stock transfers recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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

              {/* Active Batches Breakdown */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-foreground">Active Batches Breakdown (FEFO Order):</p>
                <div className="rounded-md border overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch #</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead className="text-right">Available Qty</TableHead>
                        <TableHead className="text-right">Purchase Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batches
                        .filter((b) => b.product_id === historyProduct.id && b.stock_quantity > 0)
                        .map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium">{b.batch_number || "Standard"}</TableCell>
                            <TableCell>
                              <Badge variant={(daysToExpiry(b.expiry_date) ?? 99) < 90 ? "destructive" : "outline"}>
                                {b.expiry_date || "No Expiry"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold">{NUM(b.stock_quantity)}</TableCell>
                            <TableCell className="text-right">{PKR(b.purchase_price)}</TableCell>
                          </TableRow>
                        ))}
                      {!batches.filter((b) => b.product_id === historyProduct.id && b.stock_quantity > 0).length && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-2 text-center text-xs text-muted-foreground">
                            No separate active batches recorded. Total stock: {NUM(historyProduct.stock_quantity)}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
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

      {/* Supplier Purchase Order Sheet Modal */}
      <Dialog open={orderModalOpen} onOpenChange={setOrderModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between border-b pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" /> Supplier Purchase Order Sheet (Distributor Reorder)
            </DialogTitle>
            <div className="flex gap-2">
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  const rows: Array<Record<string, unknown>> = [];
                  supplierOrderList.forEach((items, company) => {
                    items.forEach((i) => {
                      rows.push({
                        Company: company,
                        Product: i.product.name,
                        Category: i.product.category || "—",
                        "Current Stock": Number(i.product.stock_quantity),
                        "Low Stock Level": Number(i.product.low_stock_level),
                        "Recommended Order Qty": i.reorderQty,
                        "Unit Cost (Rs)": Number(i.product.purchase_price),
                        "Est Cost Total (Rs)": i.estCost,
                      });
                    });
                  });
                  exportRows(rows, "supplier_purchase_order_sheet");
                }}
              >
                <Download className="mr-1 h-3.5 w-3.5" /> Export Excel
              </Button>
              <Button size="xs" onClick={() => window.print()}>
                <Printer className="mr-1 h-3.5 w-3.5" /> Print Order Sheet
              </Button>
            </div>
          </DialogHeader>

          <div id="supplier-order-print" className="space-y-6 pt-2 text-sm bg-white text-black p-2 rounded">
            <div className="text-center border-b pb-3">
              <img src="/logo.png" alt="Mian Ali Traders" className="mx-auto mb-1 h-12 w-auto object-contain" />
              <p className="font-bold text-base">MIAN ALI TRADERS — SUPPLIER PURCHASE ORDER SHEET</p>
              <p className="text-xs text-muted-foreground">Generated Date: {new Date().toLocaleString()}</p>
            </div>

            {Array.from(supplierOrderList.entries()).map(([company, items]) => {
              const companyTotalEst = items.reduce((sum, i) => sum + i.estCost, 0);
              return (
                <div key={company} className="space-y-2 border rounded-md p-3">
                  <div className="flex items-center justify-between border-b pb-1">
                    <p className="font-bold text-sm text-primary flex items-center gap-1.5">
                      🏢 Company / Supplier: {company}
                    </p>
                    <Badge variant="outline" className="font-semibold text-xs">
                      Est. Total: {PKR(companyTotalEst)} ({items.length} items)
                    </Badge>
                  </div>

                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Current Stock</TableHead>
                        <TableHead className="text-right">Min Level</TableHead>
                        <TableHead className="text-right font-bold text-emerald-700">Recommended Order Qty</TableHead>
                        <TableHead className="text-right">Unit Rate</TableHead>
                        <TableHead className="text-right">Est. Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((i) => (
                        <TableRow key={i.product.id}>
                          <TableCell className="font-medium">{i.product.name}</TableCell>
                          <TableCell className="text-muted-foreground">{i.product.category || "—"}</TableCell>
                          <TableCell className="text-right font-bold text-red-600">{NUM(i.product.stock_quantity)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{NUM(i.product.low_stock_level)}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-700 text-sm">+{NUM(i.reorderQty)} {i.product.unit}</TableCell>
                          <TableCell className="text-right">{PKR(i.product.purchase_price)}</TableCell>
                          <TableCell className="text-right font-semibold">{PKR(i.estCost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}

            {!supplierOrderList.size && (
              <div className="py-8 text-center text-sm text-emerald-600 font-semibold">
                🎉 All products have healthy stock levels! No items currently require supplier reordering.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
