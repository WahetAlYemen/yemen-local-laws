/* ============================================================
   منصة تشريعات السلطة المحلية — منطق التطبيق (SPA)
   ============================================================ */
(function () {
"use strict";

var DATA = window.LAWDATA || { documents: [], articles: [] };
var C = window.CONTENT || {};
var S = window.LawSearch;
S.init(DATA, C);
var DOCS = DATA.documents;
var ARTS = DATA.articles;
var norm = S.norm;

/* ---------- helpers ---------- */
function $(s, r) { return (r || document).querySelector(s); }
function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
var esc = S.esc;
function enc(s) { return encodeURIComponent(s || ""); }

var docMap = {}; DOCS.forEach(function (d) { docMap[d.id] = d; });
var artMap = {}; ARTS.forEach(function (a) { artMap[a.id] = a; });

function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
function load(key, def) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }

function articlesByKeywords(keywords, docFilter, limit) {
  var r = S.byKeywords(keywords, docFilter);
  return limit ? r.slice(0, limit) : r;
}

/* wrap matched words inside an element's text nodes with <mark> */
function highlightDom(el, match) {
  if (!el || !match) return;
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), nodes = [], n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(function (node) {
    var parts = node.nodeValue.split(/(\s+)/), any = false, frag = document.createDocumentFragment();
    parts.forEach(function (p) {
      if (p && !/^\s+$/.test(p) && S.wordMatches(p, match)) {
        var m = document.createElement("mark"); m.textContent = p; frag.appendChild(m); any = true;
      } else if (p) frag.appendChild(document.createTextNode(p));
    });
    if (any) node.parentNode.replaceChild(frag, node);
  });
}

/* ---------- cross-reference linkification ---------- */
function linkifyRefs(text, doc) {
  var html = esc(text);
  var re = /(الماد(?:ة|تين|ه)|المواد)\s*(?:رقم\s*)?\(?\s*(\d{1,3})\s*\)?/g;
  return html.replace(re, function (m, w, num, off, str) {
    var target = doc;
    // a regulation citing "… من القانون" points to the law itself
    if (doc !== "law" && /^[\s،,()\d]*(?:من|في|ب)\s*(?:هذا\s*)?القانون/.test(str.slice(off + m.length, off + m.length + 40))) target = "law";
    var id = target + "-" + num;
    if (!artMap[id]) return m;
    return '<a class="ref" href="#/article/' + id + '">' + m + "</a>";
  });
}

/* ---------- favorites ---------- */
var FAV_KEY = "slm_favs_v1";
function getFavs() { var f = load(FAV_KEY, []); return Array.isArray(f) ? f : []; }
function isFav(id) { return getFavs().indexOf(id) >= 0; }
function toggleFav(id) {
  var f = getFavs(), i = f.indexOf(id);
  if (i >= 0) { f.splice(i, 1); toast("أُزيلت من المفضلة"); } else { f.push(id); toast("أُضيفت إلى المفضلة"); }
  store(FAV_KEY, f);
  return i < 0;
}

/* ---------- recent searches ---------- */
var RECENT_KEY = "slm_recent_v1";
function getRecent() { var r = load(RECENT_KEY, []); return Array.isArray(r) ? r : []; }
function saveRecent(q) {
  q = (q || "").trim(); if (q.length < 2) return;
  var r = getRecent().filter(function (x) { return x !== q; });
  r.unshift(q); store(RECENT_KEY, r.slice(0, 6));
}

/* ---------- clipboard / toast ---------- */
function copyText(txt) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(txt).catch(function () { fallbackCopy(txt); });
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
  arrow: "M15 6l-6 6 6 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  tag: "M3 12V3h9l9 9-9 9zM7.5 7.5h.01"
};
function icon(name, size) {
  var d = P[name] || P.book; size = size || 22;
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
}

/* ---------- doc chip ---------- */
function docChip(id) { var d = docMap[id]; return '<span class="chip doc-' + id + '">' + esc(d ? d.short : id) + "</span>"; }
function docColorClass(id) { return id === "exec" ? "exec" : id === "fin" ? "fin" : ""; }
function artHref(a, q) { return "#/article/" + a.id + (q ? "?q=" + enc(q) : ""); }

/* ============================================================
   VIEWS
   ============================================================ */
var view = $("#view");
function setView(html) {
  view.innerHTML = html;
  view.classList.remove("view-enter"); void view.offsetWidth; view.classList.add("view-enter");
  var de = document.documentElement, sb = de.style.scrollBehavior;
  de.style.scrollBehavior = "auto"; window.scrollTo(0, 0); de.style.scrollBehavior = sb;
  highlightNav();
}

/* ---------- HOME ---------- */
var HINTS = ["المحافظ", "الموازنة", "سحب الثقة", "المجلس المحلي", "الموارد المحلية", "مادة 25"];
function viewHome() {
  var stats = [
    { n: DOCS.length, l: "وثائق تشريعية", i: "book" },
    { n: ARTS.length, l: "مادة قانونية", i: "scale" },
    { n: (C.topics || []).length, l: "موضوعًا", i: "grid" },
    { n: (C.entities || []).length, l: "جهات باختصاصاتها", i: "users" }
  ];
  var html =
  '<section class="hero"><div class="hero-bg"><span class="hero-grad-edge"></span></div><div class="inner">' +
    '<div class="hero-official"><img src="assets/emblem.png" alt="شعار الجمهورية اليمنية" width="58" height="34"><div class="hero-min"><b>الجمهورية اليمنية</b><span>وزارة الإدارة المحلية</span><span class="en">Ministry of Local Administration</span></div></div>' +
    '<div class="eyebrow" style="color:#f0d9a7">منصة معرفية</div>' +
    '<h1>تشريعات السلطة المحلية بين يديك — تبحث وتقرأ وتربط في ثوانٍ</h1>' +
    '<p>' + esc(C.intro || "") + '</p>' +
    '<form class="hero-search live-host" id="heroSearch" role="search" autocomplete="off"><span class="s-ico">' + icon("search", 22) + '</span>' +
      '<input type="search" id="heroInput" placeholder="اكتب كلمة أو سؤالًا أو رقم مادة… مثل: من يعتمد الموازنة؟" aria-label="بحث في التشريعات" enterkeyhint="search">' +
    '</form>' +
    '<div class="hero-hints"><span>جرّب:</span>' + HINTS.map(function (h) { return '<a href="#/search?q=' + enc(h) + '">' + esc(h) + "</a>"; }).join("") + '</div>' +
    '<div class="hero-cta"><a class="ai-cta" href="#/ask">' + icon("bolt", 18) + ' اسأل المساعد الذكي — يفهم سؤالك ويجيبك من داخل القوانين</a></div>' +
  '</div></section>' +

  '<div class="stats">' + stats.map(function (s) {
    return '<div class="stat"><span class="stat-ico">' + icon(s.i, 30) + '</span><b>' + s.n + "</b><span>" + esc(s.l) + "</span></div>";
  }).join("") + '</div>' +

  '<section class="home-sec"><div class="home-sec-head"><h2>مكتبة التشريعات</h2><a href="#/library">عرض الكل ' + icon("arrow", 14) + '</a></div>' +
    '<div class="grid cols-3">' + DOCS.map(docCard).join("") + '</div></section>' +

  '<section class="home-sec"><div class="home-sec-head"><h2>أدوات معرفية</h2></div>' +
    '<div class="grid cols-4">' +
      toolCard("#/orgchart", "scale", "شجرة الاختصاصات", "الجهات ومهامها مبوّبة") +
      toolCard("#/topics", "grid", "تصفّح بالموضوع", (C.topics || []).length + " موضوعًا رئيسيًا") +
      toolCard("#/glossary", "book", "قاموس المصطلحات", "التعاريف من النصوص") +
      toolCard("#/procedures", "gavel", "دليل الإجراءات", "خطوات مرتبطة بالمواد") +
      toolCard("#/faq", "chat", "الأسئلة الشائعة", "إجابات مسندة للمواد") +
      toolCard("#/forms", "doc", "النماذج", "قوالب استرشادية") +
      toolCard("#/favorites", "heart", "مفضلتي", "المواد المحفوظة") +
      toolCard("#/about", "shield", "عن المنصة ومصدر النصوص", "الدقة والتوثيق") +
    '</div></section>';
  setView(html);
  LiveSearch($("#heroSearch"), $("#heroInput"));
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
  setView(
    '<div class="section-head"><div class="eyebrow">المكتبة</div><h1>مكتبة التشريعات</h1>' +
    '<p>الوثائق الرسمية المنظِّمة للسلطة المحلية. اختر وثيقة لتصفّح موادها كاملة، أو استخدم البحث للوصول المباشر.</p></div>' +
    '<div class="grid cols-3">' + DOCS.map(docCard).join("") + "</div>");
}

