#!/usr/bin/env python3
"""Build the GED study guide from the sources in ged/src/.

Sources
    ged/src/<key>-guide.md        the chapter text
    ged/src/<key>-questions.json  that chapter's practice bank

Output
    ged/index.html                one self-contained offline page
    docs/GED-STUDY-GUIDE.md       the same chapters as a single readable document

Run: python3 tools/build-ged.py
"""

import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "ged" / "src"
OUT_HTML = ROOT / "ged" / "index.html"
OUT_MD = ROOT / "docs" / "GED-STUDY-GUIDE.md"

# key, tab label, subtitle shown under the chapter title
CHAPTERS = [
    ("plan", "Plan", "Start here. The week, and the method for finding any answer."),
    ("nj", "New Jersey", "Your state: what it accepts, what it costs, and what it actually issues."),
    ("math", "Math", "Mathematical Reasoning — 115 minutes, 46 questions. The one that needs real hours."),
    ("rla", "Language", "Reasoning Through Language Arts — 150 minutes, 46 questions plus the essay."),
    ("essay", "Essay", "The Extended Response — 45 minutes, 6 raw points."),
    ("science", "Science", "Science — 90 minutes, 34 questions. Mostly a reading test."),
    ("social", "Social Studies", "Social Studies — 70 minutes, 35 questions. Also mostly a reading test."),
    ("logistics", "Test Day", "Booking it, sitting it, scoring it."),
]


# --------------------------------------------------------------------------
# markdown -> html
# --------------------------------------------------------------------------

_CODE = re.compile(r"`([^`]+)`")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_ITAL = re.compile(r"(?<![*\w])\*([^*\n]+)\*(?![*\w])")
_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
_BARE = re.compile(r"(?<![\"'>=])(https?://[^\s<>\")]+)")


def inline(text):
    out = html.escape(text, quote=False)
    out = _CODE.sub(r"<code>\1</code>", out)
    out = _BOLD.sub(r"<strong>\1</strong>", out)
    out = _ITAL.sub(r"<em>\1</em>", out)
    out = _LINK.sub(r'<a href="\2" target="_blank" rel="noopener">\1</a>', out)
    out = _BARE.sub(r'<a href="\1" target="_blank" rel="noopener">\1</a>', out)
    return out


def slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "section"


def is_table_row(line):
    return line.strip().startswith("|") and line.count("|") >= 2


