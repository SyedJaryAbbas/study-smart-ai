import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Download, Trash2, Pencil, Maximize2, Loader2,
  FileText, Image as ImageIcon, FileType2, Check, X,
  Eye, History, Save, Cloud, CloudOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import mammoth from "mammoth";
import { RichEditor, htmlToPlainText, plainTextToHTML } from "@/components/RichEditor";

type Kind = "pdf" | "docx" | "image" | "text" | "other";

function detectKind(name: string, type?: string | null): Kind {
  const n = name.toLowerCase();
  const t = (type ?? "").toLowerCase();
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (
    n.endsWith(".docx") ||
    t === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (t.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/.test(n)) return "image";
  if (t.startsWith("text/") || /\.(txt|md|markdown|csv|json|log)$/.test(n)) return "text";
  return "other";
}

function pathFromSignedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const marker = "/object/sign/student-files/";
    const i = u.pathname.indexOf(marker);
    if (i === -1) return null;
    return decodeURIComponent(u.pathname.slice(i + marker.length));
  } catch {
    return null;
  }
}

const isEditableKind = (k: Kind) => k !== "image"; // pdf/docx/text/other-with-content all OK

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function NoteViewer({
  note,
  open,
  onOpenChange,
  onDeleted,
  onRenamed,
  onUpdated,
}: {
  note: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted?: () => void;
  onRenamed?: (title: string) => void;
  onUpdated?: () => void;
}) {
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [initialHTML, setInitialHTML] = useState<string>("");
  const [currentHTML, setCurrentHTML] = useState<string>("");
  const [currentText, setCurrentText] = useState<string>("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastEditedAt, setLastEditedAt] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const kind: Kind = useMemo(
    () => (note ? detectKind(note.title ?? "", note.file_type) : "other"),
    [note],
  );
  const canEdit = isEditableKind(kind);

  // Reset state whenever a new note opens.
  useEffect(() => {
    if (!open || !note) return;
    setFreshUrl(null);
    setFullscreen(false);
    setRenaming(false);
    setTitleDraft(note.title ?? "");
    setMode("view");
    setStatus("idle");
    setLastEditedAt(note.last_edited_at ?? null);

    const fromEditable = note.editable_content ?? "";
    const fromExtracted = note.content ?? "";
    const description = note.description ?? "";
    let html = "";
    if (fromEditable) {
      // editable_content is stored as HTML from the editor; if it looks like
      // plain text (no tags), wrap into paragraphs.
      html = /<[a-z][^>]*>/i.test(fromEditable) ? fromEditable : plainTextToHTML(fromEditable);
    } else if (fromExtracted) {
      html = plainTextToHTML(fromExtracted);
    } else if (description) {
      html = plainTextToHTML(description);
    }
    setInitialHTML(html);
    setCurrentHTML(html);
    setCurrentText(htmlToPlainText(html));
    dirtyRef.current = false;

    if (!note.file_url) return;
    const path = pathFromSignedUrl(note.file_url);
    if (!path) {
      setFreshUrl(note.file_url);
      return;
    }
    setLoadingUrl(true);
    supabase.storage
      .from("student-files")
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (error || !data) setFreshUrl(note.file_url);
        else setFreshUrl(data.signedUrl);
      })
      .finally(() => setLoadingUrl(false));
  }, [open, note]);

  // Flush pending save on close.
  useEffect(() => {
    if (!open && dirtyRef.current && note) {
      void persist(currentHTML, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const persist = useCallback(
    async (html: string, snapshot: boolean) => {
      if (!note) return;
      setStatus("saving");
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("notes")
        .update({
          editable_content: html,
          is_edited: true,
          last_edited_at: now,
          updated_at: now,
        })
        .eq("id", note.id);
      if (error) {
        setStatus("error");
        toast.error(error.message);
        return;
      }
      dirtyRef.current = false;
      setLastEditedAt(now);
      setStatus("saved");
      onUpdated?.();

      if (snapshot) {
        const { data: latest } = await supabase
          .from("note_versions")
          .select("version_number")
          .eq("note_id", note.id)
          .order("version_number", { ascending: false })
          .limit(1);
        const nextVersion = (latest?.[0]?.version_number ?? 0) + 1;
        await supabase.from("note_versions").insert({
          note_id: note.id,
          user_id: note.user_id,
          content: html,
          version_number: nextVersion,
        });
        toast.success(`Version ${nextVersion} saved`);
      }
    },
    [note, onUpdated],
  );

  const handleChange = (html: string, text: string) => {
    setCurrentHTML(html);
    setCurrentText(text);
    dirtyRef.current = true;
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(html, false);
    }, 1500);
  };

  const enterEdit = async () => {
    setMode("edit");
    // Snapshot the original first time we start editing this note.
    if (note && !note.is_edited) {
      await supabase.from("note_versions").insert({
        note_id: note.id,
        user_id: note.user_id,
        content: initialHTML,
        version_number: 1,
      });
    }
  };

  const exitEdit = async () => {
    if (dirtyRef.current) await persist(currentHTML, false);
    setMode("view");
  };

  const saveSnapshot = async () => {
    if (dirtyRef.current) await persist(currentHTML, true);
    else await persist(currentHTML, true);
  };

  if (!note) return null;

  const handleDelete = async () => {
    if (!confirm("Delete this note? This can't be undone.")) return;
    const path = note.file_url ? pathFromSignedUrl(note.file_url) : null;
    if (path) await supabase.storage.from("student-files").remove([path]);
    await supabase.from("note_versions").delete().eq("note_id", note.id);
    const { error } = await supabase.from("notes").delete().eq("id", note.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Note deleted");
    onOpenChange(false);
    onDeleted?.();
  };

  const handleDownload = async () => {
    if (!freshUrl) return;
    const a = document.createElement("a");
    a.href = freshUrl;
    a.download = note.title || "note";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleRename = async () => {
    const title = titleDraft.trim();
    if (!title || title === note.title) {
      setRenaming(false);
      return;
    }
    const { error } = await supabase.from("notes").update({ title }).eq("id", note.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Renamed");
    setRenaming(false);
    onRenamed?.(title);
  };

  const wordCount = currentText.trim() ? currentText.trim().split(/\s+/).length : 0;
  const readingMin = Math.max(1, Math.round(wordCount / 220));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          fullscreen
            ? "max-w-[100vw] w-screen h-screen p-0 sm:rounded-none flex flex-col gap-0"
            : "max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0 overflow-hidden"
        }
      >
        <DialogHeader className="px-5 py-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {renaming ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename();
                      if (e.key === "Escape") setRenaming(false);
                    }}
                    className="h-9"
                  />
                  <Button size="icon" variant="ghost" onClick={handleRename}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setRenaming(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <DialogTitle className="truncate text-left">{note.title}</DialogTitle>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <KindBadge kind={kind} />
                {note.courses?.name && (
                  <Badge variant="outline" className="border-primary/40 text-primary">
                    {note.courses.name}
                  </Badge>
                )}
                {mode === "edit" && <SaveBadge status={status} />}
                {canEdit && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {wordCount} words · {readingMin} min read
                  </span>
                )}
                {lastEditedAt && (
                  <span className="text-xs text-muted-foreground hidden md:inline">
                    Edited {formatDistanceToNow(new Date(lastEditedAt), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 mr-8">
              {canEdit && mode === "view" && (
                <Button size="sm" variant="outline" onClick={enterEdit} className="hidden sm:inline-flex">
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
              {canEdit && mode === "view" && (
                <Button size="icon" variant="ghost" onClick={enterEdit} className="sm:hidden" title="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {mode === "edit" && (
                <>
                  <Button size="sm" variant="outline" onClick={saveSnapshot} title="Save version">
                    <Save className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Save version</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={exitEdit}>
                    <Eye className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">View</span>
                  </Button>
                </>
              )}
              {canEdit && (
                <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
                  <SheetTrigger asChild>
                    <Button size="icon" variant="ghost" title="Version history">
                      <History className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[360px] sm:w-[420px] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Version history</SheetTitle>
                    </SheetHeader>
                    <VersionList
                      noteId={note.id}
                      open={historyOpen}
                      onRestore={async (html) => {
                        setInitialHTML(html);
                        setCurrentHTML(html);
                        setCurrentText(htmlToPlainText(html));
                        await persist(html, false);
                        setHistoryOpen(false);
                        setMode("edit");
                        toast.success("Version restored");
                      }}
                    />
                  </SheetContent>
                </Sheet>
              )}
              {!renaming && (
                <Button size="icon" variant="ghost" onClick={() => setRenaming(true)} title="Rename">
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {note.file_url && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleDownload}
                  title="Download original"
                  disabled={!freshUrl}
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setFullscreen((v) => !v)}
                title="Toggle fullscreen"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDelete}
                title="Delete"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden bg-muted/30">
          {mode === "edit" && canEdit ? (
            <RichEditor
              key={`edit-${note.id}-${initialHTML.length}`}
              initialHTML={initialHTML}
              editable
              onChange={handleChange}
              placeholder="Start refining your notes..."
            />
          ) : loadingUrl && !freshUrl && note.file_url ? (
            <CenterState>
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </CenterState>
          ) : (
            <Viewer
              kind={kind}
              url={freshUrl}
              note={note}
              editedHTML={currentHTML || initialHTML}
              hasEdits={!!(note.editable_content || note.is_edited)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === "saving")
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </Badge>
    );
  if (status === "saved")
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
        <Cloud className="h-3 w-3" /> Saved
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
        <CloudOff className="h-3 w-3" /> Save failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Cloud className="h-3 w-3" /> Auto-save on
    </Badge>
  );
}

function Viewer({
  kind, url, note, editedHTML, hasEdits,
}: {
  kind: Kind; url: string | null; note: any; editedHTML: string; hasEdits: boolean;
}) {
  // If the student has edited the note, prefer showing their edits in view mode.
  if (hasEdits && editedHTML && kind !== "image") {
    return <RenderedHTML html={editedHTML} />;
  }
  if (kind === "pdf" && url) {
    return (
      <iframe
        src={`${url}#view=FitH&toolbar=1`}
        title={note.title}
        className="w-full h-full border-0 bg-background"
      />
    );
  }
  if (kind === "image" && url) {
    return (
      <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
        <img src={url} alt={note.title} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  if (kind === "docx" && url) return <DocxViewer url={url} />;
  if (kind === "text" && url) return <RemoteText url={url} />;
  if (!url) return <TextOnly content={note.content || note.description || ""} />;
  return <Fallback url={url} content={note.content} />;
}

function RenderedHTML({ html }: { html: string }) {
  return (
    <div className="w-full h-full overflow-auto">
      <article
        className="prose prose-sm sm:prose-base dark:prose-invert max-w-3xl mx-auto px-6 py-8 bg-background rounded-md my-4 shadow-soft
                   [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]_p]:m-0
                   [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:gap-2 [&_ul[data-type=taskList]_li]:items-start
                   [&_mark]:bg-yellow-200/70 [&_mark]:dark:bg-yellow-300/30 [&_mark]:px-0.5 [&_mark]:rounded"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function DocxViewer({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setErr(null);
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => mammoth.convertToHtml({ arrayBuffer: buf }))
      .then((r) => {
        if (!cancelled) setHtml(r.value);
      })
      .catch((e) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (err)
    return (
      <CenterState>
        <p className="text-sm text-destructive">Couldn't render document: {err}</p>
      </CenterState>
    );
  if (!html)
    return (
      <CenterState>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </CenterState>
    );
  return <RenderedHTML html={html} />;
}

function RemoteText({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setText(null);
    fetch(url)
      .then((r) => r.text())
      .then((t) => !cancelled && setText(t));
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (text === null)
    return (
      <CenterState>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </CenterState>
    );
  return <TextOnly content={text} />;
}

function TextOnly({ content }: { content: string }) {
  return (
    <div className="w-full h-full overflow-auto">
      <pre className="max-w-3xl mx-auto px-6 py-8 text-sm whitespace-pre-wrap font-sans text-foreground leading-relaxed">
        {content || "No preview available."}
      </pre>
    </div>
  );
}

function Fallback({ url, content }: { url: string; content?: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
      <FileType2 className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Preview isn't available for this file type.
      </p>
      <Button asChild variant="outline">
        <a href={url} target="_blank" rel="noreferrer">
          <Download className="h-4 w-4 mr-1" /> Download to view
        </a>
      </Button>
      {content && (
        <div className="mt-6 w-full max-w-3xl text-left">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Extracted text
          </p>
          <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/90 bg-card p-4 rounded-md border max-h-[40vh] overflow-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

function VersionList({
  noteId,
  open,
  onRestore,
}: {
  noteId: string;
  open: boolean;
  onRestore: (html: string) => void;
}) {
  const [versions, setVersions] = useState<any[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setVersions(null);
    supabase
      .from("note_versions")
      .select("*")
      .eq("note_id", noteId)
      .order("version_number", { ascending: false })
      .then(({ data }) => setVersions(data ?? []));
  }, [open, noteId]);

  if (versions === null)
    return (
      <div className="mt-6 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  if (versions.length === 0)
    return (
      <p className="text-sm text-muted-foreground mt-6">
        No saved versions yet. Use “Save version” while editing to snapshot your progress.
      </p>
    );

  return (
    <div className="mt-4 space-y-2">
      {versions.map((v) => {
        const preview = htmlToPlainText(v.content).slice(0, 180);
        return (
          <div
            key={v.id}
            className="border rounded-lg p-3 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Version {v.version_number}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(v.created_at), "PP p")}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => onRestore(v.content)}>
                Restore
              </Button>
            </div>
            {preview && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-3">{preview}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CenterState({ children }: { children: React.ReactNode }) {
  return <div className="w-full h-full flex items-center justify-center">{children}</div>;
}

function KindBadge({ kind }: { kind: Kind }) {
  const map: Record<Kind, { label: string; icon: any; className: string }> = {
    pdf: { label: "PDF", icon: FileText, className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
    docx: { label: "DOCX", icon: FileText, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
    image: { label: "Image", icon: ImageIcon, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    text: { label: "Text", icon: FileText, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
    other: { label: "File", icon: FileType2, className: "bg-muted text-muted-foreground border-border" },
  };
  const v = map[kind];
  const Icon = v.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${v.className}`}>
      <Icon className="h-3 w-3" />
      {v.label}
    </Badge>
  );
}