/* ---------- DOCUMENT ---------- */
function docArticles(id) { return ARTS.filter(function (a) { return a.doc === id; }); }
function viewDoc(id) {
  var d = docMap[id]; if (!d) return viewNotFound();
  var arts = docArticles(id);
  var babs = [], bmap = {};
  arts.forEach(function (a) {
    var bk = a.bab || "—";
    if (!bmap[bk]) { bmap[bk] = { bab: a.bab, title: a.babTitle, arts: [] }; babs.push(bmap[bk]); }
    bmap[bk].arts.push(a);
  });
  var toc = babs.map(function (b, i) {
    return '<details class="toc-bab"' + (i < 2 ? " open" : "") + '><summary>' + esc(b.bab || "مواد") +
      '<span class="toc-count">' + b.arts.length + "</span></summary>" +
      '<div class="toc-arts">' + b.arts.map(function (a) {
        return '<a href="#/doc/' + id + "/" + a.n + '" data-art="' + a.id + '">' + esc(a.label) + "</a>";
      }).join("") + "</div></details>";
  }).join("");

  var body = babs.map(function (b) {
    var head = b.bab ? '<div class="bab-header"><div class="eyebrow">' + esc(b.bab) + '</div><h2>' + esc(b.title || "") + "</h2></div>" : "";
    var lastFasl = null, out = "";
    b.arts.forEach(function (a) {
      if (a.fasl && a.fasl !== lastFasl) { out += '<div class="fasl-header">' + esc(a.fasl) + (a.faslTitle ? " — " + esc(a.faslTitle) : "") + "</div>"; lastFasl = a.fasl; }
      out += articleBlock(a);
    });
    return head + out;
  }).join("");

  setView(
    '<div class="breadcrumbs"><a href="#/library">المكتبة</a><span class="sep">/</span><span>' + esc(d.title) + "</span></div>" +
    '<div class="section-head"><div class="eyebrow">' + esc(d.type) + '</div><h1>' + esc(d.title) + "</h1><p>" + esc(d.fullTitle) + " — " + d.articleCount + " مادة.</p></div>" +
    '<div class="doc-layout"><aside class="doc-side"><h4>فهرس الأبواب</h4>' + toc + "</aside>" +
    '<div class="art-list" id="artList">' + preambleHtml(d) + body + "</div></div>");
}

var PREAMBLE_SKIP = { "الجمهورية اليمنية": 1, "وزارة الادارة المحلية": 1, "لوزارة الإدارة المحلية": 1, "لعام 2000م": 1, "لعام 2001م": 1, "اللائحة التنفيذية": 1, "اللائحة المالية": 1 };
function preambleHtml(d) {
  var lines = (d.front || []).filter(function (l) {
    l = (l || "").trim();
    if (l.length < 4) return false;
    if (/[A-Za-z]{3,}/.test(l)) return false;
    if (PREAMBLE_SKIP[l]) return false;
    return true;
  });
  if (!lines.length) return "";
  return '<details class="acc" style="margin-bottom:14px"><summary>ديباجة الإصدار</summary><div class="acc-body" style="line-height:2;white-space:pre-wrap">' +
    lines.map(esc).join("\n") + "</div></details>";
}
function articleBlock(a) {
  return '<article class="article" id="art-' + a.n + '" data-id="' + a.id + '">' +
    '<div class="article-head"><div class="article-num"><span class="an-badge">' + esc(a.label) + "</span></div>" +
      '<div class="article-tools">' +
        toolBtn("open", a.id, "link", "صفحة المادة") +
        toolBtn("img", a.id, "image", "الصفحة الأصلية") +
        toolBtn("copy", a.id, "copy", "نسخ") +
        toolBtn("fav", a.id, "heart", "حفظ", isFav(a.id)) +
      "</div></div>" +
    '<div class="article-text">' + linkifyRefs(a.text, a.doc) + "</div></article>";
}
function toolBtn(act, id, ic, label, on) {
  return '<button class="icon-btn' + (on ? " on" : "") + '" data-act="' + act + '" data-id="' + id + '" title="' + label + '" aria-label="' + label + '">' + icon(ic, 18) + "</button>";
}

/* ---------- ARTICLE PAGE ---------- */
function relItem(a) {
  return '<a class="rel-item" href="#/article/' + a.id + '"><b>' + esc(a.label) + " · " + esc(docMap[a.doc].short) + "</b><span>" + esc(a.text.slice(0, 120)) + "</span></a>";
}
function relatedGrid(arts, title) {
  if (!arts.length) return "";
  return '<div class="related"><h3>' + icon("link", 18) + " " + esc(title) + '</h3><div class="rel-grid">' + arts.map(relItem).join("") + "</div></div>";
}
function viewArticle(id, q) {
  var a = artMap[id]; if (!a) return viewNotFound();
  var d = docMap[a.doc];
  var ctx = [];
  if (a.bab) ctx.push(esc(a.bab) + (a.babTitle ? " — " + esc(a.babTitle) : ""));
  if (a.fasl) ctx.push(esc(a.fasl) + (a.faslTitle ? " — " + esc(a.faslTitle) : ""));
  var fav = isFav(a.id);
  var prev = artMap[a.doc + "-" + (a.n - 1)], next = artMap[a.doc + "-" + (a.n + 1)];

  var html = '<div class="article-page">' +
    '<div class="breadcrumbs"><a href="#/">الرئيسية</a><span class="sep">/</span><a href="#/doc/' + a.doc + "/" + a.n + '">' + esc(d.title) + "</a><span class=\"sep\">/</span><span>" + esc(a.label) + "</span></div>" +
    (q ? '<div class="hl-bar">' + icon("search", 16) + '<span>ظُلِّلت كلمات البحث «' + esc(q) + '»</span><a href="#/search?q=' + enc(q) + '">العودة إلى النتائج</a></div>' : "") +
    '<div class="ap-card">' +
      '<div class="ap-meta">' + docChip(a.doc) + (a.bab ? '<span class="chip">' + esc(a.bab) + "</span>" : "") + '<span class="chip">الصفحة ' + a.page + "</span></div>" +
      '<h1 class="ap-title">' + esc(a.label) + "</h1>" +
      (ctx.length ? '<div class="ap-context">' + ctx.join(" &nbsp;·&nbsp; ") + "</div>" : "") +
      '<div class="ap-text" id="apText">' + linkifyRefs(a.text, a.doc) + "</div>" +
      '<div class="ap-toolbar">' +
        '<button class="btn" data-act="img" data-id="' + a.id + '">' + icon("image", 18) + " الصفحة الأصلية</button>" +
        '<button class="btn secondary" data-act="copy" data-id="' + a.id + '">' + icon("copy", 18) + " نسخ النص</button>" +
        '<button class="btn secondary" data-act="share" data-id="' + a.id + '">' + icon("link", 18) + " مشاركة</button>" +
        '<button class="btn secondary" data-act="print" data-id="' + a.id + '">' + icon("print", 18) + " طباعة</button>" +
        '<button class="btn secondary' + (fav ? " on" : "") + '" data-act="fav" data-id="' + a.id + '">' + icon("heart", 18) + " " + (fav ? "محفوظة" : "حفظ") + "</button>" +
        (a.doc === "law" ? '<a class="btn secondary" href="#/compare/' + a.id + '">' + icon("scale", 18) + " قارن باللوائح</a>" : "") +
      "</div>" +
      '<div class="ap-nav">' +
        (next ? '<a href="#/article/' + next.id + '">' + esc(next.label) + " ←</a>" : "<span></span>") +
        (prev ? '<a href="#/article/' + prev.id + '">→ ' + esc(prev.label) + "</a>" : "<span></span>") +
      "</div>" +
    "</div>" + relatedGrid(S.related(a), "مواد ذات علاقة") + "</div>";
  setView(html);
  if (q) {
    var r = S.search(q);
    highlightDom($("#apText"), r.match);
  }
}

