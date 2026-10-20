/* ============================================================
   منصة تشريعات السلطة المحلية — منطق التطبيق (SPA)
   ============================================================ */
(function () {
"use strict";

var DATA = window.LAWDATA || { documents: [], articles: [] };
var C = window.CONTENT || {};
var DOCS = DATA.documents;
var ARTS = DATA.articles;

/* ---------- helpers ---------- */
function $(s, r) { return (r || document).querySelector(s); }
function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
  return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

var docMap = {}; DOCS.forEach(function (d) { docMap[d.id] = d; });
var artMap = {}; ARTS.forEach(function (a) { artMap[a.id] = a; });

/* ---------- Arabic normalization ---------- */
function norm(s) {
  if (!s) return "";
  return String(s)
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي").replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و").replace(/ة/g, "ه")
    .replace(/[^ء-ي0-9a-zA-Z\s]/g, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
var STOP = {}; "في من على الى إلى عن او أو و هذا هذه ذلك التي الذي ما لا ان أن إن كل مع بها به له لها عليه عليها وفقا طبقا هو هي".split(" ").forEach(function (w) { STOP[norm(w)] = 1; });

/* precompute search fields */
ARTS.forEach(function (a) {
  a._n = norm(a.text);
  a._nl = norm(a.label + " " + (a.babTitle || "") + " " + (a.faslTitle || ""));
  var terms = {};
  a._n.split(" ").forEach(function (w) { if (w.length > 2 && !STOP[w]) terms[w] = (terms[w] || 0) + 1; });
  a._terms = terms;
});

/* ---------- search engine ---------- */
function tokenize(q) { return norm(q).split(" ").filter(function (w) { return w.length > 1; }); }

function searchArticles(query, docFilter) {
  var toks = tokenize(query).filter(function (w) { return !STOP[w]; });
  if (!toks.length) return [];
  var nq = norm(query);
  var res = [];
  for (var i = 0; i < ARTS.length; i++) {
    var a = ARTS[i];
    if (docFilter && docFilter !== "all" && a.doc !== docFilter) continue;
    var score = 0, hit = 0;
    for (var t = 0; t < toks.length; t++) {
      var tok = toks[t];
      var inText = a._terms[tok] || 0;
      if (a._n.indexOf(tok) >= 0) {
        hit++;
        score += 6 + Math.min(inText, 5) * 2;
        if (a._n.indexOf(tok) < 60) score += 3;
      }
      if (a._nl.indexOf(tok) >= 0) score += 5;
    }
    if (!hit) continue;
    score += (hit / toks.length) * 14;            // coverage bonus
    if (nq.length > 3 && a._n.indexOf(nq) >= 0) score += 30; // exact phrase
    res.push({ a: a, score: score, toks: toks });
  }
  res.sort(function (x, y) { return y.score - x.score || x.a.doc.localeCompare(y.a.doc) || x.a.n - y.a.n; });
  return res;
}

function articlesByKeywords(keywords, docFilter, limit) {
  var q = (keywords || []).join(" ");
  var r = searchArticles(q, docFilter);
  return limit ? r.slice(0, limit) : r;
}

/* snippet with highlight around first matched token */
function snippet(text, toks, len) {
  len = len || 190;
  var nt = norm(text), pos = -1;
  for (var i = 0; i < toks.length; i++) { var p = nt.indexOf(toks[i]); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
  var start = 0;
  if (pos > 70) start = pos - 60;
  var raw = text.slice(start, start + len);
  if (start > 0) raw = "… " + raw;
  if (start + len < text.length) raw = raw + " …";
  return highlight(raw, toks);
}
function highlight(text, toks) {
  var out = esc(text);
  if (!toks || !toks.length) return out;
  // highlight by mapping normalized tokens back — approximate word match
  var words = out.split(/(\s+)/);
  return words.map(function (w) {
    var nw = norm(w);
    for (var i = 0; i < toks.length; i++) { if (nw && nw.indexOf(toks[i]) >= 0) return "<mark>" + w + "</mark>"; }
    return w;
  }).join("");
}

/* ---------- cross-reference linkification ---------- */
function linkifyRefs(text, doc) {
  var html = esc(text);
  var re = /(الماد(?:ة|تين|ه)|المواد)\s*(?:رقم\s*)?\(?\s*(\d{1,3})\s*\)?/g;
  html = html.replace(re, function (m, w, num) {
    var target = doc;
    // reference to "القانون" from a regulation → point to the law
    // (kept simple: same-doc unless the phrase clearly cites the law)
    var id = target + "-" + num;
    if (!artMap[id]) return m;
    return '<a class="ref" href="#/article/' + id + '">' + m + "</a>";
  });
  return html;
}

/* ---------- favorites ---------- */
var FAV_KEY = "slm_favs_v1";
function getFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch (e) { return []; } }
function isFav(id) { return getFavs().indexOf(id) >= 0; }
function toggleFav(id) {
  var f = getFavs(), i = f.indexOf(id);
  if (i >= 0) { f.splice(i, 1); toast("أُزيلت من المفضلة"); } else { f.push(id); toast("أُضيفت إلى المفضلة"); }
  localStorage.setItem(FAV_KEY, JSON.stringify(f));
  return isFav(id);
}

/* ---------- clipboard / toast ---------- */
function copyText(txt) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(txt).catch(fallbackCopy.bind(null, txt));
  }
  fallbackCopy(txt); return Promise.resolve();
}
function fallbackCopy(txt) {
  var ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
}
var toastT;
function toast(msg) {
  var t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2200);
}

/* ---------- icons ---------- */
var P = {
  users: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 2.7-5 6-5s6 2 6 5M14 20c0-2.2 1-3.8 2.7-4.6",
  star: "M12 3l2.6 5.6 6 .7-4.4 4 1.2 6-5.4-3-5.4 3 1.2-6-4.4-4 6-.7z",
  badge: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z M9 12l2 2 4-4",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  office: "M4 21V6l8-3v18M12 21V9l7 2v10M7 9h1M7 12h1M7 15h1M15 13h1M15 16h1",
  flag: "M6 21V4M6 4h11l-2 4 2 4H6",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  calc: "M6 3h12v18H6zM9 7h6M8 11h.5M12 11h.5M15.5 11H16M8 14h.5M12 14h.5M8 17h4",
  stack: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  coins: "M8 8a5 3 0 1 0 0-6 5 3 0 0 0 0 6zM3 5v6c0 1.7 2.2 3 5 3s5-1.3 5-3M11 13v3c0 1.7 2.2 3 5 3s5-1.3 5-3v-6M11 13a5 3 0 0 0 10 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  vote: "M9 12l2 2 4-5M5 21h14a1 1 0 0 0 1-1V7l-4-4H6a1 1 0 0 0-1 1z",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  chat: "M4 4h16v11H8l-4 4z",
  vault: "M4 4h16v14H4zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 11v3M7 20v2M17 20v2",
  gavel: "M14 3l7 7-3 3-7-7zM11 6l-7 7 3 3 7-7M3 21h9",
  doc: "M6 2h8l4 4v16H6zM14 2v4h4M9 12h6M9 16h6",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  note: "M5 3h11l3 3v15H5zM9 8h7M9 12h7M9 16h4",
  report: "M5 3h14v18H5zM9 3v4h6V3M8 12l2 2 4-4M8 17h8",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  book: "M4 5c2-1 5-1 8 0v15c-3-1-6-1-8 0zM20 5c-2-1-5-1-8 0v15c3-1 6-1 8 0z",
  scale: "M12 3v18M5 21h14M12 6l-6 2 3 5a3 3 0 0 1-6 0zM12 6l6 2-3 5a3 3 0 0 0 6 0z",
  home: "M4 11l8-7 8 7M6 10v10h12V10",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  print: "M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-4h18v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z",
  heart: "M12 20s-7-4.5-9.5-9C1 8 2.5 4.5 6 4.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 15.5 12 20 12 20z",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  arrow: "M15 6l-6 6 6 6"
};
function icon(name, size) {
  var d = P[name] || P.book; size = size || 22;
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
}

/* ---------- doc chip ---------- */
function docChip(id) { var d = docMap[id]; return '<span class="chip doc-' + id + '">' + esc(d ? d.short : id) + "</span>"; }
function docColorClass(id) { return id === "exec" ? "exec" : id === "fin" ? "fin" : ""; }

