import type { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { supabase } from "../../lib/supabase";

export type SiraCompany = "Zong" | "Ieng" | "Mobiserve" | "AKL";

export type SiraProfile = {
  id: string;
  full_name: string;
  company: SiraCompany;
  mobile_number: string;
  job_title: string | null;
  role: string | null;
  username?: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: SiraProfile | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string,
    captchaToken?: string
  ) => Promise<{ error?: string; notCounted?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<SiraProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from("sira_user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!error && data) {
      const raw = data as SiraProfile;
      const legacyRole = String(raw.role ?? "").trim();

      setProfile({
        ...raw,
        job_title:
          String(raw.job_title ?? "").trim() ||
          (legacyRole && legacyRole.toLowerCase() !== "field engineer"
            ? legacyRole
            : null),
      });
    }
  }

  async function refreshProfile() {
    const currentUser = session?.user;
    if (!currentUser) return;
    await loadProfile(currentUser.id);
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;

      setSession(data.session ?? null);

      if (data.session?.user?.id) {
        await loadProfile(data.session.user.id);
      }

      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession ?? null);

      if (nextSession?.user?.id) {
        await loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string, captchaToken?: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });

    if (!error) return {};

    // Not a wrong password, so these do not count towards the lockout.
    if (error.code === "captcha_failed") {
      return { error: "Security check failed. Please try again.", notCounted: true };
    }

    // Server-side account lockout (password verification hook).
    if (/too many failed attempts/i.test(error.message ?? "")) {
      return {
        error: "Too many failed attempts. This account is locked for 15 minutes.",
        notCounted: true,
      };
    }

    if (error.status === 429) {
      return {
        error: "Too many login attempts. Please wait a few minutes and try again.",
        notCounted: true,
      };
    }

    return { error: "Invalid email or password." };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}