/* ---------- COMPARE (law article vs regulations) ---------- */
function viewCompare(id) {
  var a = artMap[id]; if (!a) return viewNotFound();
  var terms = S.keyTerms(a).join(" ");
  var execR = S.search(terms, { doc: "exec", prefix: false }).results.slice(0, 5);
  var finR = S.search(terms, { doc: "fin", prefix: false }).results.slice(0, 5);
  function col(title, arr) {
    return '<div class="compare-col"><h3>' + title + "</h3>" + (arr.length ? arr.map(function (r) { return relItem(r.a); }).join("") :
      '<p style="color:var(--muted)">لا توجد مواد مطابقة واضحة.</p>') + "</div>";
  }
  setView('<div class="article-page">' +
    '<div class="breadcrumbs"><a href="#/article/' + a.id + '">' + esc(a.label) + "</a><span class=\"sep\">/</span><span>مقارنة باللوائح</span></div>" +
    '<div class="section-head"><div class="eyebrow">مقارنة</div><h1>' + esc(a.label) + " من القانون واللوائح المفسِّرة لها</h1>" +
    "<p>مواد اللائحتين التنفيذية والمالية الأقرب صلةً بموضوع هذه المادة (بحسب التشابه الموضوعي).</p></div>" +
    '<div class="ap-card"><div class="ap-meta">' + docChip("law") + "</div><div class=\"ap-text\">" + linkifyRefs(a.text, "law") + "</div></div>" +
    '<div class="compare-cols">' + col("في اللائحة التنفيذية", execR) + col("في اللائحة المالية", finR) + "</div></div>");
}

/* ============================================================
   SEARCH — shared pieces
   ============================================================ */
function filterChips(counts, active, attr) {
  var list = [{ id: "all", label: "الكل" }].concat(DOCS.map(function (d) { return { id: d.id, label: d.short }; }));
  return list.map(function (f) {
    var n = counts ? counts[f.id] || 0 : "";
    return '<button type="button" class="filter-btn' + (f.id === active ? " active" : "") + '" ' + attr + '="' + f.id + '">' +
      esc(f.label) + (counts ? ' <span class="fc">' + n + "</span>" : "") + "</button>";
  }).join("");
}

/* quick answers: direct article, definition, FAQ, topics/entities */
function quickBlocks(q, r, compact) {
  var k = S.quick(q), h = "";
  if ((S.isQuestion(q) || q.trim().split(/\s+/).length >= 3) && !r.direct.length) {
    h += '<a class="qa qa-ai ' + (compact ? "lp-item" : "") + '" href="#/ask?q=' + enc(q) + '">' +
      '<span class="qa-tag">' + icon("bolt", 14) + " المساعد الذكي</span>" +
      "<b>اسأل المساعد: «" + esc(q) + "»</b>" +
      '<span class="qa-text">يفهم سؤالك ويصوغ إجابة من نصوص المواد مع ذكر أرقامها.</span></a>';
  }
  r.direct.forEach(function (a) {
    h += '<a class="qa qa-direct ' + (compact ? "lp-item" : "") + '" href="' + artHref(a) + '">' +
      '<span class="qa-tag">' + icon("bolt", 14) + " انتقال مباشر</span>" +
      '<b>' + esc(a.label) + " · " + esc(docMap[a.doc].short) + "</b>" +
      '<span class="qa-text">' + esc(a.text.slice(0, compact ? 130 : 260)) + (a.text.length > (compact ? 130 : 260) ? " …" : "") + "</span></a>";
  });
  k.gloss.forEach(function (g) {
    h += '<a class="qa qa-def ' + (compact ? "lp-item" : "") + '" href="#/article/' + g.art + '">' +
      '<span class="qa-tag">' + icon("book", 14) + " تعريف · " + esc(docMap[g.doc].short) + "</span>" +
      "<b>" + esc(g.term) + "</b>" + '<span class="qa-text">' + esc(g.def) + "</span></a>";
  });
  if (k.faq) {
    var src = articlesByKeywords(k.faq.keywords, null, 3);
    if (compact) {
      h += '<a class="qa qa-faq lp-item" href="#/search?q=' + enc(q) + '">' +
        '<span class="qa-tag">' + icon("chat", 14) + " إجابة مقترحة</span><b>" + esc(k.faq.q) + "</b>" +
        '<span class="qa-text">' + esc(k.faq.a) + "</span></a>";
    } else {
      h += '<div class="smart-answer"><div class="sa-tag">' + icon("chat", 16) + " إجابة مقترحة</div><h3>" + esc(k.faq.q) + "</h3><p>" + esc(k.faq.a) + "</p>" +
        (src.length ? '<div class="sa-src">المواد المستند إليها: ' + src.map(function (s) {
          return '<a href="#/article/' + s.a.id + '">' + esc(s.a.label) + " (" + esc(docMap[s.a.doc].short) + ")</a>";
        }).join(" ، ") + "</div>" : "") + "</div>";
    }
  } else if (!compact && S.isQuestion(q) && r.results.length && !r.direct.length) {
    var top = r.results[0].a;
    h += '<div class="smart-answer"><div class="sa-tag">' + icon("scale", 16) + " أقرب مادة لسؤالك</div><h3>" + esc(top.label) + " · " + esc(docMap[top.doc].title) + "</h3>" +
      '<div class="result-snippet">' + S.snippet(top.text, r.match, 60) + "</div>" +
      '<div class="sa-src"><a href="' + artHref(top, q) + '">عرض المادة كاملة ' + icon("arrow", 13) + "</a></div></div>";
  }
  var links = k.topics.map(function (t) { return '<a class="qa-chip" href="#/topic/' + t.key + '">' + icon(t.icon, 14) + " موضوع: " + esc(t.name) + "</a>"; })
    .concat(k.entities.map(function (e) { return '<a class="qa-chip" href="#/entity/' + e.key + '">' + icon(e.icon, 14) + " اختصاصات: " + esc(e.name) + "</a>"; }));
  if (links.length) h += '<div class="qa-chips">' + links.join("") + "</div>";
  return h;
}

function resultItem(r, q, compact) {
  var a = r.a;
  return '<a class="result' + (compact ? " lp-item lp-result" : "") + '" href="' + artHref(a, q) + '">' +
    '<div class="result-head">' + docChip(a.doc) + "<b>" + esc(a.label) + "</b>" +
      (a.babTitle ? '<span class="result-path">' + esc(a.babTitle) + "</span>" : "") + "</div>" +
    '<div class="result-snippet">' + S.snippet(a.text, r.match || r.words, compact ? 24 : 40) + "</div></a>";
}

function noResults(q, r) {
  return '<div class="empty small">' + icon("search", 34) +
    "<p>لا توجد نتائج لـ «" + esc(q) + "».</p>" +
    (r.suggestion ? '<p>هل تقصد: <button type="button" class="link-btn lp-item" data-q="' + esc(r.suggestion) + '">' + esc(r.suggestion) + "</button>؟</p>" : "") +
    '<p class="tip">جرّب كلمة واحدة أعمّ، أو مرادفًا، أو رقم مادة مثل «مادة 25».</p></div>';
}

/* ============================================================
   LIVE SEARCH — the box expands and results appear as you type
   ============================================================ */
var liveHosts = [];
var backdrop = $("#liveBackdrop");
function anyLiveOpen() { return liveHosts.some(function (h) { return h.isOpen(); }); }
function closeAllLive(except) { liveHosts.forEach(function (h) { if (h !== except) h.close(); }); }

