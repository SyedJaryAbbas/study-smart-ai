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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Search, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { extractText } from "@/lib/extract-text";
import { useSubscription } from "@/lib/use-subscription";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { isUnlimited } from "@/lib/plan";

export const Route = createFileRoute("/_app/notes")({ component: NotesPage });

function NotesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { data: usage, limits, refresh } = useSubscription();

  const limit = limits.notesPerMonth;
  const used = usage?.notesThisMonth ?? 0;
  const blocked = !isUnlimited(limit) && used >= limit;

  const { data: courses = [] } = useQuery({
    queryKey: ["courses", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("courses").select("*").order("name")).data ?? [],
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["notes", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("notes").select("*, courses(name, color)").order("created_at", { ascending: false })).data ?? [],
  });

  const filtered = notes.filter((n: any) =>
    !search ||
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.description?.toLowerCase().includes(search.toLowerCase())
  );

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notes").delete().eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      toast.success("Note deleted");
    },
  });

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle={
          isUnlimited(limit)
            ? "Upload and organize your lecture notes by course."
            : `Upload and organize your lecture notes by course. ${used}/${limit} uploads used this month.`
        }
        action={
          <>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={(e) => {
                    if (blocked) {
                      e.preventDefault();
                      setUpgradeOpen(true);
                    }
                  }}
                  className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft"
                >
                  <Plus className="h-4 w-4 mr-1" /> New note
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Upload a note</DialogTitle></DialogHeader>
                <NoteForm
                  courses={courses}
                  onDone={() => {
                    setOpen(false);
                    qc.invalidateQueries({ queryKey: ["notes"] });
                    refresh();
                  }}
                />
              </DialogContent>
            </Dialog>
            <UpgradeDialog
              open={upgradeOpen}
              onOpenChange={setUpgradeOpen}
              reason={`You've used all ${limit} free uploads this month. Upgrade for unlimited notes.`}
            />
          </>
        }
      />

      {!isUnlimited(limit) && used >= limit - 1 && (
        <Card className="p-4 mb-5 border-primary/40 bg-accent">
          <p className="text-sm">
            {blocked
              ? "You've hit the free upload limit for this month."
              : "Heads up — you're on your last free upload this month."}{" "}
            <button onClick={() => setUpgradeOpen(true)} className="text-primary font-medium hover:underline">
              See plans →
            </button>
          </p>
        </Card>
      )}

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No notes yet. Upload your first lecture notes to get started.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((n: any) => (
            <Card key={n.id} className="p-5 hover:shadow-elegant transition-all">
              <div className="flex items-start justify-between mb-2">
                <div className="h-9 w-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">
                  <FileText className="h-4 w-4" />
                </div>
                <button onClick={() => del.mutate(n.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <h3 className="font-semibold text-foreground line-clamp-1">{n.title}</h3>
              {n.courses && <p className="text-xs text-primary mt-0.5">{n.courses.name}</p>}
              <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{n.description || "—"}</p>
              {n.file_url && (
                <a href={n.file_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Open file <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteForm({ courses, onDone }: { courses: any[]; onDone: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState<string | undefined>();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let file_url: string | null = null;
      let file_type: string | null = null;
      let content: string | null = null;
      if (file) {
        // Extract text first so AI practice uses the actual content, not the filename.
        const extracted = await extractText(file);
        content = extracted || null;
        if (!extracted) {
          toast.message("Couldn't auto-extract text from this file — you can paste it in the description.");
        }
        const path = `${user!.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("student-files").upload(path, file);
        if (error) throw error;
        const { data } = await supabase.storage.from("student-files").createSignedUrl(path, 60 * 60 * 24 * 365);
        file_url = data?.signedUrl ?? null;
        file_type = file.type;
      }
      const { error } = await supabase.from("notes").insert({
        user_id: user!.id,
        title,
        description,
        course_id: courseId || null,
        file_url,
        file_type,
        content,
      });
      if (error) throw error;
      toast.success("Note saved");
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
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Week 3: Binary Trees" />
      </div>
      <div className="space-y-1.5">
        <Label>Course</Label>
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger><SelectValue placeholder={courses.length ? "Pick a course" : "Add courses in Profile first"} /></SelectTrigger>
          <SelectContent>
            {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional summary..." rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label>File (PDF, DOCX, image)</Label>
        <Input type="file" accept=".pdf,.docx,.doc,.txt,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
        {busy ? "Saving..." : "Save note"}
      </Button>
    </form>
  );
}