/* ============================================================
   VIEWS
   ============================================================ */
var view = $("#view");
function setView(html) {
  view.innerHTML = html;
  view.classList.remove("view-enter"); void view.offsetWidth; view.classList.add("view-enter");
  window.scrollTo(0, 0);
  highlightNav();
}

/* ---------- HOME ---------- */
function viewHome() {
  var totalArts = ARTS.length;
  var stats = [
    { n: DOCS.length, l: "وثائق تشريعية", i: "book" },
    { n: totalArts, l: "مادة قانونية", i: "scale" },
    { n: (C.topics || []).length, l: "موضوعًا", i: "grid" },
    { n: (C.entities || []).length, l: "جهات باختصاصاتها", i: "users" }
  ];
  var hints = ["المحافظ", "الموازنة", "سحب الثقة", "المجلس المحلي", "الموارد المحلية"];
  var html =
  '<section class="hero"><span class="hero-grad-edge"></span><div class="inner">' +
    '<div class="hero-official"><img src="assets/emblem.png" alt="شعار الجمهورية اليمنية"><div class="hero-min"><b>الجمهورية اليمنية</b><span>وزارة الإدارة المحلية</span><span class="en">Ministry of Local Administration</span></div></div>' +
    '<div class="eyebrow" style="color:#f0d9a7">منصة معرفية</div>' +
    '<h1>تشريعات السلطة المحلية بين يديك — تبحث وتقرأ وتربط في ثوانٍ</h1>' +
    '<p>' + esc(C.intro || "") + '</p>' +
    '<form class="hero-search" id="heroSearch"><span class="s-ico">' + icon("search", 22) + '</span>' +
      '<input type="search" id="heroInput" placeholder="اكتب سؤالًا أو كلمة… مثل: من يعتمد الموازنة؟" aria-label="بحث">' +
    '</form>' +
    '<div class="hero-cta"><a class="ai-cta" href="#/ask">' + icon("chat", 18) + ' اسأل المساعد القانوني الذكي — يجيبك من داخل القوانين</a></div>' +
    '<div class="hero-hints"><span>جرّب:</span>' + hints.map(function (h) { return '<a href="#/search?q=' + encodeURIComponent(h) + '">' + esc(h) + "</a>"; }).join("") + '</div>' +
  '</div></section>' +

  '<div class="stats">' + stats.map(function (s) {
    return '<div class="stat"><span class="stat-ico">' + icon(s.i, 30) + '</span><b>' + s.n + "</b><span>" + esc(s.l) + "</span></div>";
  }).join("") + '</div>' +

  '<section class="home-sec"><div class="home-sec-head"><h2>مكتبة التشريعات</h2><a href="#/library">عرض الكل ' + icon("arrow", 14) + '</a></div>' +
    '<div class="grid cols-3">' + DOCS.map(docCard).join("") + '</div></section>' +

  '<section class="home-sec"><div class="home-sec-head"><h2>أدوات معرفية</h2></div>' +
    '<div class="grid cols-4">' +
      toolCard("#/orgchart", "scale", "شجرة الاختصاصات", "الجهات ومهامها مبوّبة") +
      toolCard("#/topics", "grid", "تصفّح بالموضوع", "16 موضوعًا رئيسيًا") +
      toolCard("#/glossary", "book", "قاموس المصطلحات", "التعاريف من النصوص") +
      toolCard("#/procedures", "gavel", "دليل الإجراءات", "خطوات مرتبطة بالمواد") +
      toolCard("#/faq", "chat", "الأسئلة الشائعة", "إجابات مسندة للمواد") +
      toolCard("#/forms", "doc", "النماذج الرسمية", "قوالب استرشادية") +
      toolCard("#/favorites", "heart", "مفضلتي", "المواد المحفوظة") +
      toolCard("#/about", "shield", "عن المنصة ومصدر النصوص", "الدقة والتوثيق") +
    '</div></section>';
  setView(html);
  var hs = $("#heroSearch"); if (hs) hs.addEventListener("submit", function (e) { e.preventDefault(); go("/search?q=" + encodeURIComponent($("#heroInput").value)); });
}
function toolCard(href, ic, title, sub) {
  return '<a class="tile" href="' + href + '"><span class="t-ico">' + icon(ic, 24) + "</span><b>" + esc(title) + "</b><span>" + esc(sub) + "</span></a>";
}
function docCard(d) {
  return '<a class="card link doc-card ' + docColorClass(d.id) + '" href="#/doc/' + d.id + '">' +
    '<span class="dc-type">' + esc(d.type) + "</span>" +
    "<h3>" + esc(d.title) + "</h3>" +
    '<div class="dc-full">' + esc(d.fullTitle) + "</div>" +
    (d.id === "law" ? '<div class="verify-badge">' + icon("shield", 13) + ' نصٌّ مُراجَع حرفيًا</div>' : "") +
    '<div class="dc-meta"><span><b>' + d.articleCount + "</b> مادة</span><span><b>" + d.pageCount + "</b> صفحة</span><span>" + esc(d.year) + "م</span></div>" +
  "</a>";
}

/* ---------- LIBRARY ---------- */
function viewLibrary() {
  var html =
    '<div class="section-head"><div class="eyebrow">المكتبة</div><h1>مكتبة التشريعات</h1>' +
    '<p>الوثائق الرسمية المنظِّمة للسلطة المحلية. اختر وثيقة لتصفّح موادها كاملة، أو استخدم البحث للوصول المباشر.</p></div>' +
    '<div class="grid cols-3">' + DOCS.map(docCard).join("") + "</div>";
  setView(html);
}

/* ---------- DOCUMENT ---------- */
function docArticles(id) { return ARTS.filter(function (a) { return a.doc === id; }); }
function viewDoc(id) {
  var d = docMap[id]; if (!d) return viewNotFound();
  var arts = docArticles(id);
  // group by bab then fasl
  var babs = [], bmap = {};
  arts.forEach(function (a) {
    var bk = a.bab || "—";
    if (!bmap[bk]) { bmap[bk] = { bab: a.bab, title: a.babTitle, arts: [] }; babs.push(bmap[bk]); }
    bmap[bk].arts.push(a);
  });
  var toc = babs.map(function (b, i) {
    return '<details class="toc-bab"' + (i < 2 ? " open" : "") + '><summary>' + esc(b.bab || "مواد") +
      '<span style="color:var(--faint);font-weight:400">' + b.arts.length + "</span></summary>" +
      '<div class="toc-arts">' + b.arts.map(function (a) {
        return '<a href="#/doc/' + id + "/" + a.n + '" data-art="' + a.id + '">' + esc(a.label) + "</a>";
      }).join("") + "</div></details>";
  }).join("");

  var body = babs.map(function (b) {
    var head = b.bab ? '<div class="bab-header"><div class="eyebrow">' + esc(b.bab) + '</div><h2>' + esc(b.title || "") + "</h2></div>" : "";
    var lastFasl = null, arts = "";
    b.arts.forEach(function (a) {
      if (a.fasl && a.fasl !== lastFasl) { arts += '<div class="fasl-header">' + esc(a.fasl) + (a.faslTitle ? " — " + esc(a.faslTitle) : "") + "</div>"; lastFasl = a.fasl; }
      arts += articleBlock(a);
    });
    return head + arts;
  }).join("");

  var html =
    '<div class="breadcrumbs"><a href="#/library">المكتبة</a><span class="sep">/</span><span>' + esc(d.title) + "</span></div>" +
    '<div class="section-head"><div class="eyebrow">' + esc(d.type) + '</div><h1>' + esc(d.title) + "</h1><p>" + esc(d.fullTitle) + " — " + d.articleCount + " مادة.</p></div>" +
    '<div class="doc-layout"><aside class="doc-side"><h4>فهرس الأبواب</h4>' + toc + "</aside>" +
    '<div class="art-list" id="artList">' + preambleHtml(d) + body + "</div></div>";
  setView(html);
  attachArticleTools(view);
}