function LiveSearch(form, input) {
  if (!form || !input) return null;
  var panel = document.createElement("div");
  panel.className = "live-panel"; panel.hidden = true;
  panel.id = "lp-" + Math.random().toString(36).slice(2, 8);
  panel.setAttribute("role", "listbox");
  form.appendChild(panel);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", panel.id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-autocomplete", "list");

  var filter = "all", active = -1, timer = null, lastQ = null, lastF = null;
  var bar = form.closest(".appbar");
  var api = {
    isOpen: function () { return !panel.hidden; },
    close: close, form: form
  };
  liveHosts = liveHosts.filter(function (h) { return document.body.contains(h.form); });
  liveHosts.push(api);

  function fitHeight() {
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var top = form.getBoundingClientRect().bottom;
    panel.style.maxHeight = Math.max(220, vh - Math.max(top, 0) - 14) + "px";
  }
  function open() {
    if (!panel.hidden) return;
    closeAllLive(api);
    panel.hidden = false;
    form.classList.add("open");
    if (bar) bar.classList.add("has-open");
    document.body.classList.add("live-open");
    backdrop.hidden = false;
    input.setAttribute("aria-expanded", "true");
    // in-page boxes (home hero): bring the box near the top so results have room
    if (!bar) {
      var head = $("#appbar").getBoundingClientRect().bottom, top = form.getBoundingClientRect().top;
      if (top > head + 24 || top < head) {
        var de = document.documentElement, sb = de.style.scrollBehavior;
        de.style.scrollBehavior = "auto"; window.scrollBy(0, top - head - 16); de.style.scrollBehavior = sb;
      }
    }
    fitHeight();
    render(true);
    // a previous query is selected so typing replaces it (desktop only: avoids selection handles on phones)
    if (input.value && window.matchMedia && window.matchMedia("(pointer:fine)").matches) setTimeout(function () { input.select(); }, 0);
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    form.classList.remove("open");
    if (bar) bar.classList.remove("has-open");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
    if (!anyLiveOpen()) { document.body.classList.remove("live-open"); backdrop.hidden = true; }
  }
  function render(force) {
    var q = input.value.trim();
    if (!force && q === lastQ && filter === lastF) return;
    lastQ = q; lastF = filter; active = -1;
    panel.innerHTML = q.length < 2 ? liveEmpty() : liveResults(q, filter);
    panel.scrollTop = 0;
  }
  function setActive(i) {
    var items = $all(".lp-item", panel);
    if (!items.length) { active = -1; return; }
    active = Math.max(-1, Math.min(items.length - 1, i));
    items.forEach(function (el, k) {
      el.classList.toggle("active", k === active);
      if (!el.id) el.id = panel.id + "-i" + k;
    });
    if (active >= 0) { input.setAttribute("aria-activedescendant", items[active].id); items[active].scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  }

  input.addEventListener("focus", open);
  input.addEventListener("click", open);
  input.addEventListener("input", function () {
    if (panel.hidden) open();
    clearTimeout(timer); timer = setTimeout(render, 60);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (panel.hidden) open(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Escape") { if (!panel.hidden) { e.preventDefault(); e.stopPropagation(); close(); input.blur(); } }
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearTimeout(timer); render();
    var items = $all(".lp-item", panel);
    if (active >= 0 && items[active]) { items[active].click(); return; }
    var q = input.value.trim();
    if (q.length < 1) return;
    saveRecent(q); close(); input.blur();
    go("/search?q=" + enc(q) + (filter !== "all" ? "&doc=" + filter : ""));
  });
  // keep focus in the input while interacting with the panel
  panel.addEventListener("mousedown", function (e) { e.preventDefault(); });
  panel.addEventListener("click", function (e) {
    var b = e.target.closest("[data-lf]");
    if (b) { filter = b.getAttribute("data-lf"); render(); return; }
    var c = e.target.closest("[data-q]");
    if (c) { input.value = c.getAttribute("data-q"); render(); input.focus(); return; }
    var x = e.target.closest("[data-clear-recent]");
    if (x) { store(RECENT_KEY, []); render(true); return; }
    var a = e.target.closest("a[href]");
    if (a) { saveRecent(input.value); close(); input.blur(); }
  });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", function () { if (!panel.hidden) fitHeight(); });
  return api;
}

function liveEmpty() {
  var rec = getRecent(), h = "";
  if (rec.length) {
    h += '<div class="lp-sec">' + icon("clock", 14) + ' عمليات بحث سابقة <button type="button" class="link-btn" data-clear-recent>مسح</button></div>' +
      '<div class="lp-chips">' + rec.map(function (q) { return '<button type="button" class="lp-chip lp-item" data-q="' + esc(q) + '">' + esc(q) + "</button>"; }).join("") + "</div>";
  }
  h += '<div class="lp-sec">' + icon("bolt", 14) + " اقتراحات</div>" +
    '<div class="lp-chips">' + HINTS.concat(["اختصاصات المحافظ", "الموارد المشتركة"]).map(function (q) {
      return '<button type="button" class="lp-chip lp-item" data-q="' + esc(q) + '">' + esc(q) + "</button>";
    }).join("") + "</div>" +
    '<div class="lp-tip">اكتب كلمة أو سؤالًا أو رقم مادة — تظهر النتائج فورًا أثناء الكتابة. ' +
    '<span class="kbd-hint"><kbd>↑</kbd><kbd>↓</kbd> للتنقل · <kbd>Enter</kbd> للفتح · <kbd>Esc</kbd> للإغلاق</span></div>';
  return h;
}
function liveResults(q, filter) {
  var r = S.search(q, { doc: filter });
  var h = '<div class="lp-filters">' + filterChips(r.counts, filter, "data-lf") + "</div>";
  h += quickBlocks(q, r, true);
  if (!r.results.length) return h + noResults(q, r);
  h += '<div class="lp-sec">' + icon("scale", 14) + " المواد المطابقة <span class=\"lp-count\">" + r.results.length + "</span></div>";
  h += r.results.slice(0, 8).map(function (x) { return resultItem(x, q, true); }).join("");
  h += '<a class="lp-all lp-item" href="#/search?q=' + enc(q) + (filter !== "all" ? "&doc=" + filter : "") + '">' +
    "عرض كل النتائج (" + r.results.length + ") " + icon("arrow", 14) + "</a>";
  return h;
}

/* ---------- SEARCH PAGE ---------- */
var PAGE = 25;
function viewSearch(q, docFilter) {
  docFilter = docFilter || "all";
  setView(
    '<div class="search-wrap">' +
    '<div class="section-head"><div class="eyebrow">البحث الذكي</div><h1>ابحث في كل التشريعات دفعة واحدة</h1>' +
    "<p>كلمة، أو سؤال، أو رقم مادة. يفهم البحث صيغ الكلمة المختلفة والمرادفات، ويرتّب النتائج حسب الصلة.</p></div>" +
    '<form class="search-box" id="pageSearchForm" role="search" autocomplete="off"><span class="s-ico">' + icon("search", 22) + '</span>' +
    '<input type="search" id="pageSearch" value="' + esc(q || "") + '" placeholder="اكتب سؤالًا أو كلمة مفتاحية أو رقم مادة…" aria-label="بحث" enterkeyhint="search"></form>' +
    '<div class="search-filters" id="searchFilters"></div>' +
    '<div id="searchResults" aria-live="polite"></div></div>');
  var input = $("#pageSearch"), state = { filter: docFilter, shown: PAGE };
  if (!q) input.focus();
  function sync() {
    var nq = input.value.trim();
    history.replaceState(null, "", "#/search?q=" + enc(nq) + (state.filter !== "all" ? "&doc=" + state.filter : ""));
  }
  var deb;
  input.addEventListener("input", function () {
    clearTimeout(deb);
    deb = setTimeout(function () { state.shown = PAGE; sync(); renderResults(input.value, state); }, 90);
  });
  $("#pageSearchForm").addEventListener("submit", function (e) { e.preventDefault(); saveRecent(input.value); input.blur(); });
  $("#searchFilters").addEventListener("click", function (e) {
    var b = e.target.closest("[data-f]"); if (!b) return;
    state.filter = b.getAttribute("data-f"); state.shown = PAGE; sync(); renderResults(input.value, state);
  });
  $("#searchResults").addEventListener("click", function (e) {
    var c = e.target.closest("[data-q]");
    if (c) { input.value = c.getAttribute("data-q"); sync(); renderResults(input.value, state); return; }
    if (e.target.closest("#moreBtn")) { state.shown += PAGE; renderResults(input.value, state, true); return; }
    if (e.target.closest("a.result")) saveRecent(input.value);
  });
  renderResults(q, state);
}
function renderResults(q, state, keepScroll) {
  var box = $("#searchResults"), fbox = $("#searchFilters"); if (!box) return;
  q = (q || "").trim();
  if (q.length < 2) {
    fbox.innerHTML = filterChips(null, state.filter, "data-f");
    box.innerHTML = '<div class="empty">' + icon("search", 40) + "<p>ابدأ الكتابة للبحث في " + ARTS.length + " مادة.</p>" +
      '<div class="lp-chips center">' + HINTS.map(function (h) { return '<button type="button" class="lp-chip" data-q="' + esc(h) + '">' + esc(h) + "</button>"; }).join("") + "</div></div>";
    return;
  }
  var r = S.search(q, { doc: state.filter });
  fbox.innerHTML = filterChips(r.counts, state.filter, "data-f");
  var html = quickBlocks(q, r, false);
  html += '<div class="search-meta">' + (r.results.length ? "<b>" + r.results.length + "</b> مادة مطابقة" : "لا نتائج") + " لـ «" + esc(q) + "»" +
    (r.unknown.length && r.results.length ? ' <span class="unk">· لم ترد في النصوص: ' + r.unknown.map(esc).join("، ") + "</span>" : "") + "</div>";
  if (!r.results.length) {
    html += noResults(q, r);
  } else {
    html += r.results.slice(0, state.shown).map(function (x) { return resultItem(x, q, false); }).join("");
    if (r.results.length > state.shown) html += '<button type="button" class="btn secondary more-btn" id="moreBtn">عرض المزيد (' + (r.results.length - state.shown) + " متبقية)</button>";
  }
  box.innerHTML = html;
}

/* ---------- TOPICS ---------- */
var topicCounts = null;
function viewTopics() {
  if (!topicCounts) {
    topicCounts = {};
    (C.topics || []).forEach(function (t) { topicCounts[t.key] = articlesByKeywords(t.keywords).length; });
  }
  setView('<div class="section-head"><div class="eyebrow">تصفّح بالموضوع</div><h1>المواضيع الرئيسية</h1>' +
    '<p>ادخل إلى أي موضوع لتُعرض عليك جميع المواد ذات الصلة من الوثائق الثلاث دفعةً واحدة، مرتّبة حسب الصلة.</p></div>' +
    '<div class="tile-grid">' + (C.topics || []).map(function (t) {
      return '<a class="tile" href="#/topic/' + t.key + '"><span class="t-ico">' + icon(t.icon, 24) + "</span><b>" + esc(t.name) + "</b><span>" + esc(t.desc) + "</span>" +
        '<span class="tile-count">' + topicCounts[t.key] + " مادة</span></a>";
    }).join("") + "</div>");
}
function viewTopic(key) {
  var t = (C.topics || []).find(function (x) { return x.key === key; }); if (!t) return viewNotFound();
  var res = articlesByKeywords(t.keywords);
  var kw = t.keywords.join(" ");
  setView('<div class="breadcrumbs"><a href="#/topics">المواضيع</a><span class="sep">/</span><span>' + esc(t.name) + "</span></div>" +
    '<div class="section-head"><div class="eyebrow">موضوع</div><h1>' + esc(t.name) + "</h1><p>" + esc(t.desc) + " — " + res.length + " مادة ذات صلة. الكلمات: " + esc(t.keywords.join("، ")) + ".</p></div>" +
    (res.length ? res.map(function (r) { return resultItem(r, kw, false); }).join("") : '<div class="empty">لا توجد مواد.</div>'));
}

/* ---------- ORG CHART ---------- */
function viewOrgchart() {
  var top = C.orgTop || { name: "السلطة المحلية" };
  var nodes = (C.orgNodes || []).map(function (k) {
    var e = (C.entities || []).find(function (x) { return x.key === k; });
    return e ? '<a class="org-node" href="#/entity/' + e.key + '">' + esc(e.name) + "</a>" : "";
  }).join("");
  setView('<div class="section-head"><div class="eyebrow">شجرة الاختصاصات</div><h1>خريطة اختصاصات السلطة المحلية</h1>' +
    '<p>اضغط على أي جهة لعرض تعريفها واختصاصاتها مبوّبة، مع المواد القانونية المنظِّمة لها.</p></div>' +
    '<div class="card"><div class="org">' +
      '<div class="org-node org-top">' + esc(top.name) + (top.note ? '<div class="org-note">' + esc(top.note) + "</div>" : "") + "</div>" +
      '<div class="org-connector"></div>' +
      '<div class="org-row">' + nodes + "</div>" +
    "</div></div>" +
    '<div class="grid cols-3" style="margin-top:20px">' + (C.entities || []).map(function (e) {
      return '<a class="card link" href="#/entity/' + e.key + '"><h3 class="ent-title">' + icon(e.icon, 20) + " " + esc(e.name) + '</h3><p class="ent-sum">' + esc(e.summary) + "</p></a>";
    }).join("") + "</div>");
}
function viewEntity(key) {
  var e = (C.entities || []).find(function (x) { return x.key === key; }); if (!e) return viewNotFound();
  var cats = e.cats.map(function (c, i) {
    var res = articlesByKeywords(c.keywords, null, 8);
    return '<details class="comp-cat"' + (i === 0 ? " open" : "") + '><summary>' + esc(c.name) + '<span class="cat-count">' + res.length + " مادة</span></summary>" +
      '<div class="comp-body">' + (res.length ? '<div class="rel-grid">' + res.map(function (r) { return relItem(r.a); }).join("") + "</div>" :
        '<p style="color:var(--muted);padding:10px">لا توجد مواد مطابقة.</p>') + "</div></details>";
  }).join("");
  setView('<div class="breadcrumbs"><a href="#/orgchart">شجرة الاختصاصات</a><span class="sep">/</span><span>' + esc(e.name) + "</span></div>" +
    '<div class="entity-hero"><h1>' + esc(e.name) + "</h1><p>" + esc(e.summary) + "</p></div>" +
    '<div class="notice">' + icon("shield", 18) + "<div>الاختصاصات أدناه مبوّبة استرشاديًا، وكل عنصر يعرض المواد الفعلية من النصوص. للاطّلاع الحرفي راجع نص كل مادة وصورتها الأصلية.</div></div>" +
    cats);
}

/* ---------- GLOSSARY ---------- */
function viewGlossary() {
  var g = S.glossary();
  setView('<div class="section-head"><div class="eyebrow">القاموس</div><h1>قاموس المصطلحات</h1>' +
    '<p>تعريفات المصطلحات كما وردت في نصوص القانون واللوائح (مادة التعاريف). عددها ' + g.length + " تعريفًا.</p></div>" +
    '<div class="gloss-search"><div class="search-box"><span class="s-ico">' + icon("search", 20) + '</span><input type="search" id="glossInput" placeholder="ابحث عن مصطلح…" aria-label="بحث في القاموس"></div></div>' +
    '<dl id="glossList">' + g.map(glossItem).join("") + "</dl>");
  var gi = $("#glossInput");
  gi.addEventListener("input", function () {
    var v = norm(gi.value);
    var filtered = v ? g.filter(function (x) { return x._n.indexOf(v) >= 0 || norm(x.def).indexOf(v) >= 0; }) : g;
    $("#glossList").innerHTML = filtered.length ? filtered.map(glossItem).join("") : '<div class="empty">لا مصطلحات مطابقة.</div>';
  });
}
function glossItem(x) {
  return '<div class="gloss-item"><dt>' + esc(x.term) + "</dt><dd>" + esc(x.def) + '</dd><div class="g-src">' +
    esc(docMap[x.doc].short) + ' · <a href="#/article/' + x.art + '">مادة التعاريف</a></div></div>';
}

/* ---------- PROCEDURES ---------- */
function viewProcedures() {
  setView('<div class="section-head"><div class="eyebrow">دليل الإجراءات</div><h1>دليل الإجراءات</h1>' +
    '<p>خطوات مبسّطة لأهم العمليات، مع روابط للمواد القانونية ذات الصلة.</p></div>' +
    '<div class="tile-grid">' + (C.procedures || []).map(function (p) {
      return '<a class="tile" href="#/procedure/' + p.key + '"><span class="t-ico">' + icon(p.icon, 24) + "</span><b>" + esc(p.name) + "</b><span>" + esc(p.desc) + "</span></a>";
    }).join("") + "</div>");
}
function viewProcedure(key) {
  var p = (C.procedures || []).find(function (x) { return x.key === key; }); if (!p) return viewNotFound();
  var rel = articlesByKeywords(p.keywords, null, 8).map(function (r) { return r.a; });
  setView('<div class="breadcrumbs"><a href="#/procedures">الإجراءات</a><span class="sep">/</span><span>' + esc(p.name) + "</span></div>" +
    '<div class="section-head"><div class="eyebrow">إجراء</div><h1>' + esc(p.name) + "</h1><p>" + esc(p.desc) + "</p></div>" +
    '<div class="card"><ol class="steps">' + p.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol></div>" +
    '<div class="notice">' + icon("shield", 18) + "<div>الخطوات استرشادية لتيسير الفهم؛ الحكم النافذ هو نص المواد القانونية أدناه.</div></div>" +
    relatedGrid(rel, "المواد ذات الصلة"));
}

/* ---------- FAQ ---------- */
function viewFaq() {
  setView('<div class="section-head"><div class="eyebrow">الأسئلة الشائعة</div><h1>الأسئلة الشائعة</h1>' +
    '<p>إجابات موجزة، مع الإحالة إلى المواد القانونية المستند إليها.</p></div>' +
    (C.faq || []).map(function (f, i) {
      var rel = articlesByKeywords(f.keywords, null, 4);
      return '<details class="acc"' + (i === 0 ? " open" : "") + '><summary>' + esc(f.q) + "</summary>" +
        '<div class="acc-body"><p>' + esc(f.a) + "</p>" +
        (rel.length ? '<p class="acc-src">المواد ذات الصلة: ' +
          rel.map(function (r) { return '<a href="#/article/' + r.a.id + '">' + esc(r.a.label) + " (" + esc(docMap[r.a.doc].short) + ")</a>"; }).join(" ، ") + "</p>" : "") +
        "</div></details>";
    }).join(""));
}

/* ---------- FORMS ---------- */
function viewForms() {
  setView('<div class="section-head"><div class="eyebrow">النماذج</div><h1>النماذج الاسترشادية</h1>' +
    '<p>قوالب جاهزة يمكن نسخها أو طباعتها واستخدامها في العمل اليومي.</p></div>' +
    '<div class="notice">' + icon("shield", 18) + "<div>هذه نماذج استرشادية لتيسير العمل، وليست جزءًا من نصوص القانون أو اللوائح.</div></div>" +
    (C.forms || []).map(function (f, i) {
      return '<div class="form-tpl"><h3>' + esc(f.name) + '</h3><p style="color:var(--muted)">' + esc(f.desc) + "</p>" +
        '<div class="tpl-body">' + esc(f.body) + "</div>" +
        '<div class="tpl-actions"><button class="btn-ghost" data-tpl="' + i + '" data-tact="copy">' + icon("copy", 16) + " نسخ</button>" +
        '<button class="btn-ghost" data-tpl="' + i + '" data-tact="print">' + icon("print", 16) + " طباعة</button></div></div>";
    }).join(""));
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
  setView('<div class="article-page"><div class="section-head"><div class="eyebrow">عن المنصة</div><h1>عن المنصة ومصدر النصوص</h1></div>' +
    '<div class="ap-card"><div class="ap-text about-text">' +
    "<p>منصة تشريعات السلطة المحلية أداة معرفية تهدف إلى تيسير الاطّلاع والبحث في تشريعات السلطة المحلية في الجمهورية اليمنية، وتضم ثلاث وثائق أساسية:</p>" +
    "<ul>" + DOCS.map(function (d) { return "<li><b>" + esc(d.title) + "</b> — " + esc(d.fullTitle) + " (" + d.articleCount + " مادة).</li>"; }).join("") + "</ul>" +
    "<h3>الدقة والتوثيق</h3>" +
    "<p>استُخرجت نصوص المواد من ملفات الوثائق الرسمية بصيغة PDF، وهُيكلت في " + ARTS.length + " مادة. وتُتاح <b>صورة الصفحة الأصلية</b> لكل مادة عبر زر «الصفحة الأصلية» للرجوع إلى النص الحرفي. المرجع الرسمي المعتمد يبقى الجريدة الرسمية والوثائق الأصلية الصادرة عن الجهات المختصة.</p>" +
    "<h4>حالة مراجعة النصوص</h4>" +
    "<ul>" +
      "<li><b>قانون السلطة المحلية</b> — رُوجِع نصّه حرفيًا مقابل صور الصفحات الأصلية (مكتمل).</li>" +
      "<li><b>اللائحة التنفيذية</b> و<b>اللائحة المالية</b> — نصٌّ مُستخرَج آليًا ومهيكل بالكامل؛ المراجعة النصية الحرفية الكاملة قيد الإنجاز، وصورة الصفحة الأصلية متاحة لكل مادة للتوثيق.</li>" +
    "</ul>" +
    "<h3>الميزات</h3>" +
    "<p>بحث ذكي فوري في كل التشريعات دفعة واحدة (يفهم صيغ الكلمات والمرادفات وأرقام المواد ويقترح التصحيح)، صفحة مستقلة لكل مادة مع النسخ والطباعة والمشاركة، ربط تلقائي بين المواد المتقاطعة، شجرة اختصاصات، قاموس مصطلحات، دليل إجراءات، أسئلة شائعة، نماذج، ومفضلة. تعمل المنصة بالكامل داخل المتصفح ولا تجمع أي بيانات.</p>" +
    '<div class="about-credit">' + ($(".foot-credit") ? $(".foot-credit").outerHTML : "") + "</div>" +
    "</div></div></div>");
}

function viewNotFound() {
  setView('<div class="empty">' + icon("search", 44) + "<h1 style='margin:10px 0'>الصفحة غير موجودة</h1><p>تعذّر العثور على المحتوى المطلوب.</p><a class='btn' href='#/' style='margin-top:14px'>العودة للرئيسية</a></div>");
}

/* ============================================================
   SMART ASSISTANT — Claude answers from the retrieved articles
   (server function /api/ask); falls back to the instant offline
   answer when the AI is unavailable (file://, GitHub Pages, errors)
   ============================================================ */
var aiCtrl = null, aiCache = {};
function aiSources(q, r, k) {
  var ids = [], seen = {};
  function add(a) { if (a && !seen[a.id] && ids.length < 14) { seen[a.id] = 1; ids.push(a.id); } }
  r.direct.forEach(add);
  r.results.slice(0, 10).forEach(function (x) { add(x.a); });
  if (k.faq) articlesByKeywords(k.faq.keywords, null, 3).forEach(function (x) { add(x.a); });
  k.gloss.forEach(function (g) { add(artMap[g.art]); });
  r.results.slice(10, 14).forEach(function (x) { add(x.a); });
  return ids.map(function (id) { return artMap[id]; });
}
var DOC_BY_NAME = { "القانون": "law", "اللائحة التنفيذية": "exec", "اللائحة المالية": "fin" };
function formatAnswer(text) {
  var html = esc(text)
    .replace(/\(\s*الماد[ةه]\s*\(?\s*(\d{1,3})\s*\)?\s*[—–\-]\s*(القانون|اللائحة التنفيذية|اللائحة المالية)\s*\)/g, function (m, num, doc) {
      var id = DOC_BY_NAME[doc] + "-" + num;
      return artMap[id] ? '(<a class="ref" href="#/article/' + id + '">المادة ' + num + " — " + doc + "</a>)" : m;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  var out = [], list = [];
  function flush() { if (list.length) { out.push("<ul>" + list.join("") + "</ul>"); list = []; } }
  html.split(/\n+/).forEach(function (line) {
    line = line.trim(); if (!line) return;
    var m = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (m) { list.push("<li>" + m[1] + "</li>"); return; }
    flush();
    out.push(/^الاستناد القانوني/.test(line) ? '<p class="ai-basis">' + line + "</p>" : "<p>" + line + "</p>");
  });
  flush();
  return out.join("");
}
function renderAI(q, box) {
  var r = S.search(q), k = S.quick(q), arts = aiSources(q, r, k);
  if (aiCtrl) { aiCtrl.abort(); aiCtrl = null; }
  if (!arts.length) { renderAnswer(q, box); return; }
  box.innerHTML =
    '<div class="ai-answer"><div class="ai-answer-tag">' + icon("bolt", 16) + " إجابة المساعد الذكي</div>" +
    '<div class="ai-answer-body" id="aiBody"><div class="ai-loading">' + icon("scale", 22) + "<span>يقرأ " + arts.length + " مادة ويصوغ الإجابة…</span></div></div>" +
    '<div class="ai-foot">الإجابة مولَّدة آليًا من نصوص المواد أدناه — راجع نص المادة قبل الاعتماد عليها.</div></div>' +
    relatedGrid(arts.slice(0, 8), "المواد التي قرأها المساعد");
  var bodyEl = $("#aiBody", box);
  function fallback(note) {
    var tmp = document.createElement("div");
    renderAnswer(q, tmp);
    box.innerHTML = '<div class="notice">' + icon("shield", 18) + "<div>" + note + "</div></div>" + tmp.innerHTML;
    if (r.match) highlightDom($(".ai-quote", box), r.match);
  }
  if (aiCache[q]) { bodyEl.innerHTML = formatAnswer(aiCache[q]); return; }
  if (location.protocol === "file:" || !window.fetch || !window.TextDecoder) {
    fallback("المساعد الذكي يعمل عند فتح المنصة من رابطها على الإنترنت؛ هذه إجابة فورية من البحث."); return;
  }
  var ctrl = aiCtrl = new AbortController(), text = "", pending = false;
  function paint() {
    pending = false;
    var shown = text.replace(/\n?\[\[[A-Z:0-9a-z]+\]\]\s*$/, "");
    if (shown.trim()) bodyEl.innerHTML = formatAnswer(shown) + (ctrl === aiCtrl ? '<span class="ai-caret"></span>' : "");
  }
  fetch("api/ask", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: q, ids: arts.map(function (a) { return a.id; }) }), signal: ctrl.signal
  }).then(function (res) {
    if (!res.ok || !res.body) { var e = new Error("http"); e.status = res.status; throw e; }
    var reader = res.body.getReader(), dec = new TextDecoder();
    return (function pump() {
      return reader.read().then(function (c) {
        if (c.done) return;
        text += dec.decode(c.value, { stream: true });
        if (!pending) { pending = true; requestAnimationFrame(paint); }
        return pump();
      });
    })();
  }).then(function () {
    if (ctrl !== aiCtrl) return;
    aiCtrl = null;
    var marker = (text.match(/\[\[([A-Z]+)(?::[^\]]*)?\]\]\s*$/) || [])[1];
    var clean = text.replace(/\n?\[\[[^\]]+\]\]\s*$/, "").trim();
    if (marker === "ERROR" && !clean) { fallback("تعذّر الوصول إلى المساعد الذكي الآن؛ هذه إجابة فورية من البحث."); return; }
    if (marker === "REFUSAL" && !clean) { bodyEl.innerHTML = "<p>تعذّر تقديم إجابة لهذا السؤال. جرّب صياغة أخرى أو استخدم البحث.</p>"; return; }
    bodyEl.innerHTML = formatAnswer(clean) + (marker === "TRUNCATED" ? '<p class="ai-basis">… (اختُصرت الإجابة لطولها)</p>' : "");
    if (!marker) aiCache[q] = clean;
  }).catch(function (err) {
    if (err && err.name === "AbortError") return;
    if (ctrl === aiCtrl) aiCtrl = null;
    fallback(err && err.status === 429 ? "وصلت إلى الحد المؤقت لعدد الأسئلة؛ انتظر دقيقة ثم أعد المحاولة. هذه إجابة فورية من البحث."
      : "المساعد الذكي غير متاح الآن؛ هذه إجابة فورية من البحث.");
  });
}

