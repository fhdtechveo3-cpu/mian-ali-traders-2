import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus, Search, Trash2, Upload, Download, History } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useMovements, useProducts, useProductBatches, useReturns, useSaleItems, useSuppliers } from "@/lib/queries";
import { PKR, NUM, exportRows, readSheet, stockStatus, type Product } from "@/lib/pos";
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

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Products & Medicines — Mian Ali Traders POS" },
      { name: "description", content: "Add, edit, duplicate and bulk-import medicines with company, category, batch, expiry, supplier and branch details." },
      { property: "og:title", content: "Products & Medicines — Mian Ali Traders POS" },
      { property: "og:description", content: "Full medicine catalogue management with Excel bulk import for both branches." },
    ],
  }),
  component: ProductsPage,
});

const blank = {
  name: "",
  generic_name: "",
  brand: "",
  company: "",
  category: "",
  purchase_price: 0,
  selling_price: 0,
  stock_quantity: 0,
  unit: "Pack",
  batch_number: "",
  expiry_date: "",
  supplier_id: "",
  branch_id: "",
  low_stock_level: 10,
  notes: "",
};

function ProductsPage() {
  const { activeBranch, branches, isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts(activeBranch);
  const { data: suppliers = [] } = useSuppliers();
  const { data: movements = [] } = useMovements(activeBranch);
  const { data: saleItems = [] } = useSaleItems();
  const { data: returns = [] } = useReturns(activeBranch);
  const { data: batches = [] } = useProductBatches(activeBranch);

  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...blank });
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[];

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return products.filter((p) => {
      const matchTerm =
        !t || [p.name, p.generic_name, p.company, p.category, p.brand].some((f) => (f ?? "").toLowerCase().includes(t));
      const matchCat = category === "all" || p.category === category;
      const st = stockStatus(p);
      const matchStatus = status === "all" || st === status;
      return matchTerm && matchCat && matchStatus;
    });
  }, [products, term, category, status]);

  const openNew = () => {
    setEditId(null);
    setForm({ ...blank, branch_id: activeBranch !== "all" ? activeBranch : (profile?.branch_id ?? branches[0]?.id ?? "") });
    setOpen(true);
  };

  const openEdit = (p: Product, duplicate = false) => {
    setEditId(duplicate ? null : p.id);
    setForm({
      name: duplicate ? `${p.name} (Copy)` : p.name,
      generic_name: p.generic_name ?? "",
      brand: p.brand ?? "",
      company: p.company ?? "",
      category: p.category ?? "",
      purchase_price: Number(p.purchase_price),
      selling_price: Number(p.selling_price),
      stock_quantity: Number(p.stock_quantity),
      unit: p.unit,
      batch_number: p.batch_number ?? "",
      expiry_date: p.expiry_date ?? "",
      supplier_id: p.supplier_id ?? "",
      branch_id: p.branch_id,
      low_stock_level: Number(p.low_stock_level),
      notes: p.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const payload = {
      ...form,
      generic_name: form.generic_name || null,
      brand: form.brand || null,
      company: form.company || null,
      category: form.category || null,
      batch_number: form.batch_number || null,
      expiry_date: form.expiry_date || null,
      supplier_id: form.supplier_id || null,
      notes: form.notes || null,
    };
    const { error } = editId
      ? await supabase.from("products").update(payload).eq("id", editId)
      : await supabase.from("products").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editId ? "Product updated" : "Product added");
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["products"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Product deleted");
    void qc.invalidateQueries({ queryKey: ["products"] });
  };

  const importFile = async (file: File) => {
    try {
      const rows = await readSheet(file);
      const branchId = activeBranch !== "all" ? activeBranch : (profile?.branch_id ?? branches[0]?.id ?? "");
      const mapped = rows
        .map((r) => ({
          name: String(r["Product Name"] ?? r["name"] ?? "").trim(),
          generic_name: (r["Generic Name"] ?? r["generic_name"] ?? null) as string | null,
          brand: (r["Brand"] ?? r["brand"] ?? null) as string | null,
          company: (r["Company"] ?? r["company"] ?? null) as string | null,
          category: (r["Category"] ?? r["category"] ?? null) as string | null,
          purchase_price: Number(r["Purchase Price"] ?? r["purchase_price"] ?? 0),
          selling_price: Number(r["Selling Price"] ?? r["selling_price"] ?? 0),
          stock_quantity: Number(r["Stock"] ?? r["stock_quantity"] ?? 0),
          unit: String(r["Unit"] ?? r["unit"] ?? "Pack"),
          batch_number: (r["Batch"] ?? r["batch_number"] ?? null) as string | null,
          expiry_date: r["Expiry"] ? new Date(r["Expiry"] as string).toISOString().slice(0, 10) : null,
          branch_id: branchId,
        }))
        .filter((r) => r.name);
      if (!mapped.length) {
        toast.error("Excel import failed: no valid product rows found");
        return;
      }
      const { error } = await supabase.from("products").insert(mapped);
      if (error) {
        toast.error(`Import failed: ${error.message}`);
        return;
      }
      toast.success(`${mapped.length} products imported`);
      void qc.invalidateQueries({ queryKey: ["products"] });
    } catch {
      toast.error("Excel import failed — please check the file format");
    }
  };

  return (
    <AppShell
      title="Products"
      subtitle={`${filtered.length} of ${products.length} medicines`}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" /> Bulk import
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportRows(
                filtered.map((p) => {
                  const prodMovements = movements.filter((m) => m.product_id === p.id);
                  const prodSales = saleItems.filter((i) => i.product_id === p.id);
                  const prodReturns = returns.filter((r) => r.product_id === p.id);
                  const prodBatches = batches.filter((b) => b.product_id === p.id && b.stock_quantity > 0);

                  const totalPurchased = prodMovements
                    .filter((m) => m.movement_type === "purchase" || m.movement_type === "adjustment_in")
                    .reduce((sum, m) => sum + Number(m.quantity), 0);
                  const totalSold = prodSales.reduce((sum, s) => sum + Number(s.quantity), 0);
                  const totalReturned = prodReturns.reduce((sum, r) => sum + Number(r.quantity), 0);

                  const activeBatchNums = prodBatches.map((b) => b.batch_number).filter(Boolean).join(", ") || p.batch_number || "Standard";
                  const earliestExp = prodBatches[0]?.expiry_date || p.expiry_date || "No Expiry";

                  const costValue = Number(p.purchase_price) * Number(p.stock_quantity);
                  const retailValue = Number(p.selling_price) * Number(p.stock_quantity);
                  const grossProfit = (Number(p.selling_price) - Number(p.purchase_price)) * Number(p.stock_quantity);

                  return {
                    "Product Name": p.name,
                    "Generic Name": p.generic_name || "—",
                    Company: p.company || "—",
                    Category: p.category || "—",
                    Brand: p.brand || "—",
                    Unit: p.unit,
                    "Current Available Stock": Number(p.stock_quantity),
                    "Total Purchased Qty": totalPurchased,
                    "Total Sold Qty": totalSold,
                    "Total Returned Qty": totalReturned,
                    "Active Batch Numbers": activeBatchNums,
                    "Expiry Date": earliestExp,
                    "Purchase Price (Rs)": Number(p.purchase_price),
                    "Selling Price (Rs)": Number(p.selling_price),
                    "Stock Value Cost (Rs)": costValue,
                    "Stock Value Retail (Rs)": retailValue,
                    "Potential Gross Profit (Rs)": grossProfit,
                    "Stock Status": stockStatus(p),
                    Branch: branches.find((b) => b.id === p.branch_id)?.name || "—",
                  };
                }),
                "products_complete_audit",
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Add product
          </Button>
        </div>
      }
    >
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name, generic, company, category…" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Stock status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock</SelectItem>
                <SelectItem value="ok">In stock</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const st = stockStatus(p);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.generic_name || "—"}</p>
                      </TableCell>
                      <TableCell className="text-sm">{p.company || "—"}</TableCell>
                      <TableCell className="text-sm">{p.category || "—"}</TableCell>
                      <TableCell className="text-right text-sm">{PKR(p.purchase_price)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{PKR(p.selling_price)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={st === "out" ? "destructive" : st === "low" ? "secondary" : "outline"}>
                          {NUM(p.stock_quantity)} {p.unit}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{p.expiry_date ?? "—"}</TableCell>
                      <TableCell className="text-xs">{branches.find((b) => b.id === p.branch_id)?.city ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Product Stock Ledger" onClick={() => setHistoryProduct(p)}>
                          <History className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(p, true)}><Copy className="h-3.5 w-3.5" /></Button>
                        {isAdmin && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void remove(p.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filtered.length && (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">{isLoading ? "Loading…" : "No products match your filters."}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit product" : "Add product"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Product name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Generic name"><Input value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} /></Field>
            <Field label="Brand"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
            <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Category"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
            <Field label="Purchase price"><Input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: Number(e.target.value) })} /></Field>
            <Field label="Selling price"><Input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })} /></Field>
            <Field label="Stock quantity"><Input type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: Number(e.target.value) })} /></Field>
            <Field label="Low stock level"><Input type="number" value={form.low_stock_level} onChange={(e) => setForm({ ...form, low_stock_level: Number(e.target.value) })} /></Field>
            <Field label="Batch number"><Input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} /></Field>
            <Field label="Expiry date"><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
            <Field label="Supplier">
              <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supplier</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={form.branch_id} onValueChange={(v) => setForm({ ...form, branch_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()}>{editId ? "Save changes" : "Add product"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Product History Ledger Modal */}
      <Dialog open={!!historyProduct} onOpenChange={(v) => !v && setHistoryProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> Product Stock History — {historyProduct?.name}
            </DialogTitle>
          </DialogHeader>

          {historyProduct && (() => {
            const pId = historyProduct.id;
            const prodMovements = movements.filter((m) => m.product_id === pId);
            const prodSales = saleItems.filter((i) => i.product_id === pId);
            const prodReturns = returns.filter((r) => r.product_id === pId);

            const totalPurchased = prodMovements
              .filter((m) => m.movement_type === "purchase" || m.movement_type === "adjustment_in")
              .reduce((sum, m) => sum + Number(m.quantity), 0);
            const totalSold = prodSales.reduce((sum, s) => sum + Number(s.quantity), 0);
            const totalReturned = prodReturns.reduce((sum, r) => sum + Number(r.quantity), 0);

            const timeline: Array<{ id: string; date: string; type: string; qty: number; price: number; ref: string }> = [];
            prodMovements.forEach((m) => {
              timeline.push({ id: `mov-${m.id}`, date: m.created_at, type: m.movement_type, qty: Number(m.quantity), price: Number(m.purchase_price) || 0, ref: m.reference || m.note || "Stock Movement" });
            });
            prodSales.forEach((s) => {
              timeline.push({ id: `sale-${s.id}`, date: s.created_at, type: "sale", qty: -Number(s.quantity), price: Number(s.price), ref: "Counter Sale" });
            });
            prodReturns.forEach((r) => {
              timeline.push({ id: `ret-${r.id}`, date: r.created_at, type: "return", qty: Number(r.quantity), price: Number(r.unit_price), ref: `Return: ${r.invoice_number}` });
            });
            timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            return (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div className="rounded-md border bg-card p-3">
                    <p className="text-muted-foreground">Stock Received</p>
                    <p className="text-lg font-bold text-emerald-600">+{NUM(totalPurchased)}</p>
                  </div>
                  <div className="rounded-md border bg-card p-3">
                    <p className="text-muted-foreground">Total Sold</p>
                    <p className="text-lg font-bold text-blue-600">-{NUM(totalSold)}</p>
                  </div>
                  <div className="rounded-md border bg-card p-3">
                    <p className="text-muted-foreground">Total Returned</p>
                    <p className="text-lg font-bold text-amber-600">+{NUM(totalReturned)}</p>
                  </div>
                  <div className="rounded-md border bg-card p-3">
                    <p className="text-muted-foreground">Current Stock</p>
                    <p className="text-lg font-bold text-foreground">{NUM(historyProduct.stock_quantity)} {historyProduct.unit}</p>
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
                      {timeline.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs text-muted-foreground">{new Date(row.date).toLocaleString()}</TableCell>
                          <TableCell><Badge variant={row.type === "sale" ? "secondary" : row.type === "purchase" ? "default" : "outline"}>{row.type.replace("_", " ")}</Badge></TableCell>
                          <TableCell className={`text-right font-medium ${row.qty > 0 ? "text-emerald-600" : "text-destructive"}`}>{row.qty > 0 ? `+${NUM(row.qty)}` : NUM(row.qty)}</TableCell>
                          <TableCell className="text-right">{PKR(row.price)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.ref}</TableCell>
                        </TableRow>
                      ))}
                      {!timeline.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No history events recorded for this product yet.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
