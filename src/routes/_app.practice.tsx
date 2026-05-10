import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/practice")({ component: PracticePage });

type Q = { question: string; options?: string[]; answer: string; explanation?: string };

function PracticePage() {
  const { user } = useAuth();
  const [kind, setKind] = useState<"mcq" | "short" | "long" | "fill_blank">("mcq");
  const [count, setCount] = useState(5);
  const [source, setSource] = useState("");
  const [noteId, setNoteId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const { data: notes = [] } = useQuery({
    queryKey: ["notes-pick", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("notes").select("id, title, description, content")).data ?? [],
  });

  const generate = async () => {
    setBusy(true);
    setQuestions([]);
    setRevealed(new Set());
    try {
      let material = source;
      if (noteId) {
        const n = (notes as any[]).find((x) => x.id === noteId);
        if (n) material = `Title: ${n.title}\n${n.description ?? ""}\n${n.content ?? ""}\n${material}`;
      }
      if (!material.trim()) {
        toast.error("Add some study material or select a note.");
        setBusy(false);
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ mode: "practice", source: material, kind, count }),
      });
      if (res.status === 402) { toast.error("AI credits exhausted."); return; }
      if (res.status === 429) { toast.error("Rate limited — try again shortly."); return; }
      const data = await res.json();
      if (data.questions) setQuestions(data.questions);
      else toast.error("Could not parse AI response. Try again.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Practice Generator" subtitle="Turn any notes into targeted practice in seconds." />

      <Card className="p-6 mb-6">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Question type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mcq">Multiple choice (MCQ)</SelectItem>
                <SelectItem value="short">Short questions</SelectItem>
                <SelectItem value="long">Long questions</SelectItem>
                <SelectItem value="fill_blank">Fill in the blanks</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>How many?</Label>
            <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 5, 8, 10].map((n) => <SelectItem key={n} value={String(n)}>{n} questions</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Use a note (optional)</Label>
            <Select value={noteId} onValueChange={setNoteId}>
              <SelectTrigger><SelectValue placeholder="No note" /></SelectTrigger>
              <SelectContent>
                {(notes as any[]).map((n) => <SelectItem key={n.id} value={n.id}>{n.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label>Topic or paste material</Label>
          <Textarea rows={4} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Paste lecture content, syllabus topics, or describe what to practice..." />
        </div>
        <Button onClick={generate} disabled={busy} className="mt-4 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft">
          {busy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...</> : <><Sparkles className="h-4 w-4 mr-1" /> Generate practice</>}
        </Button>
      </Card>

      {questions.length > 0 && (
        <div className="space-y-4">
          {questions.map((q, i) => (
            <Card key={i} className="p-5">
              <p className="font-semibold text-foreground"><span className="text-primary mr-1">Q{i + 1}.</span> {q.question}</p>
              {q.options && (
                <ul className="mt-3 space-y-1.5">
                  {q.options.map((opt, j) => (
                    <li key={j} className="text-sm px-3 py-2 rounded-lg bg-secondary text-secondary-foreground">
                      <span className="font-semibold mr-2">{String.fromCharCode(65 + j)}.</span> {opt}
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="ghost" size="sm" className="mt-3 text-primary" onClick={() => setRevealed((s) => new Set(s).add(i))}>
                {revealed.has(i) ? "Hide answer" : "Reveal answer"}
              </Button>
              {revealed.has(i) && (
                <div className="mt-2 px-3 py-2.5 rounded-lg bg-success/10 border border-success/30 text-sm">
                  <p className="font-semibold text-success-foreground inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-success" /> Answer:
                  </p>
                  <p className="mt-1 text-foreground">{q.answer}</p>
                  {q.explanation && <p className="mt-1.5 text-xs text-muted-foreground">{q.explanation}</p>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