function viewAsk(q) {
  setView('<div class="ask-wrap">' +
    '<div class="section-head"><div class="eyebrow">المساعد القانوني الذكي</div><h1>اسأل، ويُجيبك من داخل القوانين واللوائح</h1>' +
    '<p>اكتب سؤالك بأي صياغة — يفهم المساعد سؤالك، ويقرأ المواد ذات الصلة من القانون واللائحتين، ويصوغ لك إجابة واضحة مع ذكر أرقام المواد وروابطها. بلا تسجيل.</p></div>' +
    '<form class="ask-box" id="askForm">' +
      '<textarea id="askInput" rows="2" placeholder="مثال: من يعتمد موازنة الوحدة الإدارية؟ وهل يحق للمجلس المحلي سحب الثقة؟" aria-label="سؤالك">' + esc(q || "") + "</textarea>" +
      '<div class="ask-row"><button class="btn" type="submit">' + icon("chat", 18) + " اسأل</button>" +
      '<span class="ask-hint">أسئلة شائعة:</span>' +
      (C.faq || []).slice(0, 4).map(function (f) { return '<button type="button" class="lp-chip" data-ask="' + esc(f.q) + '">' + esc(f.q) + "</button>"; }).join("") +
      "</div></form>" +
    '<div id="askResult" aria-live="polite"></div>' +
    '<div class="notice" style="margin-top:20px">' + icon("shield", 18) + "<div>الإجابة تُستخرج مباشرةً من نصوص القوانين واللوائح المتاحة، وقد لا تغطّي كل الحالات. راجع دائمًا نص المادة وصورتها الأصلية؛ المرجع الرسمي هو الجريدة الرسمية.</div></div>" +
    "</div>");
  var form = $("#askForm"), input = $("#askInput"), result = $("#askResult");
  function ask(text) {
    var v = (text || "").trim();
    if (v.length < 2) { toast("اكتب سؤالًا"); return; }
    history.replaceState(null, "", "#/ask?q=" + enc(v));
    renderAI(v, result);
  }
  form.addEventListener("submit", function (e) { e.preventDefault(); ask(input.value); });
  form.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ask]"); if (!b) return;
    input.value = b.getAttribute("data-ask"); ask(input.value);
  });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  if (q) ask(q); else input.focus();
}
function renderAnswer(q, box) {
  var r = S.search(q), k = S.quick(q), html = "", quote = null;
  if (r.direct.length) {
    quote = r.direct[0];
    html = answerCard("نص المادة المطلوبة", "", quote) + relatedGrid(r.direct.slice(1), "المادة نفسها في الوثائق الأخرى");
  } else if (k.faq) {
    var src = articlesByKeywords(k.faq.keywords, null, 4).map(function (x) { return x.a; });
    html = '<div class="ai-answer"><div class="ai-answer-tag">' + icon("chat", 16) + " إجابة مختصرة</div>" +
      '<div class="ai-answer-body"><p><b>' + esc(k.faq.q) + "</b></p><p>" + esc(k.faq.a) + "</p></div></div>" +
      relatedGrid(src, "المواد المستند إليها");
  } else if (k.gloss.length) {
    var g = k.gloss[0];
    html = '<div class="ai-answer"><div class="ai-answer-tag">' + icon("book", 16) + " تعريف من " + esc(docMap[g.doc].short) + "</div>" +
      '<div class="ai-answer-body"><p><b>' + esc(g.term) + "</b>: " + esc(g.def) + "</p></div></div>" +
      relatedGrid(r.results.slice(0, 4).map(function (x) { return x.a; }), "مواد ذات صلة");
  } else if (r.results.length) {
    quote = r.results[0].a;
    html = answerCard("الإجابة مستندة إلى", "", quote) +
      relatedGrid(r.results.slice(1, 5).map(function (x) { return x.a; }), "مواد أخرى ذات صلة") +
      '<p class="more-link"><a href="#/search?q=' + enc(q) + '">عرض كل النتائج (' + r.results.length + ") في صفحة البحث ←</a></p>";
  } else {
    html = '<div class="ai-error">' + icon("search", 20) + '<div><b>لم أجد نصًّا مطابقًا لسؤالك.</b><br>' +
      (r.suggestion ? 'هل تقصد: <a href="#/ask?q=' + enc(r.suggestion) + '">' + esc(r.suggestion) + "</a>؟<br>" : "") +
      'جرّب صياغة أخرى أو كلمات أعمّ، أو تصفّح <a href="#/topics">المواضيع</a> و<a href="#/library">المكتبة</a>.</div></div>';
  }
  box.innerHTML = html;
  if (quote) highlightDom($(".ai-quote", box), r.match);
}
function answerCard(lead, _, a) {
  return '<div class="ai-answer"><div class="ai-answer-tag">' + icon("scale", 16) + " إجابة فورية من نصوص القوانين</div>" +
    '<div class="ai-answer-body"><p class="ai-lead">' + esc(lead) + ' <a href="#/article/' + a.id + '"><b>' + esc(a.label) + "</b></a> من <b>" + esc(docMap[a.doc].title) + "</b>:</p>" +
    '<blockquote class="ai-quote">' + linkifyRefs(a.text, a.doc) + "</blockquote></div></div>";
}