def is_table_rule(line):
    return bool(re.match(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", line)) and "-" in line


def split_row(line):
    cells = line.strip().strip("|").split("|")
    return [c.strip() for c in cells]


def md_to_html(text, key):
    """Convert the restricted markdown the chapters are written in."""
    lines = text.replace("\r\n", "\n").split("\n")
    out = []
    toc = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # headings
        m = re.match(r"^(#{2,5})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            title = m.group(2).strip()
            anchor = f"{key}-{slug(title)}"
            if level == 2:
                toc.append((anchor, title))
            out.append(f'<h{level} id="{anchor}">{inline(title)}</h{level}>')
            i += 1
            continue

        # horizontal rule
        if re.match(r"^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$", stripped):
            out.append("<hr>")
            i += 1
            continue

        # table
        if is_table_row(line) and i + 1 < n and is_table_rule(lines[i + 1]):
            head = split_row(line)
            i += 2
            body = []
            while i < n and is_table_row(lines[i]):
                body.append(split_row(lines[i]))
                i += 1
            cols = len(head)
            th = "".join(f"<th>{inline(c)}</th>" for c in head)
            trs = []
            for row in body:
                row = (row + [""] * cols)[:cols]
                tds = "".join(f"<td>{inline(c)}</td>" for c in row)
                trs.append(f"<tr>{tds}</tr>")
            out.append(
                '<div class="tablewrap"><table><thead><tr>'
                + th
                + "</tr></thead><tbody>"
                + "".join(trs)
                + "</tbody></table></div>"
            )
            continue

        # blockquote
        if stripped.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            joined = "<br>".join(inline(b) if b else "" for b in buf)
            out.append(f"<blockquote>{joined}</blockquote>")
            continue

        # lists (one level of nesting)
        m = re.match(r"^(\s*)([-*+]|\d+\.)\s+(.*)$", line)
        if m:
            out.append(parse_list(lines, i))
            i = skip_list(lines, i)
            continue

        # paragraph
        buf = []
        while i < n and lines[i].strip():
            nxt = lines[i]
            if re.match(r"^\s*(#{2,5}\s|[-*+]\s|\d+\.\s|>)", nxt) or is_table_row(nxt):
                break
            buf.append(nxt.strip())
            i += 1
        if buf:
            out.append(f'<p>{inline(" ".join(buf))}</p>')
        else:
            i += 1

    return "\n".join(out), toc


def list_item_match(line):
    return re.match(r"^(\s*)([-*+]|\d+\.)\s+(.*)$", line)


def skip_list(lines, start):
    i = start
    while i < len(lines):
        if list_item_match(lines[i]):
            i += 1
            continue
        if lines[i].strip() and lines[i].startswith(("    ", "\t")):
            i += 1
            continue
        if not lines[i].strip():
            j = i + 1
            if j < len(lines) and list_item_match(lines[j]):
                i = j
                continue
        break
    return i


def parse_list(lines, start):
    end = skip_list(lines, start)
    items = []
    cur = None
    base = None
    for line in lines[start:end]:
        m = list_item_match(line)
        if not m:
            if cur is not None and line.strip():
                cur["text"] += " " + line.strip()
            continue
        indent, marker, text = len(m.group(1)), m.group(2), m.group(3)
        ordered = bool(re.match(r"\d+\.", marker))
        if base is None:
            base = indent
        if indent > base and cur is not None:
            cur["children"].append({"text": text, "ordered": ordered, "children": []})
        else:
            cur = {"text": text, "ordered": ordered, "children": []}
            items.append(cur)
    if not items:
        return ""
    tag = "ol" if items[0]["ordered"] else "ul"
    parts = [f"<{tag}>"]
    for it in items:
        inner = inline(it["text"])
        if it["children"]:
            ctag = "ol" if it["children"][0]["ordered"] else "ul"
            kids = "".join(f"<li>{inline(c['text'])}</li>" for c in it["children"])
            inner += f"<{ctag}>{kids}</{ctag}>"
        parts.append(f"<li>{inner}</li>")
    parts.append(f"</{tag}>")
    return "".join(parts)


# --------------------------------------------------------------------------
# page template
# --------------------------------------------------------------------------

PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>GED Study Guide &mdash; pass it first try</title>
<meta name="description" content="A complete GED study guide: what is on all four tests, the cheat sheets, __QCOUNT__ practice questions with worked answers, and how to find the answer to anything they ask.">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#127891;</text></svg>">
<style>
:root{
  --bg:#fbfaf8; --panel:#fff; --ink:#15181d; --dim:#5c6370; --line:#e4e2dd;
  --accent:#1f6feb; --accent-ink:#fff; --ok:#137a3e; --okbg:#e7f6ec;
  --bad:#b42318; --badbg:#fdeceb; --warn:#8a5a00; --warnbg:#fdf3e2;
  --mark:#fff3b0; --radius:12px;
  --safe-t:env(safe-area-inset-top,0px); --safe-b:env(safe-area-inset-bottom,0px);
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#101215; --panel:#171a1f; --ink:#e8eaed; --dim:#9aa3b0; --line:#272b32;
    --accent:#539bf5; --accent-ink:#06121f; --ok:#57c98b; --okbg:#122a1d;
    --bad:#ff8b80; --badbg:#2d1614; --warn:#e3b341; --warnbg:#2a2113;
    --mark:#4a4110;
  }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.62 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
  padding-bottom:calc(24px + var(--safe-b))}
img{max-width:100%}
[hidden]{display:none!important}
a{color:var(--accent)}
code{font:0.88em/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  background:color-mix(in srgb,var(--ink) 8%,transparent);padding:.12em .36em;border-radius:5px}

header.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 92%,transparent);
  backdrop-filter:blur(10px);border-bottom:1px solid var(--line);
  padding-top:var(--safe-t)}
