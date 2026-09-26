// OmniDx Browser: the web engine already in Windows (WebView2, the Chromium that Edge is built on) in a window of
// its own, with nothing else. No extensions, no sync, no shopping or sidebar, no start-up pages from anyone: the
// tabs, the address bar and the page. Trackers blocked at Strict, tabs you are not looking at put to sleep after
// five minutes, and all of them, the one you left open too, the moment Game Boost turns on (unless it is playing
// sound). The new tab page is a file on this PC: nothing loads until you ask for it.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace OmniDx
{
    static class BrowserProgram
    {
        public const string Pipe = "OmniDx.Browser";
        [STAThread]
        static void Main(string[] args)
        {
            Theme.Init();
            string url = args.FirstOrDefault(a => !a.StartsWith("--"));
            bool created;
            var one = new Mutex(true, @"Local\OmniDx.Browser", out created);
            if (!created)
            {
                // Already open: hand it the address (or ask for a new window's worth: a new tab).
                foreach (var p in Process.GetProcessesByName(Process.GetCurrentProcess().ProcessName))
                    if (p.Id != Process.GetCurrentProcess().Id) Native.AllowSetForegroundWindow(p.Id);
                try
                {
                    using (var c = new NamedPipeClientStream(".", Pipe, PipeDirection.Out))
                    {
                        c.Connect(3000);
                        var b = Encoding.UTF8.GetBytes(url ?? "");
                        c.Write(b, 0, b.Length);
                    }
                    return;
                }
                catch { }
            }
            Application.Run(new BrowserForm(url));
            GC.KeepAlive(one);
        }
    }

    class Tab
    {
        public WebView2 View;
        public string Title = "New tab", Url = "", Pending;
        public Image Icon;
        public bool Loading, Audio, Asleep, Muted;
        public DateTime HiddenAt = DateTime.Now;
        public Rectangle Box, CloseBox;
    }

    class BrowserForm : ChromeForm
    {
        CoreWebView2Environment env;
        readonly List<Tab> tabs = new List<Tab>();
        readonly Stack<string> closed = new Stack<string>();
        Tab active;
        readonly Panel host = new Panel();
        readonly TextBox address = new TextBox();
        readonly FlatButton back, fwd, reload, menuBtn, home;
        readonly ListBox suggest = new ListBox();
        readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer { Interval = 33 }, sleeper = new System.Windows.Forms.Timer { Interval = 20000 };
        readonly History history = new History();
        Rectangle plusBox, addressBox;
        int tabHover = -1, closeHover = -1, spin;
        bool fullscreen;
        FormWindowState beforeFull;
        const int ToolH = 46;
        static string Profile { get { return Path.Combine(Edition.Local, "Browser"); } }
        static string Pages { get { var d = Path.Combine(Profile, "pages"); Directory.CreateDirectory(d); return d; } }
        const string NewTabUrl = "https://newtab.omnidx/newtab.html";

        public BrowserForm(string first)
        {
            Text = "OmniDx Browser";
            Caption = Theme.S(42);
            Size = new Size(Theme.S(1360), Theme.S(860));
            MinimumSize = new Size(Theme.S(560), Theme.S(420));
            try { Icon = new Icon(Path.Combine(Edition.Dir, @"assets\browser.ico")); } catch { }
            KeyPreview = true;

            host.BackColor = Theme.Bg;
            Controls.Add(host);
            back = Glyph(G.Back, (s, e) => { if (Core != null && Core.CanGoBack) Core.GoBack(); });
            fwd = Glyph(G.Forward, (s, e) => { if (Core != null && Core.CanGoForward) Core.GoForward(); });
            reload = Glyph(G.Refresh, (s, e) => { if (Core == null) return; if (active.Loading) Core.Stop(); else Core.Reload(); });
            home = Glyph(G.Home, (s, e) => Go(NewTabUrl));
            menuBtn = Glyph(G.More, (s, e) => ShowMenu());

            address.BorderStyle = BorderStyle.None; address.BackColor = Theme.Surface2; address.ForeColor = Theme.Text; address.Font = Theme.UI(10.5f);
            address.KeyDown += AddressKey;
            address.GotFocus += (s, e) => BeginInvoke(new Action(() => address.SelectAll()));
            address.TextChanged += (s, e) => { if (address.Focused) Suggest(); };
            address.LostFocus += (s, e) => { if (!suggest.Focused) suggest.Visible = false; };
            Controls.Add(address);

            suggest.Visible = false; suggest.BorderStyle = BorderStyle.None; suggest.BackColor = Theme.Surface; suggest.ForeColor = Theme.Text;
            suggest.Font = Theme.UI(10f); suggest.DrawMode = DrawMode.OwnerDrawFixed; suggest.ItemHeight = Theme.S(34); suggest.IntegralHeight = false;
            suggest.DrawItem += DrawSuggestion;
            suggest.MouseClick += (s, e) => { var i = suggest.IndexFromPoint(e.Location); if (i >= 0) { Go(((string[])suggest.Items[i])[1]); suggest.Visible = false; } };
            Controls.Add(suggest);
            suggest.BringToFront();

            anim.Tick += (s, e) => { spin = (spin + 12) % 360; if (tabs.Any(t => t.Loading)) Invalidate(new Rectangle(0, 0, ClientSize.Width, Caption + Theme.S(ToolH))); else anim.Stop(); };
            sleeper.Tick += (s, e) => Sleep(false);
            sleeper.Start();
            WriteNewTab();
            Load += async (s, e) => await Init(first);
        }

        CoreWebView2 Core { get { return active != null && active.View != null ? active.View.CoreWebView2 : null; } }

        FlatButton Glyph(string glyph, EventHandler click)
        {
            var b = new FlatButton("", Look.Ghost) { Glyph = glyph, Size = new Size(Theme.S(36), Theme.S(34)) };
            b.Click += click; Controls.Add(b); return b;
        }

        async Task Init(string first)
        {
            try
            {
                Directory.CreateDirectory(Profile);
                var opts = new CoreWebView2EnvironmentOptions();
                env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Profile, "Data"), opts);
            }
            catch (Exception ex)
            {
                Edition.Log("browser: no WebView2 (" + ex.Message + ")");
                MessageBox.Show(this, "OmniDx Browser runs on Microsoft Edge WebView2, which is part of Windows 11 and every up-to-date Windows 10. It was not found on this PC: Windows Update, or Microsoft's WebView2 page, puts it back.", "OmniDx Browser", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Close(); return;
            }
            StartPipe();
            var restore = State.Flag("RestoreTabs", true) && first == null ? Session.Load() : new List<string>();
            if (first != null) await NewTab(Fix(first), true);
            else if (restore.Count > 0)
            {
                // The last session's tabs come back asleep; each one loads when you open it.
                for (int i = 0; i < restore.Count; i++)
                {
                    if (i == 0) await NewTab(restore[i], true);
                    else { var t = new Tab { Url = restore[i], Title = Pretty(restore[i]), Pending = restore[i], Asleep = true }; tabs.Add(t); }
                }
                Invalidate();
            }
            else await NewTab(NewTabUrl, true);
        }

        // ---------------------------------------------------------------- tabs
        async Task<Tab> NewTab(string url, bool activate)
        {
            var t = new Tab { Url = url, Title = url == NewTabUrl ? "New tab" : Pretty(url) };
            int at = active == null ? tabs.Count : tabs.IndexOf(active) + 1;
            tabs.Insert(Math.Min(at, tabs.Count), t);
            if (activate)
            {
                // The new tab is the open one at once, so what is typed next lands in its address bar, not in the
                // page before it, while its engine is still starting.
                Hide(active);
                active = t;
                Text = t.Title + " - OmniDx Browser";
                ShowAddress(); Buttons();
                if (url == NewTabUrl) address.Focus();
            }
            Invalidate();
            await Wake(t, url);
            if (activate && active == t) Show1(t);
            Invalidate();
            return t;
        }

        async Task Wake(Tab t, string url)
        {
            if (t.View != null) return;
            var v = new WebView2 { Dock = DockStyle.Fill, Visible = false, DefaultBackgroundColor = Theme.Bg };
            t.View = v;
            host.Controls.Add(v);
            await v.EnsureCoreWebView2Async(env);
            var c = v.CoreWebView2;
            c.Settings.IsStatusBarEnabled = true;
            c.Settings.AreDevToolsEnabled = true;
            c.Settings.IsPasswordAutosaveEnabled = true;
            c.Settings.IsGeneralAutofillEnabled = true;
            try { c.Profile.PreferredTrackingPreventionLevel = CoreWebView2TrackingPreventionLevel.Strict; } catch { }
            c.SetVirtualHostNameToFolderMapping("newtab.omnidx", Pages, CoreWebView2HostResourceAccessKind.Allow);
            c.DocumentTitleChanged += (s, e) => { t.Title = string.IsNullOrEmpty(c.DocumentTitle) ? Pretty(c.Source) : c.DocumentTitle; if (t.Url == NewTabUrl) t.Title = "New tab"; if (t == active) Text = t.Title + " - OmniDx Browser"; Invalidate(); };
            c.SourceChanged += (s, e) => { t.Url = c.Source; if (t == active && !address.Focused) ShowAddress(); };
            c.NavigationStarting += (s, e) => { t.Loading = true; anim.Start(); Invalidate(); };
            c.NavigationCompleted += (s, e) =>
            {
                t.Loading = false; Invalidate();
                if (t.Url == NewTabUrl) FillNewTab(c);
                else if (e.IsSuccess) history.Add(c.Source, c.DocumentTitle);
            };
            c.HistoryChanged += (s, e) => { if (t == active) Buttons(); };
            c.NewWindowRequested += async (s, e) =>
            {
                // Pop-ups and "open in new tab" become tabs here, not windows.
                var d = e.GetDeferral();
                e.Handled = true;
                try { await NewTab(e.Uri, true); } finally { d.Complete(); }
            };
            c.ContainsFullScreenElementChanged += (s, e) => { if (t == active) Full(c.ContainsFullScreenElement); };
            c.IsDocumentPlayingAudioChanged += (s, e) => { t.Audio = c.IsDocumentPlayingAudio; Invalidate(); };
            c.FaviconChanged += async (s, e) =>
            {
                try
                {
                    using (var st = await c.GetFaviconAsync(CoreWebView2FaviconImageFormat.Png))
                    {
                        if (st == null) return;
                        var ms = new MemoryStream(); st.CopyTo(ms); ms.Position = 0;
                        t.Icon = ms.Length > 0 ? Image.FromStream(ms) : null; Invalidate();
                    }
                }
                catch { }
            };
            c.WebMessageReceived += (s, e) =>
            {
                string msg = null; try { msg = e.TryGetWebMessageAsString(); } catch { }
                if (string.IsNullOrEmpty(msg)) return;
                // A shortcut pressed while the page had the keys.
                if (msg.StartsWith(KeyTag)) { int kv; if (t == active && int.TryParse(msg.Substring(KeyTag.Length), out kv)) Shortcut((Keys)kv, true); return; }
                // The new tab page asks for a search or an address; no other page may.
                string from = ""; try { from = e.Source ?? ""; } catch { }
                if (from.StartsWith("https://newtab.omnidx/")) Go(msg);
            };
            try { await c.AddScriptToExecuteOnDocumentCreatedAsync(KeyScript); } catch { }
            t.Asleep = false;
            // An address asked for while the engine was starting wins over the one the tab was opened with.
            string go = t.Pending ?? url; t.Pending = null;
            c.Navigate(go);
        }

        // WebView2 keeps the keys a page has focus on, so Ctrl+T and the rest are caught in the page and passed up. The
        // script is added to every page before its own scripts run; the tag is made fresh each start and kept in the
        // script's closure, and only real key presses (isTrusted) are passed, so a page cannot press them itself.
        static readonly string KeyTag = "\u0001" + Guid.NewGuid().ToString("N") + ":";
        static readonly string KeyScript = @"(function(){
var w=window.chrome&&window.chrome.webview;if(!w||window.__omnidxKeys)return;
Object.defineProperty(window,'__omnidxKeys',{value:1});
var post=w.postMessage.bind(w),tag=" + "'" + KeyTag.Replace("\u0001", "\\u0001") + "'" + @";
addEventListener('keydown',function(e){
if(!e.isTrusted)return;
var c=e.keyCode,ctrl=e.ctrlKey&&!e.altKey&&!e.metaKey,bare=!e.ctrlKey&&!e.altKey&&!e.metaKey;
var m=(e.shiftKey?0x10000:0)|(e.ctrlKey?0x20000:0)|(e.altKey?0x40000:0);
if(bare&&c==27&&!e.shiftKey){post(tag+c);return;}
var ours=(ctrl&&(c==84||c==87||c==76||c==9||c==115||(c>=49&&c<=57)))||(bare&&!e.shiftKey&&(c==122||c==117))||(e.altKey&&!e.ctrlKey&&!e.shiftKey&&c==68);
if(!ours)return;
e.preventDefault();e.stopImmediatePropagation();
post(tag+(c|m));
},true);
})();";

        void Activate(Tab t)
        {
            if (t == null) return;
            var old = active;
            active = t;
            if (old != t) Hide(old);
            if (t.View == null) { var u = t.Pending ?? t.Url; t.Pending = null; var task = Wake(t, u); task.ContinueWith(_ => { try { BeginInvoke(new Action(() => Show1(t))); } catch { } }); return; }
            Show1(t);
        }
        void Hide(Tab old)
        {
            if (old == null || old.View == null) return;
            old.View.Visible = false; old.HiddenAt = DateTime.Now;
            try { old.View.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low; } catch { }
        }
        void Show1(Tab t)
        {
            if (t != active || t.View == null) return;
            try { if (t.View.CoreWebView2 != null && t.View.CoreWebView2.IsSuspended) t.View.CoreWebView2.Resume(); t.View.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal; } catch { }
            t.Asleep = false;
            t.View.Visible = true; t.View.BringToFront();
            Text = t.Title + " - OmniDx Browser";
            // What is being typed in the address bar stays.
            if (!address.Focused) ShowAddress();
            Buttons(); Invalidate();
            if (t.Url == NewTabUrl) address.Focus(); else if (!address.Focused) t.View.Focus();
        }
        void CloseTab(Tab t)
        {
            int i = tabs.IndexOf(t);
            if (i < 0) return;
            if (!string.IsNullOrEmpty(t.Url) && t.Url != NewTabUrl) closed.Push(t.Url);
            tabs.RemoveAt(i);
            if (t.View != null) { host.Controls.Remove(t.View); t.View.Dispose(); }
            if (tabs.Count == 0) { Close(); return; }
            if (t == active) { active = null; Activate(tabs[Math.Min(i, tabs.Count - 1)]); }
            Invalidate();
        }

        // Tabs out of sight go to sleep: after five minutes, or at once while Game Boost is on. A tab playing sound
        // stays awake; a sleeping tab wakes, where it was, when you open it.
        async void Sleep(bool now)
        {
            if (!State.Flag("SleepTabs", true) && !now) return;
            bool minimized = WindowState == FormWindowState.Minimized;
            foreach (var t in tabs.ToList())
            {
                if (t.View == null || t.Asleep || t.Audio) continue;
                bool hidden = t != active || (minimized && now);
                if (!hidden) continue;
                if (!now && (DateTime.Now - t.HiddenAt).TotalMinutes < 5) continue;
                try
                {
                    if (t == active) t.View.Visible = false;
                    t.View.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;
                    if (await t.View.CoreWebView2.TrySuspendAsync()) t.Asleep = true;
                }
                catch { }
            }
            Invalidate();
        }
        protected override void OnSignal(int what)
        {
            if (what == Signal.Boost) Sleep(true);
            Invalidate();
        }
        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (WindowState == FormWindowState.Minimized) { if (State.Boost) Sleep(true); return; }
            if (active != null && active.View != null && !active.View.Visible) Show1(active);
            int top = fullscreen ? 0 : Caption + Theme.S(ToolH);
            host.Bounds = new Rectangle(0, top, ClientSize.Width, ClientSize.Height - top);
            int y = Caption + (Theme.S(ToolH) - Theme.S(34)) / 2, x = Theme.S(8);
            foreach (var b in new[] { back, fwd, reload, home }) { if (b == null) continue; b.Location = new Point(x, y); b.Visible = !fullscreen; x += b.Width + Theme.S(2); }
            if (menuBtn != null) { menuBtn.Location = new Point(ClientSize.Width - menuBtn.Width - Theme.S(8), y); menuBtn.Visible = !fullscreen; }
            addressBox = new Rectangle(x + Theme.S(6), Caption + Theme.S(7), ClientSize.Width - x - Theme.S(6) - Theme.S(56), Theme.S(ToolH) - Theme.S(14));
            address.Location = new Point(addressBox.X + Theme.S(40), addressBox.Y + (addressBox.Height - address.PreferredHeight) / 2 + 1);
            address.Width = addressBox.Width - Theme.S(52);
            address.Visible = !fullscreen;
            suggest.Bounds = new Rectangle(addressBox.X, addressBox.Bottom + Theme.S(4), addressBox.Width, suggest.Height);
        }

        void Full(bool on)
        {
            if (on == fullscreen) return;
            fullscreen = on;
            if (on) { beforeFull = WindowState; FormBorderStyle = FormBorderStyle.None; WindowState = FormWindowState.Normal; WindowState = FormWindowState.Maximized; }
            else { FormBorderStyle = FormBorderStyle.Sizable; WindowState = beforeFull; }
            OnResize(EventArgs.Empty); Invalidate();
        }

        // ---------------------------------------------------------------- the address bar
        void ShowAddress()
        {
            if (active == null) return;
            address.Text = active.Url == NewTabUrl ? "" : active.Url ?? "";
            Invalidate(addressBox);
        }
        void Buttons()
        {
            var c = Core;
            back.Enabled = c != null && c.CanGoBack; fwd.Enabled = c != null && c.CanGoForward;
        }
        static string Fix(string s)
        {
            s = (s ?? "").Trim();
            if (s.Length == 0) return NewTabUrl;
            if (Regex.IsMatch(s, "^[a-zA-Z][a-zA-Z0-9+.-]*://")) return s;
            if (s.StartsWith("about:") || s.StartsWith("edge:")) return s;
            if (Regex.IsMatch(s, @"^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(/.*)?$")) return "http://" + s;
            if (!s.Contains(" ") && Regex.IsMatch(s, @"^[\w\-]+(\.[\w\-]+)+(:\d+)?(/.*)?$")) return "https://" + s;
            if (File.Exists(s) || Directory.Exists(s)) return new Uri(s).AbsoluteUri;
            return State.SearchUrl(s);
        }
        void Go(string s)
        {
            suggest.Visible = false;
            string url = Fix(s);
            if (active == null) { var t = NewTab(url, true); return; }
            if (active.View == null) { active.Pending = url; Activate(active); return; }
            // The tab's engine is still starting: it goes there as soon as it can.
            if (active.View.CoreWebView2 == null) { active.Pending = url; active.Url = url; active.View.Focus(); return; }
            active.View.CoreWebView2.Navigate(url);
            active.View.Focus();
        }
        void AddressKey(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                string pick = suggest.Visible && suggest.SelectedIndex >= 0 ? ((string[])suggest.Items[suggest.SelectedIndex])[1] : address.Text;
                if (e.Control && !address.Text.Contains(".") && !address.Text.Contains(" ")) pick = address.Text + ".com";
                Go(pick); e.Handled = e.SuppressKeyPress = true;
            }
            else if (e.KeyCode == Keys.Escape) { suggest.Visible = false; ShowAddress(); if (active != null && active.View != null) active.View.Focus(); e.Handled = e.SuppressKeyPress = true; }
            else if (e.KeyCode == Keys.Down && suggest.Visible) { suggest.SelectedIndex = Math.Min(suggest.Items.Count - 1, suggest.SelectedIndex + 1); e.Handled = true; }
            else if (e.KeyCode == Keys.Up && suggest.Visible) { suggest.SelectedIndex = Math.Max(-1, suggest.SelectedIndex - 1); e.Handled = true; }
        }
        void Suggest()
        {
            string q = address.Text.Trim();
            suggest.Items.Clear();
            if (q.Length == 0) { suggest.Visible = false; return; }
            suggest.Items.Add(new[] { "Search " + State.Engine + " for \u201C" + q + "\u201D", State.SearchUrl(q), "search" });
            foreach (var h in history.Match(q, 6)) suggest.Items.Add(new[] { h[1], h[0], "history" });
            suggest.Height = Math.Min(7, suggest.Items.Count) * suggest.ItemHeight + Theme.S(8);
            suggest.Visible = true; suggest.BringToFront();
            suggest.SelectedIndex = -1;
        }
        void DrawSuggestion(object sender, DrawItemEventArgs e)
        {
            if (e.Index < 0) return;
            var it = (string[])suggest.Items[e.Index];
            var g = e.Graphics;
            using (var b = new SolidBrush((e.State & DrawItemState.Selected) != 0 ? Theme.Selected : Theme.Surface)) g.FillRectangle(b, e.Bounds);
            Theme.Icon(g, it[2] == "search" ? G.Search : G.History, 10f, new Rectangle(e.Bounds.X + Theme.S(8), e.Bounds.Y, Theme.S(28), e.Bounds.Height), Theme.Accent2);
            int tx = e.Bounds.X + Theme.S(44);
            Theme.Draw(g, it[0], Theme.UI(10f), new Rectangle(tx, e.Bounds.Y, e.Bounds.Width / 2, e.Bounds.Height), Theme.Text);
            if (it[2] == "history") Theme.Draw(g, it[1], Theme.UI(9f), new Rectangle(tx + e.Bounds.Width / 2, e.Bounds.Y, e.Bounds.Width / 2 - Theme.S(56), e.Bounds.Height), Theme.Text3);
        }

        // ---------------------------------------------------------------- keys
        protected override bool ProcessCmdKey(ref Message msg, Keys k)
        {
            return Shortcut(k, false) || base.ProcessCmdKey(ref msg, k);
        }
        // A key can reach here from the window and from the page both, if WebView2 also hands it to the window: the
        // second of the pair, within 400 ms, is dropped. Held keys repeat from one side and are all kept.
        Keys lastKey; bool lastFromPage; DateTime lastKeyAt;
        bool Shortcut(Keys k, bool fromPage)
        {
            if (k == lastKey && fromPage != lastFromPage && (DateTime.Now - lastKeyAt).TotalMilliseconds < 400) return true;
            if (!Do(k)) return false;
            lastKey = k; lastFromPage = fromPage; lastKeyAt = DateTime.Now;
            return true;
        }
        bool Do(Keys k)
        {
            switch (k)
            {
                case Keys.Control | Keys.T: var t = NewTab(NewTabUrl, true); return true;
                case Keys.Control | Keys.W: case Keys.Control | Keys.F4: if (active != null) CloseTab(active); return true;
                case Keys.Control | Keys.Shift | Keys.T: if (closed.Count > 0) { var r = NewTab(closed.Pop(), true); } return true;
                case Keys.Control | Keys.L: case Keys.Alt | Keys.D: case Keys.F6: address.Focus(); address.SelectAll(); return true;
                case Keys.Control | Keys.Tab: Cycle(1); return true;
                case Keys.Control | Keys.Shift | Keys.Tab: Cycle(-1); return true;
                case Keys.F11: Full(!fullscreen); return true;
                case Keys.Alt | Keys.Left: if (Core != null && Core.CanGoBack) Core.GoBack(); return true;
                case Keys.Alt | Keys.Right: if (Core != null && Core.CanGoForward) Core.GoForward(); return true;
                case Keys.Control | Keys.J: if (Core != null) Core.OpenDefaultDownloadDialog(); return true;
                case Keys.Escape: if (fullscreen && Core != null && !Core.ContainsFullScreenElement) { Full(false); return true; } break;
            }
            int n = (int)(k & Keys.KeyCode) - (int)Keys.D1;
            if ((k & Keys.Modifiers) == Keys.Control && n >= 0 && n <= 8 && tabs.Count > 0) { Activate(n == 8 ? tabs[tabs.Count - 1] : tabs[Math.Min(n, tabs.Count - 1)]); return true; }
            return false;
        }
        void Cycle(int d) { if (tabs.Count == 0) return; int i = (tabs.IndexOf(active) + d + tabs.Count) % tabs.Count; Activate(tabs[i]); }

        // ---------------------------------------------------------------- the menu
        void ShowMenu()
        {
            var m = new ContextMenuStrip { Renderer = new DarkMenu(), ShowImageMargin = false, Font = Theme.UI(9.5f) };
            m.Items.Add("New tab            Ctrl+T", null, (s, e) => { var t = NewTab(NewTabUrl, true); });
            m.Items.Add("Reopen closed tab  Ctrl+Shift+T", null, (s, e) => { if (closed.Count > 0) { var t = NewTab(closed.Pop(), true); } });
            m.Items.Add("Downloads          Ctrl+J", null, (s, e) => { if (Core != null) Core.OpenDefaultDownloadDialog(); });
            m.Items.Add("Print              Ctrl+P", null, (s, e) => { if (Core != null) Core.ExecuteScriptAsync("window.print()"); });
            m.Items.Add(new ToolStripSeparator());
            var zoom = new ToolStripMenuItem("Zoom (" + (active != null && active.View != null ? Math.Round(active.View.ZoomFactor * 100) : 100) + "%)");
            foreach (var z in new[] { 67, 80, 90, 100, 110, 125, 150 }) { var zz = z; zoom.DropDownItems.Add(z + "%", null, (s, e) => { if (active != null && active.View != null) active.View.ZoomFactor = zz / 100.0; }); }
            m.Items.Add(zoom);
            var eng = new ToolStripMenuItem("Search with: " + State.Engine);
            foreach (var n in new[] { "Google", "DuckDuckGo", "Bing", "Brave" }) { var nn = n; var it = new ToolStripMenuItem(n, null, (s, e) => { State.Engine = nn; WriteNewTab(); Signal.Send(Signal.Changed); }) { Checked = State.Engine == n }; eng.DropDownItems.Add(it); }
            m.Items.Add(eng);
            m.Items.Add(new ToolStripMenuItem("Sleeping tabs (after 5 minutes, and during Game Boost)", null, (s, e) => State.Set("SleepTabs", !State.Flag("SleepTabs", true))) { Checked = State.Flag("SleepTabs", true) });
            m.Items.Add(new ToolStripMenuItem("Open last session's tabs on start", null, (s, e) => State.Set("RestoreTabs", !State.Flag("RestoreTabs", true))) { Checked = State.Flag("RestoreTabs", true) });
            m.Items.Add(new ToolStripSeparator());
            m.Items.Add("Clear browsing data...", null, async (s, e) =>
            {
                if (MessageBox.Show(this, "Delete history, cookies, cache and saved site data? You will be signed out of sites.", "OmniDx Browser", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK || Core == null) return;
                try { await Core.Profile.ClearBrowsingDataAsync(); } catch { }
                history.Clear();
            });
            m.Items.Add("Make OmniDx Browser the default", null, (s, e) => Edition.Start("ms-settings:defaultapps?registeredAppMachine=OmniDx%20Browser", null));
            m.Items.Add("Developer tools    F12", null, (s, e) => { if (Core != null) Core.OpenDevToolsWindow(); });
            m.Items.Add(new ToolStripSeparator());
            string ver = ""; try { ver = env.BrowserVersionString; } catch { }
            m.Items.Add(new ToolStripMenuItem("OmniDx Browser " + Edition.Version + (ver != "" ? "  (engine " + ver + ")" : "")) { Enabled = false });
            foreach (ToolStripItem i in m.Items) i.ForeColor = Theme.Text;
            m.Show(menuBtn, new Point(menuBtn.Width - m.Width, menuBtn.Height));
        }

        // ---------------------------------------------------------------- painting
        protected override bool IsCaption(Point p)
        {
            if (p.Y >= Caption) return false;
            if (plusBox.Contains(p)) return false;
            foreach (var t in tabs) if (t.Box.Contains(p)) return false;
            return true;
        }
        void LayoutTabs()
        {
            int left = Theme.S(10), right = BtnMin.X - Theme.S(46);
            int n = Math.Max(1, tabs.Count), w = Math.Max(Theme.S(56), Math.Min(Theme.S(236), (right - left) / n));
            int y = Theme.S(7), h = Caption - y;
            for (int i = 0; i < tabs.Count; i++)
            {
                tabs[i].Box = new Rectangle(left + i * w, y, w - Theme.S(2), h);
                tabs[i].CloseBox = new Rectangle(tabs[i].Box.Right - Theme.S(30), y + (h - Theme.S(22)) / 2, Theme.S(22), Theme.S(22));
            }
            int px = left + tabs.Count * w + Theme.S(4);
            plusBox = new Rectangle(Math.Min(px, right), y + (h - Theme.S(30)) / 2, Theme.S(30), Theme.S(30));
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(Theme.Bg);
            if (fullscreen) return;
            LayoutTabs();
            using (var b = new SolidBrush(Theme.Bg)) g.FillRectangle(b, 0, 0, ClientSize.Width, Caption);
            using (var b = new SolidBrush(Theme.Surface)) g.FillRectangle(b, 0, Caption, ClientSize.Width, Theme.S(ToolH));
            for (int i = 0; i < tabs.Count; i++)
            {
                var t = tabs[i]; var r = t.Box; bool on = t == active, hot = i == tabHover;
                if (on)
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    using (var p = Theme.Round(new RectangleF(r.X, r.Y, r.Width, r.Height + Theme.S(12)), Theme.S(9))) using (var b = new SolidBrush(Theme.Surface)) g.FillPath(b, p);
                    Theme.FillGrad(g, new Rectangle(r.X + Theme.S(12), r.Y, r.Width - Theme.S(24), Theme.S(2)), 1, 255);
                }
                else if (hot) Theme.Fill(g, new Rectangle(r.X, r.Y + Theme.S(2), r.Width, r.Height - Theme.S(6)), Theme.S(8), Theme.Hover);
                else if (i + 1 < tabs.Count && tabs[i + 1] != active) using (var p = new Pen(Theme.Line)) g.DrawLine(p, r.Right, r.Y + Theme.S(9), r.Right, r.Bottom - Theme.S(9));
                var ic = new Rectangle(r.X + Theme.S(12), r.Y + (r.Height - Theme.S(16)) / 2, Theme.S(16), Theme.S(16));
                if (t.Loading)
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    using (var p = new Pen(Theme.Accent2, Theme.S(2))) g.DrawArc(p, ic, spin, 270);
                }
                else if (t.Icon != null) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(t.Icon, ic); }
                else Theme.Icon(g, t.Url == NewTabUrl ? G.Bolt : G.Globe, 9f, ic, Theme.Accent2);
                if (t.Asleep) Theme.Icon(g, G.Moon, 7f, new Rectangle(ic.Right - Theme.S(6), ic.Bottom - Theme.S(8), Theme.S(12), Theme.S(12)), Theme.Text3);
                bool showClose = r.Width > Theme.S(92) && (on || hot);
                int tx = ic.Right + Theme.S(8), tw = r.Width - (tx - r.X) - (showClose ? Theme.S(34) : Theme.S(10)) - (t.Audio ? Theme.S(20) : 0);
                if (tw > Theme.S(12)) Theme.Draw(g, t.Title, Theme.UI(9f), new Rectangle(tx, r.Y, tw, r.Height), t.Asleep ? Theme.Text3 : on ? Theme.Text : Theme.Text2);
                if (t.Audio) Theme.Icon(g, "\uE767", 8f, new Rectangle(tx + tw + Theme.S(2), r.Y, Theme.S(18), r.Height), Theme.Accent2);
                if (showClose)
                {
                    if (closeHover == i) Theme.Fill(g, t.CloseBox, Theme.S(6), Theme.Selected);
                    Theme.Icon(g, G.Close, 6.5f, t.CloseBox, Theme.Text2);
                }
            }
            if (tabHover == -2) Theme.Fill(g, plusBox, Theme.S(8), Theme.Hover);
            Theme.Icon(g, G.Add, 9f, plusBox, Theme.Text2);
            PaintButtons(g);

            // The address bar.
            bool focused = address.Focused;
            Theme.Fill(g, addressBox, addressBox.Height / 2f, Theme.Surface2);
            if (focused) Theme.Stroke(g, addressBox, addressBox.Height / 2f, Theme.Accent, Theme.S(1.5f));
            bool secure = active != null && active.Url != null && active.Url.StartsWith("https://") && active.Url != NewTabUrl;
            Theme.Icon(g, active == null || active.Url == NewTabUrl ? G.Search : secure ? G.Lock : G.Info, 9f, new Rectangle(addressBox.X + Theme.S(12), addressBox.Y, Theme.S(22), addressBox.Height), secure ? Theme.Text2 : Theme.Accent2);
            if (address.Text.Length == 0 && !focused)
                Theme.Draw(g, "Search " + State.Engine + " or type an address", Theme.UI(10.5f), new Rectangle(address.Left, addressBox.Y, address.Width, addressBox.Height), Theme.Text3);
            if (State.Boost) Theme.Icon(g, G.Bolt, 9f, new Rectangle(menuBtn.Left - Theme.S(26), addressBox.Y, Theme.S(22), addressBox.Height), Theme.Accent2);
            // Loading: a thin violet line under the bar.
            if (active != null && active.Loading)
            {
                int bw = ClientSize.Width / 3, bx = (int)((spin / 360.0) * (ClientSize.Width + bw)) - bw;
                Theme.FillGrad(g, new Rectangle(Math.Max(0, bx), Caption + Theme.S(ToolH) - Theme.S(2), Math.Min(bw, ClientSize.Width - Math.Max(0, bx)), Theme.S(2)), 0, 255);
            }
        }
        protected override void OnMouseMove(MouseEventArgs e)
        {
            int h = -1, ch = -1;
            for (int i = 0; i < tabs.Count; i++) if (tabs[i].Box.Contains(e.Location)) { h = i; if (tabs[i].CloseBox.Contains(e.Location)) ch = i; }
            if (plusBox.Contains(e.Location)) h = -2;
            if (h != tabHover || ch != closeHover) { tabHover = h; closeHover = ch; Invalidate(new Rectangle(0, 0, ClientSize.Width, Caption)); }
            base.OnMouseMove(e);
        }
        protected override void OnMouseLeave(EventArgs e) { tabHover = closeHover = -1; Invalidate(new Rectangle(0, 0, ClientSize.Width, Caption)); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e)
        {
            if (plusBox.Contains(e.Location) && e.Button == MouseButtons.Left) { var t = NewTab(NewTabUrl, true); return; }
            for (int i = 0; i < tabs.Count; i++)
                if (tabs[i].Box.Contains(e.Location))
                {
                    if (e.Button == MouseButtons.Middle || (e.Button == MouseButtons.Left && closeHover == i && tabs[i].CloseBox.Contains(e.Location))) CloseTab(tabs[i]);
                    else if (e.Button == MouseButtons.Left) Activate(tabs[i]);
                    return;
                }
            base.OnMouseDown(e);
        }
        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            Session.Save(tabs.Where(t => t.Url != NewTabUrl && !string.IsNullOrEmpty(t.Url)).Select(t => t.Pending ?? t.Url).ToList());
            base.OnFormClosing(e);
        }

        // ---------------------------------------------------------------- another copy hands over an address
        void StartPipe()
        {
            var th = new Thread(() =>
            {
                while (true)
                {
                    try
                    {
                        using (var s = new NamedPipeServerStream(BrowserProgram.Pipe, PipeDirection.In, 1))
                        {
                            s.WaitForConnection();
                            var ms = new MemoryStream(); s.CopyTo(ms);
                            string url = Encoding.UTF8.GetString(ms.ToArray());
                            BeginInvoke(new Action(async () =>
                            {
                                await NewTab(string.IsNullOrWhiteSpace(url) ? NewTabUrl : Fix(url), true);
                                if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
                                Activate(); Native.SetForegroundWindow(Handle);
                            }));
                        }
                    }
                    catch { Thread.Sleep(500); }
                }
            }) { IsBackground = true };
            th.Start();
        }

        // ---------------------------------------------------------------- the new tab page
        void WriteNewTab()
        {
            try { File.WriteAllText(Path.Combine(Pages, "newtab.html"), NewTabPage.Html(State.Engine), Encoding.UTF8); } catch (Exception e) { Edition.Log("newtab: " + e.Message); }
        }
        void FillNewTab(CoreWebView2 c)
        {
            var top = history.Top(8).Select(h => "{\"u\":" + Json(h[0]) + ",\"t\":" + Json(h[1]) + "}");
            try { c.ExecuteScriptAsync("window.omni && omni.top([" + string.Join(",", top) + "])"); } catch { }
        }
        static string Json(string s)
        {
            var b = new StringBuilder("\"");
            foreach (char ch in s ?? "") { if (ch == '"' || ch == '\\') b.Append('\\').Append(ch); else if (ch < 32 || ch == '<' || ch == '>') b.AppendFormat("\\u{0:x4}", (int)ch); else b.Append(ch); }
            return b.Append('"').ToString();
        }
        static string Pretty(string url)
        {
            try { var u = new Uri(url); return u.Host.StartsWith("www.") ? u.Host.Substring(4) : u.Host; } catch { return url ?? ""; }
        }
    }

    // Where you have been, for the address bar's suggestions and the new tab page. On this PC only.
    class History
    {
        readonly string file = Path.Combine(Edition.Local, @"Browser\history.tsv");
        readonly List<string[]> rows = new List<string[]>(); // url, title, count, last
        public History()
        {
            try { foreach (var l in File.ReadAllLines(file)) { var p = l.Split('\t'); if (p.Length == 4) rows.Add(p); } } catch { }
        }
        public void Add(string url, string title)
        {
            if (string.IsNullOrEmpty(url) || url.StartsWith("https://newtab.omnidx") || url.StartsWith("about:")) return;
            title = (title ?? "").Replace('\t', ' ').Replace('\n', ' ');
            var r = rows.FirstOrDefault(x => x[0] == url);
            if (r == null) { r = new[] { url, title, "0", "" }; rows.Add(r); }
            r[1] = title.Length > 0 ? title : r[1]; r[2] = (int.Parse(r[2]) + 1).ToString(); r[3] = DateTime.Now.ToString("s");
            if (rows.Count > 3000) rows.RemoveRange(0, rows.Count - 3000);
            try { Directory.CreateDirectory(Path.GetDirectoryName(file)); File.WriteAllLines(file, rows.Select(x => string.Join("\t", x))); } catch { }
        }
        public IEnumerable<string[]> Match(string q, int n)
        {
            q = q.ToLowerInvariant();
            return rows.Where(r => r[0].ToLowerInvariant().Contains(q) || r[1].ToLowerInvariant().Contains(q))
                .OrderByDescending(r => (r[0].ToLowerInvariant().Replace("https://", "").Replace("www.", "").StartsWith(q) ? 1000 : 0) + int.Parse(r[2])).Take(n);
        }
        public IEnumerable<string[]> Top(int n)
        {
            return rows.GroupBy(r => { try { return new Uri(r[0]).Host; } catch { return r[0]; } })
                .Select(g => g.OrderByDescending(r => int.Parse(r[2])).First()).OrderByDescending(r => int.Parse(r[2])).Take(n);
        }
        public void Clear() { rows.Clear(); try { File.Delete(file); } catch { } }
    }

    static class Session
    {
        static string File1 { get { return Path.Combine(Edition.Local, @"Browser\session.txt"); } }
        public static List<string> Load() { try { return File.ReadAllLines(File1).Where(l => l.Length > 0).Take(40).ToList(); } catch { return new List<string>(); } }
        public static void Save(List<string> urls) { try { Directory.CreateDirectory(Path.GetDirectoryName(File1)); File.WriteAllLines(File1, urls); } catch { } }
    }

    // The page a new tab opens on: the OmniDx background, the time, one box, your sites. It is a file on this PC; it
    // loads nothing from the internet.
    static class NewTabPage
    {
        public static string Html(string engine)
        {
            return @"<!doctype html><html lang=""en""><head><meta charset=""utf-8""><title>New tab</title>
<meta name=""color-scheme"" content=""dark""><style>
:root{--bg:#000;--text:#f1ecff;--t2:#b3a8cf;--t3:#8a7ea6;--line:#2a1f45;--s:#150f22;--s2:#1d1530;--a:#8b5cf6;--a2:#c084fc}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font-family:'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif;overflow:hidden}
body:before{content:'';position:fixed;inset:-20%;background:
radial-gradient(40% 45% at 18% 20%,rgba(124,58,237,.30),transparent 70%),
radial-gradient(38% 40% at 82% 30%,rgba(168,85,247,.24),transparent 70%),
radial-gradient(45% 45% at 55% 90%,rgba(109,40,217,.26),transparent 72%);filter:blur(20px)}
main{position:relative;display:flex;flex-direction:column;align-items:center;padding-top:16vh;height:100%}
.time{font-size:76px;font-weight:600;letter-spacing:-2px;line-height:1}
.date{color:var(--t2);font-size:15px;margin:8px 0 34px}
form{width:min(640px,86vw);position:relative}
input{width:100%;height:56px;border-radius:28px;border:1px solid var(--line);background:rgba(21,15,34,.86);color:var(--text);font:inherit;font-size:17px;padding:0 22px 0 54px;outline:none;transition:border-color .12s}
input:focus{border-color:var(--a)}
form svg{position:absolute;left:20px;top:18px;width:20px;height:20px;fill:var(--a2)}
.sites{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;width:min(640px,86vw);margin-top:30px}
.sites a{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 8px;border-radius:14px;text-decoration:none;color:var(--text);background:rgba(21,15,34,.6);border:1px solid transparent;font-size:13px;transition:background .12s,border-color .12s}
.sites a:hover{background:var(--s2);border-color:var(--line)}
.sites b{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:17px;font-weight:700;color:#fff;background:linear-gradient(135deg,#6d28d9,#8b5cf6 45%,#d946ef)}
.sites span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.foot{position:fixed;bottom:18px;color:var(--t3);font-size:12px}
</style></head><body><main>
<div class=""time"" id=""time""></div><div class=""date"" id=""date""></div>
<form id=""f"" autocomplete=""off""><svg viewBox=""0 0 24 24""><path d=""M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.4-5.4-5.39A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z""/></svg>
<input id=""q"" placeholder=""Search " + engine + @" or type an address"" autofocus></form>
<div class=""sites"" id=""sites""></div>
<div class=""foot"">OmniDx Browser &middot; trackers blocked (Strict) &middot; tabs sleep while you game</div></main>
<script>
const pad=n=>String(n).padStart(2,'0');
function tick(){const d=new Date();time.textContent=pad(d.getHours())+':'+pad(d.getMinutes());date.textContent=d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});}
tick();setInterval(tick,1000);
f.onsubmit=e=>{e.preventDefault();const v=q.value.trim();if(v)window.chrome.webview.postMessage(v);};
const base=[['YouTube','https://www.youtube.com'],['Twitch','https://www.twitch.tv'],['Discord','https://discord.com/app'],['Reddit','https://www.reddit.com'],['Steam','https://store.steampowered.com'],['Epic Games','https://store.epicgames.com'],['X','https://x.com'],['OmniDx','https://omnidx.net']];
function draw(list){sites.innerHTML='';list.slice(0,8).forEach(([t,u])=>{const a=document.createElement('a');a.href=u;const b=document.createElement('b');b.textContent=(t||u).replace(/^https?:\/\/(www\.)?/,'').charAt(0).toUpperCase();const s=document.createElement('span');s.textContent=t;a.append(b,s);sites.append(a);});}
draw(base);
window.omni={top(rows){if(!rows||!rows.length)return;const mine=rows.map(r=>[(r.t||'').split(/ [-|\u2013\u2014] /)[0].slice(0,24)||new URL(r.u).hostname,r.u]);const seen=new Set(mine.map(m=>new URL(m[1]).hostname));draw(mine.concat(base.filter(b=>!seen.has(new URL(b[1]).hostname))));}};
</script></body></html>";
        }
    }
}