/* ============================================================
   Global actions (one delegated listener — no duplicates)
   ============================================================ */
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-act]");
  if (b) {
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id"), a = artMap[id];
    if (!a) return;
    if (act === "open") go("/article/" + id);
    else if (act === "copy") { copyText(a.label + " — " + docMap[a.doc].title + "\n" + a.text); toast("نُسخ نص المادة"); }
    else if (act === "fav") {
      var on = toggleFav(id);
      b.classList.toggle("on", on);
      if (b.classList.contains("btn")) b.innerHTML = icon("heart", 18) + " " + (on ? "محفوظة" : "حفظ");
    }
    else if (act === "img") openImgModal(a);
    else if (act === "print") printContent("<h2>" + esc(a.label) + " — " + esc(docMap[a.doc].title) + "</h2><p style='font-size:1.1rem;line-height:2'>" + esc(a.text) + "</p>");
    else if (act === "share") {
      var url = location.origin + location.pathname + "#/article/" + id;
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        navigator.share({ title: a.label + " — " + docMap[a.doc].title, url: url }).catch(function () {});
      } else { copyText(url); toast("نُسخ رابط المادة"); }
    }
    return;
  }
  var t = e.target.closest("[data-tpl]");
  if (t) {
    var f = (C.forms || [])[+t.getAttribute("data-tpl")]; if (!f) return;
    if (t.getAttribute("data-tact") === "copy") { copyText(f.body); toast("نُسخ النموذج"); }
    else printContent("<h2>" + esc(f.name) + "</h2><pre style='font-family:inherit;white-space:pre-wrap'>" + esc(f.body) + "</pre>");
  }
});
// close live panels when tapping/clicking outside
document.addEventListener("pointerdown", function (e) {
  if (!anyLiveOpen()) return;
  liveHosts.forEach(function (h) { if (!h.form.contains(e.target)) h.close(); });
});

