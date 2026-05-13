import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, X, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useSubscription } from "@/lib/use-subscription";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { isUnlimited } from "@/lib/plan";

export const Route = createFileRoute("/_app/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [university, setUniversity] = useState("");
  const [degree, setDegree] = useState("");
  const [semester, setSemester] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [newCode, setNewCode] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { limits, refresh } = useSubscription();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("courses").select("*").order("name")).data ?? [],
  });

  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? "");
      setUniversity(profile.university ?? "");
      setDegree(profile.degree ?? "");
      setSemester(profile.semester ?? "");
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").upsert({
        id: user!.id,
        full_name: name,
        university,
        degree,
        semester,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const courseLimit = limits.courses;
  const courseBlocked = !isUnlimited(courseLimit) && courses.length >= courseLimit;

  const addCourse = useMutation({
    mutationFn: async () => {
      if (!newCourse.trim()) return;
      if (courseBlocked) {
        setUpgradeOpen(true);
        throw new Error("Course limit reached on Free plan.");
      }
      const { error } = await supabase.from("courses").insert({ user_id: user!.id, name: newCourse.trim(), code: newCode.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { setNewCourse(""); setNewCode(""); qc.invalidateQueries({ queryKey: ["courses"] }); refresh(); },
    onError: (e: any) => { if (!courseBlocked) toast.error(e.message); },
  });

  const removeCourse = useMutation({
    mutationFn: async (id: string) => { await supabase.from("courses").delete().eq("id", id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["courses"] }); refresh(); },
  });

  return (
    <div>
      <PageHeader title="Profile" subtitle="Personalize your StudyOwl experience." />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4">Your information</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>University</Label>
              <Input value={university} onChange={(e) => setUniversity(e.target.value)} placeholder="Habib University" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Degree / Program</Label>
                <Input value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="BS Computer Science" />
              </div>
              <div className="space-y-1.5">
                <Label>Semester</Label>
                <Input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Fall 2025" />
              </div>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              {save.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" /> Current semester courses
          </h2>

          <div className="space-y-2 mb-4">
            {courses.length === 0 && <p className="text-sm text-muted-foreground">No courses yet. Add your first below.</p>}
            {courses.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  {c.code && <p className="text-xs text-muted-foreground">{c.code}</p>}
                </div>
                <button onClick={() => removeCourse.mutate(c.id)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {courseBlocked && (
            <p className="text-xs text-muted-foreground mb-2">
              Free plan allows {courseLimit} courses.{" "}
              <button onClick={() => setUpgradeOpen(true)} className="text-primary font-medium hover:underline">
                Upgrade for unlimited →
              </button>
            </p>
          )}

          <form onSubmit={(e) => { e.preventDefault(); addCourse.mutate(); }} className="space-y-2">
            <Input placeholder="Course name (e.g. Linear Algebra)" value={newCourse} onChange={(e) => setNewCourse(e.target.value)} disabled={courseBlocked} />
            <div className="flex gap-2">
              <Input placeholder="Code (optional)" value={newCode} onChange={(e) => setNewCode(e.target.value)} disabled={courseBlocked} />
              <Button type="submit" variant="outline" disabled={courseBlocked}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        reason={`The Free plan is capped at ${courseLimit} courses. Premium gives you unlimited courses, notes, and practice.`}
      />
    </div>
  );
}
