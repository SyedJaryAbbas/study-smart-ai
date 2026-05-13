// @ts-nocheck
// Edge function: practice question generator + answer evaluator.
// Uses Lovable AI Gateway (LOVABLE_API_KEY auto-provisioned).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode } = body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let payload: any;

    if (mode === "practice") {
      const { source, kind, count } = body;
      const sys = `You are an expert university tutor. Read the STUDY MATERIAL provided by the student and generate ${count || 5} high-quality practice questions of type "${kind || "mcq"}" that test understanding of that material.

STRICT RULES:
- Base every question on the actual content of the study material provided. Do NOT invent topics or use only the file title.
- If the material is too short or unclear, still produce questions grounded ONLY in what is given.
- Return ONLY valid JSON. No prose, no markdown fences.

JSON shape:
{"questions":[{"question":"...","options":["A","B","C","D"],"answer":"A","explanation":"..."}]}

For "mcq": include exactly 4 options. "answer" must be the letter A-D matching the correct option.
For "short", "long", "fill_blank": omit "options". Put the model answer in "answer" and a brief "explanation".`;
      payload = {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `STUDY MATERIAL:\n\n${(source || "").slice(0, 24000)}` },
        ],
      };
    } else if (mode === "evaluate") {
      const { question, expected, studentAnswer, kind } = body;
      const sys = `You are a strict but fair university tutor grading a student's ${kind || "short"} answer. Compare the student's answer to the model answer and the question.
Return ONLY valid JSON of shape:
{"correct": true|false, "score": 0-100, "missing": ["..."], "feedback": "...", "improved_answer": "..."}
- "score" is a percentage match of correctness/coverage (0-100).
- "correct" = true if score >= 70 and the core idea is right.
- "missing" lists key points the student left out (max 5, short phrases).
- "feedback" is 1-3 sentences explaining strengths and weaknesses.
- "improved_answer" is a concise model answer the student should aim for.`;
      payload = {
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `QUESTION: ${question}\n\nEXPECTED ANSWER: ${expected}\n\nSTUDENT ANSWER: ${studentAnswer}`,
          },
        ],
      };
    } else {
      return new Response(JSON.stringify({ error: "Unknown mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (resp.status === 429)
      return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    if (resp.status === 402)
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable workspace settings." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      const json = JSON.parse(cleaned);
      return new Response(JSON.stringify(json), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ raw: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