var PREAMBLE_SKIP = { "الجمهورية اليمنية": 1, "وزارة الادارة المحلية": 1, "لوزارة الإدارة المحلية": 1, "لعام 2000م": 1, "لعام 2001م": 1, "اللائحة التنفيذية": 1, "اللائحة المالية": 1 };
function preambleHtml(d) {
  var lines = (d.front || []).filter(function (l) {
    l = (l || "").trim();
    if (l.length < 4) return false;
    if (/[A-Za-z]{3,}/.test(l)) return false;      // drop latin letterhead
    if (PREAMBLE_SKIP[l]) return false;
    return true;
  });
  if (!lines.length) return "";
  return '<details class="acc" style="margin-bottom:14px"><summary>ديباجة الإصدار</summary><div class="acc-body" style="line-height:2;white-space:pre-wrap">' +
    lines.map(esc).join("\n") + "</div></details>";
}
function articleBlock(a) {
  var fav = isFav(a.id);
  return '<article class="article" id="art-' + a.n + '" data-id="' + a.id + '">' +
    '<div class="article-head"><div class="article-num"><span class="an-badge">' + esc(a.label) + "</span></div>" +
      '<div class="article-tools">' +
        toolBtn("open", a.id, "link", "رابط المادة") +
        toolBtn("img", a.id, "image", "الصفحة الأصلية") +
        toolBtn("copy", a.id, "copy", "نسخ") +
        toolBtn("fav", a.id, "heart", "حفظ", fav) +
      "</div></div>" +
    '<div class="article-text">' + linkifyRefs(a.text, a.doc) + "</div></article>";
}
function toolBtn(act, id, ic, label, on) {
  return '<button class="icon-btn' + (on ? " on" : "") + '" data-act="' + act + '" data-id="' + id + '" title="' + label + '" aria-label="' + label + '">' + icon(ic, 18) + "</button>";
}

/* ---------- ARTICLE PAGE ---------- */
function viewArticle(id) {
  var a = artMap[id]; if (!a) return viewNotFound();
  var d = docMap[a.doc];
  var ctx = [];
  if (a.bab) ctx.push(esc(a.bab) + (a.babTitle ? " — " + esc(a.babTitle) : ""));
  if (a.fasl) ctx.push(esc(a.fasl) + (a.faslTitle ? " — " + esc(a.faslTitle) : ""));
  if (a.far3) ctx.push(esc(a.far3) + (a.far3Title ? " — " + esc(a.far3Title) : ""));
  var fav = isFav(a.id);

  var related = relatedArticles(a);
  var relHtml = related.length ? '<div class="related"><h3>' + icon("link", 18) + " مواد ذات علاقة</h3><div class=\"rel-grid\">" +
    related.map(function (r) {
      return '<a class="rel-item" href="#/article/' + r.id + '"><b>' + esc(r.label) + " · " + esc(docMap[r.doc].short) + "</b><span>" + esc(r.text.slice(0, 110)) + "</span></a>";
    }).join("") + "</div></div>" : "";

  var html = '<div class="article-page">' +
    '<div class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><a href="#/doc/' + a.doc + '">' + esc(d.title) + "</a><span class=\"sep\">/</span><span>" + esc(a.label) + "</span></div>" +
    '<div class="ap-card">' +
      '<div class="ap-meta">' + docChip(a.doc) + (a.bab ? '<span class="chip">' + esc(a.bab) + "</span>" : "") + "</div>" +
      '<h1 class="ap-title">' + esc(a.label) + "</h1>" +
      (ctx.length ? '<div class="ap-context">' + ctx.join(" &nbsp;·&nbsp; ") + "</div>" : "") +
      '<div class="ap-text">' + linkifyRefs(a.text, a.doc) + "</div>" +
      '<div class="ap-toolbar">' +
        '<button class="btn" data-act="img" data-id="' + a.id + '">' + icon("image", 18) + " الصفحة الأصلية</button>" +
        '<button class="btn secondary" data-act="copy" data-id="' + a.id + '">' + icon("copy", 18) + " نسخ النص</button>" +
        '<button class="btn secondary" data-act="print" data-id="' + a.id + '">' + icon("print", 18) + " طباعة</button>" +
        '<button class="btn secondary" data-act="share" data-id="' + a.id + '">' + icon("link", 18) + " مشاركة الرابط</button>" +
        '<button class="btn secondary' + (fav ? " on" : "") + '" data-act="fav" data-id="' + a.id + '">' + icon("heart", 18) + " " + (fav ? "محفوظة" : "حفظ") + "</button>" +
        (a.doc !== "law" ? "" : '<a class="btn secondary" href="#/compare/' + a.id + '">' + icon("scale", 18) + " قارن باللوائح</a>") +
      "</div>" +
    "</div>" + relHtml + "</div>";
  setView(html);
  attachArticleTools(view);
}

/* relatedness: neighbors + cross-doc keyword matches */
function relatedArticles(a) {
  var out = [], seen = {}; seen[a.id] = 1;
  var neigh = [a.doc + "-" + (a.n - 1), a.doc + "-" + (a.n + 1)];
  neigh.forEach(function (id) { if (artMap[id] && !seen[id]) { out.push(artMap[id]); seen[id] = 1; } });
  // cross-doc by shared terms
  var terms = Object.keys(a._terms).sort(function (x, y) { return a._terms[y] - a._terms[x]; }).slice(0, 8);
  if (terms.length) {
    var res = searchArticles(terms.join(" "), null);
    for (var i = 0; i < res.length && out.length < 6; i++) {
      var r = res[i].a; if (seen[r.id]) continue;
      if (r.doc !== a.doc) { out.push(r); seen[r.id] = 1; }
    }
    for (var j = 0; j < res.length && out.length < 6; j++) {
      var r2 = res[j].a; if (seen[r2.id]) continue; out.push(r2); seen[r2.id] = 1;
    }
  }
  return out.slice(0, 6);
}

/* ---------- COMPARE (law article vs regulations) ---------- */
function viewCompare(id) {
  var a = artMap[id]; if (!a) return viewNotFound();
  var terms = Object.keys(a._terms).sort(function (x, y) { return a._terms[y] - a._terms[x]; }).slice(0, 8);
  var execR = searchArticles(terms.join(" "), "exec").slice(0, 5);
  var finR = searchArticles(terms.join(" "), "fin").slice(0, 5);
  function col(title, arr) {
    return '<div class="compare-col"><h3>' + title + "</h3>" + (arr.length ? arr.map(function (r) {
      return '<a class="rel-item" href="#/article/' + r.a.id + '"><b>' + esc(r.a.label) + "</b><span>" + esc(r.a.text.slice(0, 130)) + "</span></a>";
    }).join("") : '<p style="color:var(--muted)">لا توجد مواد مطابقة واضحة.</p>') + "</div>";
  }
  var html = '<div class="article-page">' +
    '<div class="breadcrumbs"><a href="#/article/' + a.id + '">' + esc(a.label) + "</a><span class=\"sep\">/</span><span>مقارنة باللوائح</span></div>" +
    '<div class="section-head"><div class="eyebrow">مقارنة</div><h1>' + esc(a.label) + " من القانون واللوائح المفسِّرة لها</h1>" +
    "<p>مواد اللائحتين التنفيذية والمالية الأقرب صلةً بموضوع هذه المادة (بحسب التشابه الموضوعي).</p></div>" +
    '<div class="ap-card"><div class="ap-meta">' + docChip("law") + "</div><div class=\"ap-text\">" + linkifyRefs(a.text, "law") + "</div></div>" +
    '<div class="compare-cols">' + col("في اللائحة التنفيذية", execR) + col("في اللائحة المالية", finR) + "</div></div>";
  setView(html);
}

