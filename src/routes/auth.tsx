import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — StudyOwl" }] }),
});

function AuthPage() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) nav({ to: "/dashboard" });
  }, [user, loading, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        toast.success("Account created! Check your email to confirm.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        nav({ to: "/dashboard" });
      }
    } catch (e: any) {
      toast.error(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      {/* Left: form */}
      <div className="flex flex-col justify-center px-6 py-12 md:px-16">
        <div className="max-w-sm w-full mx-auto">
          <Link to="/" className="inline-block mb-8">
            <Logo size={36} withWordmark />
          </Link>

          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {tab === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {tab === "signup" ? "Start studying smarter today." : "Pick up where you left off."}
          </p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-8">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <TabsContent value="signup" className="space-y-4 mt-0">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required={tab === "signup"} placeholder="Aisha Khan" />
                </div>
              </TabsContent>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@university.edu" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
              </div>

              <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft h-11">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tab === "signup" ? "Create account" : "Sign in"}
              </Button>
            </form>
          </Tabs>

          <p className="mt-8 text-xs text-muted-foreground text-center">
            By continuing you agree to our terms and privacy policy.
          </p>
        </div>
      </div>

      {/* Right: visual */}
      <div className="hidden md:flex relative bg-gradient-hero items-center justify-center p-12 border-l border-border">
        <div className="max-w-md text-center">
          <div className="inline-flex p-5 rounded-3xl bg-gradient-primary shadow-elegant mb-6">
            <Logo size={64} />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Your AI study buddy
          </h2>
          <p className="mt-3 text-muted-foreground">
            "I finally know what to study, when to study, and how to stay ahead."
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-xs">
            {["Notes", "Plans", "Practice"].map((t) => (
              <div key={t} className="p-3 rounded-xl bg-card border border-border shadow-soft">
                <p className="font-semibold text-foreground">{t}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