/* ---------- source image modal ---------- */
function openImgModal(a) {
  var m = $("#imgModal"), img = $("#imgModalImg");
  m.classList.add("loading");
  img.onload = img.onerror = function () { m.classList.remove("loading"); };
  img.src = a.img;
  img.alt = "الصفحة الأصلية للمادة " + a.num;
  $("#imgModalTitle").textContent = docMap[a.doc].short + " — الصفحة " + a.page + " (" + a.label + ")";
  $("#imgModalOpen").href = a.img;
  m.hidden = false; document.body.style.overflow = "hidden";
  $(".modal-box [data-close]", m).focus();
}
function closeImgModal() { var m = $("#imgModal"); if (m.hidden) return; m.hidden = true; document.body.style.overflow = ""; }
$("#imgModal").addEventListener("click", function (e) { if (e.target.closest("[data-close]") || e.target.classList.contains("modal-back")) closeImgModal(); });
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
   ROUTER
   ============================================================ */
function parseHash() {
  var h = location.hash.replace(/^#/, "") || "/";
  var qi = h.indexOf("?"), query = "";
  if (qi >= 0) { query = h.slice(qi + 1); h = h.slice(0, qi); }
  var parts = h.split("/").filter(Boolean);
  var params = {};
  query.split("&").forEach(function (kv) {
    var i = kv.indexOf("="); if (i < 0) return;
    try { params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " ")); } catch (e) { params[kv.slice(0, i)] = kv.slice(i + 1); }
  });
  return { parts: parts, params: params };
}
var curKey = "";
function route() {
  var r = parseHash(), p = r.parts;
  closeImgModal();
  closeAllLive();
  var key = p.slice(0, 2).join("/");
  // same document already on screen: just scroll to the requested article
  if (p[0] === "doc" && p[2] && key === curKey && $("#artList")) { scrollToArticle(p[1] + "-" + p[2]); return; }
  curKey = key;
  if (!p.length) return viewHome();
  switch (p[0]) {
    case "library": return viewLibrary();
    case "doc":
      viewDoc(p[1]);
      if (p[2]) scrollToArticle(p[1] + "-" + p[2]);
      return;
    case "article": return viewArticle(p[1], r.params.q);
    case "compare": return viewCompare(p[1]);
    case "search": return viewSearch(r.params.q || "", r.params.doc || "all");
    case "ask": return viewAsk(r.params.q || "");
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
    if (elm) {
      var far = Math.abs(elm.getBoundingClientRect().top) > 1500, de = document.documentElement, sb = de.style.scrollBehavior;
      if (far) de.style.scrollBehavior = "auto";
      elm.scrollIntoView({ behavior: far ? "auto" : "smooth", block: "start" });
      if (far) de.style.scrollBehavior = sb;
      elm.classList.add("flash"); setTimeout(function () { elm.classList.remove("flash"); }, 1600);
    }
    $all(".toc-arts a.active").forEach(function (x) { x.classList.remove("active"); });
    var link = $('.toc-arts a[data-art="' + id + '"]');
    if (link) { link.classList.add("active"); var det = link.closest("details"); if (det) det.open = true; }
  }, 60);
}
function go(path) { location.hash = "#" + path; }