/* ---------- SEARCH ---------- */
function viewSearch(q, docFilter) {
  docFilter = docFilter || "all";
  var html =
    '<div class="search-wrap">' +
    '<div class="section-head"><div class="eyebrow">البحث الذكي</div><h1>ابحث في كل التشريعات دفعة واحدة</h1></div>' +
    '<div class="search-box"><span class="s-ico">' + icon("search", 22) + '</span>' +
    '<input type="search" id="pageSearch" value="' + esc(q || "") + '" placeholder="اكتب سؤالًا أو كلمة مفتاحية…" aria-label="بحث"></div>' +
    '<div class="search-filters" id="searchFilters">' +
      filterBtn("all", "الكل", docFilter) +
      DOCS.map(function (d) { return filterBtn(d.id, d.short, docFilter); }).join("") +
    "</div>" +
    '<div id="searchResults"></div></div>';
  setView(html);
  var input = $("#pageSearch");
  input.focus();
  var end = input.value.length; input.setSelectionRange(end, end);
  var run = function () { renderResults(input.value, currentFilter); };
  var deb; input.addEventListener("input", function () { clearTimeout(deb); deb = setTimeout(function () {
    var nq = input.value.trim();
    history.replaceState(null, "", "#/search?q=" + encodeURIComponent(nq) + (currentFilter !== "all" ? "&doc=" + currentFilter : ""));
    run();
  }, 160); });
  var currentFilter = docFilter;
  $("#searchFilters").addEventListener("click", function (e) {
    var b = e.target.closest(".filter-btn"); if (!b) return;
    currentFilter = b.dataset.f;
    $all(".filter-btn").forEach(function (x) { x.classList.toggle("active", x.dataset.f === currentFilter); });
    run();
  });
  renderResults(q, docFilter);
}
function filterBtn(f, label, active) {
  return '<button class="filter-btn' + (f === active ? " active" : "") + '" data-f="' + f + '">' + esc(label) + "</button>";
}
function renderResults(q, docFilter) {
  var box = $("#searchResults"); if (!box) return;
  q = (q || "").trim();
  if (q.length < 2) { box.innerHTML = '<div class="empty">' + icon("search", 40) + "<p>ابدأ الكتابة للبحث في " + ARTS.length + " مادة.</p></div>"; return; }
  var res = searchArticles(q, docFilter);
  var html = "";
  // smart answer for questions
  var smart = smartAnswer(q, res);
  if (smart) html += smart;
  html += '<div class="search-meta">' + (res.length ? res.length + " نتيجة" : "لا نتائج") + ' لـ «' + esc(q) + "»</div>";
  if (!res.length) {
    html += '<div class="empty">' + icon("search", 40) + "<p>لم يُعثر على نتائج. جرّب كلمات أعمّ أو مرادفات مختلفة.</p></div>";
  } else {
    html += res.slice(0, 60).map(function (r) {
      var a = r.a;
      return '<a class="result" href="#/article/' + a.id + '"><div class="result-head">' + docChip(a.doc) +
        "<b>" + esc(a.label) + "</b>" + (a.babTitle ? '<span style="color:var(--faint);font-size:.83rem">' + esc(a.babTitle) + "</span>" : "") + "</div>" +
        '<div class="result-snippet">' + snippet(a.text, r.toks) + "</div></a>";
    }).join("");
    if (res.length > 60) html += '<p style="color:var(--muted);text-align:center;margin-top:16px">تُعرض أول 60 نتيجة — حسّن كلمات البحث لنتائج أدق.</p>';
  }
  box.innerHTML = html;
}
function smartAnswer(q, res) {
  var nq = norm(q);
  var isQ = /(\?|؟)/.test(q) || /^(من|ما|ماذا|هل|كيف|متى|اين|أين|لماذا|كم)\b/.test(nq);
  // try FAQ match first
  var faq = (C.faq || []), best = null, bestScore = 0;
  faq.forEach(function (f) {
    var s = overlap(nq, norm(f.q));
    if (s > bestScore) { bestScore = s; best = f; }
  });
  if (best && bestScore >= 0.5) {
    var rel = articlesByKeywords(best.keywords, null, 3);
    return '<div class="smart-answer"><div class="sa-tag">' + icon("chat", 16) + " إجابة مقترحة</div><h3>" + esc(best.q) + "</h3><p>" + esc(best.a) + "</p>" +
      (rel.length ? '<div class="sa-src">المواد المستند إليها: ' + rel.map(function (r) { return '<a href="#/article/' + r.a.id + '">' + esc(r.a.label) + " (" + esc(docMap[r.a.doc].short) + ")</a>"; }).join(" ، ") + "</div>" : "") + "</div>";
  }
  if (isQ && res.length) {
    var a = res[0].a;
    return '<div class="smart-answer"><div class="sa-tag">' + icon("scale", 16) + " أقرب مادة لسؤالك</div><h3>" + esc(a.label) + " · " + esc(docMap[a.doc].title) + "</h3>" +
      '<div class="result-snippet">' + esc(a.text.slice(0, 260)) + (a.text.length > 260 ? " …" : "") + "</div>" +
      '<div class="sa-src"><a href="#/article/' + a.id + '">عرض المادة كاملة ' + icon("arrow", 13) + "</a></div></div>";
  }
  return "";
}
function overlap(a, b) {
  var wa = a.split(" ").filter(function (w) { return w.length > 2 && !STOP[w]; });
  var wb = {}; b.split(" ").forEach(function (w) { wb[w] = 1; });
  if (!wa.length) return 0;
  var hit = 0; wa.forEach(function (w) { if (wb[w]) hit++; });
  return hit / wa.length;
}

/* ---------- TOPICS ---------- */
function viewTopics() {
  var html = '<div class="section-head"><div class="eyebrow">تصفّح بالموضوع</div><h1>المواضيع الرئيسية</h1>' +
    '<p>ادخل إلى أي موضوع لتُعرض عليك جميع المواد ذات الصلة من الوثائق الثلاث دفعةً واحدة.</p></div>' +
    '<div class="tile-grid">' + (C.topics || []).map(function (t) {
      var count = searchArticles(t.keywords.join(" "), null).length;
      return '<a class="tile" href="#/topic/' + t.key + '"><span class="t-ico">' + icon(t.icon, 24) + "</span><b>" + esc(t.name) + "</b><span>" + esc(t.desc) + "</span>" +
        '<span style="color:var(--primary);font-weight:700;font-size:.82rem">' + count + " مادة</span></a>";
    }).join("") + "</div>";
  setView(html);
}
function viewTopic(key) {
  var t = (C.topics || []).find(function (x) { return x.key === key; }); if (!t) return viewNotFound();
  var res = searchArticles(t.keywords.join(" "), null);
  var html = '<div class="breadcrumbs"><a href="#/topics">المواضيع</a><span class="sep">/</span><span>' + esc(t.name) + "</span></div>" +
    '<div class="section-head"><div class="eyebrow">موضوع</div><h1>' + esc(t.name) + "</h1><p>" + esc(t.desc) + " — " + res.length + " مادة ذات صلة. الكلمات: " + esc(t.keywords.join("، ")) + ".</p></div>" +
    (res.length ? res.map(function (r) {
      var a = r.a;
      return '<a class="result" href="#/article/' + a.id + '"><div class="result-head">' + docChip(a.doc) + "<b>" + esc(a.label) + "</b></div><div class=\"result-snippet\">" + esc(a.text.slice(0, 200)) + (a.text.length > 200 ? " …" : "") + "</div></a>";
    }).join("") : '<div class="empty">لا توجد مواد.</div>');
  setView(html);
}

