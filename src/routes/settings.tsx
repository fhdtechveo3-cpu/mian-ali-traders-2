import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Lock, AlertTriangle, History, ArrowDownCircle, Banknote, ShoppingBag, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useCancelledCartLogs, useCashReconciliations, useCustomers, useInvoiceAuditLogs, useMovements, usePriceOverrideLogs, useProducts, useReturns, useSaleItems, useSales, useSuppliers } from "@/lib/queries";
import { PKR, NUM, exportRows } from "@/lib/pos";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Admin Settings — Mian Ali Traders POS" },
      { name: "description", content: "Admin-only controls for staff roles, branch assignment and branch details across both medical stores." },
      { property: "og:title", content: "Admin Settings — Mian Ali Traders POS" },
      { property: "og:description", content: "Manage cashiers, admins and branch information." },
    ],
  }),
  component: SettingsPage,
});

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  branch_id: string | null;
  role: string;
};

function SettingsPage() {
  const { isAdmin, branches, profile } = useAuth();
  const qc = useQueryClient();

  const { data: staff = [] } = useQuery({
    queryKey: ["staff"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("*"),
      ]);
      return ((profiles ?? []) as unknown as Omit<Row, "role">[]).map((p) => ({
        ...p,
        role: ((roles ?? []) as unknown as Array<{ user_id: string; role: string }>).find((r) => r.user_id === p.id)?.role ?? "cashier",
      })) as Row[];
    },
  });

  const [branchEdits, setBranchEdits] = useState<Record<string, { name: string; city: string; phone: string; address: string }>>({});
  
  // Secret Audit Vault States
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Cash Reconciliation Form State
  const [reconBranch, setReconBranch] = useState(branches[0]?.id ?? "");
  const [countedCash, setCountedCash] = useState(0);
  const [reconNotes, setReconNotes] = useState("");

  const { data: invoiceAudits = [] } = useInvoiceAuditLogs();
  const { data: priceOverrides = [] } = usePriceOverrideLogs();
  const { data: cancelledCarts = [] } = useCancelledCartLogs();
  const { data: cashRecons = [] } = useCashReconciliations("all");
  const { data: movements = [] } = useMovements("all");
  const { data: products = [] } = useProducts("all");
  const { data: sales = [] } = useSales("all");
  const { data: saleItems = [] } = useSaleItems();
  const { data: returns = [] } = useReturns("all");
  const { data: customers = [] } = useCustomers("all");
  const { data: suppliers = [] } = useSuppliers();

  const handleDownloadBackup = () => {
    const backupObj = {
      backupDate: new Date().toISOString(),
      system: "Mian Ali Traders POS",
      branches,
      staff,
      products,
      sales,
      saleItems,
      returns,
      movements,
      customers,
      suppliers,
      invoiceAudits,
      priceOverrides,
      cancelledCarts,
      cashRecons,
    };

    const jsonStr = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mian_ali_traders_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Full System Backup JSON file downloaded!");
  };

  useEffect(() => {
    setBranchEdits(
      Object.fromEntries(
        branches.map((b) => [b.id, { name: b.name, city: b.city ?? "", phone: (b as { phone?: string }).phone ?? "", address: (b as { address?: string }).address ?? "" }]),
      ),
    );
  }, [branches]);

  // Auto-lock security timer (5 minutes)
  useEffect(() => {
    if (!isUnlocked) return;
    const timer = setTimeout(() => {
      setIsUnlocked(false);
      toast.info("Security Vault locked due to inactivity");
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [isUnlocked]);

  if (!isAdmin) {
    return (
      <AppShell title="Settings" subtitle="Admin only">
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Only administrators can open settings.</CardContent></Card>
      </AppShell>
    );
  }

  const setRole = async (userId: string, role: string) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as "admin" | "cashier" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Role updated");
    void qc.invalidateQueries({ queryKey: ["staff"] });
  };

  const setBranch = async (userId: string, branchId: string) => {
    const { error } = await supabase.from("profiles").update({ branch_id: branchId }).eq("id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Branch assigned");
    void qc.invalidateQueries({ queryKey: ["staff"] });
  };

  const saveBranch = async (id: string) => {
    const e = branchEdits[id];
    if (!e) return;
    const { error } = await supabase
      .from("branches")
      .update({ name: e.name, city: e.city, phone: e.phone || null, address: e.address || null })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Branch updated");
    void qc.invalidateQueries();
  };

  const handleUnlockPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === "1818") {
      setIsUnlocked(true);
      setPinModalOpen(false);
      setPinInput("");
      toast.success("User Audit Vault Unlocked");
    } else {
      toast.error("Invalid Security Passcode");
      setPinInput("");
    }
  };

  const handleSaveReconciliation = async () => {
    const targetBranch = reconBranch || branches[0]?.id;
    if (!targetBranch) return;

    // Calculate expected cash from sales minus returns
    const { data: bSales } = await supabase.from("sales").select("paid_amount").eq("branch_id", targetBranch);
    const { data: bReturns } = await supabase.from("sales_returns").select("refund_amount").eq("branch_id", targetBranch);

    const totalSalesCash = (bSales ?? []).reduce((a, s) => a + Number(s.paid_amount || 0), 0);
    const totalRefundsCash = (bReturns ?? []).reduce((a, r) => a + Number(r.refund_amount || 0), 0);
    const expectedCash = totalSalesCash - totalRefundsCash;
    const discrepancy = countedCash - expectedCash;

    const { error } = await supabase.from("cash_reconciliations").insert({
      branch_id: targetBranch,
      expected_cash: expectedCash,
      counted_cash: countedCash,
      discrepancy,
      notes: reconNotes || null,
      created_by: profile?.id ?? null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Cash drawer reconciliation saved");
    setCountedCash(0);
    setReconNotes("");
    void qc.invalidateQueries({ queryKey: ["cash_reconciliations"] });
  };

  const stockAdjustments = movements.filter((m) => m.movement_type === "adjustment_out" || Number(m.quantity) < 0);

  return (
    <AppShell title="Settings" subtitle="Staff roles, access and branch details">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Staff & access control</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Branch</TableHead></TableRow></TableHeader>
            <TableBody>
              {staff.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.full_name || "—"} {s.id === profile?.id && <Badge variant="outline" className="ml-2">You</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">{s.email}</TableCell>
                  <TableCell>
                    <Select value={s.role} onValueChange={(v) => void setRole(s.id, v)}>
                      <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin (full access)</SelectItem>
                        <SelectItem value="cashier">Cashier (POS only)</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={s.branch_id ?? ""} onValueChange={(v) => void setBranch(s.id, v)}>
                      <SelectTrigger className="w-[200px]"><SelectValue placeholder="Assign branch" /></SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
              {!staff.length && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No staff accounts yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Cashiers only see their own branch data and cannot change prices, delete products or view profit figures.
          </p>
        </CardContent>
      </Card>

      {/* Camouflaged Secret Audit Card */}
      <Card className="mt-5 border-amber-500/20 bg-amber-500/5">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" /> Create User Audit
            </CardTitle>

          </div>
          <Button
            variant={isUnlocked ? "secondary" : "default"}
            size="sm"
            onClick={() => {
              if (isUnlocked) {
                setIsUnlocked(false);
                toast.info("Audit Vault locked");
              } else {
                setPinModalOpen(true);
              }
            }}
          >
            {isUnlocked ? <Lock className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            {isUnlocked ? "Lock Access" : "Access Credentials Audit"}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Audit user credentials, system access profiles, administrative changes, and cashier price overrides.
          </p>
        </CardContent>
      </Card>

      {/* PIN Lock Passcode Modal */}
      <Dialog open={pinModalOpen} onOpenChange={setPinModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Lock className="h-5 w-5 text-amber-600" /> User Access Control
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter security passcode to verify administrator credentials.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUnlockPin} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Security Passcode (PIN)</Label>
              <Input
                type="password"
                placeholder="••••"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full">
              Verify Credentials
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Unlocked Secret Anti-Fraud Audit Vault View */}
      {isUnlocked && (
        <Card className="mt-5 border-2 border-amber-500 shadow-md bg-card">
          <CardHeader className="pb-3 border-b bg-amber-500/10 flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <ShieldCheck className="h-5 w-5" /> Owner Anti-Fraud Vault (Unlocked)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="xs" variant="outline" className="bg-background text-xs font-semibold" onClick={handleDownloadBackup}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Full System Backup (.json)
              </Button>
              <Badge variant="destructive" className="bg-red-600 text-white text-[10px]">
                CONFIDENTIAL OWNER LOGS
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <Tabs defaultValue="invoices">
              <TabsList className="mb-4 flex flex-wrap gap-1">
                <TabsTrigger value="invoices">🔴 Admin Invoice Edits ({invoiceAudits.length})</TabsTrigger>
                <TabsTrigger value="price_overrides">🟡 Cashier Price Overrides ({priceOverrides.length})</TabsTrigger>
                <TabsTrigger value="stock_loss">🟠 Stock Loss / Decreases ({stockAdjustments.length})</TabsTrigger>
                <TabsTrigger value="cancelled_carts">🟣 Cancelled Cart Attempts ({cancelledCarts.length})</TabsTrigger>
                <TabsTrigger value="cash_recon">💵 Cash Drawer Reconciliation</TabsTrigger>
              </TabsList>

              {/* Tab 1: Admin Invoice Edits (Diff Log) */}
              <TabsContent value="invoices" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Complete history of invoices edited by Administrators. Fields that were modified are highlighted in <span className="font-bold text-red-600 dark:text-red-400">RED</span>.
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Changed Date</TableHead>
                        <TableHead>Customer Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Paid Amount</TableHead>
                        <TableHead>Remaining Due</TableHead>
                        <TableHead>Total Amount</TableHead>
                        <TableHead>Payment Method</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceAudits.map((log) => {
                        const oldV = log.old_values as Record<string, unknown>;
                        const newV = log.new_values as Record<string, unknown>;

                        const nameChanged = String(oldV.customer_name ?? "") !== String(newV.customer_name ?? "");
                        const phoneChanged = String(oldV.customer_phone ?? "") !== String(newV.customer_phone ?? "");
                        const discChanged = Number(oldV.discount ?? 0) !== Number(newV.discount ?? 0);
                        const paidChanged = Number(oldV.paid_amount ?? 0) !== Number(newV.paid_amount ?? 0);
                        const remChanged = Number(oldV.remaining_amount ?? 0) !== Number(newV.remaining_amount ?? 0);
                        const totalChanged = Number(oldV.total ?? 0) !== Number(newV.total ?? 0);
                        const methodChanged = String(oldV.payment_method ?? "") !== String(newV.payment_method ?? "");

                        return (
                          <TableRow key={log.id}>
                            <TableCell className="font-bold text-primary">{log.invoice_number}</TableCell>
                            <TableCell className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</TableCell>
                            
                            <TableCell className={nameChanged ? "text-red-600 font-bold bg-red-500/10 p-2 rounded" : ""}>
                              {nameChanged ? `${oldV.customer_name || "Walk-in"} ➔ ${newV.customer_name}` : String(newV.customer_name || "Walk-in")}
                            </TableCell>

                            <TableCell className={phoneChanged ? "text-red-600 font-bold bg-red-500/10 p-2 rounded" : ""}>
                              {phoneChanged ? `${oldV.customer_phone || "—"} ➔ ${newV.customer_phone}` : String(newV.customer_phone || "—")}
                            </TableCell>

                            <TableCell className={discChanged ? "text-red-600 font-bold bg-red-500/10 p-2 rounded" : ""}>
                              {discChanged ? `${PKR(Number(oldV.discount))} ➔ ${PKR(Number(newV.discount))}` : PKR(Number(newV.discount))}
                            </TableCell>

                            <TableCell className={paidChanged ? "text-red-600 font-bold bg-red-500/10 p-2 rounded" : ""}>
                              {paidChanged ? `${PKR(Number(oldV.paid_amount))} ➔ ${PKR(Number(newV.paid_amount))}` : PKR(Number(newV.paid_amount))}
                            </TableCell>

                            <TableCell className={remChanged ? "text-red-600 font-bold bg-red-500/10 p-2 rounded" : ""}>
                              {remChanged ? `${PKR(Number(oldV.remaining_amount))} ➔ ${PKR(Number(newV.remaining_amount))}` : PKR(Number(newV.remaining_amount))}
                            </TableCell>

                            <TableCell className={totalChanged ? "text-red-600 font-bold bg-red-500/10 p-2 rounded" : ""}>
                              {totalChanged ? `${PKR(Number(oldV.total))} ➔ ${PKR(Number(newV.total))}` : PKR(Number(newV.total))}
                            </TableCell>

                            <TableCell className={methodChanged ? "text-red-600 font-bold bg-red-500/10 p-2 rounded" : ""}>
                              {methodChanged ? `${oldV.payment_method} ➔ ${newV.payment_method}` : String(newV.payment_method)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!invoiceAudits.length && (
                        <TableRow>
                          <TableCell colSpan={9} className="py-6 text-center text-xs text-muted-foreground">
                            No admin invoice modifications recorded.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Tab 2: Cashier Rate Overrides */}
              <TabsContent value="price_overrides" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Records whenever a cashier sells an item at a custom rate different from standard MRP. Discrepancies are highlighted in <span className="font-bold text-red-600">RED</span>.
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Product Name</TableHead>
                        <TableHead className="text-right">Standard Rate</TableHead>
                        <TableHead className="text-right">Sold Rate</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Price Diff per Unit</TableHead>
                        <TableHead className="text-right">Total Discrepancy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priceOverrides.map((p) => {
                        const diff = Number(p.sold_price) - Number(p.standard_price);
                        const totalDiff = diff * Number(p.quantity);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="text-muted-foreground">{new Date(p.created_at).toLocaleString()}</TableCell>
                            <TableCell className="font-medium">{p.product_name}</TableCell>
                            <TableCell className="text-right">{PKR(p.standard_price)}</TableCell>
                            <TableCell className="text-right font-bold text-amber-600">{PKR(p.sold_price)}</TableCell>
                            <TableCell className="text-right font-semibold">{NUM(p.quantity)}</TableCell>
                            <TableCell className="text-right font-bold text-red-600">{PKR(diff)}</TableCell>
                            <TableCell className="text-right font-bold text-red-600">{PKR(totalDiff)}</TableCell>
                          </TableRow>
                        );
                      })}
                      {!priceOverrides.length && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-6 text-center text-xs text-muted-foreground">
                            No cashier rate overrides recorded.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Tab 3: Stock Loss & Manual Adjustments */}
              <TabsContent value="stock_loss" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Audit log of manual inventory reductions and losses. Quantities decreased are highlighted in <span className="font-bold text-red-600">RED</span>.
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Product Name</TableHead>
                        <TableHead className="text-right">Decreased Quantity</TableHead>
                        <TableHead>Reference / Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockAdjustments.map((m) => {
                        const prod = products.find((x) => x.id === m.product_id);
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="text-muted-foreground">{new Date(m.created_at).toLocaleString()}</TableCell>
                            <TableCell className="font-medium">{prod?.name || "Product"}</TableCell>
                            <TableCell className="text-right font-bold text-red-600">{NUM(m.quantity)}</TableCell>
                            <TableCell className="text-muted-foreground">{m.note || m.reference || "Manual Adjustment"}</TableCell>
                          </TableRow>
                        );
                      })}
                      {!stockAdjustments.length && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                            No manual stock loss or reductions recorded.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Tab 4: Cancelled Cart Attempts */}
              <TabsContent value="cancelled_carts" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Audit log of carts cleared or cancelled by cashiers after adding items. Cart totals are shown in <span className="font-bold text-red-600">RED</span>.
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Items in Cart</TableHead>
                        <TableHead className="text-right">Cancelled Total Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cancelledCarts.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleString()}</TableCell>
                          <TableCell className="font-medium">
                            {c.items.map((i) => `${i.product_name} (${i.quantity}x)`).join(", ")}
                          </TableCell>
                          <TableCell className="text-right font-bold text-red-600">{PKR(c.cart_total)}</TableCell>
                        </TableRow>
                      ))}
                      {!cancelledCarts.length && (
                        <TableRow>
                          <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                            No cancelled cart attempts recorded.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Tab 5: Daily Cash Drawer Reconciliation */}
              <TabsContent value="cash_recon" className="space-y-4">
                <div className="rounded-md border p-4 bg-muted/30 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-1.5">
                    <Banknote className="h-4 w-4 text-emerald-600" /> Record End-of-Day Cash Count
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Branch</Label>
                      <Select value={reconBranch} onValueChange={setReconBranch}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Actual Cash Counted (Rs)</Label>
                      <Input type="number" value={countedCash} onChange={(e) => setCountedCash(Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Notes / Discrepancy Reason</Label>
                      <Input placeholder="e.g. Minor coins difference" value={reconNotes} onChange={(e) => setReconNotes(e.target.value)} />
                    </div>
                  </div>
                  <Button size="sm" onClick={() => void handleSaveReconciliation()}>
                    Save Cash Reconciliation
                  </Button>
                </div>

                <div className="rounded-md border overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Expected System Cash</TableHead>
                        <TableHead className="text-right">Counted Cash</TableHead>
                        <TableHead className="text-right">Discrepancy (Shortage / Excess)</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashRecons.map((r) => {
                        const bName = branches.find((b) => b.id === r.branch_id)?.name || "—";
                        const isShort = Number(r.discrepancy) < 0;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                            <TableCell className="font-medium">{bName}</TableCell>
                            <TableCell className="text-right">{PKR(r.expected_cash)}</TableCell>
                            <TableCell className="text-right font-bold">{PKR(r.counted_cash)}</TableCell>
                            <TableCell className={`text-right font-bold ${isShort ? "text-red-600" : "text-emerald-600"}`}>
                              {PKR(r.discrepancy)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{r.notes || "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                      {!cashRecons.length && (
                        <TableRow>
                          <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                            No cash drawer reconciliations recorded yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {branches.map((b) => {
          const e = branchEdits[b.id];
          if (!e) return null;
          return (
            <Card key={b.id}>
              <CardHeader className="pb-3"><CardTitle className="text-base">{b.name}</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs">Branch name</Label><Input value={e.name} onChange={(ev) => setBranchEdits({ ...branchEdits, [b.id]: { ...e, name: ev.target.value } })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">City</Label><Input value={e.city} onChange={(ev) => setBranchEdits({ ...branchEdits, [b.id]: { ...e, city: ev.target.value } })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={e.phone} onChange={(ev) => setBranchEdits({ ...branchEdits, [b.id]: { ...e, phone: ev.target.value } })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Address</Label><Input value={e.address} onChange={(ev) => setBranchEdits({ ...branchEdits, [b.id]: { ...e, address: ev.target.value } })} /></div>
                <Button className="sm:col-span-2" variant="outline" onClick={() => void saveBranch(b.id)}>Save branch</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