.bar{max-width:940px;margin:0 auto;padding:10px 16px 0;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.bar h1{font-size:17px;margin:0;letter-spacing:-.01em}
.bar .sub{color:var(--dim);font-size:13px}
nav.tabs{max-width:940px;margin:0 auto;padding:8px 8px 0;display:flex;gap:2px;overflow-x:auto;
  scrollbar-width:none}
nav.tabs::-webkit-scrollbar{display:none}
nav.tabs button{flex:0 0 auto;background:none;border:0;border-bottom:2px solid transparent;color:var(--dim);
  font:inherit;font-size:14px;font-weight:600;padding:8px 12px 9px;cursor:pointer;white-space:nowrap;border-radius:8px 8px 0 0}
nav.tabs button:hover{color:var(--ink);background:color-mix(in srgb,var(--ink) 5%,transparent)}
nav.tabs button[aria-selected=true]{color:var(--accent);border-bottom-color:var(--accent)}

main{max-width:940px;margin:0 auto;padding:0 16px}
section.chapter{padding:22px 0 60px}
.chaphead h2.title{font-size:27px;line-height:1.2;margin:.2em 0 .15em;letter-spacing:-.02em}
.chaphead p.sub{color:var(--dim);margin:0 0 18px}

.toc{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;margin:0 0 26px}
.toc b{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim)}
.toc ol{margin:8px 0 0;padding-left:20px;columns:2;column-gap:22px}
@media(max-width:620px){.toc ol{columns:1}}
.toc li{margin:3px 0}
.toc a{text-decoration:none}
.toc a:hover{text-decoration:underline}

.prose h2{font-size:21px;margin:2.1em 0 .5em;padding-top:.3em;letter-spacing:-.015em;scroll-margin-top:110px;
  border-top:1px solid var(--line)}
.prose h2:first-child{border-top:0;margin-top:.4em}
.prose h3{font-size:17px;margin:1.6em 0 .4em;scroll-margin-top:110px}
.prose h4{font-size:15px;margin:1.3em 0 .3em;color:var(--dim);text-transform:uppercase;letter-spacing:.05em}
.prose p{margin:.7em 0}
.prose ul,.prose ol{margin:.6em 0;padding-left:24px}
.prose li{margin:.3em 0}
.prose li>ul,.prose li>ol{margin:.25em 0}
.prose blockquote{margin:1em 0;padding:.6em 14px;border-left:3px solid var(--accent);
  background:var(--panel);border-radius:0 8px 8px 0;color:var(--ink)}
.prose strong{font-weight:680}
.tablewrap{overflow-x:auto;margin:1em 0;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel)}
table{border-collapse:collapse;width:100%;font-size:14.5px;min-width:420px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:color-mix(in srgb,var(--ink) 4%,transparent);font-size:12.5px;text-transform:uppercase;
  letter-spacing:.05em;color:var(--dim);font-weight:700}
tbody tr:last-child td{border-bottom:0}

.btn{display:inline-flex;align-items:center;gap:7px;background:var(--accent);color:var(--accent-ink);
  border:0;border-radius:10px;font:inherit;font-weight:650;font-size:15px;padding:11px 18px;cursor:pointer}
