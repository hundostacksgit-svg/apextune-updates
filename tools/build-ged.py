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
_BOLD = re.compile(r"\*\*(.+?)\*\*")   # non-greedy so **bold with *italic* inside** works
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

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
    "family=Archivo:wght@500;600;700&"
    "family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&"
    "family=IBM+Plex+Mono:wght@500&display=swap\">"
)

STYLE = r"""<style>
/* Exam blue-book: cool paper, flat indigo, semantics kept separate from the accent. */
:root{
  --paper:#f6f7f9; --panel:#fff; --sunk:#eef0f4;
  --ink:#131820; --dim:#5a6472; --faint:#8b93a1; --line:#dfe3ea;
  --accent:#2d4ea8; --accent-ink:#fff; --accent-soft:#e8edf9;
  --ok:#0f7a4a; --ok-bg:#e6f4ec; --bad:#b3261e; --bad-bg:#fceceb;
  --warn:#8a5a00; --warn-bg:#fdf4e3;
  --display:'Archivo',system-ui,-apple-system,'Segoe UI',sans-serif;
  --body:'Source Serif 4',Georgia,'Times New Roman',serif;
  --mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  --r:10px;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --paper:#0f1218; --panel:#171c24; --sunk:#12161d;
    --ink:#e6e9ee; --dim:#98a2b3; --faint:#6b7585; --line:#262d38;
    --accent:#7d9cf0; --accent-ink:#0c1220; --accent-soft:#1a2235;
    --ok:#4ec98a; --ok-bg:#11291e; --bad:#ff8f84; --bad-bg:#2b1513;
    --warn:#e0b341; --warn-bg:#271f10;
  }
}
:root[data-theme="dark"]{
  --paper:#0f1218; --panel:#171c24; --sunk:#12161d;
  --ink:#e6e9ee; --dim:#98a2b3; --faint:#6b7585; --line:#262d38;
  --accent:#7d9cf0; --accent-ink:#0c1220; --accent-soft:#1a2235;
  --ok:#4ec98a; --ok-bg:#11291e; --bad:#ff8f84; --bad-bg:#2b1513;
  --warn:#e0b341; --warn-bg:#271f10;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);
  font:400 17px/1.66 var(--body);
  padding-bottom:calc(30px + env(safe-area-inset-bottom,0px))}
img{max-width:100%}
[hidden]{display:none!important}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
code,.mono{font-family:var(--mono);font-size:.86em}
code{background:var(--sunk);padding:.14em .4em;border-radius:5px;border:1px solid var(--line)}

/* ---- masthead ---- */
header.top{position:sticky;top:env(safe-area-inset-top,0px);z-index:20;
  background:color-mix(in srgb,var(--paper) 93%,transparent);
  backdrop-filter:saturate(1.6) blur(10px);border-bottom:1px solid var(--line)}
.bar{max-width:1000px;margin:0 auto;padding:11px 20px 0;
  display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.bar h1{font:700 17px/1.2 var(--display);margin:0;letter-spacing:-.015em}
.bar .band{font-family:var(--mono);font-size:11.5px;color:var(--dim);
  border:1px solid var(--line);border-radius:999px;padding:3px 9px;background:var(--panel)}
nav.tabs{max-width:1000px;margin:0 auto;padding:9px 12px 0;display:flex;gap:1px;
  overflow-x:auto;scrollbar-width:none}
nav.tabs::-webkit-scrollbar{display:none}
nav.tabs button{flex:0 0 auto;background:none;border:0;border-bottom:2px solid transparent;
  color:var(--dim);font:600 13.5px/1 var(--display);letter-spacing:.01em;
  padding:9px 13px 10px;cursor:pointer;white-space:nowrap;border-radius:7px 7px 0 0}
nav.tabs button:hover{color:var(--ink);background:var(--sunk)}
nav.tabs button[aria-selected=true]{color:var(--accent);border-bottom-color:var(--accent)}

main{max-width:1000px;margin:0 auto;padding:0 20px}
section.chapter{padding:26px 0 64px}
.chaphead{max-width:68ch}
.chaphead .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--faint);margin:0 0 7px}
.chaphead h2.title{font:700 clamp(29px,6vw,40px)/1.08 var(--display);
  margin:0 0 .18em;letter-spacing:-.028em;text-wrap:balance}
.chaphead p.sub{color:var(--dim);margin:0 0 22px;font-size:17.5px;line-height:1.5}

.toc{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);
  padding:14px 17px;margin:0 0 30px;max-width:68ch}
.toc b{font-family:var(--mono);font-size:10.5px;letter-spacing:.13em;
  text-transform:uppercase;color:var(--faint);font-weight:500}
.toc ol{margin:9px 0 0;padding-left:0;list-style:none;counter-reset:t;
  columns:2;column-gap:26px}
@media(max-width:640px){.toc ol{columns:1}}
.toc li{margin:4px 0;counter-increment:t;break-inside:avoid;
  font-family:var(--display);font-size:14px}
.toc li::before{content:counter(t,decimal-leading-zero);font-family:var(--mono);
  font-size:10.5px;color:var(--faint);margin-right:9px}
.toc a{text-decoration:none;color:var(--ink)}
.toc a:hover{color:var(--accent);text-decoration:underline}

/* ---- long-form prose ---- */
.prose{max-width:68ch;overflow-wrap:break-word}
.prose code,.prose a{overflow-wrap:anywhere;word-break:break-word}
.prose h2{font:600 25px/1.2 var(--display);letter-spacing:-.02em;
  margin:2.3em 0 .55em;padding-top:1.1em;border-top:1px solid var(--line);
  scroll-margin-top:120px;text-wrap:balance}
.prose h2:first-child{border-top:0;padding-top:0;margin-top:.3em}
.prose h3{font:600 18.5px/1.3 var(--display);margin:1.9em 0 .45em;
  scroll-margin-top:120px;letter-spacing:-.01em}
.prose h4{font:500 12px/1.4 var(--mono);margin:1.5em 0 .35em;color:var(--faint);
  text-transform:uppercase;letter-spacing:.12em}
.prose p{margin:.85em 0}
.prose ul,.prose ol{margin:.75em 0;padding-left:26px}
.prose li{margin:.38em 0}
.prose li>ul,.prose li>ol{margin:.3em 0}
.prose strong{font-weight:600;color:var(--ink)}
.prose blockquote{margin:1.25em 0;padding:.85em 18px;background:var(--accent-soft);
  border-left:3px solid var(--accent);border-radius:0 var(--r) var(--r) 0}
.prose blockquote p:first-child{margin-top:0}
.prose blockquote p:last-child{margin-bottom:0}
.prose hr{border:0;border-top:1px solid var(--line);margin:2em 0}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;width:100%;
  margin:1.3em 0;border:1px solid var(--line);border-radius:var(--r);background:var(--panel)}
table{border-collapse:collapse;width:100%;min-width:0;
  font:400 15px/1.5 var(--display);font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);
  vertical-align:top;min-width:74px}
th{background:var(--sunk);font:500 10.5px/1.4 var(--mono);text-transform:uppercase;
  letter-spacing:.11em;color:var(--dim)}
tbody tr:last-child td{border-bottom:0}

/* ---- buttons ---- */
.btn{display:inline-flex;align-items:center;gap:7px;background:var(--accent);
  color:var(--accent-ink);border:1px solid transparent;border-radius:9px;
  font:600 14.5px/1 var(--display);padding:12px 18px;cursor:pointer}
.btn:hover{filter:brightness(1.09)}
.btn.ghost{background:var(--panel);color:var(--ink);border-color:var(--line)}
.btn.ghost:hover{background:var(--sunk);filter:none}
.btn:disabled{opacity:.45;cursor:default}

.drillbar{position:sticky;bottom:0;z-index:15;margin:34px -20px 0;
  padding:13px 20px calc(13px + env(safe-area-inset-bottom,0px));
  background:color-mix(in srgb,var(--paper) 93%,transparent);
  backdrop-filter:saturate(1.6) blur(10px);border-top:1px solid var(--line);
  display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.drillbar select{font:500 13.5px/1 var(--display);padding:10px 11px;border-radius:9px;
  border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer}
.drillbar .count{font-family:var(--mono);font-size:12px;color:var(--faint)}
</style>"""

