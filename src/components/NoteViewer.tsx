import { useEffect, useMemo, useState } from "react";
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
  Download,
  Trash2,
  Pencil,
  Maximize2,
  Loader2,
  FileText,
  Image as ImageIcon,
  FileType2,
  Check,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import mammoth from "mammoth";

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

// Extract storage path from a signed URL like
// https://<ref>.supabase.co/storage/v1/object/sign/student-files/<path>?token=...
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

export function NoteViewer({
  note,
  open,
  onOpenChange,
  onDeleted,
  onRenamed,
}: {
  note: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted?: () => void;
  onRenamed?: (title: string) => void;
}) {
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const kind: Kind = useMemo(
    () => (note ? detectKind(note.title ?? "", note.file_type) : "other"),
    [note],
  );

  useEffect(() => {
    if (!open || !note) return;
    setFreshUrl(null);
    setFullscreen(false);
    setRenaming(false);
    setTitleDraft(note.title ?? "");

    if (!note.file_url) return;
    const path = pathFromSignedUrl(note.file_url);
    if (!path) {
      setFreshUrl(note.file_url);
      return;
    }
    setLoading(true);
    supabase.storage
      .from("student-files")
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (error || !data) {
          setFreshUrl(note.file_url);
        } else {
          setFreshUrl(data.signedUrl);
        }
      })
      .finally(() => setLoading(false));
  }, [open, note]);

  if (!note) return null;

  const handleDelete = async () => {
    if (!confirm("Delete this note? This can't be undone.")) return;
    const path = note.file_url ? pathFromSignedUrl(note.file_url) : null;
    if (path) await supabase.storage.from("student-files").remove([path]);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          fullscreen
            ? "max-w-[100vw] w-screen h-screen p-0 sm:rounded-none flex flex-col gap-0"
            : "max-w-5xl w-[95vw] h-[88vh] p-0 flex flex-col gap-0 overflow-hidden"
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
                {note.created_at && (
                  <span className="text-xs text-muted-foreground">
                    Uploaded {format(new Date(note.created_at), "PP")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 mr-8">
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
                  title="Download"
                  disabled={!freshUrl}
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
              {(kind === "pdf" || kind === "image") && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setFullscreen((v) => !v)}
                  title="Toggle fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              )}
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
          {loading && !freshUrl ? (
            <CenterState>
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </CenterState>
          ) : !note.file_url ? (
            <TextOnly content={note.content || note.description || ""} />
          ) : (
            <Viewer kind={kind} url={freshUrl!} note={note} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Viewer({ kind, url, note }: { kind: Kind; url: string; note: any }) {
  if (kind === "pdf") {
    // Browser-native PDF viewer ships zoom, pagination, and fullscreen controls.
    return (
      <iframe
        src={`${url}#view=FitH&toolbar=1`}
        title={note.title}
        className="w-full h-full border-0 bg-background"
      />
    );
  }
  if (kind === "image") {
    return (
      <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
        <img src={url} alt={note.title} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  if (kind === "docx") {
    return <DocxViewer url={url} />;
  }
  if (kind === "text") {
    return <RemoteText url={url} />;
  }
  return <Fallback url={url} content={note.content} />;
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
  return (
    <div className="w-full h-full overflow-auto">
      <article
        className="prose prose-sm sm:prose-base dark:prose-invert max-w-3xl mx-auto px-6 py-8 bg-background rounded-md my-4 shadow-soft"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
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
