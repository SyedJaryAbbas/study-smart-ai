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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, CheckCircle2, XCircle, ArrowRight, RotateCcw, Trophy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/lib/use-subscription";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { isUnlimited, remaining } from "@/lib/plan";

export const Route = createFileRoute("/_app/practice")({ component: PracticePage });

type Kind = "mcq" | "short" | "long" | "fill_blank";
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
  const [source, setSource] = useState("");
  const [noteId, setNoteId] = useState<string | undefined>();
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
      (await supabase
        .from("notes")
        .select("id, title, description, content, editable_content, is_edited")).data ?? [],
  });

  const stripHTML = (s: string) => {
    if (!s) return "";
    if (typeof window === "undefined") return s.replace(/<[^>]+>/g, " ");
    const div = document.createElement("div");
    div.innerHTML = s;
    return (div.textContent || div.innerText || "").trim();
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
      if (noteId) {
        const n = (notes as any[]).find((x) => x.id === noteId);
        if (n) {
          // Prefer the student's edited version; fall back to the originally
          // extracted text. AI questions should reflect their latest notes.
          const editedRaw = (n.editable_content || "").trim();
          const edited = editedRaw ? stripHTML(editedRaw) : "";
          const body = (edited || (n.content || "")).trim();
          if (!body) {
            toast.error(
              "This note has no extracted text. Re-upload the file or paste content into the topic box.",
            );
            setBusy(false);
            return;
          }
          material = `${n.title}\n\n${n.description ?? ""}\n\n${body}`;
        }
      }
      if (source.trim()) material += `\n\n${source.trim()}`;
      if (!material.trim()) {
        toast.error("Add some study material or select a note.");
        setBusy(false);
        return;
      }
      const data = await aiCall({ mode: "practice", source: material, kind, count: cappedCount });
      if (data.questions?.length) {
        setQuestions(data.questions);
        // Log usage (count of generated questions)
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
              ? "Turn your notes into an interactive practice session."
              : `Free plan: ${kindUsed}/${kindLimit} ${kind} questions used this month.`
          }
        />
        <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} reason={upgradeReason} />
        <Card className="p-6">
          <div className="grid md:grid-cols-3 gap-4">
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
                  {[3, 5, 8, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} questions
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Use a note (optional)</Label>
              <Select value={noteId} onValueChange={setNoteId}>
                <SelectTrigger>
                  <SelectValue placeholder="No note" />
                </SelectTrigger>
                <SelectContent>
                  {(notes as any[]).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.title}
                      {n.content ? "" : " (no text)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label>Topic or paste material</Label>
            <Textarea
              rows={4}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Optional: paste extra material or describe what to practice..."
            />
          </div>
          <Button
            onClick={generate}
            disabled={busy}
            className="mt-4 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft"
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