.btn:hover{filter:brightness(1.08)}
.btn.ghost{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
.btn:disabled{opacity:.45;cursor:default}

.drillbar{position:sticky;bottom:0;z-index:15;margin:30px -16px 0;padding:12px 16px calc(12px + var(--safe-b));
  background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(10px);
  border-top:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.drillbar .count{color:var(--dim);font-size:13.5px}

/* ---------- drill ---------- */
.modal{position:fixed;inset:0;z-index:50;background:var(--bg);display:flex;flex-direction:column}
.modal header{border-bottom:1px solid var(--line);padding:calc(10px + var(--safe-t)) 16px 10px;
  display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.modal header .who{font-weight:680;font-size:15px}
.modal header .score{margin-left:auto;font-size:13.5px;color:var(--dim);font-variant-numeric:tabular-nums}
.progress{height:4px;background:var(--line)}
.progress i{display:block;height:100%;background:var(--accent);transition:width .2s}
.modal .body{flex:1;overflow-y:auto;padding:18px 16px calc(28px + var(--safe-b));-webkit-overflow-scrolling:touch}
.qwrap{max-width:760px;margin:0 auto}
.meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.chip{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--dim);
  border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:var(--panel)}
.chip.hard{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,var(--line))}
.chip.medium{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,var(--line))}
.chip.easy{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,var(--line))}
.stimulus{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:0 var(--radius) var(--radius) 0;padding:13px 15px;margin:0 0 16px;
  white-space:pre-wrap;font-size:14.6px;line-height:1.6;max-height:44vh;overflow-y:auto}
.qtext{font-size:18px;line-height:1.45;font-weight:600;margin:0 0 16px}
.choices{display:flex;flex-direction:column;gap:9px}
.choice{display:flex;gap:11px;align-items:flex-start;text-align:left;width:100%;
  background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:12px 14px;
  font:inherit;font-size:15.5px;color:var(--ink);cursor:pointer;line-height:1.45}
.choice:hover:not(:disabled){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--panel))}
.choice .k{flex:0 0 22px;height:22px;border-radius:6px;background:color-mix(in srgb,var(--ink) 9%,transparent);
  display:grid;place-items:center;font-size:12.5px;font-weight:800;margin-top:1px}