DRILL_STYLE = r"""<style>
/* ---- drill: styled like an exam screen ---- */
.modal{position:fixed;inset:0;z-index:50;background:var(--paper);display:flex;flex-direction:column}
.modal header{border-bottom:1px solid var(--line);background:var(--panel);
  padding:calc(11px + env(safe-area-inset-top,0px)) 16px 11px;
  display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.modal header .who{font:600 15px/1 var(--display)}
.modal header .score{margin-left:auto;font-family:var(--mono);font-size:12.5px;
  color:var(--dim);font-variant-numeric:tabular-nums}
.progress{height:3px;background:var(--line)}
.progress i{display:block;height:100%;background:var(--accent);transition:width .25s ease}
.modal .body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;
  padding:20px 16px calc(34px + env(safe-area-inset-bottom,0px))}
.qwrap{max-width:66ch;margin:0 auto}
.meta{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 14px}
.chip{font:500 10.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.1em;
  color:var(--dim);border:1px solid var(--line);border-radius:999px;
  padding:5px 10px;background:var(--panel)}
.chip.hard{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 38%,var(--line))}
.chip.medium{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 38%,var(--line))}
.chip.easy{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 38%,var(--line))}
.stimulus{background:var(--panel);border:1px solid var(--line);
  border-left:3px solid var(--accent);border-radius:0 var(--r) var(--r) 0;
  padding:15px 17px;margin:0 0 18px;white-space:pre-wrap;
  font:400 15.5px/1.62 var(--body);max-height:42vh;overflow-y:auto;
  overflow-wrap:anywhere;word-break:break-word}
.qtext{font:600 19.5px/1.38 var(--display);letter-spacing:-.012em;margin:0 0 18px;text-wrap:balance}
.choices{display:flex;flex-direction:column;gap:9px}
.choice{display:flex;gap:12px;align-items:flex-start;text-align:left;width:100%;
  background:var(--panel);border:1px solid var(--line);border-radius:10px;
  padding:13px 15px;font:400 16px/1.46 var(--body);color:var(--ink);cursor:pointer}
.choice:hover:not(:disabled){border-color:var(--accent);background:var(--accent-soft)}
.choice .k{flex:0 0 23px;height:23px;border-radius:6px;background:var(--sunk);
  border:1px solid var(--line);display:grid;place-items:center;
  font:500 11.5px/1 var(--mono);margin-top:1px}
.choice.correct{border-color:var(--ok);background:var(--ok-bg)}
.choice.correct .k{background:var(--ok);color:#fff;border-color:var(--ok)}
.choice.wrong{border-color:var(--bad);background:var(--bad-bg)}
.choice.wrong .k{background:var(--bad);color:#fff;border-color:var(--bad)}
.choice:disabled{cursor:default;opacity:1}
.numeric{display:flex;gap:9px;flex-wrap:wrap}
.numeric input{flex:1 1 180px;font:500 18px/1 var(--mono);padding:13px 15px;
  border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink)}
.verdict{margin:20px 0 0;border-radius:var(--r);padding:13px 16px;
  font:600 15.5px/1.4 var(--display)}
.verdict.good{background:var(--ok-bg);color:var(--ok)}
.verdict.bad{background:var(--bad-bg);color:var(--bad)}
.explain{margin:15px 0 0;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--r);overflow:hidden}
.explain section{padding:14px 16px;border-bottom:1px solid var(--line)}
.explain section:last-child{border-bottom:0}
.explain h5{margin:0 0 7px;font:500 10.5px/1 var(--mono);text-transform:uppercase;
  letter-spacing:.12em;color:var(--faint)}
.explain div{font:400 15.5px/1.62 var(--body);overflow-wrap:anywhere}
.explain .how{white-space:pre-wrap;line-height:1.72}
.explain .trap{background:var(--warn-bg)}
.explain .trap h5{color:var(--warn)}
.navrow{display:flex;gap:10px;margin:22px 0 0;align-items:center;flex-wrap:wrap}
.summary{max-width:60ch;margin:7vh auto 0;text-align:center}
.summary .big{font:700 62px/1 var(--display);letter-spacing:-.04em;margin:0 0 8px;
  font-variant-numeric:tabular-nums}
.summary .verdictline{font:600 18px/1.3 var(--display);margin:0 0 8px}
.summary p.note{color:var(--dim);margin:0 0 26px;font-size:16px}
.missed{text-align:left;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--r);margin:0 0 22px;max-height:38vh;overflow-y:auto}
.missed div{padding:11px 16px;border-bottom:1px solid var(--line);font-size:15px}
.missed div:last-child{border-bottom:0}
.missed b{font-family:var(--display);font-size:13px;color:var(--bad);
  display:block;margin-bottom:2px}

footer{max-width:1000px;margin:0 auto;
  padding:28px 20px calc(44px + env(safe-area-inset-bottom,0px));
  border-top:1px solid var(--line);color:var(--dim);font-size:15px;max-width:74ch}
footer p{margin:.6em 0}

@media print{
  header.top,nav.tabs,.drillbar,.modal{display:none!important}
  section.chapter{display:block!important;page-break-after:always}
  body{background:#fff;color:#000;font-size:10.5pt}
  .tablewrap,blockquote{break-inside:avoid}
}
</style>"""