function highlightNav() {
  var h = location.hash.split("?")[0] || "#/";
  $all(".nav-links a").forEach(function (a) {
    var href = a.getAttribute("href");
    var on = h === href || (href.length > 2 && h.indexOf(href + "/") === 0);
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

/* ============================================================
   Header search + nav + theme
   ============================================================ */
var topInput = $("#topSearchInput");
LiveSearch($("#topSearch"), topInput);
backdrop.addEventListener("click", function () { closeAllLive(); });
document.addEventListener("keydown", function (e) {
  var tag = (document.activeElement && document.activeElement.tagName) || "";
  if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
    e.preventDefault(); topInput.focus();
  }
});
function currentTheme() {
  var t = document.documentElement.getAttribute("data-theme");
  if (t) return t;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
$("#themeBtn").addEventListener("click", function () {
  var next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("slm_theme", next); } catch (e) {}
});
$("#navToggle").addEventListener("click", function () {
  var n = $("#navLinks"), open = n.classList.toggle("open");
  this.setAttribute("aria-expanded", open ? "true" : "false");
});
$("#navLinks").addEventListener("click", function (e) {
  if (e.target.closest("a")) { $("#navLinks").classList.remove("open"); $("#navToggle").setAttribute("aria-expanded", "false"); }
});

// phones show the credit at the very bottom of the footer (CSS picks which copy is visible)
(function () {
  var fc = $(".foot-min .foot-credit"), inner = $(".foot-inner");
  if (!fc || !inner) return;
  var m = fc.cloneNode(true);
  m.className = "foot-credit-mobile";
  inner.appendChild(m);
})();

window.addEventListener("hashchange", route);
route();
})();
