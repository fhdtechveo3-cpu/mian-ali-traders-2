import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Search, Trash2, Printer, Lock } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useCustomers, useProducts, useProductBatches } from "@/lib/queries";
import { PKR, NUM, daysToExpiry, type Product } from "@/lib/pos";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "POS Billing — Mian Ali Traders" },
      { name: "description", content: "Fast counter billing: search medicines, edit price, apply discounts, take payment and print the invoice." },
      { property: "og:title", content: "POS Billing — Mian Ali Traders" },
      { property: "og:description", content: "Fast medical store counter billing with discounts, payments and printed receipts." },
    ],
  }),
  component: PosPage,
});

type Line = { product: Product; quantity: number; price: number };

type Receipt = {
  invoice: string;
  date: string;
  branch: string;
  customer: string;
  phone?: string;
  lines: { name: string; quantity: number; price: number }[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
  method: string;
  notes: string;
};


function PosPage() {
  const { activeBranch, branches, profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const billingBranch = activeBranch !== "all" ? activeBranch : (profile?.branch_id ?? branches[0]?.id ?? "");
  const { data: products = [] } = useProducts(billingBranch);
  const { data: customers = [] } = useCustomers(billingBranch);
  const { data: batches = [] } = useProductBatches(billingBranch);

  const [term, setTerm] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState("walkin");
  const [custName, setCustName] = useState("Walk-in Customer");
  const [custPhone, setCustPhone] = useState("");
  const [discount, setDiscount] = useState(0);
  const [autoDiscount, setAutoDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const results = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return products.slice(0, 8);
    return products
      .filter((p) =>
        [p.name, p.generic_name, p.company, p.category, p.brand].some((f) => (f ?? "").toLowerCase().includes(t)),
      )
      .slice(0, 12);
  }, [products, term]);

  const add = (p: Product) => {
    setLines((prev) => {
      const found = prev.find((l) => l.product.id === p.id);
      if (found) return prev.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { product: p, quantity: 1, price: Number(p.selling_price) }];
    });
    setTerm("");
  };

  const subtotal = lines.reduce((a, l) => a + l.quantity * l.price, 0);
  // Automatic discount rule: 3% off on bills above Rs 5,000
  const auto = subtotal > 5000 ? Math.round(subtotal * 0.03) : 0;
  const totalDiscount = (autoDiscount || auto) + discount;
  const total = Math.max(subtotal - totalDiscount, 0);
  const remaining = Math.max(total - paid, 0);

  const checkout = async () => {
    if (!lines.length) {
      toast.error("Add at least one product");
      return;
    }
    if (!billingBranch) {
      toast.error("No branch assigned to your account");
      return;
    }
    const overStock = lines.find((l) => l.quantity > Number(l.product.stock_quantity));
    if (overStock) {
      toast.error(`Not enough stock for ${overStock.product.name}`);
      return;
    }

    setBusy(true);

    let finalCustomerId = customerId === "walkin" ? null : customerId;
    let finalCustomerName = custName.trim() || "Walk-in Customer";
    let finalCustomerPhone = custPhone.trim() || null;

    if (!finalCustomerId && finalCustomerName !== "Walk-in Customer") {
      const existing = customers.find((c) => c.name.toLowerCase() === finalCustomerName.toLowerCase());
      if (existing) {
        finalCustomerId = existing.id;
      } else {
        const { data: newCust } = await supabase
          .from("customers")
          .insert({ name: finalCustomerName, phone: finalCustomerPhone, branch_id: billingBranch })
          .select("id")
          .single();
        if (newCust) finalCustomerId = newCust.id;
      }
    }

    const args = {
      _branch_id: billingBranch,
      _customer_id: finalCustomerId,
      _customer_name: finalCustomerName,
      _discount: totalDiscount,
      _paid_amount: paid || total,
      _payment_method: method,
      _notes: notes || null,
      _items: lines.map((l) => ({
        product_id: l.product.id,
        product_name: l.product.name,
        quantity: l.quantity,
        price: l.price,
        purchase_price: Number(l.product.purchase_price),
      })),
      _customer_phone: finalCustomerPhone,
    };
    const { data, error } = await supabase.rpc("create_sale", args as never);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    const { data: sale } = await supabase
      .from("sales")
      .select("invoice_number, created_at")
      .eq("id", data as string)
      .maybeSingle();

    const paidNow = paid || total;
    setReceipt({
      invoice: (sale as { invoice_number: string } | null)?.invoice_number ?? "—",
      date: (sale as { created_at: string } | null)?.created_at ?? new Date().toISOString(),
      branch: branches.find((b) => b.id === billingBranch)?.name ?? "",
      customer: finalCustomerName,
      phone: finalCustomerPhone || undefined,
      lines: lines.map((l) => ({ name: l.product.name, quantity: l.quantity, price: l.price })),
      subtotal,
      discount: totalDiscount,
      total,
      paid: paidNow,
      remaining: Math.max(total - paidNow, 0),
      method,
      notes,
    });

    toast.success("Sale completed");
    // Background audit log for price overrides
    lines.forEach((l) => {
      if (Number(l.price) !== Number(l.product.selling_price)) {
        void supabase.from("price_override_logs").insert({
          product_id: l.product.id,
          product_name: l.product.name,
          standard_price: Number(l.product.selling_price),
          sold_price: Number(l.price),
          quantity: Number(l.quantity),
          cashier_id: profile?.id ?? null,
        });
      }
    });

    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["product_batches"] });
    void qc.invalidateQueries({ queryKey: ["movements"] });
    void qc.invalidateQueries({ queryKey: ["sales"] });
    void qc.invalidateQueries({ queryKey: ["price_override_logs"] });
    setLines([]);
    setDiscount(0);
    setAutoDiscount(0);
    setPaid(0);
    setNotes("");
    void qc.invalidateQueries();
  };

  const clearCartWithAudit = async () => {
    if (lines.length > 0) {
      void supabase.from("cancelled_cart_logs").insert({
        items: lines.map((l) => ({ product_name: l.product.name, quantity: l.quantity, price: l.price })),
        cart_total: subtotal,
        cashier_id: profile?.id ?? null,
      });
    }
    setLines([]);
    toast.info("Cart cleared");
  };

  return (
    <AppShell title="POS · Billing" subtitle={branches.find((b) => b.id === billingBranch)?.name ?? "Select a branch"}>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Product Search</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name, generic, company or category…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  className="rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
                  disabled={Number(p.stock_quantity) <= 0}
                >
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.generic_name || p.company || "—"} · {p.category || "General"}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-semibold">{PKR(p.selling_price)}</span>
                    <Badge variant={Number(p.stock_quantity) <= 0 ? "destructive" : "secondary"}>
                      {NUM(p.stock_quantity)} {p.unit}
                    </Badge>
                  </div>
                </button>
              ))}
              {!results.length && <p className="text-sm text-muted-foreground">No products found.</p>}
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Cart</p>
                {lines.length > 0 && (
                  <Button size="xs" variant="ghost" className="h-6 text-xs text-destructive hover:bg-destructive/10" onClick={clearCartWithAudit}>
                    Clear Cart
                  </Button>
                )}
              </div>
              {lines.map((l) => {
                const cost = Number(l.product.purchase_price);
                const isBelowCost = l.price < cost;
                const unitLoss = cost - l.price;
                const totalLoss = unitLoss * l.quantity;

                const prodBatches = batches.filter((b) => b.product_id === l.product.id && b.stock_quantity > 0);
                const expDate = prodBatches[0]?.expiry_date || l.product.expiry_date;
                const expDays = daysToExpiry(expDate);

                return (
                  <div key={l.product.id} className="space-y-1 rounded-md border p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{l.product.name}</span>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setLines((p) => p.map((x) => (x.product.id === l.product.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          className="h-7 w-16 text-center"
                          type="number"
                          value={l.quantity}
                          onChange={(e) => setLines((p) => p.map((x) => (x.product.id === l.product.id ? { ...x, quantity: Number(e.target.value) || 1 } : x)))}
                        />
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setLines((p) => p.map((x) => (x.product.id === l.product.id ? { ...x, quantity: x.quantity + 1 } : x)))}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Input
                        className={`h-7 w-24 ${isBelowCost ? "border-red-600 text-red-600 font-bold bg-red-50" : ""}`}
                        type="number"
                        title="Manual selling price edit"
                        value={l.price}
                        onChange={(e) => setLines((p) => p.map((x) => (x.product.id === l.product.id ? { ...x, price: Number(e.target.value) || 0 } : x)))}
                      />
                      <span className="w-24 text-right text-sm font-semibold">{PKR(l.quantity * l.price)}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setLines((p) => p.filter((x) => x.product.id !== l.product.id))}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>

                    {isBelowCost && (
                      <div className="w-full text-[11px] text-red-600 font-semibold bg-red-500/10 px-2 py-0.5 rounded flex items-center justify-between">
                        <span>⚠️ Below Cost Warning! Cost Rate: {PKR(cost)}</span>
                        <span>Loss: -{PKR(totalLoss)}</span>
                      </div>
                    )}

                    {expDays !== null && expDays < 0 && (
                      <div className="w-full text-[11px] font-bold text-white bg-red-600 px-2 py-0.5 rounded flex items-center justify-between">
                        <span>🔴 EXPIRED ITEM ALERT! Expired: {expDate}</span>
                        <span>Do Not Sell</span>
                      </div>
                    )}

                    {expDays !== null && expDays >= 0 && expDays <= 30 && (
                      <div className="w-full text-[11px] font-semibold text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded flex items-center justify-between">
                        <span>⚠️ Near Expiry Warning! Exp: {expDate}</span>
                        <span>({expDays} Days Left)</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {!lines.length && <p className="text-sm text-muted-foreground">Cart is empty. Click a product to add it.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Select Saved Customer (Optional)</Label>
                <Select
                  value={customerId}
                  onValueChange={(val) => {
                    setCustomerId(val);
                    if (val === "walkin") {
                      setCustName("Walk-in Customer");
                      setCustPhone("");
                    } else {
                      const c = customers.find((x) => x.id === val);
                      if (c) {
                        setCustName(c.name);
                        setCustPhone(c.phone ?? "");
                      }
                    }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walkin">Walk-in Customer</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Customer Name <span className="text-destructive">*</span></Label>
                  <Input
                    required
                    placeholder="e.g. Ali Raza"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone Number (Optional)</Label>
                  <Input
                    placeholder="e.g. 03001234567"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3 text-sm">
              <Row label="Subtotal" value={PKR(subtotal)} />
              <Row label="Automatic discount (3% over Rs 5,000)" value={PKR(auto)} />
              <Row label="Total discount" value={PKR(totalDiscount)} />
              <div className="my-2 h-px bg-border" />
              <Row label="Grand total" value={PKR(total)} bold />
              <Row label="Remaining" value={PKR(remaining)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Manual discount</Label>
                <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Override auto discount</Label>
                <Input type="number" value={autoDiscount} onChange={(e) => setAutoDiscount(Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Paid amount</Label>
                <Input type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Cash", "Card", "Easypaisa", "JazzCash", "Bank Transfer", "Credit"].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Invoice notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note printed on the receipt" />
            </div>

            <Button className="w-full" disabled={busy} onClick={() => void checkout()}>
              Complete sale · {PKR(total)}
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> Saved invoices can never be edited or deleted.
            </p>
          </CardContent>
        </Card>
      </div>

      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </AppShell>
  );
}

function ReceiptDialog({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  useEffect(() => {
    if (!receipt) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [receipt]);

  return (
    <Dialog open={!!receipt} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[320px]">
        <DialogHeader className="no-print">
          <DialogTitle>Sale completed · {receipt?.invoice}</DialogTitle>
        </DialogHeader>
        {receipt && (
          <div id="invoice-print" className="space-y-3 text-sm">
            <div className="text-center">
              <img src="/logo.png" alt="Mian Ali Traders" className="mx-auto mb-2 h-14 w-auto object-contain" />

              <p className="text-xs text-muted-foreground">{receipt.branch}</p>
              <p className="text-xs text-muted-foreground">Invoice {receipt.invoice}</p>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{new Date(receipt.date).toLocaleString()}</span>
              <span>{receipt.customer}{receipt.phone ? ` (${receipt.phone})` : ""}</span>
            </div>
            <div className="border-t pt-2">
              {receipt.lines.map((l, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span className="min-w-0 flex-1 truncate pr-2">
                    {l.name} × {NUM(l.quantity)}
                  </span>
                  <span>{PKR(l.quantity * l.price)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-0.5 border-t pt-2 text-right">
              <p>Subtotal: {PKR(receipt.subtotal)}</p>
              <p>Discount: {PKR(receipt.discount)}</p>
              <p className="text-base font-semibold">Total: {PKR(receipt.total)}</p>
              <p className="text-xs text-muted-foreground">
                Paid {PKR(receipt.paid)} · Due {PKR(receipt.remaining)} · {receipt.method}
              </p>
              {receipt.notes && <p className="text-xs text-muted-foreground">{receipt.notes}</p>}
            </div>
            <p className="text-center text-xs text-muted-foreground">Thank you for your purchase!</p>
            <div className="no-print grid grid-cols-2 gap-2 pt-1">
              <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-0.5 ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
