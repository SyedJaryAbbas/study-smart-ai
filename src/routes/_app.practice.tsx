import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, CheckCircle2, XCircle, ArrowRight, RotateCcw, Trophy, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/lib/use-subscription";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { isUnlimited, remaining } from "@/lib/plan";
import { NotePicker } from "@/components/NotePicker";

export const Route = createFileRoute("/_app/practice")({ component: PracticePage });

type Kind = "mcq" | "short" | "long" | "fill_blank";
type Difficulty = "easy" | "medium" | "hard" | "mixed";
type Scope = "all" | "latest" | "repeated";
type Q = { question: string; options?: string[]; answer: string; explanation?: string };
type Result = {
  correct: boolean;
  score: number;
  missing?: string[];
  feedback?: string;
  improved_answer?: string;
};
type Attempt = {
  studentAnswer: string;
  result: Result;
};

function PracticePage() {
  const { user } = useAuth();
  const [kind, setKind] = useState<Kind>("mcq");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [scope, setScope] = useState<Scope>("all");
  const [source, setSource] = useState("");
  const [noteIds, setNoteIds] = useState<string[]>([]);
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [attempts, setAttempts] = useState<Record<number, Attempt>>({});
  const [current, setCurrent] = useState(0);
  const [finished, setFinished] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");
  const { data: usage, limits, refresh } = useSubscription();

  const kindLimit = limits.practicePerMonth[kind];
  const kindUsed = usage?.practiceThisMonth[kind] ?? 0;
  const kindRemaining = remaining(kindLimit, kindUsed);
  const kindBlocked = kindRemaining <= 0;

  const { data: notes = [] } = useQuery({
    queryKey: ["notes-pick", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("notes")
          .select(
            "id, title, description, content, editable_content, is_edited, course_id, file_type, created_at",
          )
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-pick", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("courses").select("id, name, code").order("name")).data ?? [],
  });

  const stripHTML = (s: string) => {
    if (!s) return "";
    if (typeof window === "undefined")
      return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const div = document.createElement("div");
    div.innerHTML = s;
    return (div.textContent || div.innerText || "").trim();
  };

  const bodyFor = (n: any): string => {
    const edited = (n?.editable_content || "").trim();
    if (edited) return stripHTML(edited);
    return (n?.content || "").trim();
  };

  const selectedNotes = useMemo(
    () => (notes as any[]).filter((n) => noteIds.includes(n.id)),
    [notes, noteIds],
  );

  const scopedNotes = useMemo(() => {
    if (scope === "latest") {
      return [...selectedNotes]
        .sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        )
        .slice(0, Math.max(1, Math.ceil(selectedNotes.length / 2)));
    }
    return selectedNotes;
  }, [selectedNotes, scope]);

  const totalWords = useMemo(
    () =>
      scopedNotes.reduce((sum, n) => {
        const t = bodyFor(n);
        return sum + (t ? t.split(/\s+/).filter(Boolean).length : 0);
      }, 0),
    [scopedNotes],
  );

  const courseById = useMemo(() => {
    const m = new Map<string, any>();
    (courses as any[]).forEach((c) => m.set(c.id, c));
    return m;
  }, [courses]);

  /**
   * Build a combined study prompt from selected notes. Balances character
   * budget across notes so no single huge file dominates, tags each section
   * with its course, and optionally keeps only paragraphs whose key terms
   * appear in multiple notes ("repeated concepts" scope).
   */
  const buildMaterial = (): { material: string; emptyNotes: any[] } => {
    const MAX_CHARS = 22000;
    const emptyNotes: any[] = [];
    const sections: { header: string; body: string }[] = [];

    for (const n of scopedNotes) {
      const body = bodyFor(n);
      if (!body) {
        emptyNotes.push(n);
        continue;
      }
      const cname = n.course_id ? courseById.get(n.course_id)?.name ?? "" : "";
      const header = `### ${n.title}${cname ? ` (${cname})` : ""}`;
      sections.push({ header, body });
    }

    if (!sections.length) return { material: "", emptyNotes };

    const perSection = Math.floor(MAX_CHARS / sections.length);
    let combined = sections
      .map(({ header, body }) => `${header}\n${body.slice(0, perSection)}`)
      .join("\n\n---\n\n");

    if (scope === "repeated" && sections.length > 1) {
      const paras = combined.split(/\n{2,}/);
      const wordCounts = new Map<string, Set<number>>();
      paras.forEach((p, i) => {
        const words = p.toLowerCase().match(/[a-z]{5,}/g) ?? [];
        new Set(words).forEach((w) => {
          if (!wordCounts.has(w)) wordCounts.set(w, new Set());
          wordCounts.get(w)!.add(i);
        });
      });
      const shared = new Set(
        Array.from(wordCounts.entries())
          .filter(([, set]) => set.size >= 2)
          .map(([w]) => w),
      );
      const kept = paras.filter((p) => {
        const words = p.toLowerCase().match(/[a-z]{5,}/g) ?? [];
        return words.some((w) => shared.has(w));
      });
      if (kept.length) combined = kept.join("\n\n");
    }

    if (source.trim()) combined += `\n\n### Extra material\n${source.trim()}`;
    return { material: combined.slice(0, MAX_CHARS), emptyNotes };
  };

  const aiCall = async (body: any) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (res.status === 429) throw new Error("Rate limited — try again shortly.");
    return res.json();
  };

  const generate = async () => {
    if (kindBlocked) {
      setUpgradeReason(
        kindLimit === 0
          ? `${kind === "long" ? "Long answers" : "Fill-in-the-blanks"} are a Premium feature.`
          : `You've used your ${kindLimit} free ${kind} questions for this month.`,
      );
      setUpgradeOpen(true);
      return;
    }
    const cappedCount = isUnlimited(kindLimit) ? count : Math.min(count, kindRemaining);
    setBusy(true);
    setQuestions([]);
    setAttempts({});
    setCurrent(0);
    setFinished(false);
    try {
      let material = "";
      let emptyNotes: any[] = [];
      if (scopedNotes.length) {
        const built = buildMaterial();
        material = built.material;
        emptyNotes = built.emptyNotes;
        if (emptyNotes.length) {
          toast.warning(
            `${emptyNotes.length} note(s) had no extracted text and were skipped.`,
          );
        }
        if (!material.trim() && !source.trim()) {
          toast.error(
            "None of the selected notes have extracted text. Open a note and edit its content, or paste material below.",
          );
          setBusy(false);
          return;
        }
      } else if (source.trim()) {
        material = source.trim();
      }

      if (!material.trim()) {
        toast.error("Select at least one note or paste study material.");
        setBusy(false);
        return;
      }

      const noteTitles = scopedNotes.map((n) => n.title);
      const data = await aiCall({
        mode: "practice",
        source: material,
        kind,
        count: cappedCount,
        difficulty,
        noteTitles,
      });
      if (data.questions?.length) {
        setQuestions(data.questions);
        await supabase.from("practice_events").insert({
          user_id: user!.id,
          kind,
          count: data.questions.length,
        });
        refresh();
      } else toast.error("Could not parse AI response. Try again.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setQuestions([]);
    setAttempts({});
    setCurrent(0);
    setFinished(false);
  };

  const retryWrong = () => {
    const wrongIdx = questions
      .map((_, i) => i)
      .filter((i) => attempts[i] && !attempts[i].result.correct);
    if (!wrongIdx.length) {
      toast.success("Nothing to retry — perfect score!");
      return;
    }
    const wrongQs = wrongIdx.map((i) => questions[i]);
    setQuestions(wrongQs);
    setAttempts({});
    setCurrent(0);
    setFinished(false);
  };

  const recordAttempt = (idx: number, attempt: Attempt) =>
    setAttempts((a) => ({ ...a, [idx]: attempt }));

  const next = () => {
    if (current + 1 >= questions.length) setFinished(true);
    else setCurrent(current + 1);
  };

  // ---- Setup screen ----
  if (questions.length === 0) {
    return (
      <div>
        <PageHeader
          title="Practice Generator"
          subtitle={
            isUnlimited(kindLimit)
              ? "Combine notes from any course into a focused practice session."
              : `Free plan: ${kindUsed}/${kindLimit} ${kind} questions used this month.`
          }
        />
        <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason={upgradeReason} />
        <Card className="p-6 space-y-5">
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <NotePicker
              notes={notes as any[]}
              courses={courses as any[]}
              selectedIds={noteIds}
              onChange={setNoteIds}
              courseFilter={courseFilter}
              onCourseFilterChange={setCourseFilter}
            />
            {scopedNotes.length > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                <FileText className="h-3 w-3" />
                {scopedNotes.length} note{scopedNotes.length === 1 ? "" : "s"} loaded •{" "}
                {totalWords.toLocaleString()} words
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Question type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 8, 10, 15, 20].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} questions
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All selected notes</SelectItem>
                  <SelectItem value="latest">Latest uploads only</SelectItem>
                  <SelectItem value="repeated">Repeated concepts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Extra topic or material (optional)</Label>
            <Textarea
              rows={3}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Paste extra material or describe what to focus on..."
            />
          </div>

          <Button
            onClick={generate}
            disabled={busy}
            className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" /> Start practice
              </>
            )}
          </Button>
        </Card>
      </div>
    );
  }


  // ---- Final summary ----
  if (finished) {
    const total = questions.length;
    const scored = Object.values(attempts);
    const avg = scored.length
      ? Math.round(scored.reduce((s, a) => s + a.result.score, 0) / scored.length)
      : 0;
    const correctCount = scored.filter((a) => a.result.correct).length;
    return (
      <div>
        <PageHeader title="Session complete" subtitle="Here's how you did." />
        <Card className="p-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-elegant mb-4">
            <Trophy className="h-8 w-8 text-primary-foreground" />
          </div>
          <p className="text-4xl font-bold text-foreground">{avg}%</p>
          <p className="text-sm text-muted-foreground mt-1">
            {correctCount} of {total} answered correctly
          </p>
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            <Button onClick={retryWrong} variant="outline">
              <RotateCcw className="h-4 w-4 mr-1" /> Retry incorrect
            </Button>
            <Button onClick={restart} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              New session
            </Button>
          </div>
        </Card>

        <div className="mt-6 space-y-3">
          {questions.map((q, i) => {
            const a = attempts[i];
            return (
              <Card key={i} className="p-4">
                <div className="flex items-start gap-3">
                  {a?.result.correct ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground">
                      Q{i + 1}. {q.question}
                    </p>
                    {a && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Score: {a.result.score}% — your answer: {a.studentAnswer || "—"}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Active question ----
  const q = questions[current];
  const attempt = attempts[current];
  return (
    <div>
      <PageHeader
        title={`Question ${current + 1} of ${questions.length}`}
        subtitle="Answer, then check the feedback before moving on."
      />
      <Progress value={((current + (attempt ? 1 : 0)) / questions.length) * 100} className="mb-6" />

      <QuestionCard
        key={current}
        kind={kind}
        index={current}
        question={q}
        attempt={attempt}
        onAttempt={(a) => recordAttempt(current, a)}
        evaluate={(payload) => aiCall({ mode: "evaluate", ...payload })}
      />

      {attempt && (
        <div className="mt-5 flex justify-end">
          <Button onClick={next} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
            {current + 1 >= questions.length ? "Finish" : "Next question"}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  kind,
  question,
  attempt,
  onAttempt,
  evaluate,
}: {
  kind: Kind;
  index: number;
  question: Q;
  attempt?: Attempt;
  onAttempt: (a: Attempt) => void;
  evaluate: (p: { question: string; expected: string; studentAnswer: string; kind: Kind }) => Promise<Result>;
}) {
  const [text, setText] = useState("");
  const [evaluating, setEvaluating] = useState(false);

  const correctLetter = (question.answer || "").trim().charAt(0).toUpperCase();

  const submitMcq = (letter: string) => {
    if (attempt) return;
    const correct = letter === correctLetter;
    onAttempt({
      studentAnswer: letter,
      result: {
        correct,
        score: correct ? 100 : 0,
        feedback: question.explanation,
      },
    });
  };

  const submitFill = () => {
    if (attempt || !text.trim()) return;
    const expected = (question.answer || "").trim().toLowerCase();
    const given = text.trim().toLowerCase();
    const correct = expected.length > 0 && (given === expected || expected.includes(given) || given.includes(expected));
    onAttempt({
      studentAnswer: text,
      result: {
        correct,
        score: correct ? 100 : 0,
        feedback: question.explanation,
      },
    });
  };

  const submitWritten = async () => {
    if (attempt || !text.trim()) return;
    setEvaluating(true);
    try {
      const result = await evaluate({
        question: question.question,
        expected: question.answer,
        studentAnswer: text,
        kind,
      });
      onAttempt({ studentAnswer: text, result });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <Card className="p-6">
      <p className="font-semibold text-foreground text-base">{question.question}</p>

      {kind === "mcq" && question.options && (
        <ul className="mt-4 space-y-2">
          {question.options.map((opt, j) => {
            const letter = String.fromCharCode(65 + j);
            const picked = attempt?.studentAnswer === letter;
            const isCorrect = letter === correctLetter;
            const showState = !!attempt;
            return (
              <li key={j}>
                <button
                  onClick={() => submitMcq(letter)}
                  disabled={!!attempt}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg border text-sm transition-all flex items-center gap-3",
                    !showState && "border-border bg-secondary hover:border-primary/40 hover:bg-accent",
                    showState && isCorrect && "border-success/60 bg-success/10 text-foreground",
                    showState && picked && !isCorrect && "border-destructive/60 bg-destructive/10",
                    showState && !picked && !isCorrect && "opacity-60",
                  )}
                >
                  <span className="font-semibold w-6">{letter}.</span>
                  <span className="flex-1">{opt}</span>
                  {showState && isCorrect && <CheckCircle2 className="h-4 w-4 text-success" />}
                  {showState && picked && !isCorrect && <XCircle className="h-4 w-4 text-destructive" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {kind === "fill_blank" && (
        <div className="mt-4 space-y-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your answer..."
            disabled={!!attempt}
          />
          {!attempt && (
            <Button onClick={submitFill} disabled={!text.trim()} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              Submit answer
            </Button>
          )}
        </div>
      )}

      {(kind === "short" || kind === "long") && (
        <div className="mt-4 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={kind === "long" ? 8 : 4}
            placeholder={kind === "long" ? "Write your full response..." : "Write your answer..."}
            disabled={!!attempt}
          />
          {!attempt && (
            <Button
              onClick={submitWritten}
              disabled={!text.trim() || evaluating}
              className="bg-gradient-primary text-primary-foreground hover:opacity-90"
            >
              {evaluating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Evaluating...
                </>
              ) : (
                "Submit for evaluation"
              )}
            </Button>
          )}
        </div>
      )}

      {attempt && <Feedback kind={kind} question={question} attempt={attempt} />}
    </Card>
  );
}

function Feedback({ kind, question, attempt }: { kind: Kind; question: Q; attempt: Attempt }) {
  const { result } = attempt;
  return (
    <div
      className={cn(
        "mt-5 p-4 rounded-lg border",
        result.correct ? "bg-success/10 border-success/30" : "bg-destructive/5 border-destructive/30",
      )}
    >
      <div className="flex items-center justify-between">
        <p
          className={cn(
            "font-semibold inline-flex items-center gap-2 text-sm",
            result.correct ? "text-success-foreground" : "text-destructive",
          )}
        >
          {result.correct ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-success" /> Correct
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4" /> {kind === "mcq" || kind === "fill_blank" ? "Incorrect" : "Needs work"}
            </>
          )}
        </p>
        <span className="text-xs font-mono text-muted-foreground">{result.score}%</span>
      </div>

      {(kind === "mcq" || kind === "fill_blank") && !result.correct && (
        <p className="text-sm mt-2 text-foreground">
          <span className="font-medium">Correct answer:</span> {question.answer}
        </p>
      )}

      {result.feedback && <p className="text-sm mt-2 text-foreground/90">{result.feedback}</p>}

      {result.missing && result.missing.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Missing points</p>
          <ul className="mt-1 list-disc list-inside text-sm text-foreground space-y-0.5">
            {result.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {result.improved_answer && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggested answer</p>
          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{result.improved_answer}</p>
        </div>
      )}

      {(kind === "mcq" || kind === "fill_blank") && question.explanation && !result.feedback && (
        <p className="text-xs text-muted-foreground mt-2">{question.explanation}</p>
      )}
    </div>
  );
}
