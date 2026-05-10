// @ts-nocheck
// Edge function: AI assistant + practice generator
// Uses Lovable AI Gateway (LOVABLE_API_KEY auto-provisioned).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, messages, source, kind, count } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let payload: any;

    if (mode === "practice") {
      const sys = `You are an expert tutor. From the provided study material, generate ${count || 5} practice questions of type "${kind || "mcq"}". 
Return ONLY valid JSON of the form:
{"questions":[{"question":"...","options":["A","B","C","D"],"answer":"A","explanation":"..."}]}
For non-MCQ types, omit "options" and put the model answer in "answer".`;
      payload = {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: source || "General academic topics for a university student." },
        ],
      };
    } else {
      // chat mode
      payload = {
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are StudyOwl, a friendly, concise AI tutor for university students. Help with concepts, problem solving, study advice, and exam prep. Use markdown. Be encouraging and clear.",
          },
          ...(messages || []),
        ],
        stream: true,
      };
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "practice") {
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content ?? "";
      // strip code fences if present
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      try {
        const json = JSON.parse(cleaned);
        return new Response(JSON.stringify(json), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch {
        return new Response(JSON.stringify({ raw: text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(resp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
