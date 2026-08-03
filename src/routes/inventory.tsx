import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PackagePlus, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/lib/auth";
import { useMovements, useProducts, useSuppliers } from "@/lib/queries";
import { PKR, NUM, daysToExpiry, stockStatus } from "@/lib/pos";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory & Stock — Mian Ali Traders POS" },
      { name: "description", content: "Record new stock arrivals, adjust quantities and track stock value, expiry and movement per branch." },
      { property: "og:title", content: "Inventory & Stock — Mian Ali Traders POS" },
      { property: "og:description", content: "New inventory entry, stock adjustments and expiry tracking for both medical stores." },
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

  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [supplierId, setSupplierId] = useState("none");
  const [note, setNote] = useState("");
  const [adjustId, setAdjustId] = useState("");
  const [adjustQty, setAdjustQty] = useState(0);

  const stockValueCost = products.reduce((a, p) => a + Number(p.purchase_price) * Number(p.stock_quantity), 0);
  const stockValueSale = products.reduce((a, p) => a + Number(p.selling_price) * Number(p.stock_quantity), 0);
  const low = products.filter((p) => stockStatus(p) === "low");
  const out = products.filter((p) => stockStatus(p) === "out");
  const expired = products.filter((p) => (daysToExpiry(p.expiry_date) ?? 1) < 0);
  const near = products.filter((p) => {
    const d = daysToExpiry(p.expiry_date);
    return d !== null && d >= 0 && d <= 90;
  });

  const addStock = async () => {
    const p = products.find((x) => x.id === productId);
    if (!p || qty <= 0) {
      toast.error("Select a product and enter a quantity");
      return;
    }
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
      toast.error(e1?.message ?? e2?.message ?? "Failed");
      return;
    }
    toast.success("New inventory recorded");
    setQty(0);
    setPrice(0);
    setNote("");
    void qc.invalidateQueries();
  };

  const adjust = async (dir: 1 | -1) => {
    const p = products.find((x) => x.id === adjustId);
    if (!p || adjustQty <= 0) {
      toast.error("Select a product and quantity");
      return;
    }
    const next = Number(p.stock_quantity) + dir * adjustQty;
    if (next < 0) {
      toast.error("Stock cannot go below zero");
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
    toast.success("Stock adjusted");
    setAdjustQty(0);
    void qc.invalidateQueries();
  };

  const prodName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

  return (
    <AppShell title="Inventory" subtitle="Stock levels, new inventory entry and adjustments">
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
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">New Inventory Entry</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quantity received</Label>
              <Input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Purchase price</Label>
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
              <Label className="text-xs">Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button className="sm:col-span-2" onClick={() => void addStock()}>
              <PackagePlus className="mr-2 h-4 w-4" /> Record stock arrival
            </Button>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Date, supplier, quantity, purchase price and branch are saved automatically with each entry.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Stock Adjustment</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Product</Label>
              <Select value={adjustId} onValueChange={setAdjustId}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {NUM(p.stock_quantity)} {p.unit}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Quantity</Label>
              <Input type="number" value={adjustQty} onChange={(e) => setAdjustQty(Number(e.target.value) || 0)} />
            </div>
            <Button variant="outline" onClick={() => void adjust(1)}><ArrowUpCircle className="mr-2 h-4 w-4" /> Increase</Button>
            <Button variant="outline" onClick={() => void adjust(-1)}><ArrowDownCircle className="mr-2 h-4 w-4" /> Decrease</Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stock" className="mt-5">
        <TabsList>
          <TabsTrigger value="stock">Current Stock</TabsTrigger>
          <TabsTrigger value="expiry">Expiry Watch</TabsTrigger>
          <TabsTrigger value="movements">Stock Movement</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <Card><CardContent className="overflow-x-auto p-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Product</TableHead><TableHead>Branch</TableHead>
                <TableHead className="text-right">Available</TableHead><TableHead className="text-right">Cost value</TableHead>
                <TableHead className="text-right">Retail value</TableHead><TableHead>Status</TableHead>
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
      <p className="mt-3 text-xs text-muted-foreground">Signed in branch: {branches.find((b) => b.id === profile?.branch_id)?.name ?? "—"}</p>
    </AppShell>
  );
}
