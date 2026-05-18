import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FileText, X, BookOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type PickerNote = {
  id: string;
  title: string;
  file_type?: string | null;
  created_at?: string | null;
  course_id?: string | null;
  content?: string | null;
  editable_content?: string | null;
  is_edited?: boolean | null;
};

export type PickerCourse = { id: string; name: string; code?: string | null };

function kindLabel(title: string, type?: string | null) {
  const n = (title ?? "").toLowerCase();
  const t = (type ?? "").toLowerCase();
  if (t === "application/pdf" || n.endsWith(".pdf")) return "PDF";
  if (n.endsWith(".docx") || t.includes("wordprocessingml")) return "DOCX";
  if (t.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/.test(n)) return "Image";
  if (t.startsWith("text/") || /\.(txt|md|markdown)$/.test(n)) return "Text";
  return "File";
}

export function NotePicker({
  notes,
  courses,
  selectedIds,
  onChange,
  courseFilter,
  onCourseFilterChange,
}: {
  notes: PickerNote[];
  courses: PickerCourse[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  courseFilter: string; // "all" or course id
  onCourseFilterChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const courseById = useMemo(() => {
    const m = new Map<string, PickerCourse>();
    courses.forEach((c) => m.set(c.id, c));
    return m;
  }, [courses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (courseFilter !== "all" && (n.course_id ?? "") !== courseFilter) return false;
      if (!q) return true;
      const cname = n.course_id ? courseById.get(n.course_id)?.name ?? "" : "";
      return (
        n.title.toLowerCase().includes(q) ||
        cname.toLowerCase().includes(q)
      );
    });
  }, [notes, search, courseFilter, courseById]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { course: PickerCourse | null; notes: PickerNote[] }>();
    filtered.forEach((n) => {
      const key = n.course_id ?? "__none__";
      if (!groups.has(key)) {
        groups.set(key, {
          course: n.course_id ? courseById.get(n.course_id) ?? null : null,
          notes: [],
        });
      }
      groups.get(key)!.notes.push(n);
    });
    return Array.from(groups.values()).sort((a, b) =>
      (a.course?.name ?? "zzz").localeCompare(b.course?.name ?? "zzz"),
    );
  }, [filtered, courseById]);

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const selectAllInGroup = (groupNotes: PickerNote[]) => {
    const ids = new Set(selectedIds);
    groupNotes.forEach((n) => ids.add(n.id));
    onChange(Array.from(ids));
  };

  const clearAll = () => onChange([]);

  const selectedNotes = notes.filter((n) => selectedIds.includes(n.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="justify-between min-w-[220px]">
              <span className="truncate">
                {selectedIds.length
                  ? `${selectedIds.length} note${selectedIds.length === 1 ? "" : "s"} selected`
                  : "Select notes..."}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-60 ml-2 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[380px] p-0" align="start">
            <div className="p-2 border-b">
              <Input
                placeholder="Search notes or courses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9"
              />
              <div className="flex gap-1 mt-2 flex-wrap">
                <Chip
                  active={courseFilter === "all"}
                  onClick={() => onCourseFilterChange("all")}
                  label="All courses"
                />
                {courses.map((c) => (
                  <Chip
                    key={c.id}
                    active={courseFilter === c.id}
                    onClick={() => onCourseFilterChange(c.id)}
                    label={c.code || c.name}
                  />
                ))}
              </div>
            </div>
            <ScrollArea className="max-h-80">
              {grouped.length === 0 && (
                <p className="p-6 text-sm text-center text-muted-foreground">No notes found.</p>
              )}
              {grouped.map((g, gi) => (
                <div key={gi} className="py-1">
                  <div className="px-3 py-1.5 flex items-center justify-between sticky top-0 bg-popover">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <BookOpen className="h-3 w-3" />
                      {g.course?.name ?? "Uncategorized"}
                    </p>
                    <button
                      type="button"
                      onClick={() => selectAllInGroup(g.notes)}
                      className="text-xs text-primary hover:underline"
                    >
                      Select all
                    </button>
                  </div>
                  {g.notes.map((n) => {
                    const checked = selectedIds.includes(n.id);
                    const hasText =
                      !!(n.editable_content && n.editable_content.trim()) ||
                      !!(n.content && n.content.trim());
                    return (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => toggle(n.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 flex items-start gap-3 hover:bg-accent transition-colors",
                          checked && "bg-accent/50",
                        )}
                      >
                        <Checkbox checked={checked} className="mt-0.5 pointer-events-none" />
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{n.title}</p>
                          <div className="flex gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                              {kindLabel(n.title, n.file_type)}
                            </span>
                            {n.is_edited && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                edited
                              </span>
                            )}
                            {!hasText && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                                no text
                              </span>
                            )}
                          </div>
                        </div>
                        {checked && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </ScrollArea>
            <div className="border-t p-2 flex justify-between">
              <Button variant="ghost" size="sm" onClick={clearAll} disabled={!selectedIds.length}>
                Clear
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {selectedIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear all
          </Button>
        )}
      </div>

      {selectedNotes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedNotes.map((n) => (
            <Badge
              key={n.id}
              variant="secondary"
              className="pl-2 pr-1 py-1 gap-1 font-normal"
            >
              <span className="truncate max-w-[180px]">{n.title}</span>
              <button
                type="button"
                onClick={() => toggle(n.id)}
                className="ml-0.5 hover:bg-background/60 rounded p-0.5"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-xs px-2 py-1 rounded-full border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-secondary text-foreground border-transparent hover:border-border",
      )}
    >
      {label}
    </button>
  );
}