/* ---------- ORG CHART ---------- */
function viewOrgchart() {
  var top = C.orgTop || { name: "السلطة المحلية" };
  var nodes = (C.orgNodes || []).map(function (k) {
    var e = (C.entities || []).find(function (x) { return x.key === k; });
    return e ? '<a class="org-node" href="#/entity/' + e.key + '" style="text-decoration:none">' + esc(e.name) + "</a>" : "";
  }).join("");
  var html = '<div class="section-head"><div class="eyebrow">شجرة الاختصاصات</div><h1>خريطة اختصاصات السلطة المحلية</h1>' +
    '<p>اضغط على أي جهة لعرض تعريفها واختصاصاتها مبوّبة، مع المواد القانونية المنظِّمة لها. توفّر عليك ساعات البحث في مئات المواد.</p></div>' +
    '<div class="card"><div class="org">' +
      '<div class="org-node org-top">' + esc(top.name) + (top.note ? '<div style="font-size:.75rem;font-weight:400;opacity:.85">' + esc(top.note) + "</div>" : "") + "</div>" +
      '<div class="org-connector"></div>' +
      '<div class="org-row">' + nodes + "</div>" +
    "</div></div>" +
    '<div class="grid cols-3" style="margin-top:20px">' + (C.entities || []).map(function (e) {
      return '<a class="card link" href="#/entity/' + e.key + '"><h3 style="color:var(--primary);display:flex;align-items:center;gap:8px">' + icon(e.icon, 20) + " " + esc(e.name) + '</h3><p style="color:var(--muted);font-size:.9rem;margin-top:8px">' + esc(e.summary) + "</p></a>";
    }).join("") + "</div>";
  setView(html);
}
function viewEntity(key) {
  var e = (C.entities || []).find(function (x) { return x.key === key; }); if (!e) return viewNotFound();
  var cats = e.cats.map(function (c, i) {
    var res = searchArticles(c.keywords.join(" "), null).slice(0, 8);
    return '<details class="comp-cat"' + (i === 0 ? " open" : "") + '><summary>' + esc(c.name) + '<span style="color:var(--muted);font-size:.85rem;font-weight:400">' + res.length + " مادة</span></summary>" +
      '<div class="comp-body">' + (res.length ? res.map(function (r) {
        return '<a class="rel-item" href="#/article/' + r.a.id + '" style="margin:6px"><b>' + esc(r.a.label) + " · " + esc(docMap[r.a.doc].short) + "</b><span>" + esc(r.a.text.slice(0, 120)) + "</span></a>";
      }).join("") : '<p style="color:var(--muted);padding:10px">لا توجد مواد مطابقة.</p>') + "</div></details>";
  }).join("");
  var html = '<div class="breadcrumbs"><a href="#/orgchart">شجرة الاختصاصات</a><span class="sep">/</span><span>' + esc(e.name) + "</span></div>" +
    '<div class="entity-hero"><h1>' + esc(e.name) + "</h1><p>" + esc(e.summary) + "</p></div>" +
    '<div class="notice">' + icon("shield", 18) + "<div>الاختصاصات أدناه مبوّبة استرشاديًا، وكل عنصر يعرض المواد الفعلية من النصوص. للاطّلاع الحرفي راجع نص كل مادة وصورتها الأصلية.</div></div>" +
    cats;
  setView(html);
}

/* ---------- GLOSSARY ---------- */
var glossaryCache = null;
function buildGlossary() {
  if (glossaryCache) return glossaryCache;
  var out = [];
  DOCS.forEach(function (d) {
    var a2 = artMap[d.id + "-2"]; if (!a2) return;
    // drop the introductory clause before the first definition ("… معنى آخر:")
    var body = a2.text.replace(/^[\s\S]*?معن[ىي]\s*آخر\s*:?\s*/, "");
    // split definition entries: "term : definition ." repeated
    var parts = body.split(/\s+\.\s+/);
    parts.forEach(function (p) {
      var idx = p.indexOf(" : ");
      if (idx < 0) idx = p.indexOf(" :");
      if (idx > 0 && idx < 40) {
        var term = p.slice(0, idx).trim().replace(/^و/, "");
        var def = p.slice(idx + 2).replace(/^:\s*/, "").trim();
        if (term && def && term.length < 42 && def.length > 3) out.push({ term: term, def: def, doc: d.id, art: a2.id });
      }
    });
  });
  glossaryCache = out; return out;
}
function viewGlossary() {
  var g = buildGlossary();
  var html = '<div class="section-head"><div class="eyebrow">القاموس</div><h1>قاموس المصطلحات</h1>' +
    '<p>تعريفات المصطلحات كما وردت في نصوص القانون واللوائح (مادة التعاريف). عددها ' + g.length + " تعريفًا.</p></div>" +
    '<div class="gloss-search"><div class="search-box"><span class="s-ico">' + icon("search", 20) + '</span><input type="search" id="glossInput" placeholder="ابحث عن مصطلح…" aria-label="بحث في القاموس"></div></div>' +
    '<dl id="glossList">' + g.map(glossItem).join("") + "</dl>";
  setView(html);
  var gi = $("#glossInput");
  gi.addEventListener("input", function () {
    var v = norm(gi.value);
    var filtered = v ? g.filter(function (x) { return norm(x.term).indexOf(v) >= 0 || norm(x.def).indexOf(v) >= 0; }) : g;
    $("#glossList").innerHTML = filtered.length ? filtered.map(glossItem).join("") : '<div class="empty">لا مصطلحات مطابقة.</div>';
  });
}
function glossItem(x) {
  return '<div class="gloss-item"><dt>' + esc(x.term) + "</dt><dd>" + esc(x.def) + '</dd><div class="g-src">' +
    esc(docMap[x.doc].short) + " · <a href=\"#/article/" + x.art + '">مادة التعاريف</a></div></div>';
}

/* ---------- PROCEDURES ---------- */
function viewProcedures() {
  var html = '<div class="section-head"><div class="eyebrow">دليل الإجراءات</div><h1>دليل الإجراءات</h1>' +
    '<p>خطوات مبسّطة لأهم العمليات، مع روابط للمواد القانونية ذات الصلة.</p></div>' +
    '<div class="tile-grid">' + (C.procedures || []).map(function (p) {
      return '<a class="tile" href="#/procedure/' + p.key + '"><span class="t-ico">' + icon(p.icon, 24) + "</span><b>" + esc(p.name) + "</b><span>" + esc(p.desc) + "</span></a>";
    }).join("") + "</div>";
  setView(html);
}
function viewProcedure(key) {
  var p = (C.procedures || []).find(function (x) { return x.key === key; }); if (!p) return viewNotFound();
  var rel = articlesByKeywords(p.keywords, null, 8);
  var html = '<div class="breadcrumbs"><a href="#/procedures">الإجراءات</a><span class="sep">/</span><span>' + esc(p.name) + "</span></div>" +
    '<div class="section-head"><div class="eyebrow">إجراء</div><h1>' + esc(p.name) + "</h1><p>" + esc(p.desc) + "</p></div>" +
    '<div class="card"><ol style="line-height:2.1;font-size:1.05rem;padding-inline-start:22px">' +
      p.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol></div>" +
    '<div class="notice">' + icon("shield", 18) + "<div>الخطوات استرشادية لتيسير الفهم؛ الحكم النافذ هو نص المواد القانونية أدناه.</div></div>" +
    '<div class="related"><h3>' + icon("link", 18) + " المواد ذات الصلة</h3><div class=\"rel-grid\">" +
      rel.map(function (r) { return '<a class="rel-item" href="#/article/' + r.a.id + '"><b>' + esc(r.a.label) + " · " + esc(docMap[r.a.doc].short) + "</b><span>" + esc(r.a.text.slice(0, 110)) + "</span></a>"; }).join("") + "</div></div>";
  setView(html);
}

/* ---------- FAQ ---------- */
function viewFaq() {
  var html = '<div class="section-head"><div class="eyebrow">الأسئلة الشائعة</div><h1>الأسئلة الشائعة</h1>' +
    '<p>إجابات موجزة، مع الإحالة إلى المواد القانونية المستند إليها.</p></div>' +
    (C.faq || []).map(function (f, i) {
      var rel = articlesByKeywords(f.keywords, null, 4);
      return '<details class="acc"' + (i === 0 ? " open" : "") + '><summary>' + esc(f.q) + "</summary>" +
        '<div class="acc-body"><p>' + esc(f.a) + "</p>" +
        (rel.length ? '<p style="margin-top:10px;font-size:.9rem;color:var(--muted)">المواد ذات الصلة: ' +
          rel.map(function (r) { return '<a href="#/article/' + r.a.id + '">' + esc(r.a.label) + " (" + esc(docMap[r.a.doc].short) + ")</a>"; }).join(" ، ") + "</p>" : "") +
        "</div></details>";
    }).join("");
  setView(html);
}