BODY = r"""
<header class="top">
  <div class="bar">
    <h1>GED Study Guide</h1>
    <span class="band">__QCOUNT__ worked questions &middot; pass = 145</span>
  </div>
  <nav class="tabs" role="tablist">__NAV__</nav>
</header>

<main>__CHAPTERS__</main>

<footer>
  <p>Every practice answer here was worked a second time by an independent checker, and a
  sample from each subject verified by hand. The only scores that count come from
  <a href="https://ged.com" target="_blank" rel="noopener">ged.com</a> &mdash; confirm price,
  eligibility and scheduling for New Jersey there before you pay. The checkout screen is the
  only price that binds.</p>
  <p>Your drill history is saved in this browser only. Nothing is uploaded.</p>
</footer>

<div class="modal" id="drill" hidden>
  <header>
    <button class="btn ghost" id="d-quit" style="padding:8px 13px;font-size:13.5px">&larr; Back</button>
    <span class="who" id="d-who"></span>
    <span class="score" id="d-score"></span>
  </header>
  <div class="progress"><i id="d-prog" style="width:0"></i></div>
  <div class="body" id="d-body"></div>
</div>

<script type="application/json" id="bank">__BANK__</script>
"""

SCRIPT = r"""
<script>
(function(){
"use strict";
var BANK = JSON.parse(document.getElementById('bank').textContent);
var LS = 'ged-drill-v1';
function store(){ try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch(e){ return {}; } }
function save(o){ try { localStorage.setItem(LS, JSON.stringify(o)); } catch(e){} }

var tabs = [].slice.call(document.querySelectorAll('nav.tabs button'));
var panes = [].slice.call(document.querySelectorAll('section.chapter'));
function show(key, push){
  tabs.forEach(function(t){ t.setAttribute('aria-selected', String(t.dataset.key === key)); });
  panes.forEach(function(p){ p.hidden = p.dataset.key !== key; });
  if (push !== false) { try { history.replaceState(null,'','#'+key); } catch(e){} }
  window.scrollTo(0,0);
}
tabs.forEach(function(t){ t.addEventListener('click', function(){ show(t.dataset.key); }); });

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
function letterOf(c){ var m = /^([A-Z])[.)]/.exec(String(c).trim()); return m ? m[1] : null; }
function norm(s){ return String(s).trim().toLowerCase().replace(/[\s,$]/g,'').replace(/^\+/,''); }
function tally(){
  return (run.i + 1) + ' / ' + run.qs.length + '  ·  ' + run.right + ' right';
}

function start(key, opts){
  opts = opts || {};
  var pool = BANK.filter(function(q){ return key === 'all' || q.subject === key; });
  if (opts.only) pool = pool.filter(function(q){ return opts.only.indexOf(q.id) >= 0; });
  if (opts.topic && opts.topic !== 'all') pool = pool.filter(function(q){ return q.topic === opts.topic; });
  if (opts.diff && opts.diff !== 'all') pool = pool.filter(function(q){ return q.difficulty === opts.diff; });
  if (!pool.length) return;
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
  scoreEl.textContent = tally();
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
      var text = String(c).replace(/^[A-Z][.)]\s*/, '');
      h += '<button class="choice" data-k="' + k + '"><span class="k">' + k +
           '</span><span>' + esc(text) + '</span></button>';
    });
    h += '</div>';
  } else {
    h += '<div class="numeric"><input id="d-input" inputmode="decimal" autocomplete="off" ' +
         'placeholder="Type your answer"><button class="btn" id="d-check">Check</button></div>';
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
  }
}

function answer(given, btn){
  var q = run.qs[run.i];
  var key = String(q.answer).trim();
  var ok;
  if (q.choices && q.choices.length){
    ok = String(given).toUpperCase() === key.toUpperCase().charAt(0);
    [].slice.call(body.querySelectorAll('.choice')).forEach(function(b){
      b.disabled = true;
      if (b.dataset.k === key.toUpperCase().charAt(0)) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });
  } else {
    ok = norm(given) === norm(key);
    var inp = document.getElementById('d-input');
    if (inp) inp.disabled = true;
    var chk = document.getElementById('d-check');
    if (chk) chk.disabled = true;
  }
  if (ok) run.right++; else run.missed.push(q);
  scoreEl.textContent = tally();

  var db = store();
  db[q.id] = { ok: ok };
  save(db);

  var full = (q.choices && q.choices.length)
    ? (q.choices.filter(function(c){ return letterOf(c) === key.toUpperCase().charAt(0); })[0] || key)
    : key;

  var h = '<div class="verdict ' + (ok ? 'good' : 'bad') + '">' +
          (ok ? '✓ Correct.' : '✗ Not this time — the answer is ' + esc(full)) + '</div>';
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
  if (pct >= 75){ verdict = 'On track to pass.'; note = 'Hold this, and keep drilling whatever you missed.'; }
  else if (pct >= 60){ verdict = 'Close.'; note = 'Roughly the 145 borderline. The misses below are exactly what to study next.'; }
  else { verdict = 'Not yet.'; note = 'Read the chapter for the topics below, then drill them again. This is fixable in days, not months.'; }

  var h = '<div class="summary"><p class="big">' + pct + '%</p>' +
          '<p class="verdictline">' + verdict + '</p>' +
          '<p class="note">' + run.right + ' of ' + run.qs.length + ' correct. ' + note + '</p>';
  if (run.missed.length){
    h += '<div class="missed">';
    run.missed.forEach(function(q){
      h += '<div><b>' + esc(q.topic) + '</b>' + esc(q.question.slice(0, 120)) +
           (q.question.length > 120 ? '…' : '') + '</div>';
    });
    h += '</div><button class="btn" id="d-again">Drill the ' + run.missed.length + ' I missed</button> ';
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

[].slice.call(document.querySelectorAll('[data-drill]')).forEach(function(el){
  el.addEventListener('click', function(){
    var wrap = el.closest('.drillbar');
    var topic = wrap ? wrap.querySelector('[data-topic]') : null;
    var diff = wrap ? wrap.querySelector('[data-diff]') : null;
    var lim = wrap ? wrap.querySelector('[data-limit]') : null;
    start(el.dataset.drill, {
      label: el.dataset.label || 'Practice',
      topic: topic ? topic.value : 'all',
      diff: diff ? diff.value : 'all',
      limit: lim ? parseInt(lim.value, 10) || 0 : 0
    });
  });
});

var want = (location.hash || '').slice(1).split('/')[0];
show(tabs.some(function(t){ return t.dataset.key === want; }) ? want : tabs[0].dataset.key, false);
window.addEventListener('hashchange', function(){
  var k = (location.hash || '').slice(1).split('/')[0];
  if (tabs.some(function(t){ return t.dataset.key === k; })) show(k, false);
});
})();
</script>
"""

