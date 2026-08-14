import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, PackageX, Wallet, Phone, Calendar, CheckCircle2, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useProducts, useReturns, useSales } from "@/lib/queries";
import { PKR, NUM, daysToExpiry, stockStatus } from "@/lib/pos";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Alerts & Udhaar Calling List — Mian Ali Traders POS" },
      { name: "description", content: "Low stock, expiry and comprehensive Udhaar payment calling list with due date rescheduling." },
      { property: "og:title", content: "Alerts & Udhaar Calling List — Mian Ali Traders POS" },
      { property: "og:description", content: "Live inventory alerts and customer Udhaar calling list for shop manager." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { activeBranch, branches } = useAuth();
  const qc = useQueryClient();
  const { data: products = [] } = useProducts(activeBranch);
  const { data: sales = [] } = useSales(activeBranch);
  const { data: returns = [] } = useReturns(activeBranch);

  const [searchTerm, setSearchTerm] = useState("");
  const [callingFilter, setCallingFilter] = useState<"all" | "overdue" | "upcoming">("all");

  // Dialog states for Udhaar clearing & rescheduling
  const [paySale, setPaySale] = useState<(typeof sales)[0] | null>(null);
  const [rescheduleSale, setRescheduleSale] = useState<(typeof sales)[0] | null>(null);
  const [newDueDate, setNewDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  const refundedBySaleMap = useMemo(() => {
    const map = new Map<string, number>();
    returns.forEach((r) => {
      if (r.sale_id) {
        const prev = map.get(r.sale_id) || 0;
        map.set(r.sale_id, prev + Number(r.refund_amount));
      }
      if (r.invoice_number) {
        const prev = map.get(r.invoice_number) || 0;
        map.set(r.invoice_number, prev + Number(r.refund_amount));
      }
    });
    return map;
  }, [returns]);

  const low = products.filter((p) => stockStatus(p) === "low");
  const out = products.filter((p) => stockStatus(p) === "out");
  const expiring = products.filter((p) => {
    const d = daysToExpiry(p.expiry_date);
    return d !== null && d <= 90;
  });

  const unpaidSales = useMemo(() => {
    return sales.filter((s) => {
      const refSum = Math.max(
        refundedBySaleMap.get(s.id) || 0,
        refundedBySaleMap.get(s.invoice_number) || 0,
      );
      if (refSum >= Number(s.total)) return false;
      const effRemaining = Math.max(0, Number(s.remaining_amount) - refSum);
      return effRemaining > 0;
    });
  }, [sales, refundedBySaleMap]);

  const city = (id: string) => branches.find((b) => b.id === id)?.city ?? "";

  // Group unpaid sales by Customer
  const customerUdhaarGroups = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const term = searchTerm.trim().toLowerCase();

    const map = new Map<
      string,
      {
        customerName: string;
        customerPhone: string;
        totalDue: number;
        invoices: typeof sales;
        earliestDueDate: string | null;
        isOverdue: boolean;
        isUpcoming: boolean;
      }
    >();

    unpaidSales.forEach((s) => {
      const name = s.customer_name || "Walk-in Customer";
      const phone = (s as unknown as { customer_phone?: string }).customer_phone || "";
      const key = `${name.toLowerCase()}__${phone.toLowerCase()}`;

      if (term && !name.toLowerCase().includes(term) && !phone.toLowerCase().includes(term) && !s.invoice_number.toLowerCase().includes(term)) {
        return;
      }

      const dueVal = Number(s.remaining_amount);
      const dueDate = (s as unknown as { due_date?: string }).due_date || null;

      const group = map.get(key) || {
        customerName: name,
        customerPhone: phone,
        totalDue: 0,
        invoices: [],
        earliestDueDate: null,
        isOverdue: false,
        isUpcoming: false,
      };

      group.totalDue += dueVal;
      group.invoices.push(s);

      if (dueDate) {
        if (!group.earliestDueDate || dueDate < group.earliestDueDate) {
          group.earliestDueDate = dueDate;
        }
        if (dueDate < todayStr) {
          group.isOverdue = true;
        } else {
          group.isUpcoming = true;
        }
      }

      map.set(key, group);
    });

    let result = Array.from(map.values());

    if (callingFilter === "overdue") {
      result = result.filter((g) => g.isOverdue);
    } else if (callingFilter === "upcoming") {
      result = result.filter((g) => g.isUpcoming && !g.isOverdue);
    }

    return result.sort((a, b) => b.totalDue - a.totalDue);
  }, [unpaidSales, searchTerm, callingFilter]);

  const handleConfirmPay = async () => {
    if (!paySale) return;
    setBusy(true);
    const dueVal = Number(paySale.remaining_amount);

    const { error } = await supabase
      .from("sales")
      .update({ remaining_amount: 0, paid_amount: Number(paySale.total) })
      .eq("id", paySale.id);

    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }

    if (paySale.customer_id && dueVal > 0) {
      await supabase.from("customer_payments").insert({
        customer_id: paySale.customer_id,
        branch_id: paySale.branch_id,
        amount: dueVal,
        payment_method: "Cash",
        notes: `Cleared invoice ${paySale.invoice_number} via Notifications Calling List`,
        note: `Cleared invoice ${paySale.invoice_number} via Notifications Calling List`,
      });
    }

    setBusy(false);
    toast.success(`Cleared invoice ${paySale.invoice_number} (${PKR(dueVal)})`);
    setPaySale(null);
    void qc.invalidateQueries({ queryKey: ["sales"] });
    void qc.invalidateQueries({ queryKey: ["customer_payments"] });
  };

  const handleConfirmReschedule = async () => {
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

    toast.success(`Updated promised date for ${rescheduleSale.invoice_number} to ${newDueDate}`);
    setRescheduleSale(null);
    setNewDueDate("");
    void qc.invalidateQueries({ queryKey: ["sales"] });
  };

  const inventoryGroups = [
    {
      title: "Out of stock",
      icon: PackageX,
      tone: "destructive" as const,
      rows: out.map((p) => ({ key: p.id, main: p.name, meta: `${city(p.branch_id)} · reorder immediately`, badge: "0" })),
    },
    {
      title: "Low stock",
      icon: AlertTriangle,
      tone: "warning" as const,
      rows: low.map((p) => ({ key: p.id, main: p.name, meta: `${city(p.branch_id)} · min ${p.low_stock_level}`, badge: `${p.stock_quantity} ${p.unit}` })),
    },
    {
      title: "Expiry alerts (90 days)",
      icon: CalendarClock,
      tone: "warning" as const,
      rows: expiring.map((p) => {
        const d = daysToExpiry(p.expiry_date)!;
        return { key: p.id, main: p.name, meta: `${city(p.branch_id)} · expires ${p.expiry_date}`, badge: d < 0 ? "Expired" : `${d} days` };
      }),
    },
  ];

  return (
    <AppShell title="Alerts & Udhaar Calling List" subtitle="Manage stock alerts, customer credit follow-ups, and reschedule payment promises">
      <Tabs defaultValue="udhaar" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="udhaar" className="flex items-center gap-1.5 font-bold text-red-600">
            <Phone className="h-4 w-4" /> Udhaar Calling List & Follow-ups ({unpaidSales.length} Invoices)
          </TabsTrigger>
          <TabsTrigger value="inventory">
            <AlertTriangle className="mr-1.5 h-4 w-4" /> Inventory & Expiry Alerts ({out.length + low.length + expiring.length})
          </TabsTrigger>
        </TabsList>

        {/* Udhaar Calling List Tab */}
        <TabsContent value="udhaar" className="space-y-4">
          <Card className="border-red-200 bg-red-50/20 dark:bg-red-950/10">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2 text-foreground">
                  <Phone className="h-5 w-5 text-red-600" /> Customer Udhaar Follow-up & Calling Engine
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="xs"
                    variant={callingFilter === "all" ? "default" : "outline"}
                    onClick={() => setCallingFilter("all")}
                  >
                    All Pending ({unpaidSales.length})
                  </Button>
                  <Button
                    size="xs"
                    variant={callingFilter === "overdue" ? "destructive" : "outline"}
                    className={callingFilter === "overdue" ? "bg-red-600 text-white" : ""}
                    onClick={() => setCallingFilter("overdue")}
                  >
                    🔴 Overdue (Wada Guzar Gaya)
                  </Button>
                  <Button
                    size="xs"
                    variant={callingFilter === "upcoming" ? "secondary" : "outline"}
                    onClick={() => setCallingFilter("upcoming")}
                  >
                    🗓️ Upcoming Promise (Calling List)
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customer name, phone number, or invoice #..."
                  className="pl-9 bg-background"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="space-y-3 pt-2">
                {customerUdhaarGroups.map((group, idx) => (
                  <div key={idx} className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold text-foreground">{group.customerName}</p>
                          {group.isOverdue && (
                            <Badge variant="destructive" className="bg-red-600 text-white font-bold text-[10px]">
                              🔴 OVERDUE WAADA
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <Phone className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="font-semibold">{group.customerPhone || "No Phone Registered"}</span>
                          <span>· {group.invoices.length} Unpaid Invoices</span>
                          {group.earliestDueDate && (
                            <span className="font-medium text-amber-700 dark:text-amber-400">
                              · Promised Due Date: {group.earliestDueDate}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total Combined Udhaar</p>
                        <p className="text-lg font-bold text-red-600">{PKR(group.totalDue)}</p>
                      </div>
                    </div>

                    {/* Itemized Invoices List for this Customer */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Itemized Pending Invoices:</p>
                      <div className="grid gap-2">
                        {group.invoices.map((inv) => {
                          const dueDate = (inv as unknown as { due_date?: string }).due_date;
                          const dueVal = Number(inv.remaining_amount);

                          return (
                            <div
                              key={inv.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-2.5 text-xs"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-foreground">{inv.invoice_number}</span>
                                  <span className="text-muted-foreground">({new Date(inv.created_at).toLocaleDateString()})</span>
                                  {dueDate ? (
                                    <Badge variant="outline" className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                      Due: {dueDate}
                                    </Badge>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">No Date Set</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Total Bill: {PKR(inv.total)} · Outstanding: <span className="font-bold text-red-600">{PKR(dueVal)}</span>
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  className="h-7 text-[11px]"
                                  onClick={() => {
                                    setRescheduleSale(inv);
                                    setNewDueDate(dueDate || "");
                                  }}
                                >
                                  <Calendar className="mr-1 h-3 w-3" /> Reschedule Date
                                </Button>

                                <Button
                                  size="xs"
                                  className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px]"
                                  onClick={() => setPaySale(inv)}
                                >
                                  <CheckCircle2 className="mr-1 h-3 w-3" /> Mark Invoice Paid
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}

                {!customerUdhaarGroups.length && (
                  <div className="py-12 text-center rounded-lg border border-dashed">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 mb-2" />
                    <p className="font-semibold text-foreground">No matching Udhaar accounts found!</p>
                    <p className="text-xs text-muted-foreground">All customer credit accounts are clear or match your search query.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Standard Inventory & Expiry Alerts Tab */}
        <TabsContent value="inventory">
          <div className="grid gap-4 lg:grid-cols-3">
            {inventoryGroups.map((g) => (
              <Card key={g.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <g.icon className={`h-4 w-4 ${g.tone === "destructive" ? "text-destructive" : "text-warning"}`} />
                    {g.title}
                  </CardTitle>
                  <Badge variant={g.rows.length ? (g.tone === "destructive" ? "destructive" : "secondary") : "outline"}>
                    {g.rows.length}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  {g.rows.slice(0, 20).map((r) => (
                    <div key={r.key} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.main}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.meta}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {r.badge}
                      </Badge>
                    </div>
                  ))}
                  {!g.rows.length && <p className="py-4 text-center text-sm text-muted-foreground">All clear.</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Mark Invoice Paid Dialog */}
      <Dialog open={!!paySale} onOpenChange={(v) => !v && setPaySale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> Clear Udhaar & Mark Invoice Paid
            </DialogTitle>
          </DialogHeader>
          {paySale && (
            <div className="space-y-4 text-xs pt-2">
              <div className="rounded border bg-card p-3 space-y-1">
                <p><span className="font-semibold">Invoice #:</span> {paySale.invoice_number}</p>
                <p><span className="font-semibold">Customer:</span> {paySale.customer_name}</p>
                <p className="font-bold text-red-600 text-sm pt-1">
                  Outstanding Due to Clear: {PKR(paySale.remaining_amount)}
                </p>
              </div>
              <p className="text-muted-foreground">
                Marking this invoice paid will clear the remaining balance of {PKR(paySale.remaining_amount)} and log cash received in today's revenue.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaySale(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => void handleConfirmPay()}>
              Confirm Payment Received
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Due Date Dialog */}
      <Dialog open={!!rescheduleSale} onOpenChange={(v) => !v && setRescheduleSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" /> Reschedule Promised Payment Due Date
            </DialogTitle>
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
            <Button className="bg-primary text-white" disabled={busy || !newDueDate} onClick={() => void handleConfirmReschedule()}>
              Update Promised Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