/* ---------- FORMS ---------- */
function viewForms() {
  var html = '<div class="section-head"><div class="eyebrow">النماذج</div><h1>النماذج الرسمية</h1>' +
    '<p>قوالب استرشادية جاهزة يمكن نسخها أو طباعتها واستخدامها في العمل اليومي.</p></div>' +
    '<div class="notice">' + icon("shield", 18) + "<div>هذه نماذج استرشادية لتيسير العمل، وليست جزءًا من نصوص القانون أو اللوائح.</div></div>" +
    (C.forms || []).map(function (f, i) {
      return '<div class="form-tpl"><h3>' + esc(f.name) + '</h3><p style="color:var(--muted)">' + esc(f.desc) + "</p>" +
        '<div class="tpl-body" id="tpl-' + i + '">' + esc(f.body) + "</div>" +
        '<div style="display:flex;gap:8px"><button class="btn-ghost" data-tpl="' + i + '" data-tact="copy">' + icon("copy", 16) + " نسخ</button>" +
        '<button class="btn-ghost" data-tpl="' + i + '" data-tact="print">' + icon("print", 16) + " طباعة</button></div></div>";
    }).join("");
  setView(html);
  view.addEventListener("click", function (e) {
    var b = e.target.closest("[data-tpl]"); if (!b) return;
    var f = (C.forms || [])[+b.dataset.tpl]; if (!f) return;
    if (b.dataset.tact === "copy") { copyText(f.body); toast("نُسخ النموذج"); }
    else { printContent("<h2>" + esc(f.name) + "</h2><pre style='font-family:inherit;white-space:pre-wrap'>" + esc(f.body) + "</pre>"); }
  });
}

/* ---------- FAVORITES ---------- */
function viewFavorites() {
  var favs = getFavs().map(function (id) { return artMap[id]; }).filter(Boolean);
  var html = '<div class="section-head"><div class="eyebrow">المفضلة</div><h1>موادي المحفوظة</h1>' +
    "<p>المواد التي حفظتها للرجوع إليها. تُحفظ محليًا في متصفحك.</p></div>";
  if (!favs.length) {
    html += '<div class="empty">' + icon("heart", 44) + "<p>لا توجد مواد محفوظة بعد. اضغط رمز ♥ في أي مادة لإضافتها هنا.</p><a class=\"btn\" href=\"#/library\" style=\"margin-top:14px\">تصفّح المكتبة</a></div>";
  } else {
    html += favs.map(function (a) {
      return '<a class="result" href="#/article/' + a.id + '"><div class="result-head">' + docChip(a.doc) + "<b>" + esc(a.label) + "</b></div><div class=\"result-snippet\">" + esc(a.text.slice(0, 180)) + (a.text.length > 180 ? " …" : "") + "</div></a>";
    }).join("");
  }
  setView(html);
}

/* ---------- ABOUT ---------- */
function viewAbout() {
  var html = '<div class="article-page"><div class="section-head"><div class="eyebrow">عن المنصة</div><h1>عن المنصة ومصدر النصوص</h1></div>' +
    '<div class="ap-card"><div class="ap-text" style="font-size:1.05rem">' +
    "<p>منصة تشريعات السلطة المحلية أداة معرفية غير رسمية تهدف إلى تيسير الاطّلاع والبحث في تشريعات السلطة المحلية في الجمهورية اليمنية، وتضم ثلاث وثائق أساسية:</p>" +
    "<ul style='line-height:2;padding-inline-start:22px'>" +
      DOCS.map(function (d) { return "<li><b>" + esc(d.title) + "</b> — " + esc(d.fullTitle) + " (" + d.articleCount + " مادة).</li>"; }).join("") +
    "</ul>" +
    "<h3 style='margin:18px 0 8px;color:var(--primary)'>الدقة والتوثيق</h3>" +
    "<p>استُخرجت نصوص المواد من ملفات الوثائق الرسمية بصيغة PDF، وهُيكلت في " + ARTS.length + " مادة. وتُتاح <b>صورة الصفحة الأصلية</b> لكل مادة عبر زر «الصفحة الأصلية» للرجوع إلى النص الحرفي. المرجع الرسمي المعتمد يبقى الجريدة الرسمية والوثائق الأصلية الصادرة عن الجهات المختصة.</p>" +
    "<h4 style='margin:14px 0 6px'>حالة مراجعة النصوص</h4>" +
    "<ul style='line-height:2;padding-inline-start:22px'>" +
      "<li><b>قانون السلطة المحلية</b> — رُوجِع نصّه حرفيًا مقابل صور الصفحات الأصلية (مكتمل).</li>" +
      "<li><b>اللائحة التنفيذية</b> و<b>اللائحة المالية</b> — نصٌّ مُستخرَج آليًا ومهيكل بالكامل؛ المراجعة النصية الحرفية الكاملة قيد الإنجاز، وصورة الصفحة الأصلية متاحة لكل مادة للتوثيق.</li>" +
    "</ul>" +
    "<h3 style='margin:18px 0 8px;color:var(--primary)'>الميزات</h3>" +
    "<p>بحث ذكي في كل التشريعات دفعة واحدة، صفحة مستقلة لكل مادة مع النسخ والطباعة والمشاركة، ربط تلقائي بين المواد المتقاطعة، شجرة اختصاصات، قاموس مصطلحات، دليل إجراءات، أسئلة شائعة، نماذج، ومفضلة.</p>" +
    "</div></div></div>";
  setView(html);
}

function viewNotFound() {
  setView('<div class="empty">' + icon("search", 44) + "<h1 style='margin:10px 0'>الصفحة غير موجودة</h1><p>تعذّر العثور على المحتوى المطلوب.</p><a class='btn' href='#/' style='margin-top:14px'>العودة للرئيسية</a></div>");
}

/* ============================================================
   Article tools (copy / fav / image / print / share)
   ============================================================ */
function attachArticleTools(scope) {
  scope.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.dataset.act, id = b.dataset.id, a = artMap[id];
    if (act === "open") { go("/article/" + id); }
    else if (act === "copy" && a) { copyText(a.label + "\n" + a.text); toast("نُسخ نص المادة"); }
    else if (act === "fav" && a) {
      var on = toggleFav(id);
      b.classList.toggle("on", on);
      if (b.classList.contains("btn")) b.innerHTML = icon("heart", 18) + " " + (on ? "محفوظة" : "حفظ");
    }
    else if (act === "img" && a) { openImgModal(a); }
    else if (act === "print" && a) { printContent("<h2>" + esc(a.label) + " — " + esc(docMap[a.doc].title) + "</h2><p style='font-size:1.1rem;line-height:2'>" + esc(a.text) + "</p>"); }
    else if (act === "share" && a) {
      var url = location.origin + location.pathname + "#/article/" + id;
      copyText(url); toast("نُسخ رابط المادة");
    }
  });
}

/* ---------- source image modal ---------- */
function openImgModal(a) {
  var m = $("#imgModal");
  $("#imgModalImg").src = a.img;
  $("#imgModalImg").alt = "الصفحة الأصلية للمادة " + a.num;
  $("#imgModalTitle").textContent = docMap[a.doc].short + " — الصفحة " + a.page + " (" + a.label + ")";
  $("#imgModalOpen").href = a.img;
  m.hidden = false; document.body.style.overflow = "hidden";
}
function closeImgModal() { $("#imgModal").hidden = true; document.body.style.overflow = ""; }
$("#imgModal").addEventListener("click", function (e) { if (e.target.hasAttribute("data-close") || e.target.classList.contains("modal-back")) closeImgModal(); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeImgModal(); });

/* ---------- print ---------- */
function printContent(inner) {
  var w = window.open("", "_blank");
  if (!w) { toast("منع المتصفح فتح نافذة الطباعة"); return; }
  w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>طباعة</title>' +
    '<style>body{font-family:"Segoe UI",Tahoma,sans-serif;padding:30px;line-height:1.9;color:#111}h2{font-family:Georgia,serif}a{color:#0f5b58}</style></head><body>' +
    inner + "</body></html>");
  w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 250);
}

/* ============================================================
   AI LEGAL ASSISTANT (RAG over the laws — answers only from the texts)
   ============================================================ */
var AI_KEY = "slm_ai_cfg_v1";
var AI_MODELS = [
  { id: "claude-opus-5", name: "الأدق (Opus)" },
  { id: "claude-sonnet-5", name: "متوازن وأسرع (Sonnet)" },
  { id: "claude-haiku-4-5", name: "الأسرع (Haiku)" }
];
function aiCfg() { try { return JSON.parse(localStorage.getItem(AI_KEY) || "{}"); } catch (e) { return {}; } }
function aiSave(c) { localStorage.setItem(AI_KEY, JSON.stringify(c)); }