TITLE = "Pass the GED First Try"
BLURB = ("Everything on all four GED tests, the cheat sheets, and __QCOUNT__ practice questions "
         "that each show how to find the answer — written for a New Jersey test taker.")


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
        out.append({
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
        })
    return out


def drillbar(key, label, questions):
    if not questions:
        return ""
    topics = sorted({q["topic"] for q in questions})
    opts = "".join(f'<option value="{html.escape(t, True)}">{html.escape(t)}</option>' for t in topics)
    sizes = [n for n in (10, 20, 30, 50) if n < len(questions)]
    size_opts = "".join(f'<option value="{n}">{n} questions</option>' for n in sizes)
    size_opts += f'<option value="0">All {len(questions)}</option>'
    return (
        '<div class="drillbar">'
        f'<button class="btn" data-drill="{key}" data-label="{html.escape(label, True)}">Drill this subject</button>'
        f'<select data-topic aria-label="Topic"><option value="all">Every topic</option>{opts}</select>'
        '<select data-diff aria-label="Difficulty"><option value="all">Any difficulty</option>'
        '<option value="easy">Easy</option><option value="medium">Medium</option>'
        '<option value="hard">Hard</option></select>'
        f'<select data-limit aria-label="How many">{size_opts}</select>'
        f'<span class="count">{len(questions)} in the bank</span>'
        "</div>"
    )


