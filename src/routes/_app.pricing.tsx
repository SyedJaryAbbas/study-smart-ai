import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/lib/use-subscription";
import { PLANS, type Plan } from "@/lib/plan";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export const Route = createFileRoute("/_app/pricing")({ component: PricingPage });

function PricingPage() {
  const { user } = useAuth();
  const { data, refresh } = useSubscription();
  const [busy, setBusy] = useState<Plan | null>(null);

  const activate = async (plan: Plan) => {
    if (!user) return;
    setBusy(plan);
    try {
      const now = new Date();
      let expires_at: string | null = null;
      if (plan === "premium_monthly") {
        const d = new Date(now);
        d.setMonth(d.getMonth() + 1);
        expires_at = d.toISOString();
      } else if (plan === "semester_pass") {
        const d = new Date(now);
        d.setDate(d.getDate() + (PLANS.semester_pass.durationDays ?? 180));
        expires_at = d.toISOString();
      }
      const { error } = await supabase.from("subscriptions").upsert(
        {
          user_id: user.id,
          plan,
          status: "active",
          started_at: now.toISOString(),
          expires_at,
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      toast.success(
        plan === "free" ? "Switched to Free plan" : `${PLANS[plan].name} activated (demo checkout)`,
      );
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const current = data?.plan ?? "free";

  return (
    <div>
      <PageHeader
        title="Plans & pricing"
        subtitle="Affordable plans built for university students in Pakistan."
      />

      {data && current !== "free" && (
        <Card className="p-4 mb-6 bg-accent border-primary/30">
          <p className="text-sm">
            You're on <span className="font-semibold">{PLANS[current].name}</span>
            {data.expiresAt && (
              <> — renews/expires on {format(new Date(data.expiresAt), "PPP")}</>
            )}
            .
          </p>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-5">
        {(Object.values(PLANS) as typeof PLANS[Plan][]).map((p) => {
          const isCurrent = p.id === current;
          return (
            <Card
              key={p.id}
              className={cn(
                "p-6 flex flex-col relative",
                p.highlight && "border-primary/50 shadow-elegant",
              )}
            >
              {p.highlight && (
                <Badge className="absolute -top-2 right-4 bg-gradient-primary text-primary-foreground border-0">
                  <Sparkles className="h-3 w-3 mr-1" /> Most popular
                </Badge>
              )}
              <h3 className="font-semibold text-lg text-foreground">{p.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{p.tagline}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold text-foreground">{p.price}</span>
                <span className="text-sm text-muted-foreground ml-1">{p.cadence}</span>
              </div>

              <ul className="mt-5 space-y-2 text-sm flex-1">
                {p.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    <span className="text-foreground/90">{b}</span>
                  </li>
                ))}
                {p.notIncluded?.map((b) => (
                  <li key={b} className="flex items-start gap-2 opacity-60">
                    <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-muted-foreground line-through">{b}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => activate(p.id)}
                disabled={isCurrent || busy === p.id}
                className={cn(
                  "mt-6 w-full",
                  p.highlight && !isCurrent
                    ? "bg-gradient-primary text-primary-foreground hover:opacity-90"
                    : "",
                )}
                variant={p.highlight && !isCurrent ? "default" : isCurrent ? "secondary" : "outline"}
              >
                {busy === p.id ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Activating...
                  </>
                ) : isCurrent ? (
                  "Current plan"
                ) : p.id === "free" ? (
                  "Switch to Free"
                ) : (
                  "Activate (demo)"
                )}
              </Button>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-6 text-center">
        Payments are simulated for now — a real gateway (JazzCash, Easypaisa, Stripe) will be wired in
        before launch. Your subscription will be saved to your account immediately.
      </p>
    </div>
  );
}
