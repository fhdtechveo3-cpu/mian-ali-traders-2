import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Branch = { id: string; name: string; city: string; phone: string | null; address: string | null };
export type Profile = { id: string; full_name: string; email: string | null; branch_id: string | null; is_active: boolean };

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: "admin" | "cashier" | null;
  isAdmin: boolean;
  branches: Branch[];
  activeBranch: string; // branch id or "all"
  setActiveBranch: (v: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<"admin" | "cashier" | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = async (uid: string) => {
    try {
      const [{ data: p }, { data: r }, { data: b }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle(),
        supabase.from("branches").select("*").order("created_at"),
      ]);
      setProfile((p as Profile) ?? null);
      const rr = (r?.role as "admin" | "cashier") ?? "cashier";
      setRole(rr);
      setBranches((b as Branch[]) ?? []);
      setActiveBranch(rr === "admin" ? "all" : ((p as Profile)?.branch_id ?? "all"));
    } catch (err) {
      console.error("Failed to load user profile/branches:", err);
    }
  };

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        setTimeout(() => void load(s.user.id), 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    async function initAuth() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("Supabase getSession error:", error);
        if (mounted) {
          setSession(data?.session ?? null);
          if (data?.session?.user) {
            await load(data.session.user.id);
          }
        }
      } catch (err) {
        console.error("Auth init exception:", err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void initAuth();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    loading,
    session,
    user: session?.user ?? null,
    profile,
    role,
    isAdmin: role === "admin",
    branches,
    activeBranch,
    setActiveBranch,
    refresh: async () => {
      if (session?.user) await load(session.user.id);
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
      setRole(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Fallback used only if a component renders outside the provider (e.g. an
// error/pending boundary during SSR) — keeps the app rendering instead of crashing.
const emptyAuth: AuthState = {
  loading: true,
  session: null,
  user: null,
  profile: null,
  role: null,
  isAdmin: false,
  branches: [],
  activeBranch: "all",
  setActiveBranch: () => {},
  refresh: async () => {},
  signOut: async () => {},
};

export function useAuth() {
  return useContext(Ctx) ?? emptyAuth;
}
