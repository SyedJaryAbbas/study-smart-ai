import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { LIMITS, type Plan, type PracticeKind } from "@/lib/plan";

function startOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export interface UsageSnapshot {
  plan: Plan;
  expiresAt: string | null;
  notesThisMonth: number;
  courses: number;
  practiceThisMonth: Record<PracticeKind, number>;
}

export function useSubscription() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<UsageSnapshot>({
    queryKey: ["subscription", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = startOfMonthISO();
      const [sub, notes, courses, practice] = await Promise.all([
        supabase.from("subscriptions").select("plan, status, expires_at").eq("user_id", user!.id).maybeSingle(),
        supabase
          .from("notes")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("practice_events").select("kind, count").gte("created_at", since),
      ]);

      let plan: Plan = "free";
      let expiresAt: string | null = null;
      const row = sub.data;
      if (row && row.status === "active") {
        const expired = row.expires_at && new Date(row.expires_at) < new Date();
        if (!expired) {
          plan = row.plan as Plan;
          expiresAt = row.expires_at;
        }
      }

      const practiceThisMonth: Record<PracticeKind, number> = {
        mcq: 0,
        short: 0,
        long: 0,
        fill_blank: 0,
      };
      for (const e of practice.data ?? []) {
        const k = e.kind as PracticeKind;
        if (k in practiceThisMonth) practiceThisMonth[k] += e.count ?? 1;
      }

      return {
        plan,
        expiresAt,
        notesThisMonth: notes.count ?? 0,
        courses: courses.count ?? 0,
        practiceThisMonth,
      };
    },
  });

  const limits = LIMITS[query.data?.plan ?? "free"];

  return {
    ...query,
    limits,
    refresh: () => qc.invalidateQueries({ queryKey: ["subscription"] }),
  };
}
