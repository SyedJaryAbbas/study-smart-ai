import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/_app/assistant")({ component: AssistantPage });

type Msg = { role: "user" | "assistant"; content: string };

function AssistantPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Load history
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("role, content")
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) setMessages(data as Msg[]);
    })();
  }, [user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || busy) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);

    await supabase.from("chat_messages").insert({ user_id: user!.id, role: "user", content: userMsg.content });

    let assistantSoFar = "";
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ mode: "chat", messages: [...messages, userMsg] }),
      });

      if (resp.status === 402) { toast.error("AI credits exhausted."); setBusy(false); return; }
      if (resp.status === 429) { toast.error("Rate limited — please wait."); setBusy(false); return; }
      if (!resp.ok || !resp.body) throw new Error("Stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantSoFar += delta;
              setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, content: assistantSoFar } : msg)));
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      await supabase.from("chat_messages").insert({ user_id: user!.id, role: "assistant", content: assistantSoFar });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="AI Assistant" subtitle="Stuck on a concept? Ask anything." />

      <Card className="flex flex-col h-[calc(100vh-220px)] min-h-[500px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="p-4 rounded-2xl bg-gradient-primary shadow-elegant mb-4">
                <Logo size={48} />
              </div>
              <h3 className="font-semibold text-lg text-foreground">Hi, I'm StudyOwl 🦉</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Ask me to explain a concept, solve a problem, or help you prepare for tomorrow's quiz.
              </p>
              <div className="mt-6 grid sm:grid-cols-2 gap-2 max-w-lg w-full">
                {[
                  "Explain binary trees with an example",
                  "Help me solve this accounting problem",
                  "How should I prepare for tomorrow's quiz?",
                  "Summarize the key points of supply and demand",
                ].map((p) => (
                  <button
                    key={p}
                    onClick={() => setInput(p)}
                    className="text-left text-xs px-3 py-2.5 rounded-lg bg-secondary hover:bg-accent transition-colors"
                  >
                    <Sparkles className="h-3 w-3 inline mr-1 text-primary" /> {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <div className="h-8 w-8 rounded-lg bg-gradient-primary shrink-0 flex items-center justify-center">
                  <Logo size={20} />
                </div>
              )}
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-gradient-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-secondary-foreground rounded-bl-sm"
                }`}
              >
                {m.content || (busy && i === messages.length - 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : "")}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="border-t border-border p-4 flex gap-2 bg-background"
        >
          <Input
            placeholder="Ask anything about your studies..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            className="flex-1"
          />
          <Button type="submit" disabled={busy || !input.trim()} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
