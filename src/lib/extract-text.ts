// Client-side text extraction for uploaded notes.
import mammoth from "mammoth";

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type;

  try {
    if (type === "application/pdf" || name.endsWith(".pdf")) {
      return await extractPdf(file);
    }
    if (
      name.endsWith(".docx") ||
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const buf = await file.arrayBuffer();
      const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
      return value.trim();
    }
    if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
      return (await file.text()).trim();
    }
  } catch (e) {
    console.error("[extractText] failed", e);
  }
  return "";
}

async function extractPdf(file: File): Promise<string> {
  // Dynamic import so pdfjs only loads when needed (and stays out of SSR).
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = "";
  const max = Math.min(doc.numPages, 80);
  for (let i = 1; i <= max; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((it: any) => it.str).join(" ") + "\n\n";
  }
  return out.trim();
}
