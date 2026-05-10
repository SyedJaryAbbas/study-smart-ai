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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ClipboardList, Lightbulb, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, differenceInDays, isPast } from "date-fns";

export const Route = createFileRoute("/_app/assignments")({ component: AssignmentsPage });

function recommendStart(due: Date, priority: string, estHours: number) {
  const days = differenceInDays(due, new Date());
  if (days < 0) return "Overdue — start now.";
  const buffer = priority === "high" ? Math.max(estHours / 2, 3) : priority === "medium" ? 2 : 1;
  if (days <= buffer) return "Start today.";
  return `Start within ${Math.max(1, days - Math.ceil(buffer))} day(s).`;
}

function AssignmentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("courses").select("*")).data ?? [],
  });

  const { data: items = [] } = useQuery({
    queryKey: ["assignments", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("assignments").select("*, courses(name)").order("due_date")).data ?? [],
  });

  const toggle = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      await supabase.from("assignments").update({ completed }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("assignments").delete().eq("id", id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assignments"] }); toast.success("Deleted"); },
  });

  return (
    <div>
      <PageHeader
        title="Assignments"
        subtitle="Track deadlines and get smart suggestions for when to start."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft">
                <Plus className="h-4 w-4 mr-1" /> New assignment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add assignment</DialogTitle></DialogHeader>
              <AssignmentForm courses={courses} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["assignments"] }); }} />
            </DialogContent>
          </Dialog>
        }
      />

      {items.length === 0 ? (
        <Card className="p-12 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No assignments yet. Add one to start tracking.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((a: any) => {
            const due = new Date(a.due_date);
            const overdue = !a.completed && isPast(due);
            return (
              <Card key={a.id} className={`p-5 ${a.completed ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-4">
                  <Checkbox
                    checked={a.completed}
                    onCheckedChange={(v) => toggle.mutate({ id: a.id, completed: !!v })}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className={`font-semibold ${a.completed ? "line-through" : ""} text-foreground`}>{a.title}</h3>
                        {a.courses && <p className="text-xs text-primary mt-0.5">{a.courses.name}</p>}
                        {a.description && <p className="text-sm text-muted-foreground mt-1.5">{a.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={a.priority === "high" ? "destructive" : a.priority === "medium" ? "default" : "secondary"}>
                          {a.priority}
                        </Badge>
                        <button onClick={() => del.mutate(a.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                      <span className={`font-medium ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                        {overdue ? "Overdue" : `Due ${formatDistanceToNow(due, { addSuffix: true })}`}
                      </span>
                      {!a.completed && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent text-accent-foreground">
                          <Lightbulb className="h-3 w-3" />
                          {recommendStart(due, a.priority, a.estimated_hours ?? 2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AssignmentForm({ courses, onDone }: { courses: any[]; onDone: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [hours, setHours] = useState(2);
  const [courseId, setCourseId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.from("assignments").insert({
        user_id: user!.id,
        title,
        description,
        due_date: new Date(dueDate).toISOString(),
        priority,
        estimated_hours: hours,
        course_id: courseId || null,
      });
      if (error) throw error;
      toast.success("Assignment added");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Due date</Label>
          <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Est. hours</Label>
          <Input type="number" min={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
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
      </div>
      <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
        {busy ? "Adding..." : "Add assignment"}
      </Button>
    </form>
  );
}