var AI_SYSTEM =
"أنت «المساعد القانوني» لمنصة تشريعات السلطة المحلية في الجمهورية اليمنية. تجيب على أسئلة المستخدم بالاعتماد الحصري على «النصوص القانونية المرفقة» في رسالة المستخدم فقط، ولا تستعمل أي معرفة من خارجها.\n\n" +
"قواعد صارمة يجب الالتزام بها:\n" +
"1) اعتمد فقط على المواد المرفقة. يمنع منعًا باتًا استخدام أي معلومة أو اجتهاد من خارج هذه المواد.\n" +
"2) اذكر في إجابتك أرقام المواد التي استندت إليها واسم وثيقتها بالصيغة التالية بالضبط بين قوسين: (المادة رقم — الوثيقة)، حيث الوثيقة إحدى: القانون / اللائحة التنفيذية / اللائحة المالية. مثال: (المادة 130 — القانون).\n" +
"3) لا تُلفّق أرقام مواد أو نصوصًا غير موجودة في المرفقات.\n" +
"4) إذا لم تجد في المواد المرفقة ما يجيب على السؤال، فاذكر بوضوح: «لم أجد نصًّا صريحًا يجيب على هذا السؤال ضمن المواد المتاحة»، واقترح إعادة صياغة السؤال أو تصفّح المكتبة.\n" +
"5) أجب بالعربية الفصحى بإيجاز ودقة، ثم أضف في النهاية سطرًا بعنوان «الاستناد القانوني:» تسرد فيه المواد ذات الصلة بصيغة القوسين أعلاه.";

function aiRetrieve(question, limit) {
  limit = limit || 16;
  var res = searchArticles(question, "all");
  var arts = res.slice(0, limit).map(function (r) { return r.a; });
  return arts;
}
function aiBuildUserMessage(question, arts) {
  var ctx = arts.map(function (a, i) {
    return "[" + (i + 1) + "] " + docMap[a.doc].short + " — " + a.label + ":\n" + a.text;
  }).join("\n\n");
  return "السؤال: " + question + "\n\n=== النصوص القانونية المرفقة (أجب منها فقط) ===\n" + ctx;
}
function aiDocId(name) {
  if (/تنفيذية/.test(name)) return "exec";
  if (/مالية/.test(name)) return "fin";
  return "law";
}
function linkifyAnswer(text) {
  var html = esc(text);
  // (المادة N — الوثيقة)  → clickable
  html = html.replace(/\(\s*الماد[ةه]\s*(\d{1,3})\s*[—–\-]\s*(القانون|اللائحة التنفيذية|اللائحة المالية)\s*\)/g,
    function (m, num, doc) {
      var id = aiDocId(doc) + "-" + num;
      if (!artMap[id]) return m;
      return '(<a class="ref" href="#/article/' + id + '">المادة ' + num + " — " + doc + "</a>)";
    });
  return html.replace(/\n/g, "<br>");
}

function aiAsk(question) {
  var cfg = aiCfg();
  var arts = aiRetrieve(question);
  var body = {
    model: cfg.model || "claude-opus-5",
    max_tokens: 4000,
    system: AI_SYSTEM,
    messages: [{ role: "user", content: aiBuildUserMessage(question, arts) }]
  };
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.json().then(function (data) {
      if (!r.ok) { throw new Error((data && data.error && data.error.message) || ("خطأ " + r.status)); }
      return { data: data, arts: arts };
    });
  }).then(function (o) {
    var data = o.data;
    if (data.stop_reason === "refusal") { return { answer: "تعذّر تقديم إجابة لهذا الطلب.", arts: o.arts }; }
    var text = (data.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("").trim();
    return { answer: text || "لم يصل رد نصي.", arts: o.arts };
  });
}

/* ---- instant offline answer engine (no key, works in the browser) ---- */
function aiStem(w) { return w.replace(/^ال/, ""); }
var AI_GENERIC = {};
"الوحده الاداريه الادارية المحلي المحليه المجلس مجلس قانون هذا نص المواطنين وحده اداريه محلي محليه".split(" ")
  .forEach(function (w) { AI_GENERIC[aiStem(norm(w))] = 1; });
function aiWeight(t) { return AI_GENERIC[t] ? 0.3 : 1; }
function faqScore(question, f) {
  var vocab = {};
  tokenize(f.q).forEach(function (w) { if (!STOP[w]) { var s = aiStem(w); vocab[s] = Math.max(vocab[s] || 0, aiWeight(s)); } });
  (f.keywords || []).forEach(function (k) {
    norm(k).split(" ").forEach(function (w) { if (w.length > 1 && !STOP[w]) { var s = aiStem(w); vocab[s] = Math.max(vocab[s] || 0, aiWeight(s)); } });
  });
  var qWords = tokenize(question).filter(function (w) { return !STOP[w]; }).map(aiStem);
  if (!qWords.length) return { score: 0, distinct: 0 };
  var num = 0, den = 0, distinct = 0;
  qWords.forEach(function (w) {
    var wt = aiWeight(w); den += wt;
    if (vocab[w] !== undefined) { num += Math.min(wt, vocab[w]); if (!AI_GENERIC[w]) distinct++; }
  });
  return { score: den ? num / den : 0, distinct: distinct };
}
function offlineAnswer(question) {
  var faqs = C.faq || [], best = null, bs = 0, bd = 0;
  faqs.forEach(function (f) {
    var r = faqScore(question, f);
    if (r.score > bs || (r.score === bs && r.distinct > bd)) { bs = r.score; bd = r.distinct; best = f; }
  });
  if (best && bs >= 0.5 && bd >= 1) {
    var rel = articlesByKeywords(best.keywords, null, 4).map(function (r) { return r.a; });
    return { lead: best.a, arts: rel };
  }
  var res = searchArticles(question, "all");
  if (!res.length) return { none: true };
  return { top: res[0].a, arts: res.slice(0, 4).map(function (r) { return r.a; }) };
}
function relatedGrid(arts, title) {
  if (!arts.length) return "";
  return '<div class="related"><h3>' + icon("link", 18) + " " + esc(title) + '</h3><div class="rel-grid">' +
    arts.map(function (a) {
      return '<a class="rel-item" href="#/article/' + a.id + '"><b>' + esc(a.label) + " · " + esc(docMap[a.doc].short) + "</b><span>" + esc(a.text.slice(0, 110)) + "</span></a>";
    }).join("") + "</div></div>";
}
function renderOffline(question, result) {
  var o = offlineAnswer(question);
  if (o.none) {
    result.innerHTML = '<div class="ai-error">' + icon("search", 20) + '<div><b>لم أجد نصًّا مطابقًا لسؤالك.</b><br>جرّب صياغة أخرى أو كلمات أعمّ، أو تصفّح <a href="#/topics">المواضيع</a> و<a href="#/library">المكتبة</a>.</div></div>';
    return;
  }
  var body;
  if (o.lead) {
    body = "<p>" + esc(o.lead) + "</p>";
  } else {
    var a = o.top;
    body = '<p style="margin-bottom:10px;color:var(--muted)">الإجابة مستندة إلى <b>' + esc(a.label) + "</b> من <b>" + esc(docMap[a.doc].title) + "</b>:</p>" +
      '<blockquote class="ai-quote">' + linkifyRefs(a.text, a.doc) + "</blockquote>";
  }
  result.innerHTML =
    '<div class="ai-answer"><div class="ai-answer-tag">' + icon("scale", 16) + " إجابة فورية من نصوص القوانين</div>" +
    '<div class="ai-answer-body">' + body + "</div></div>" +
    relatedGrid(o.arts, "المواد ذات الصلة");
}

