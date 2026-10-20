/* ============================================================
   محرك البحث — يعمل بالكامل داخل المتصفح (بلا خادم ولا إنترنت)
   - تطبيع عربي + تجذيع خفيف + مرادفات + إكمال الكلمة أثناء الكتابة
   - ترتيب BM25 مع مكافأة التغطية والعبارة المتتالية والعناوين
   - انتقال مباشر برقم المادة، واقتراح «هل تقصد» عند انعدام النتائج
   ============================================================ */
(function (root) {
"use strict";

/* ---------- Arabic normalization ---------- */
function norm(s) {
  if (!s) return "";
  return String(s)
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
    .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); })
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي").replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و").replace(/ة/g, "ه").replace(/ء/g, "")
    .replace(/[^ء-ي0-9a-zA-Z\s]/g, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

var STOP = {};
("في من على الى إلى عن او أو و ثم هذا هذه ذلك تلك التي الذي الذين ما ماذا لا ان أن إن كل مع به بها له لها لهم " +
 "عليه عليها فيه فيها منه منها هو هي هم وفقا طبقا هل كيف متى اين أين لماذا كم قد لم لن اي أي حول بشأن عند كان " +
 "يكون تكون الا إلا اذا إذا يتم ممكن اريد أريد ابحث عن")
  .split(" ").forEach(function (w) { STOP[norm(w)] = 1; });

/* ---------- light stemmer ---------- */
var PRE = ["وبال", "فبال", "وكال", "وال", "فال", "بال", "كال", "ولل", "فلل", "لل", "ال"];
var SUF = ["اتها", "اته", "ات", "ون", "ين", "ان", "ها", "هم", "هن", "يه", "ه", "ي"];
function stripPre(w) {
  if (w.length < 4) return w;
  for (var i = 0; i < PRE.length; i++) {
    var p = PRE[i];
    if (w.lastIndexOf(p, 0) === 0 && w.length - p.length >= 3) return w.slice(p.length);
  }
  return w;
}
function stem(w) {
  if (w.length < 4 || /^\d+$/.test(w)) return w;
  w = stripPre(w);
  for (var j = 0; j < SUF.length; j++) {
    var s = SUF[j];
    if (w.length - s.length >= 3 && w.slice(-s.length) === s) return w.slice(0, -s.length);
  }
  return w;
}

/* ---------- synonyms / broken plurals ---------- */
var SYN_GROUPS = [
  ["موازنه", "ميزانيه", "موازنات", "ميزانيات"], ["مجلس", "مجالس"], ["لجنه", "لجان"],
  ["مشروع", "مشاريع", "مشروعات"], ["عضو", "اعضا", "عضويه"], ["ضريبه", "ضرايب"], ["رسم", "رسوم"],
  ["قانون", "قوانين"], ["لايحه", "لوايح"], ["مكتب", "مكاتب"], ["جهاز", "اجهزه"], ["مورد", "موارد"],
  ["اختصاص", "اختصاصات", "صلاحيه", "صلاحيات", "مهام"], ["مديريه", "مديريات"], ["رييس", "روسا"],
  ["عزل", "اقاله", "سحب"], ["انتخاب", "انتخابات", "اقتراع"], ["اجتماع", "اجتماعات", "جلسه", "جلسات"],
  ["قرار", "قرارات"], ["عقد", "عقود"], ["مناقصه", "مناقصات"], ["مزايده", "مزايدات"], ["شرط", "شروط"],
  ["وزاره", "وزارات"], ["تعيين", "يعين", "تعين"], ["مخالفه", "مخالفات"], ["عقوبه", "عقوبات", "جزا", "جزاات"],
  ["ايراد", "ايرادات"], ["نفقه", "نفقات", "مصروفات"], ["مده", "مدد"], ["حساب", "حسابات"],
  ["اعتماد", "يعتمد", "اقرار", "يقر", "مصادقه", "يصادق"]
];
var SYN = {};
SYN_GROUPS.forEach(function (g) {
  g.forEach(function (w) {
    var others = g.filter(function (x) { return x !== w; });
    [w, stem(w)].forEach(function (k) { SYN[k] = (SYN[k] || []).concat(others); });
  });
});

/* ---------- index ---------- */
var ARTS = [], DOCS = [], CONTENT = {}, ART = {}, DOCORDER = {};
var post = {}, vocab = [], wstem = {}, stems = {}, N = 1, avgLen = 1;
var K1 = 1.2, B = 0.6;

function init(data, content) {
  ARTS = data.articles || []; DOCS = data.documents || []; CONTENT = content || {};
  N = ARTS.length || 1;
  DOCS.forEach(function (d, i) { DOCORDER[d.id] = i; });
  var total = 0;
  ARTS.forEach(function (a, i) {
    ART[a.id] = a;
    a._i = i;
    a._n = norm(a.text);
    var ws = a._n.split(" ");
    a._len = ws.length; total += ws.length;
    var tf = {};
    ws.forEach(function (w) { if (w.length > 1 && !STOP[w]) tf[w] = (tf[w] || 0) + 1; });
    a._tf = tf;
    for (var w in tf) (post[w] || (post[w] = [])).push(i);
    a._hw = {};
    norm([a.label, a.babTitle, a.faslTitle, a.far3Title].join(" ")).split(" ").forEach(function (w) { if (w) a._hw[w] = 1; });
  });
  avgLen = total / N;
  vocab = Object.keys(post);
  vocab.forEach(function (w) { var s = stem(w); wstem[w] = s; (stems[s] || (stems[s] = [])).push(w); });
}

function idfOf(df) { return Math.log(1 + (N - df + 0.5) / (df + 0.5)); }

/* expand one query token into indexed words with weights */
function expand(t, prefix) {
  var out = {};
  function add(w, wt) { if (post[w] && (out[w] || 0) < wt) out[w] = wt; }
  add(t, 1);
  var st = stem(t), sp = stripPre(t);
  (stems[st] || []).forEach(function (w) { add(w, stripPre(w) === sp ? 0.95 : 0.6); });
  var syn = SYN[t] || SYN[st] || SYN[sp] || [];
  syn.forEach(function (s) {
    add(s, 0.8);
    (stems[stem(s)] || []).forEach(function (w) { add(w, 0.72); });
  });
  if (prefix && t.length >= 3 && !/^\d+$/.test(t)) {
    for (var i = 0; i < vocab.length; i++) {
      var w = vocab[i];
      if (w.length <= t.length || out[w]) continue;
      if (w.lastIndexOf(t, 0) === 0 || wstem[w].lastIndexOf(st, 0) === 0 || stripPre(w).lastIndexOf(sp, 0) === 0) add(w, prefix);
    }
  }
  return out;
}

/* "مادة 25" / "25" / "المادة 12 من اللائحة المالية" */
function docHint(s) {
  if (/تنفيذ/.test(s)) return "exec";
  if (/مالي/.test(s)) return "fin";
  if (/قانون/.test(s)) return "law";
  return null;
}
function numberHits(nq) {
  var m = nq.match(/^(?:ال)?(?:ماده|م|رقم)?\s*(\d{1,3})(?:\s+(.*))?$/) || nq.match(/^(?:ال)?(?:ماده|رقم)\s*(\d{1,3})(.*)$/);
  if (!m) return [];
  var n = m[1], hint = docHint(m[2] || "");
  return DOCS.map(function (d) { return ART[d.id + "-" + n]; })
    .filter(function (a) { return a && (!hint || a.doc === hint); });
}

function tokensOf(q) {
  var seen = {};
  return norm(q).split(" ").filter(function (w) {
    if (w.length < 2 || STOP[w] || seen[w]) return false;
    seen[w] = 1; return true;
  });
}

/* ---------- main search ---------- */
function search(query, opts) {
  opts = opts || {};
  var doc = opts.doc && opts.doc !== "all" ? opts.doc : null;
  var usePrefix = opts.prefix !== false;
  var nq = norm(query);
  var direct = numberHits(nq);
  var toks = tokensOf(query);
  if (direct.length) toks = toks.filter(function (t) { return !/^(ال)?(ماده|رقم|م)$/.test(t); });
  var groups = [], unknown = [];
  toks.forEach(function (t, k) {
    var last = k === toks.length - 1;
    var exp = expand(t, usePrefix ? (last ? 0.62 : 0.5) : 0);
    var words = Object.keys(exp);
    if (!words.length) { unknown.push(t); return; }
    var set = {}, df = 0;
    words.forEach(function (w) { post[w].forEach(function (i) { if (!set[i]) { set[i] = 1; df++; } }); });
    groups.push({ t: t, exp: exp, idf: idfOf(df) });
  });

  var acc = {};
  groups.forEach(function (g, gi) {
    for (var w in g.exp) {
      var wt = g.exp[w], pl = post[w];
      for (var j = 0; j < pl.length; j++) {
        var i = pl[j], a = ARTS[i], tf = a._tf[w];
        var v = g.idf * wt * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * a._len / avgLen));
        var r = acc[i] || (acc[i] = { best: [], words: {} });
        if (!(r.best[gi] >= v)) r.best[gi] = v;
        r.words[w] = 1;
      }
    }
  });

  var phrase = toks.length > 1 ? toks.join(" ") : "";
  var res = [], counts = { all: 0 };
  DOCS.forEach(function (d) { counts[d.id] = 0; });
  for (var key in acc) {
    var r = acc[key], a = ARTS[+key], s = 0, hits = 0;
    for (var gi = 0; gi < groups.length; gi++) {
      if (r.best[gi]) {
        s += r.best[gi]; hits++;
        for (var hw in groups[gi].exp) { if (a._hw[hw]) { s += 0.45 * groups[gi].idf; break; } }
      }
    }
    var cov = hits / groups.length;
    if (phrase && a._n.indexOf(phrase) >= 0) s += 2.5 + groups.length;
    else for (var p = 0; p + 1 < toks.length; p++) {
      if (a._n.indexOf(toks[p] + " " + toks[p + 1]) >= 0) s += 1.2;
    }
    if (nq.length > 4 && nq !== phrase && a._n.indexOf(nq) >= 0) s += 3;
    var score = s * (0.3 + 0.7 * cov * cov);
    counts.all++; counts[a.doc] = (counts[a.doc] || 0) + 1;
    if (doc && a.doc !== doc) continue;
    res.push({ a: a, score: score, cov: cov, words: r.words });
  }
  res.sort(function (x, y) {
    return y.score - x.score || DOCORDER[x.a.doc] - DOCORDER[y.a.doc] || x.a.n - y.a.n;
  });

  var match = {};
  groups.forEach(function (g) { for (var w in g.exp) match[w] = 1; });
  return {
    query: query, results: res, counts: counts, groups: groups.length,
    terms: groups.map(function (g) { return g.t; }), unknown: unknown, match: match,
    direct: doc ? direct.filter(function (a) { return a.doc === doc; }) : direct,
    suggestion: res.length ? null : didYouMean(toks, unknown)
  };
}

