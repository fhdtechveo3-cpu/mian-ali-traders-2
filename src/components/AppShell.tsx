import { useEffect, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  ReceiptText,
  RotateCcw,
  Users,
  BarChart3,
  FileSpreadsheet,
  Bell,
  Settings,
  LogOut,
  Building2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, admin: false },
  { to: "/pos", label: "POS / Billing", icon: ShoppingCart, admin: false },
  { to: "/products", label: "Products", icon: Package, admin: false },
  { to: "/inventory", label: "Inventory", icon: Boxes, admin: false },
  { to: "/sales", label: "Sales & Invoices", icon: ReceiptText, admin: false },
  { to: "/returns", label: "Returns & Refunds", icon: RotateCcw, admin: false },
  { to: "/customers", label: "Customers", icon: Users, admin: false },
  { to: "/analytics", label: "Analytics", icon: BarChart3, admin: false },
  { to: "/reports", label: "Reports & Excel", icon: FileSpreadsheet, admin: false },
  { to: "/notifications", label: "Notifications", icon: Bell, admin: false },
  { to: "/settings", label: "Settings", icon: Settings, admin: true },
] as const;

export function AppShell({ children, title, subtitle, actions }: { children: ReactNode; title: string; subtitle?: string | undefined; actions?: ReactNode }) {
  const { loading, session, isAdmin, profile, branches, activeBranch, setActiveBranch, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const branchName = branches.find((b) => b.id === profile?.branch_id)?.name ?? "No branch";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border px-5 py-5">
          <img src="/logo.png" alt="Mian Ali Traders — Animal Medicines, Feed & Wanda" className="w-full rounded-md bg-white p-2" />
          <p className="mt-2 text-xs text-sidebar-foreground/60">Medical Store POS</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.filter((n) => !n.admin || isAdmin).map((n) => {
            const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4 text-xs">
          <p className="font-medium">{profile?.full_name || profile?.email}</p>
          <p className="text-sidebar-foreground/60">{isAdmin ? "Administrator · All branches" : `Cashier · ${branchName}`}</p>
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => void signOut()}>
            <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            {isAdmin && (
              <Select value={activeBranch} onValueChange={setActiveBranch}>
                <SelectTrigger className="w-[220px]">
                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches (company)</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} · {b.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:hidden">
          {NAV.filter((n) => !n.admin || isAdmin).map((n) => (
            <Link key={n.to} to={n.to} className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs text-muted-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-5">{children}</main>
      </div>
    </div>
  );
}