def assemble():
    nav, chapters, bank, md = [], [], [], []
    md.append(
        "# GED Study Guide\n\n"
        "Everything on all four GED tests, the cheat sheets, a bank of worked practice "
        "questions, and the method for finding the answer to anything they ask.\n\n"
        "Pass mark is **145 on each subject, out of 100-200**. There is no averaging: "
        "165 on three and 140 on the fourth is not a pass.\n"
    )
    for n, (key, label, sub) in enumerate(CHAPTERS, 1):
        md_path = SRC / f"{key}-guide.md"
        if not md_path.exists():
            print(f"   ~ no {md_path.name}, skipping chapter")
            continue
        raw = md_path.read_text(encoding="utf-8").strip()
        prose, toc = md_to_html(raw, key)
        qs = load_questions(key, label)
        bank.extend(qs)
        nav.append(f'<button role="tab" data-key="{key}" aria-selected="false">{html.escape(label)}</button>')
        toc_html = ""
        if len(toc) > 2:
            items = "".join(f'<li><a href="#{a}">{html.escape(t)}</a></li>' for a, t in toc)
            toc_html = f'<div class="toc"><b>In this chapter</b><ol>{items}</ol></div>'
        chapters.append(
            f'<section class="chapter" data-key="{key}" hidden>'
            f'<div class="chaphead"><p class="eyebrow">Chapter {n:02d}</p>'
            f'<h2 class="title">{html.escape(label)}</h2>'
            f'<p class="sub">{html.escape(sub)}</p></div>'
            f'{toc_html}<div class="prose">{prose}</div>'
            f"{drillbar(key, label, qs)}</section>"
        )
        md.append(f"\n\n---\n\n# {label}\n\n*{sub}*\n\n{raw}\n")
        print(f"   ✓ {label}: {len(raw.split()):,} words, {len(qs)} questions")

    if not chapters:
        sys.exit("!! nothing to build")

    content = (
        STYLE + DRILL_STYLE
        + BODY.replace("__NAV__", "".join(nav)).replace("__CHAPTERS__", "\n".join(chapters))
              .replace("__BANK__", json.dumps(bank, ensure_ascii=False).replace("</", "<\\/"))
        + SCRIPT
    ).replace("__QCOUNT__", str(len(bank)))
    return content, "".join(md), len(bank)