.choice.correct{border-color:var(--ok);background:var(--okbg)}
.choice.correct .k{background:var(--ok);color:#fff}
.choice.wrong{border-color:var(--bad);background:var(--badbg)}
.choice.wrong .k{background:var(--bad);color:#fff}
.choice:disabled{cursor:default;opacity:1}
.numeric{display:flex;gap:9px;flex-wrap:wrap}
.numeric input{flex:1 1 180px;font:inherit;font-size:17px;padding:12px 14px;border-radius:11px;
  border:1px solid var(--line);background:var(--panel);color:var(--ink)}
.verdict{margin:18px 0 0;border-radius:var(--radius);padding:13px 15px;font-weight:650}
.verdict.good{background:var(--okbg);color:var(--ok)}
.verdict.bad{background:var(--badbg);color:var(--bad)}
.explain{margin:14px 0 0;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.explain section{padding:13px 15px;border-bottom:1px solid var(--line)}
.explain section:last-child{border-bottom:0}
.explain h5{margin:0 0 6px;font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim)}
.explain .how{white-space:pre-wrap;font-size:14.8px;line-height:1.66}
.explain .trap{background:var(--warnbg)}
.explain .trap h5{color:var(--warn)}
.navrow{display:flex;gap:10px;margin:20px 0 0;align-items:center;flex-wrap:wrap}
.summary{max-width:620px;margin:8vh auto 0;text-align:center}
.summary .big{font-size:56px;font-weight:800;letter-spacing:-.03em;line-height:1;margin:0 0 6px;
  font-variant-numeric:tabular-nums}
.summary .verdictline{font-size:17px;font-weight:650;margin:0 0 6px}
.summary p.note{color:var(--dim);margin:0 0 24px}
.missed{text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
  padding:6px 0;margin:0 0 20px;max-height:40vh;overflow-y:auto}
.missed div{padding:9px 15px;border-bottom:1px solid var(--line);font-size:14.5px}
.missed div:last-child{border-bottom:0}
.missed b{color:var(--bad)}

.setup{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:0 0 16px}
.setup label{font-size:13px;color:var(--dim);font-weight:650}
.setup select{font:inherit;font-size:14px;padding:8px 10px;border-radius:9px;border:1px solid var(--line);
  background:var(--panel);color:var(--ink)}

footer{max-width:940px;margin:0 auto;padding:26px 16px calc(40px + var(--safe-b));
  border-top:1px solid var(--line);color:var(--dim);font-size:13.5px}

@media print{
  header.top,nav.tabs,.drillbar,.modal{display:none!important}
  section.chapter{display:block!important;page-break-after:always}
  body{background:#fff;color:#000;font-size:11pt}
  .tablewrap,blockquote{break-inside:avoid}
}
</style>
</head>
<body>

<header class="top">
  <div class="bar">
    <h1>GED Study Guide</h1>
    <span class="sub">__QCOUNT__ worked practice questions &middot; pass mark 145</span>
  </div>
  <nav class="tabs" role="tablist">__NAV__</nav>
</header>

<main>__CHAPTERS__</main>

<footer>
  <p>Built __BUILT__. Every practice answer here was worked a second time by an independent
  checker, but the only scores that count come from <a href="https://ged.com" target="_blank" rel="noopener">ged.com</a>
  &mdash; confirm price, eligibility and scheduling for your own state there.</p>
  <p>Your drill history is saved in this browser only. Nothing is uploaded.</p>
</footer>

<div class="modal" id="drill" hidden>
  <header>
    <button class="btn ghost" id="d-quit" style="padding:7px 13px;font-size:14px">&larr; Back</button>
    <span class="who" id="d-who"></span>
    <span class="score" id="d-score"></span>
  </header>
  <div class="progress"><i id="d-prog" style="width:0"></i></div>
  <div class="body" id="d-body"></div>
</div>

<script type="application/json" id="bank">__BANK__</script>
<script>
(function(){
"use strict";
var BANK = JSON.parse(document.getElementById('bank').textContent);
var LS = 'ged-drill-v1';

function store(){ try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch(e){ return {}; } }
function save(o){ try { localStorage.setItem(LS, JSON.stringify(o)); } catch(e){} }

/* ---------- tabs ---------- */
var tabs = [].slice.call(document.querySelectorAll('nav.tabs button'));
var panes = [].slice.call(document.querySelectorAll('section.chapter'));
function show(key, push){
  tabs.forEach(function(t){ t.setAttribute('aria-selected', String(t.dataset.key === key)); });
  panes.forEach(function(p){ p.hidden = p.dataset.key !== key; });
  if (push !== false && location.hash.slice(1).split('/')[0] !== key) history.replaceState(null,'','#'+key);
  window.scrollTo(0,0);
}
tabs.forEach(function(t){ t.addEventListener('click', function(){ show(t.dataset.key); }); });

/* ---------- drill engine ---------- */
var modal = document.getElementById('drill');
var body = document.getElementById('d-body');
var who = document.getElementById('d-who');
var scoreEl = document.getElementById('d-score');
var prog = document.getElementById('d-prog');
var run = null;

function shuffle(a){
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--){
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function esc(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function letterOf(c){ var m = /^([A-Z])[.)]/.exec(c.trim()); return m ? m[1] : null; }
function norm(s){ return String(s).trim().toLowerCase().replace(/[\s,$]/g,'').replace(/^\+/,''); }

function start(key, opts){
  opts = opts || {};
  var pool = BANK.filter(function(q){ return key === 'all' || q.subject === key; });
  if (opts.only) pool = pool.filter(function(q){ return opts.only.indexOf(q.id) >= 0; });
  if (opts.topic && opts.topic !== 'all') pool = pool.filter(function(q){ return q.topic === opts.topic; });
  if (opts.diff && opts.diff !== 'all') pool = pool.filter(function(q){ return q.difficulty === opts.diff; });
  if (!pool.length) { alert('No questions match that filter.'); return; }
  pool = shuffle(pool);
  if (opts.limit && opts.limit < pool.length) pool = pool.slice(0, opts.limit);
  run = { qs: pool, i: 0, right: 0, missed: [], label: opts.label || 'Practice', key: key };
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  render();
}
function quit(){
  modal.hidden = true;
  document.body.style.overflow = '';
  run = null;
}
document.getElementById('d-quit').addEventListener('click', quit);
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !modal.hidden) quit(); });

function render(){
  var q = run.qs[run.i];
  who.textContent = run.label;
  scoreEl.textContent = (run.i + 1) + ' / ' + run.qs.length + '  ·  ' + run.right + ' right';
  prog.style.width = (run.i / run.qs.length * 100) + '%';

  var h = '<div class="qwrap">';
  h += '<div class="meta"><span class="chip">' + esc(q.subjectLabel) + '</span>' +
       '<span class="chip">' + esc(q.topic) + '</span>' +
       '<span class="chip ' + esc(q.difficulty) + '">' + esc(q.difficulty) + '</span></div>';
  if (q.stimulus && q.stimulus.trim()) h += '<div class="stimulus">' + esc(q.stimulus) + '</div>';
  h += '<p class="qtext">' + esc(q.question) + '</p>';
  if (q.choices && q.choices.length){
    h += '<div class="choices">';
    q.choices.forEach(function(c, idx){
      var k = letterOf(c) || String.fromCharCode(65 + idx);
      var text = c.replace(/^[A-Z][.)]\s*/, '');
      h += '<button class="choice" data-k="' + k + '"><span class="k">' + k + '</span><span>' + esc(text) + '</span></button>';
    });
    h += '</div>';
  } else {
    h += '<div class="numeric"><input id="d-input" inputmode="decimal" autocomplete="off" placeholder="Type your answer">' +
         '<button class="btn" id="d-check">Check</button></div>';
  }
  h += '<div id="d-after"></div></div>';
  body.innerHTML = h;
  body.scrollTop = 0;

  [].slice.call(body.querySelectorAll('.choice')).forEach(function(b){
    b.addEventListener('click', function(){ answer(b.dataset.k, b); });
  });
  var chk = document.getElementById('d-check');
  if (chk){
    var inp = document.getElementById('d-input');
    chk.addEventListener('click', function(){ answer(inp.value, null); });
    inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') answer(inp.value, null); });
    inp.focus();
  }
}

function answer(given, btn){
  var q = run.qs[run.i];
  var correctKey = String(q.answer).trim();
  var ok;
  if (q.choices && q.choices.length){
    ok = String(given).toUpperCase() === correctKey.toUpperCase().charAt(0);
    [].slice.call(body.querySelectorAll('.choice')).forEach(function(b){
      b.disabled = true;
      if (b.dataset.k === correctKey.toUpperCase().charAt(0)) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });
  } else {
    ok = norm(given) === norm(correctKey);
    var inp = document.getElementById('d-input');
    if (inp) inp.disabled = true;
    var chk = document.getElementById('d-check');
    if (chk) chk.disabled = true;
  }
  if (ok) run.right++; else run.missed.push(q);
  scoreEl.textContent = (run.i + 1) + ' / ' + run.qs.length + '  \u00b7  ' + run.right + ' right';

  var db = store();
  db[q.id] = { ok: ok, at: Date.now() };
  save(db);

  var full = (q.choices && q.choices.length)
    ? (q.choices.filter(function(c){ return letterOf(c) === correctKey.toUpperCase().charAt(0); })[0] || correctKey)
    : correctKey;

  var h = '<div class="verdict ' + (ok ? 'good' : 'bad') + '">' +
          (ok ? '✓ Correct.' : '✗ Not this time. The answer is ' + esc(full)) + '</div>';
  h += '<div class="explain">';
  h += '<section><h5>Why</h5><div>' + esc(q.why) + '</div></section>';
  h += '<section><h5>How to find it on test day</h5><div class="how">' + esc(q.howToFind) + '</div></section>';
  if (q.trap) h += '<section class="trap"><h5>The trap</h5><div>' + esc(q.trap) + '</div></section>';
  h += '</div>';
  h += '<div class="navrow"><button class="btn" id="d-next">' +
       (run.i + 1 < run.qs.length ? 'Next question →' : 'See results') + '</button>' +
       '<button class="btn ghost" id="d-skip">Quit</button></div>';
  document.getElementById('d-after').innerHTML = h;
  document.getElementById('d-next').addEventListener('click', next);
  document.getElementById('d-skip').addEventListener('click', quit);
  document.getElementById('d-next').scrollIntoView({block:'nearest', behavior:'smooth'});
}

function next(){
  run.i++;
  if (run.i >= run.qs.length) finish(); else render();
}

function finish(){
  var pct = Math.round(run.right / run.qs.length * 100);
  prog.style.width = '100%';
  scoreEl.textContent = run.right + ' / ' + run.qs.length;
  var verdict, note;
  if (pct >= 75){ verdict = 'On track to pass.'; note = 'Hold this and keep drilling the topics you missed.'; }
  else if (pct >= 60){ verdict = 'Close.'; note = 'Roughly the 145 borderline. The misses below are exactly what to study next.'; }
  else { verdict = 'Not yet.'; note = 'Read the chapter for the topics below, then drill them again. This is fixable in days, not months.'; }

  var h = '<div class="summary"><p class="big">' + pct + '%</p>' +
          '<p class="verdictline">' + verdict + '</p>' +
          '<p class="note">' + run.right + ' of ' + run.qs.length + ' correct. ' + note + '</p>';
  if (run.missed.length){
    h += '<div class="missed">';
    run.missed.forEach(function(q){
      h += '<div><b>' + esc(q.topic) + '</b> &mdash; ' + esc(q.question.slice(0, 110)) +
           (q.question.length > 110 ? '…' : '') + '</div>';
    });
    h += '</div>';
    h += '<button class="btn" id="d-again">Drill the ' + run.missed.length + ' I missed</button> ';
  }
  h += '<button class="btn ghost" id="d-done">Done</button></div>';
  body.innerHTML = h;
  body.scrollTop = 0;
  var again = document.getElementById('d-again');
  if (again){
    var ids = run.missed.map(function(q){ return q.id; });
    var key = run.key, label = run.label;
    again.addEventListener('click', function(){ start(key, { only: ids, label: label + ' — misses' }); });
  }
  document.getElementById('d-done').addEventListener('click', quit);
}

/* ---------- wire up the per-chapter drill bars ---------- */
[].slice.call(document.querySelectorAll('[data-drill]')).forEach(function(el){
  el.addEventListener('click', function(){
    var key = el.dataset.drill;
    var wrap = el.closest('.drillbar');
    var topic = wrap ? wrap.querySelector('[data-topic]') : null;
    var diff = wrap ? wrap.querySelector('[data-diff]') : null;
    var lim = wrap ? wrap.querySelector('[data-limit]') : null;
    start(key, {
      label: el.dataset.label || 'Practice',
      topic: topic ? topic.value : 'all',
      diff: diff ? diff.value : 'all',
      limit: lim ? parseInt(lim.value, 10) || 0 : 0
    });
  });
});

/* ---------- open on the right tab ---------- */
var want = location.hash.slice(1).split('/')[0];
show(tabs.some(function(t){ return t.dataset.key === want; }) ? want : tabs[0].dataset.key, false);
window.addEventListener('hashchange', function(){
  var k = location.hash.slice(1).split('/')[0];
  if (tabs.some(function(t){ return t.dataset.key === k; })) show(k, false);
});
})();
</script>
</body>
</html>
"""


# --------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------

def load_questions(key, label):
    path = SRC / f"{key}-questions.json"
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        sys.exit(f"!! {path.name} is not valid JSON: {exc}")
    out = []
    for idx, q in enumerate(data):
        missing = [f for f in ("question", "answer", "why", "howToFind") if not q.get(f)]
        if missing:
            print(f"   ~ skipped {key}[{idx}] (missing {', '.join(missing)})")
            continue
        out.append(
            {
                "id": q.get("id") or f"{key.upper()}-{idx:03d}",
                "subject": key,
                "subjectLabel": label,
                "topic": q.get("topic", "General"),
                "difficulty": (q.get("difficulty") or "medium").lower(),
                "stimulus": q.get("stimulus", "") or "",
                "question": q["question"],
                "choices": q.get("choices") or [],
                "answer": str(q["answer"]),
                "why": q["why"],
                "howToFind": q["howToFind"],
                "trap": q.get("trap", "") or "",
            }
        )
    return out


def drillbar(key, label, questions):
    if not questions:
        return ""
    topics = sorted({q["topic"] for q in questions})
    opts = "".join(f'<option value="{html.escape(t, True)}">{html.escape(t)}</option>' for t in topics)
    sizes = [n for n in (10, 20, 30, 50) if n < len(questions)]
    size_opts = "".join(f'<option value="{n}">{n} questions</option>' for n in sizes)
    size_opts += f'<option value="0">All {len(questions)}</option>'
    return f"""<div class="drillbar">
  <button class="btn" data-drill="{key}" data-label="{html.escape(label, True)}">Drill this subject</button>
  <select data-topic aria-label="Topic"><option value="all">Every topic</option>{opts}</select>
  <select data-diff aria-label="Difficulty"><option value="all">Any difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
  <select data-limit aria-label="How many">{size_opts}</select>
  <span class="count">{len(questions)} in the bank</span>