/* ---------- "did you mean" ---------- */
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  var prev = [], cur, i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur = [i]; var rowMin = i;
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function didYouMean(toks, unknown) {
  if (!unknown.length) return null;
  var changed = false;
  var fixed = toks.map(function (t) {
    if (unknown.indexOf(t) < 0 || t.length < 3) return t;
    var max = t.length >= 6 ? 2 : 1, best = null, bd = max + 1, bdf = 0;
    for (var i = 0; i < vocab.length; i++) {
      var w = vocab[i], d = lev(t, w, max);
      if (d < bd || (d === bd && d <= max && post[w].length > bdf)) { bd = d; best = w; bdf = post[w].length; }
    }
    if (best && bd <= max) { changed = true; return best; }
    return t;
  });
  return changed ? fixed.join(" ") : null;
}

/* ---------- snippets & highlighting ---------- */
function esc(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function wordMatches(word, match) {
  var parts = norm(word).split(" ");
  for (var i = 0; i < parts.length; i++) if (parts[i] && match[parts[i]]) return parts[i];
  return "";
}
/* best window of the text that covers the most distinct matched words */
function snippet(text, match, maxWords) {
  maxWords = maxWords || 34;
  var parts = String(text).split(/(\s+)/), idx = [], hit = [];
  for (var k = 0; k < parts.length; k++) {
    if (parts[k] && !/^\s+$/.test(parts[k])) { idx.push(k); hit.push(wordMatches(parts[k], match)); }
  }
  var bestStart = 0, bestCount = -1;
  for (var s = 0; s < idx.length; s++) {
    if (!hit[s]) continue;
    var seen = {}, c = 0;
    for (var e = s; e < Math.min(idx.length, s + maxWords - 6); e++) if (hit[e] && !seen[hit[e]]) { seen[hit[e]] = 1; c++; }
    if (c > bestCount) { bestCount = c; bestStart = s; }
  }
  var start = Math.max(0, bestStart - 6), end = Math.min(idx.length, start + maxWords);
  if (end - start < maxWords) start = Math.max(0, end - maxWords);
  var out = [];
  for (var w = start; w < end; w++) {
    var t = esc(parts[idx[w]]);
    out.push(hit[w] ? "<mark>" + t + "</mark>" : t);
  }
  return (start > 0 ? "… " : "") + out.join(" ") + (end < idx.length ? " …" : "");
}

/* ---------- keyword sets (topics, procedures, FAQ) ---------- */
function byKeywords(keywords, doc) {
  return search((keywords || []).join(" "), { doc: doc, prefix: false }).results;
}

/* distinctive terms of an article, for "related" and "compare" */
function keyTerms(a, n) {
  return Object.keys(a._tf).filter(function (w) { return w.length > 2 && !/^\d+$/.test(w); })
    .map(function (w) { return { w: w, s: a._tf[w] * idfOf(post[w].length) }; })
    .sort(function (x, y) { return y.s - x.s; }).slice(0, n || 8).map(function (x) { return x.w; });
}
function related(a, limit) {
  limit = limit || 6;
  var out = [], seen = {}; seen[a.id] = 1;
  [a.doc + "-" + (a.n - 1), a.doc + "-" + (a.n + 1)].forEach(function (id) {
    if (ART[id]) { out.push(ART[id]); seen[id] = 1; }
  });
  var res = search(keyTerms(a).join(" "), { prefix: false }).results;
  res.forEach(function (r) { if (out.length < limit && !seen[r.a.id] && r.a.doc !== a.doc) { out.push(r.a); seen[r.a.id] = 1; } });
  res.forEach(function (r) { if (out.length < limit && !seen[r.a.id]) { out.push(r.a); seen[r.a.id] = 1; } });
  return out.slice(0, limit);
}

/* ---------- glossary (definitions article of each document) ---------- */
var glossCache = null;
function glossary() {
  if (glossCache) return glossCache;
  var out = [];
  DOCS.forEach(function (d) {
    var a2 = ART[d.id + "-2"]; if (!a2) return;
    var body = a2.text.replace(/^[\s\S]*?معن[ىي]\s*آخر\s*:?\s*/, "");
    body.split(/\s+\.\s+/).forEach(function (p) {
      var idx = p.indexOf(" : "); if (idx < 0) idx = p.indexOf(" :");
      if (idx > 0 && idx < 40) {
        var term = p.slice(0, idx).trim().replace(/^و/, "");
        var def = p.slice(idx + 2).replace(/^:\s*/, "").trim().replace(/\s*\.$/, "");
        if (term && def && term.length < 42 && def.length > 3) out.push({ term: term, def: def, doc: d.id, art: a2.id, _n: norm(term) });
      }
    });
  });
  return (glossCache = out);
}

/* ---------- quick answers shown above results ---------- */
var GENERIC = {};
"الوحده الاداريه اداري المحلي المحليه مجلس قانون نص المواطنين وحده محلي اداره".split(" ")
  .forEach(function (w) { GENERIC[stem(norm(w))] = 1; });
function faqScore(question, f) {
  var vocabF = {};
  function addW(w) { if (w.length > 1 && !STOP[w]) { var s = stem(w); vocabF[s] = GENERIC[s] ? 0.3 : 1; } }
  tokensOf(f.q).forEach(addW);
  (f.keywords || []).forEach(function (k) { norm(k).split(" ").forEach(addW); });
  var qs = tokensOf(question).map(stem);
  if (!qs.length) return { score: 0, distinct: 0, back: 0 };
  var num = 0, den = 0, distinct = 0, qset = {};
  qs.forEach(function (s) {
    qset[s] = 1;
    var wt = GENERIC[s] ? 0.3 : 1; den += wt;
    if (vocabF[s] !== undefined) { num += Math.min(wt, vocabF[s]); if (!GENERIC[s]) distinct++; }
  });
  // reverse coverage: how much of the FAQ question itself is in the query
  var bn = 0, bdn = 0;
  tokensOf(f.q).map(stem).forEach(function (s) { var wt = GENERIC[s] ? 0.3 : 1; bdn += wt; if (qset[s]) bn += wt; });
  return { score: den ? num / den : 0, distinct: distinct, back: bdn ? bn / bdn : 0 };
}
function bestFaq(q) {
  var best = null, bs = 0, bd = 0;
  (CONTENT.faq || []).forEach(function (f) {
    var r = faqScore(q, f);
    if (r.back < 0.45) return;
    if (r.score > bs || (r.score === bs && r.distinct > bd)) { bs = r.score; bd = r.distinct; best = f; }
  });
  return best && bs >= 0.6 && bd >= 1 ? best : null;
}
function isQuestion(q) {
  return /[?؟]/.test(q) || /^(من|ما|ماذا|هل|كيف|متي|اين|لماذا|كم|ما هي|ما هو)(\s|$)/.test(norm(q));
}
function quick(q) {
  var nq = norm(q), sq = tokensOf(q).map(stripPre).join(" ");
  var out = { gloss: [], topics: [], entities: [], faq: null };
  if (nq.length < 2 || numberHits(nq).length) return out;
  glossary().forEach(function (g) {
    var t = g._n.split(" ").map(stripPre).join(" ");
    if (t.length > 2 && (sq === t || (" " + sq + " ").indexOf(" " + t + " ") >= 0)) out.gloss.push(g);
  });
  out.gloss = out.gloss.sort(function (x, y) { return y._n.length - x._n.length; }).slice(0, 2);
  function nameHit(name) {
    var n = tokensOf(name).map(stripPre).join(" ");
    return n && (sq === n || (" " + sq + " ").indexOf(" " + n + " ") >= 0 || (sq.length >= 3 && n.lastIndexOf(sq, 0) === 0));
  }
  (CONTENT.topics || []).forEach(function (t) { if (nameHit(t.name)) out.topics.push(t); });
  (CONTENT.entities || []).forEach(function (e) { if (nameHit(e.name)) out.entities.push(e); });
  out.faq = tokensOf(q).length >= 1 ? bestFaq(q) : null;
  return out;
}

root.LawSearch = {
  init: init, norm: norm, stem: stem, search: search, snippet: snippet, wordMatches: wordMatches,
  byKeywords: byKeywords, keyTerms: keyTerms, related: related, glossary: glossary,
  quick: quick, bestFaq: bestFaq, isQuestion: isQuestion, esc: esc
};
})(typeof window !== "undefined" ? window : this);
