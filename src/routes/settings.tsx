import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  useEffect(() => {
    setBranchEdits(
      Object.fromEntries(
        branches.map((b) => [b.id, { name: b.name, city: b.city ?? "", phone: (b as { phone?: string }).phone ?? "", address: (b as { address?: string }).address ?? "" }]),
      ),
    );
  }, [branches]);

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