def main():
    if not SRC.exists():
        sys.exit(f"!! no sources at {SRC}")
    artifact_out = None
    if "--artifact" in sys.argv:
        artifact_out = pathlib.Path(sys.argv[sys.argv.index("--artifact") + 1])

    content, markdown, n = assemble()
    blurb = BLURB.replace("__QCOUNT__", str(n))

    # standalone: carries its own document shell
    OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUT_HTML.write_text(
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f"<title>{TITLE}</title>\n"
        f'<meta name="description" content="{html.escape(blurb, True)}">\n'
        '<meta name="color-scheme" content="light dark">\n'
        '<link rel="icon" href="data:image/svg+xml,'
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>"
        "<text y='.9em' font-size='90'>&#127891;</text></svg>\">\n"
        f"{FONTS}\n</head>\n<body>\n{content}\n</body>\n</html>\n",
        encoding="utf-8",
    )

    # artifact: the publish skeleton supplies doctype, head and body
    if artifact_out:
        artifact_out.parent.mkdir(parents=True, exist_ok=True)
        artifact_out.write_text(f"<title>{TITLE}</title>\n{FONTS}\n{content}\n", encoding="utf-8")
        print(f"   {artifact_out}  {artifact_out.stat().st_size/1024:.0f} KB")

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text(markdown, encoding="utf-8")
    print(f"\n   {OUT_HTML.relative_to(ROOT)}  {OUT_HTML.stat().st_size/1024:.0f} KB, {n} questions")
    print(f"   {OUT_MD.relative_to(ROOT)}  {OUT_MD.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
