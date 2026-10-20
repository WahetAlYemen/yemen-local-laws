/* ============================================================
   POST /api/ask — المساعد القانوني الذكي (Cloudflare Pages Function)
   - The browser retrieves the relevant articles with its search engine and
     sends their ids; this function loads their official text from
     /assets/data.js (never trusting text sent by the client), asks Claude to
     answer only from them, and streams the answer back as plain text.
   - The API key lives only in the Pages environment (ANTHROPIC_API_KEY).
   ============================================================ */
import Anthropic from "@anthropic-ai/sdk";

const MAX_Q = 500;          // characters per question
const MAX_IDS = 14;         // articles per question
const PER_MINUTE = 6;       // questions per visitor (IP) per minute
const PER_HOUR = 40;        // questions per visitor (IP) per hour

const SYSTEM = [
  "أنت «المساعد القانوني» لمنصة تشريعات السلطة المحلية في الجمهورية اليمنية.",
  "تجيب عن سؤال المستخدم بالاعتماد الحصري على «النصوص القانونية المرفقة» في رسالته: قانون السلطة المحلية رقم (4) لسنة 2000م، ولائحته التنفيذية، ولائحته المالية.",
  "",
  "قواعد الإجابة:",
  "1) اعتمد فقط على المواد المرفقة، ولا تستعمل أي معلومة أو اجتهاد من خارجها، ولا تختلق أرقام مواد أو نصوصًا.",
  "2) عند الاستناد إلى مادة اذكرها بهذه الصيغة بالضبط: (المادة 130 — القانون)، حيث اسم الوثيقة أحد: القانون / اللائحة التنفيذية / اللائحة المالية.",
  "3) ابدأ بالإجابة المباشرة في جملة أو جملتين، ثم التفاصيل والشروط والاستثناءات إن وُجدت. استخدم نقاطًا تبدأ بـ «- » عند تعدد العناصر.",
  "4) إن لم تجد في المواد المرفقة ما يجيب عن السؤال فقل بوضوح: «لم أجد نصًّا صريحًا يجيب عن هذا السؤال ضمن المواد المتاحة»، واذكر أقرب ما وجدته إن كان مفيدًا.",
  "5) أجب بالعربية الفصحى الواضحة بإيجاز ودقة، دون عناوين Markdown ودون جداول. يجوز استخدام **عريض** لإبراز عبارة مهمة.",
  "6) اختم بسطر «الاستناد القانوني:» تسرد فيه المواد التي اعتمدت عليها بالصيغة نفسها.",
  "إذا كان السؤال خارج نطاق تشريعات السلطة المحلية فاعتذر بلطف ووجّه المستخدم إلى البحث في المنصة.",
  "الاستجابة سريعة الحساسية للزمن؛ ابدأ إجابتك المرئية فورًا."
].join("\n");

/* ---------- official texts, loaded once per isolate ---------- */
let lawData = null;
async function loadData(env, request) {
  if (lawData) return lawData;
  const res = await env.ASSETS.fetch(new URL("/assets/data.js", request.url));
  if (!res.ok) throw new Error("data.js " + res.status);
  const js = await res.text();
  const json = js.slice(js.indexOf("{"), js.lastIndexOf("}") + 1);
  const data = JSON.parse(json);
  const docs = {}, arts = {};
  data.documents.forEach((d) => { docs[d.id] = d; });
  data.articles.forEach((a) => { arts[a.id] = a; });
  return (lawData = { docs, arts });
}

/* ---------- light per-visitor rate limit (per isolate, best effort) ---------- */
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (list.filter((t) => now - t < 60e3).length >= PER_MINUTE || list.length >= PER_HOUR) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ANTHROPIC_API_KEY) return json(503, { error: "not_configured" });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "bad_json" }); }
  const q = String(body.q || "").trim();
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))].slice(0, MAX_IDS) : [];
  if (q.length < 2 || q.length > MAX_Q) return json(400, { error: "bad_question" });

  const { docs, arts } = await loadData(env, request);
  const chosen = ids.map((id) => arts[id]).filter(Boolean);
  if (!chosen.length) return json(400, { error: "no_articles" });

  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (limited(ip)) return json(429, { error: "rate_limited" });

  const sources = chosen.map((a, i) =>
    `[${i + 1}] ${docs[a.doc].short} — ${a.label}` +
    (a.babTitle ? ` (${a.bab}: ${a.babTitle})` : "") + `:\n${a.text}`).join("\n\n");
  const userMsg = `السؤال: ${q}\n\n=== النصوص القانونية المرفقة (أجب منها فقط) ===\n${sources}`;

  const model = env.CLAUDE_MODEL || "claude-opus-5-5";
  // ANTHROPIC_BASE_URL is only set for local testing against a mock server
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined });
  const params = {
    model,
    max_tokens: 4000,                       // cost cap for a public endpoint
    system: SYSTEM,
    output_config: { effort: env.CLAUDE_EFFORT || "medium" },
    messages: [{ role: "user", content: userMsg }]
  };
  // re-run a false-positive safety decline on Anthropic's recommended fallback model
  if (!/haiku/.test(model)) { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const run = (async () => {
    try {
      const stream = client.beta.messages.stream(params);
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          await writer.write(enc.encode(event.delta.text));
        }
      }
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") await writer.write(enc.encode("\n[[REFUSAL]]"));
      else if (msg.stop_reason === "max_tokens") await writer.write(enc.encode("\n[[TRUNCATED]]"));
    } catch (err) {
      const status = err instanceof Anthropic.APIError ? err.status : 0;
      console.error("ask failed", status, err && err.message);
      await writer.write(enc.encode("\n[[ERROR:" + (status || "network") + "]]"));
    } finally {
      await writer.close();
    }
  })();
  context.waitUntil(run);

  // text/event-stream is passed through uncompressed, so text reaches the reader as it is written
  // (the body is plain answer text, read with fetch(), not EventSource)
  return new Response(readable, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-content-type-options": "nosniff" }
  });
}

export async function onRequest() {
  return json(405, { error: "method_not_allowed" });
}