</div>"""


def main():
    if not SRC.exists():
        sys.exit(f"!! no sources at {SRC}")

    nav, chapters, bank, md_parts = [], [], [], []
    md_parts.append(
        "# GED Study Guide\n\n"
        "Everything on all four GED tests, the cheat sheets, a bank of worked practice questions, "
        "and the method for finding the answer to anything they ask.\n\n"
        "**The interactive version, with the drillable question bank, is at "
        "[`ged/index.html`](../ged/index.html)** "
        "(live: <https://hundostacksgit-svg.github.io/apextune-updates/ged/>).\n\n"
        "Pass mark is **145 on each subject, out of 100-200**. There is no averaging: "
        "165 on three and 140 on the fourth is not a pass.\n"
    )

    for key, label, sub in CHAPTERS:
        md_path = SRC / f"{key}-guide.md"
        if not md_path.exists():
            print(f"   ~ no {md_path.name}, skipping chapter")
            continue
        raw = md_path.read_text(encoding="utf-8").strip()
        prose, toc = md_to_html(raw, key)
        qs = load_questions(key, label)
        bank.extend(qs)

        nav.append(
            f'<button role="tab" data-key="{key}" aria-selected="false">{html.escape(label)}</button>'
        )
        toc_html = ""
        if len(toc) > 2:
            items = "".join(f'<li><a href="#{a}">{html.escape(t)}</a></li>' for a, t in toc)
            toc_html = f'<div class="toc"><b>In this chapter</b><ol>{items}</ol></div>'

        chapters.append(
            f'<section class="chapter" data-key="{key}" hidden>'
            f'<div class="chaphead"><h2 class="title">{html.escape(label)}</h2>'
            f'<p class="sub">{html.escape(sub)}</p></div>'
            f"{toc_html}"
            f'<div class="prose">{prose}</div>'
            f"{drillbar(key, label, qs)}"
            f"</section>"
        )

        md_parts.append(f"\n\n---\n\n# {label}\n\n*{sub}*\n\n{raw}\n")
        if qs:
            md_parts.append(
                f"\n### Practice bank\n\n{len(qs)} questions for this subject live in "
                f"[`ged/src/{key}-questions.json`](../ged/src/{key}-questions.json) and are "
                f"drillable in the interactive guide.\n"
            )
        print(f"   ✓ {label}: {len(raw.split()):,} words, {len(qs)} questions")

    if not chapters:
        sys.exit("!! nothing to build")

    OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    page = (
        PAGE.replace("__NAV__", "".join(nav))
        .replace("__CHAPTERS__", "\n".join(chapters))
        .replace("__BANK__", json.dumps(bank, ensure_ascii=False).replace("</", "<\\/"))
        .replace("__QCOUNT__", str(len(bank)))
        .replace("__BUILT__", "from the sources in ged/src/")
    )
    OUT_HTML.write_text(page, encoding="utf-8")

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text("".join(md_parts), encoding="utf-8")

    print(f"\n   {OUT_HTML.relative_to(ROOT)}  {len(page)/1024:.0f} KB, {len(bank)} questions")
    print(f"   {OUT_MD.relative_to(ROOT)}  {len(''.join(md_parts))/1024:.0f} KB")


if __name__ == "__main__":
    main()
