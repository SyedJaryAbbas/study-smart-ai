import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, GraduationCap, Calendar, BookOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, format } from "date-fns";

export const Route = createFileRoute("/_app/exams")({ component: ExamsPage });

function studyPlan(daysLeft: number, topics: string[]) {
  if (!topics.length) return "Add syllabus topics to generate a study plan.";
  if (daysLeft <= 0) return "Exam is today — focus on quick revision and weak areas.";
  const perDay = Math.ceil(topics.length / Math.max(daysLeft - 1, 1));
  return `Study ~${perDay} topic${perDay > 1 ? "s" : ""}/day. Reserve last day for revision.`;
}

function ExamsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("courses").select("*")).data ?? [],
  });

  const { data: items = [] } = useQuery({
    queryKey: ["exams", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("exams").select("*, courses(name)").order("exam_date")).data ?? [],
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("exams").delete().eq("id", id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exams"] }); toast.success("Deleted"); },
  });

  return (
    <div>
      <PageHeader
        title="Exams & Quizzes"
        subtitle="Plan ahead. We'll turn your syllabus into a daily study plan."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft">
                <Plus className="h-4 w-4 mr-1" /> Add exam
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add exam</DialogTitle></DialogHeader>
              <ExamForm courses={courses} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["exams"] }); }} />
            </DialogContent>
          </Dialog>
        }
      />

      {items.length === 0 ? (
        <Card className="p-12 text-center">
          <GraduationCap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No exams scheduled yet.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((e: any) => {
            const days = differenceInDays(new Date(e.exam_date), new Date());
            const topics = e.syllabus_topics ?? [];
            return (
              <Card key={e.id} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{e.title}</h3>
                    {e.courses && <p className="text-xs text-primary mt-0.5">{e.courses.name}</p>}
                    <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(e.exam_date), "PPP")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={days <= 3 ? "destructive" : days <= 7 ? "default" : "secondary"} className="capitalize">
                      {e.exam_type}
                    </Badge>
                    <button onClick={() => del.mutate(e.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="px-3 py-2.5 rounded-lg bg-accent text-accent-foreground text-xs flex items-start gap-2 mb-3">
                  <BookOpen className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    <strong>{days <= 0 ? "Today" : `${days} days left`}.</strong> {studyPlan(days, topics)}
                  </span>
                </div>

                {topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {topics.map((t: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExamForm({ courses, onDone }: { courses: any[]; onDone: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [examType, setExamType] = useState<"quiz" | "midterm" | "final" | "presentation">("quiz");
  const [examDate, setExamDate] = useState("");
  const [topics, setTopics] = useState("");
  const [courseId, setCourseId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.from("exams").insert({
        user_id: user!.id,
        title,
        exam_type: examType,
        exam_date: new Date(examDate).toISOString(),
        syllabus_topics: topics.split("\n").map((t) => t.trim()).filter(Boolean),
        course_id: courseId || null,
      });
      if (error) throw error;
      toast.success("Exam added");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Calculus Midterm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={examType} onValueChange={(v) => setExamType(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="quiz">Quiz</SelectItem>
              <SelectItem value="midterm">Midterm</SelectItem>
              <SelectItem value="final">Final</SelectItem>
              <SelectItem value="presentation">Presentation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input type="datetime-local" value={examDate} onChange={(e) => setExamDate(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Course</Label>
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
          <SelectContent>
            {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Syllabus topics (one per line)</Label>
        <Textarea value={topics} onChange={(e) => setTopics(e.target.value)} rows={5} placeholder={"Limits and continuity\nDerivatives\nIntegration techniques"} />
      </div>
      <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
        {busy ? "Adding..." : "Add exam"}
      </Button>
    </form>
  );
}