function viewAsk() {
  var cfg = aiCfg();
  var hasKey = !!cfg.key;
  var modelOpts = AI_MODELS.map(function (m) {
    return '<option value="' + m.id + '"' + ((cfg.model || "claude-opus-5") === m.id ? " selected" : "") + ">" + esc(m.name) + "</option>";
  }).join("");
  var html =
    '<div class="ask-wrap">' +
    '<div class="section-head"><div class="eyebrow">المساعد القانوني الذكي</div><h1>اسأل، ويُجيبك من داخل القوانين واللوائح فقط</h1>' +
    '<p>اكتب سؤالك بأي صياغة واضغط «اسأل» — تحصل على الإجابة <b>فورًا وبلا أي إعداد</b>، مستخرَجةً من داخل القانون واللائحتين، مع عرض المادة القانونية المطابقة ووثيقتها ورابط الرجوع إليها.</p></div>' +

    '<form class="ask-box" id="askForm">' +
      '<textarea id="askInput" rows="2" placeholder="مثال: من يعتمد موازنة الوحدة الإدارية؟ وهل يحق للمجلس المحلي سحب الثقة؟" aria-label="سؤالك"></textarea>' +
      '<div class="ask-row">' +
        '<button class="btn" id="askBtn" type="submit">' + icon("chat", 18) + " اسأل المساعد</button>" +
        '<button class="btn-ghost" id="aiSettingsBtn" type="button">' + icon("shield", 16) + " ربط ذكاء اصطناعي (اختياري)</button>" +
      "</div>" +
    "</form>" +

    '<div class="ai-settings" id="aiSettings" hidden>' +
      '<div class="card">' +
        '<p style="color:var(--muted);font-size:.88rem;margin-bottom:12px">اختياري للمتقدمين: لصياغة الإجابة بذكاء اصطناعي (Claude). يتطلب مفتاح Claude API يُحفظ في متصفحك فقط. <b>الإجابة الفورية تعمل بدونه.</b></p>' +
        '<label class="ai-lbl">مفتاح Claude API</label>' +
        '<input type="password" id="aiKey" dir="ltr" placeholder="sk-ant-..." value="' + esc(cfg.key || "") + '" autocomplete="off">' +
        '<label class="ai-lbl" style="margin-top:12px">النموذج</label>' +
        '<select id="aiModel">' + modelOpts + "</select>" +
        '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="aiSaveBtn" type="button">حفظ</button>' +
        '<button class="btn-ghost" id="aiClearBtn" type="button">حذف المفتاح</button></div>' +
        '<p style="color:var(--faint);font-size:.82rem;margin-top:10px">يُحفظ المفتاح في هذا المتصفح فقط (localStorage). لن يظهر لأحد آخر ولن يُرسل لأي جهة عدا Anthropic.</p>' +
      "</div></div>" +

    '<div id="askResult"></div>' +

    '<div class="notice" style="margin-top:20px">' + icon("shield", 18) + "<div>الإجابة تُستخرج مباشرةً من نصوص القوانين واللوائح المتاحة، وقد لا تغطّي كل الحالات. راجع دائمًا نص المادة وصورتها الأصلية؛ المرجع الرسمي هو الجريدة الرسمية.</div></div>" +
    "</div>";
  setView(html);
  wireAsk();
}
function wireAsk() {
  var form = $("#askForm"), input = $("#askInput"), result = $("#askResult");
  var settings = $("#aiSettings");
  $("#aiSettingsBtn").addEventListener("click", function () { settings.hidden = !settings.hidden; });
  $("#aiSaveBtn").addEventListener("click", function () {
    aiSave({ key: $("#aiKey").value.trim(), model: $("#aiModel").value });
    toast("حُفظت الإعدادات"); viewAsk();
  });
  $("#aiClearBtn").addEventListener("click", function () { localStorage.removeItem(AI_KEY); toast("حُذف المفتاح"); viewAsk(); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (q.length < 3) { toast("اكتب سؤالًا"); return; }
    var cfg = aiCfg();
    if (!cfg.key) { renderOffline(q, result); return; }
    var btn = $("#askBtn"); btn.disabled = true;
    result.innerHTML = '<div class="ai-loading">' + icon("scale", 22) + '<span>يقرأ النصوص القانونية ويصوغ الإجابة…</span></div>';
    aiAsk(q).then(function (o) {
      var refs = o.arts.slice(0, 8);
      result.innerHTML =
        '<div class="ai-answer">' +
          '<div class="ai-answer-tag">' + icon("chat", 16) + " إجابة مستندة إلى النصوص</div>" +
          '<div class="ai-answer-body">' + linkifyAnswer(o.answer) + "</div>" +
        "</div>" +
        (refs.length ? '<div class="related"><h3>' + icon("link", 18) + " المواد المرجعية التي بُحث فيها</h3><div class=\"rel-grid\">" +
          refs.map(function (a) {
            return '<a class="rel-item" href="#/article/' + a.id + '"><b>' + esc(a.label) + " · " + esc(docMap[a.doc].short) + "</b><span>" + esc(a.text.slice(0, 110)) + "</span></a>";
          }).join("") + "</div></div>" : "");
    }).catch(function (err) {
      var msg = (err && err.message) || "خطأ غير متوقع";
      result.innerHTML = '<div class="ai-error">' + icon("shield", 20) + "<div><b>تعذّر الحصول على إجابة.</b><br>" + esc(msg) +
        (/401|api|key|auth/i.test(msg) ? "<br>تأكّد من صحة مفتاح Claude API في الإعدادات." : "") + "</div></div>";
    }).then(function () { btn.disabled = false; });
  });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
  input.focus();
}

/* ============================================================
   ROUTER
   ============================================================ */
function parseHash() {
  var h = location.hash.replace(/^#/, "") || "/";
  var qi = h.indexOf("?"); var query = "";
  if (qi >= 0) { query = h.slice(qi + 1); h = h.slice(0, qi); }
  var parts = h.split("/").filter(Boolean);
  var params = {}; query.split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) params[p[0]] = decodeURIComponent(p[1] || ""); });
  return { parts: parts, params: params };
}
function route() {
  var r = parseHash(), p = r.parts;
  closeImgModal();
  if (!p.length) return viewHome();
  switch (p[0]) {
    case "library": return viewLibrary();
    case "doc":
      if (p[2]) { viewDoc(p[1]); scrollToArticle(p[1] + "-" + p[2]); return; }
      return viewDoc(p[1]);
    case "article": return viewArticle(p[1]);
    case "compare": return viewCompare(p[1]);
    case "search": return viewSearch(r.params.q || "", r.params.doc || "all");
    case "ask": return viewAsk();
    case "topics": return viewTopics();
    case "topic": return viewTopic(p[1]);
    case "orgchart": return viewOrgchart();
    case "entity": return viewEntity(p[1]);
    case "glossary": return viewGlossary();
    case "procedures": return viewProcedures();
    case "procedure": return viewProcedure(p[1]);
    case "faq": return viewFaq();
    case "forms": return viewForms();
    case "favorites": return viewFavorites();
    case "about": return viewAbout();
    default: return viewNotFound();
  }
}
function scrollToArticle(id) {
  var a = artMap[id]; if (!a) return;
  setTimeout(function () {
    var elm = $("#art-" + a.n);
    if (elm) { elm.scrollIntoView({ behavior: "smooth", block: "start" }); elm.classList.add("flash"); setTimeout(function () { elm.classList.remove("flash"); }, 1600); }
    var link = $('.toc-arts a[data-art="' + id + '"]'); if (link) { $all(".toc-arts a.active").forEach(function (x) { x.classList.remove("active"); }); link.classList.add("active"); }
  }, 60);
}
function go(path) { location.hash = "#" + path; }

function highlightNav() {
  var h = location.hash;
  $all(".nav-links a").forEach(function (a) {
    var href = a.getAttribute("href");
    a.classList.toggle("active", h === href || (href !== "#/" && h.indexOf(href) === 0));
  });
}

/* ============================================================
   Global search bar + nav
   ============================================================ */
var topInput = $("#topSearchInput");
$("#topSearch").addEventListener("submit", function (e) { e.preventDefault(); go("/search?q=" + encodeURIComponent(topInput.value)); });
document.addEventListener("keydown", function (e) {
  if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
    e.preventDefault(); topInput.focus();
  }
});
$("#themeBtn").addEventListener("click", function () {
  var cur = document.documentElement.getAttribute("data-theme");
  var next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("slm_theme", next); } catch (e) {}
});
(function initTheme() {
  var saved; try { saved = localStorage.getItem("slm_theme"); } catch (e) {}
  if (saved) document.documentElement.setAttribute("data-theme", saved);
})();
$("#navToggle").addEventListener("click", function () {
  var n = $("#navLinks"); var open = n.classList.toggle("open");
  this.setAttribute("aria-expanded", open ? "true" : "false");
});
$("#navLinks").addEventListener("click", function (e) { if (e.target.tagName === "A") $("#navLinks").classList.remove("open"); });

window.addEventListener("hashchange", route);
route();
})();
