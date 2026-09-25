// OmniDx Hub: the PC at a glance, the three presets, Game Boost, your games and the tune. It asks for administrator
// rights only when a preset is applied (the shield on the button), and every value a preset changes is written
// down first, so "Restore Windows defaults" puts back exactly what was there.
//
//   OmniHub.exe                     the window
//   OmniHub.exe --page presets      the window, on a page (home, presets, games, tune, about)
//   OmniHub.exe --welcome           the first sign-in after setup
//   OmniHub.exe --apply Insane      apply a preset and stop (run as administrator)
//   OmniHub.exe --restore           put back what the presets changed (run as administrator)
//   OmniHub.exe --purge             empty the standby list (the Free Memory task, as SYSTEM)
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace OmniDx
{
    static class HubProgram
    {
        [STAThread]
        static int Main(string[] args)
        {
            int i = Array.IndexOf(args, "--apply");
            if (i >= 0 && i + 1 < args.Length) return Presets.Apply(args[i + 1]) ? 0 : 1;
            if (args.Contains("--restore")) return Presets.Restore() ? 0 : 1;
            if (args.Contains("--purge")) return Native.PurgeStandby() ? 0 : 1;
            Theme.Init();
            bool created;
            var one = new Mutex(true, @"Local\OmniDx.Hub", out created);
            if (!created)
            {
                foreach (var p in Process.GetProcessesByName(Process.GetCurrentProcess().ProcessName))
                    if (p.Id != Process.GetCurrentProcess().Id) { Native.AllowSetForegroundWindow(p.Id); if (p.MainWindowHandle != IntPtr.Zero) { Native.ShowWindow(p.MainWindowHandle, 9); Native.SetForegroundWindow(p.MainWindowHandle); } }
                return 0;
            }
            int pg = Array.IndexOf(args, "--page");
            string page = args.Contains("--welcome") ? "welcome" : pg >= 0 && pg + 1 < args.Length ? args[pg + 1] : "home";
            Application.Run(new HubForm(page));
            GC.KeepAlive(one);
            return 0;
        }
    }

    // ------------------------------------------------------------------ the presets
    class Preset
    {
        public string Name, Tag, Blurb;
        public string[] Does;
    }

    static class Presets
    {
        public static readonly Preset[] All = {
            new Preset { Name = "Balanced", Tag = "Everyday", Blurb = "Windows' own scheduling and power, with the OmniDx look and the tune's cuts kept.",
                Does = new[] { "Windows' Balanced power plan", "Windows' default CPU scheduling and multimedia reserve", "Animations as Windows chooses", "Game Mode on, mouse 1:1", "Game Boost: the performance plan and sleeping tabs, no timer change" } },
            new Preset { Name = "Competitive", Tag = "Recommended", Blurb = "Foreground first: the game gets the CPU, the network and the timer when it has the screen.",
                Does = new[] { "The OmniDx power plan (or High performance)", "Short, foreground-boosted CPU slices", "Multimedia reserve at its minimum, network throttling off", "Games get the GPU and I/O priority Windows gives \"Pro Audio\"", "Background Store apps off, Game Mode on, mouse 1:1", "Game Boost holds a 1 ms timer" } },
            new Preset { Name = "Insane", Tag = "Every last millisecond", Blurb = "Competitive, then everything that trades comfort, heat or power for latency. Undo is one button.",
                Does = new[] { "OmniDx Insane power plan: cores never parked, 100% minimum, aggressive boost, no USB or PCIe power saving", "Fixed short CPU slices, strongest foreground boost", "Network cards: interrupt moderation and energy saving off", "Keyboard repeat at its fastest", "No animations, no transparency, no toasts", "Kernel kept in RAM (16 GB or more)", "Game Boost holds a 0.5 ms timer and empties the standby list" } },
        };

        static string UndoFile { get { return Path.Combine(Edition.Data, "presets-undo.tsv"); } }
        static HashSet<string> recorded;
        static List<string> lines;

        static void Load()
        {
            if (lines != null) return;
            lines = new List<string>(); recorded = new HashSet<string>();
            try { foreach (var l in File.ReadAllLines(UndoFile)) { lines.Add(l); var p = l.Split('\t'); if (p.Length > 3) recorded.Add(p[0] + "|" + p[1] + "|" + p[2] + "|" + p[3]); } } catch { }
        }
        static void Save() { try { File.WriteAllLines(UndoFile, lines); } catch (Exception e) { Edition.Log("undo file: " + e.Message); } }
        static void Remember(string line, string key) { Load(); if (recorded.Add(key)) { lines.Add(line); Save(); } }

        static RegistryKey Hive(string h) { return h == "HKLM" ? Registry.LocalMachine : Registry.CurrentUser; }
        // Sets a value, first writing down what was there (once: the first value seen is Windows' own).
        static void Reg(string hive, string path, string name, object value, RegistryValueKind kind)
        {
            try
            {
                string key = "reg|" + hive + "|" + path + "|" + name;
                using (var k = Hive(hive).OpenSubKey(path))
                {
                    object old = k == null ? null : k.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames);
                    string oldKind = old == null ? "absent" : k.GetValueKind(name).ToString();
                    Remember(string.Join("\t", new[] { "reg", hive, path, name, oldKind, Encode(old) }), key);
                }
                using (var k = Hive(hive).CreateSubKey(path)) k.SetValue(name, value, kind);
            }
            catch (Exception e) { Edition.Log("set " + hive + "\\" + path + "\\" + name + ": " + e.Message); }
        }
        static void Dword(string hive, string path, string name, long v) { Reg(hive, path, name, unchecked((int)(uint)v), RegistryValueKind.DWord); }
        static void Str(string hive, string path, string name, string v) { Reg(hive, path, name, v, RegistryValueKind.String); }

        static string Encode(object v)
        {
            if (v == null) return "";
            if (v is byte[]) return Convert.ToBase64String((byte[])v);
            if (v is string[]) return Convert.ToBase64String(Encoding.UTF8.GetBytes(string.Join("\0", (string[])v)));
            if (v is string) return Convert.ToBase64String(Encoding.UTF8.GetBytes((string)v));
            return Convert.ToString(v, CultureInfo.InvariantCulture);
        }
        static object Decode(string kind, string s)
        {
            switch (kind)
            {
                case "DWord": return int.Parse(s, CultureInfo.InvariantCulture);
                case "QWord": return long.Parse(s, CultureInfo.InvariantCulture);
                case "Binary": return Convert.FromBase64String(s);
                case "MultiString": return Encoding.UTF8.GetString(Convert.FromBase64String(s)).Split('\0');
                default: return Encoding.UTF8.GetString(Convert.FromBase64String(s));
            }
        }

        public static string Run(string file, string args)
        {
            try
            {
                var p = Process.Start(new ProcessStartInfo(file, args) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true });
                string o = p.StandardOutput.ReadToEnd(); p.WaitForExit(20000); return o;
            }
            catch (Exception e) { Edition.Log(file + " " + args + ": " + e.Message); return ""; }
        }
        static string Ps(string script)
        {
            return Run("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"" + script.Replace("\"", "\\\"") + "\"");
        }
        static string SchemeByName(string name)
        {
            var m = Regex.Match(Run("powercfg.exe", "/list"), "([0-9a-fA-F\\-]{36})\\s+\\(" + Regex.Escape(name) + "\\)");
            return m.Success ? m.Groups[1].Value : null;
        }
        static void Power(string guid)
        {
            if (guid == null) return;
            string cur = Booster.ActiveScheme();
            if (cur != null) Remember("power\tactive\t" + cur + "\t-", "power|active|-|-");
            Run("powercfg.exe", "/setactive " + guid);
        }

        public static bool Apply(string name)
        {
            var p = All.FirstOrDefault(x => x.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
            if (p == null) return false;
            Edition.Log("preset " + p.Name + ": applying");
            const string MM = @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile";
            const string PRI = @"SYSTEM\CurrentControlSet\Control\PriorityControl";
            bool insane = p.Name == "Insane", balanced = p.Name == "Balanced";

            // Every preset: Game Mode, and the mouse moving as far as the hand does.
            Dword("HKCU", @"Software\Microsoft\GameBar", "AutoGameModeEnabled", 1);
            Dword("HKCU", @"Software\Microsoft\GameBar", "AllowAutoGameMode", 1);
            Str("HKCU", @"Control Panel\Mouse", "MouseSpeed", "0");
            Str("HKCU", @"Control Panel\Mouse", "MouseThreshold1", "0");
            Str("HKCU", @"Control Panel\Mouse", "MouseThreshold2", "0");

            // CPU slices: 2 is Windows' default, 38 (0x26) short and foreground-boosted, 42 (0x2A) short, fixed and boosted.
            Dword("HKLM", PRI, "Win32PrioritySeparation", balanced ? 2 : insane ? 42 : 38);
            Dword("HKLM", MM, "SystemResponsiveness", balanced ? 20 : 10);
            Dword("HKLM", MM, "NetworkThrottlingIndex", balanced ? 10 : 0xFFFFFFFFL);
            if (!balanced)
            {
                Dword("HKLM", MM + @"\Tasks\Games", "GPU Priority", 8);
                Dword("HKLM", MM + @"\Tasks\Games", "Priority", 6);
                Str("HKLM", MM + @"\Tasks\Games", "Scheduling Category", "High");
                Str("HKLM", MM + @"\Tasks\Games", "SFIO Priority", "High");
            }
            Dword("HKCU", @"Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications", "GlobalUserDisabled", balanced ? 0 : 1);

            // Keyboard repeat: Windows' default delay is 1 (of 0 to 3).
            Str("HKCU", @"Control Panel\Keyboard", "KeyboardDelay", insane ? "0" : "1");
            Str("HKCU", @"Control Panel\Keyboard", "KeyboardSpeed", "31");

            // The look: Windows' choice on Balanced, everything off on Insane, left alone on Competitive (the tune's choice).
            if (balanced) Dword("HKCU", @"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects", "VisualFXSetting", 0);
            if (insane)
            {
                Dword("HKCU", @"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects", "VisualFXSetting", 2);
                Reg("HKCU", @"Control Panel\Desktop", "UserPreferencesMask", new byte[] { 0x90, 0x12, 0x03, 0x80, 0x10, 0x00, 0x00, 0x00 }, RegistryValueKind.Binary);
                Str("HKCU", @"Control Panel\Desktop\WindowMetrics", "MinAnimate", "0");
                Dword("HKCU", @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "EnableTransparency", 0);
                Dword("HKCU", @"Software\Microsoft\Windows\CurrentVersion\PushNotifications", "ToastEnabled", 0);
                double used, total; Native.MemoryLoad(out used, out total);
                if (total >= 15) Dword("HKLM", @"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management", "DisablePagingExecutive", 1);
            }
            else Dword("HKCU", @"Software\Microsoft\Windows\CurrentVersion\PushNotifications", "ToastEnabled", 1);

            // Network cards: interrupt moderation batches packets to save CPU; off, each packet is handled as it lands.
            NetAdapters(insane);

            // Power.
            if (balanced) Power("381b4222-f694-41f0-9685-ff5bb260df2e");
            else if (!insane) Power(SchemeByName("OmniDx") ?? "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c");
            else Power(InsanePlan());

            State.Preset = p.Name;
            State.Set("PresetApplied", DateTime.Now.ToString("s"));
            Edition.Log("preset " + p.Name + ": done");
            Signal.Send(Signal.Changed);
            return true;
        }

        static void NetAdapters(bool off)
        {
            // Physical, connected adapters only; each keyword that the driver offers.
            string list = Ps("Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object { $n = $_.Name; Get-NetAdapterAdvancedProperty -Name $n -ErrorAction SilentlyContinue | Where-Object { $_.RegistryKeyword -in '*InterruptModeration','*EEE','EEELinkAdvertisement','GreenEthernet','*FlowControl' } | ForEach-Object { $n + '|' + $_.RegistryKeyword + '|' + ($_.RegistryValue -join ',') } }");
            foreach (var l in list.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var p = l.Split('|'); if (p.Length != 3) continue;
                string adapter = p[0], kw = p[1], cur = p[2];
                if (kw == "*FlowControl") continue; // shown in the list, left as it is: turning it off drops packets on some switches
                Remember("netadv\t" + adapter + "\t" + kw + "\t" + cur, "netadv|" + adapter + "|" + kw + "|-");
                if (!off) continue;
                string want = "0";
                if (cur == want) continue;
                Ps("Set-NetAdapterAdvancedProperty -Name '" + adapter.Replace("'", "''") + "' -RegistryKeyword '" + kw + "' -RegistryValue " + want + " -NoRestart -ErrorAction SilentlyContinue");
                Edition.Log("adapter " + adapter + ": " + kw + " " + cur + " -> " + want);
            }
            if (off) Ps("Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | Restart-NetAdapter -Confirm:$false -ErrorAction SilentlyContinue");
        }

        // A copy of Ultimate Performance (or High performance where Windows hides it) with the last of the power
        // saving taken out, on mains power only: a laptop on battery keeps its own settings.
        static string InsanePlan()
        {
            string guid = SchemeByName("OmniDx Insane");
            if (guid == null)
            {
                var m = Regex.Match(Run("powercfg.exe", "/duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61"), "([0-9a-fA-F\\-]{36})");
                if (!m.Success) m = Regex.Match(Run("powercfg.exe", "/duplicatescheme 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"), "([0-9a-fA-F\\-]{36})");
                if (!m.Success) return null;
                guid = m.Groups[1].Value;
                Run("powercfg.exe", "/changename " + guid + " \"OmniDx Insane\" \"OmniDx Edition: cores never parked, no USB or PCIe power saving.\"");
                Remember("plan\tinsane\t" + guid + "\t-", "plan|insane|-|-");
            }
            const string CPU = "54533251-82be-4824-96c1-47b60b740d00";
            var set = new[] {
                CPU + " 893dee8e-2bef-41e0-89c6-b55d0929964c 100",   // minimum processor state
                CPU + " bc5038f7-23e0-4960-96da-33abaf5935ec 100",   // maximum processor state
                CPU + " 0cc5b647-c1df-4637-891a-dec35c318583 100",   // core parking: minimum cores unparked
                CPU + " ea062031-0e34-4ff1-9b6d-eb1059334028 100",   // core parking: maximum cores
                CPU + " be337238-0d82-4146-a960-4f3749d470c7 2",     // boost mode: aggressive
                CPU + " 36687f9e-e3a5-4dbf-b1dc-15eb381c6863 0",     // energy performance preference: performance
                "2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0", // USB selective suspend off
                "501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 0", // PCIe link state power management off
                "0012ee47-9041-4b5d-9b77-535fba8b1442 6738e2c4-e8a5-4a42-b16a-e040e769756e 0", // disks never spin down
            };
            foreach (var s in set) Run("powercfg.exe", "/setacvalueindex " + guid + " " + s);
            return guid;
        }

        public static bool Restore()
        {
            Load();
            Edition.Log("presets: restoring " + lines.Count + " recorded values");
            string insane = null;
            foreach (var l in Enumerable.Reverse(lines))
            {
                var p = l.Split('\t');
                try
                {
                    if (p[0] == "reg" && p.Length >= 6)
                    {
                        if (p[4] == "absent") { using (var k = Hive(p[1]).OpenSubKey(p[2], true)) if (k != null) k.DeleteValue(p[3], false); }
                        else using (var k = Hive(p[1]).CreateSubKey(p[2])) k.SetValue(p[3], Decode(p[4], p[5]), (RegistryValueKind)Enum.Parse(typeof(RegistryValueKind), p[4]));
                    }
                    else if (p[0] == "power") Run("powercfg.exe", "/setactive " + p[2]);
                    else if (p[0] == "plan") insane = p[2];
                    else if (p[0] == "netadv") Ps("Set-NetAdapterAdvancedProperty -Name '" + p[1].Replace("'", "''") + "' -RegistryKeyword '" + p[2] + "' -RegistryValue " + p[3].Split(',')[0] + " -NoRestart -ErrorAction SilentlyContinue");
                }
                catch (Exception e) { Edition.Log("restore " + l + ": " + e.Message); }
            }
            if (insane != null) Run("powercfg.exe", "/delete " + insane);
            try { File.Move(UndoFile, UndoFile + "." + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".done"); } catch { }
            lines = null;
            State.Preset = "Windows defaults";
            Signal.Send(Signal.Changed);
            return true;
        }
    }

    // ------------------------------------------------------------------ the window
    class HubForm : ChromeForm
    {
        readonly string[] pages = { "home", "presets", "games", "tune", "about" };
        readonly string[] labels = { "Home", "Presets", "Games", "Tune", "About" };
        readonly string[] glyphs = { G.Home, G.Speed, G.Game, G.Rocket, G.Info };
        string page;
        readonly Panel content = new Panel();
        Page current;
        int navHover = -1;
        readonly Image logo, mark;
        public HubForm(string start)
        {
            Text = "OmniDx Hub";
            Size = new Size(Theme.S(1140), Theme.S(760));
            MinimumSize = new Size(Theme.S(940), Theme.S(620));
            Caption = Theme.S(44);
            try { Icon = new Icon(Path.Combine(Edition.Dir, @"assets\hub.ico")); } catch { }
            try { logo = Image.FromFile(Path.Combine(Edition.Dir, @"assets\logo.png")); } catch { }
            try { mark = Image.FromFile(Path.Combine(Edition.Dir, @"assets\hub-256.png")); } catch { }
            content.BackColor = Theme.Bg;
            Controls.Add(content);
            Go(start);
        }
        int NavW { get { return page == "welcome" ? 0 : Theme.S(236); } }
        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (content != null) content.Bounds = new Rectangle(NavW, Caption, ClientSize.Width - NavW, ClientSize.Height - Caption);
        }
        public void Go(string p)
        {
            page = pages.Contains(p) || p == "welcome" ? p : "home";
            if (current != null) { content.Controls.Remove(current); current.Dispose(); }
            switch (page)
            {
                case "welcome": current = new WelcomePage(this, logo); break;
                case "presets": current = new PresetsPage(this); break;
                case "games": current = new GamesPage(this); break;
                case "tune": current = new TunePage(this); break;
                case "about": current = new AboutPage(this); break;
                default: current = new HomePage(this); break;
            }
            current.Dock = DockStyle.Fill;
            content.Controls.Add(current);
            OnResize(EventArgs.Empty);
            Invalidate();
        }
        protected override void OnSignal(int what) { if (current != null) current.Refresh1(); Invalidate(); }
        // Ctrl + 1 to 5: the pages, from the keyboard.
        protected override bool ProcessCmdKey(ref Message msg, Keys k)
        {
            int n = (int)(k & Keys.KeyCode) - (int)Keys.D1;
            if ((k & Keys.Modifiers) == Keys.Control && n >= 0 && n < pages.Length) { Go(pages[n]); return true; }
            return base.ProcessCmdKey(ref msg, k);
        }

        Rectangle NavItem(int i) { return new Rectangle(Theme.S(12), Caption + Theme.S(18) + i * Theme.S(46), NavW - Theme.S(24), Theme.S(40)); }
        protected override bool IsCaption(Point p) { return p.Y < Caption; }
        protected override void OnMouseMove(MouseEventArgs e)
        {
            int h = -1;
            for (int i = 0; i < pages.Length; i++) if (NavW > 0 && NavItem(i).Contains(e.Location)) h = i;
            if (h != navHover) { navHover = h; Cursor = h >= 0 ? Cursors.Hand : Cursors.Default; Invalidate(); }
            base.OnMouseMove(e);
        }
        protected override void OnMouseClick(MouseEventArgs e)
        {
            for (int i = 0; i < pages.Length; i++) if (NavW > 0 && NavItem(i).Contains(e.Location)) Go(pages[i]);
            base.OnMouseClick(e);
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(Theme.Bg);
            using (var b = new SolidBrush(Theme.Panel)) g.FillRectangle(b, 0, 0, ClientSize.Width, Caption);
            if (NavW > 0) using (var b = new SolidBrush(Theme.Panel)) g.FillRectangle(b, 0, Caption, NavW, ClientSize.Height - Caption);
            // Title: the mark and the name.
            if (mark != null) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(mark, Theme.S(14), (Caption - Theme.S(22)) / 2, Theme.S(22), Theme.S(22)); }
            Theme.Draw(g, "OmniDx Hub", Theme.Semi(10f), new Rectangle(Theme.S(44), 0, Theme.S(200), Caption), Theme.Text);
            string st = State.Preset + " preset" + (State.Boost ? "  \u00B7  Game Boost on" : "");
            Theme.Draw(g, st, Theme.UI(9f), new Rectangle(Theme.S(150), 0, Theme.S(400), Caption), State.Boost ? Theme.Accent2 : Theme.Text3);
            PaintButtons(g);
            if (NavW == 0) return;
            for (int i = 0; i < pages.Length; i++)
            {
                var r = NavItem(i);
                bool on = pages[i] == page;
                if (on) { Theme.Fill(g, r, Theme.S(10), Theme.Selected); Theme.FillGrad(g, new Rectangle(r.X, r.Y + Theme.S(10), Theme.S(3), r.Height - Theme.S(20)), 1, 255); }
                else if (i == navHover) Theme.Fill(g, r, Theme.S(10), Theme.Hover);
                Theme.Icon(g, glyphs[i], 11f, new Rectangle(r.X + Theme.S(12), r.Y, Theme.S(24), r.Height), on ? Theme.Accent2 : Theme.Text2);
                Theme.Draw(g, labels[i], on ? Theme.Semi(10f) : Theme.UI(10f), new Rectangle(r.X + Theme.S(46), r.Y, r.Width - Theme.S(50), r.Height), on ? Theme.Text : Theme.Text2);
            }
            // The foot of the rail: the edition.
            var foot = new Rectangle(Theme.S(24), ClientSize.Height - Theme.S(64), NavW - Theme.S(36), Theme.S(44));
            Theme.Draw(g, "OmniDx Edition " + Edition.Version, Theme.Semi(8.5f), new Rectangle(foot.X, foot.Y, foot.Width, Theme.S(20)), Theme.Text3);
            Theme.Draw(g, "Genuine Windows, set up for games", Theme.UI(8f), new Rectangle(foot.X, foot.Y + Theme.S(20), foot.Width, Theme.S(20)), Theme.Text3);
        }

        public static void Elevated(string args, Action done)
        {
            var t = new Thread(() =>
            {
                try
                {
                    var p = Process.Start(new ProcessStartInfo(Edition.Exe("OmniHub"), args) { UseShellExecute = true, Verb = "runas" });
                    if (p != null) p.WaitForExit();
                }
                catch (Exception e) { Edition.Log("elevated " + args + ": " + e.Message); }
                if (done != null) done();
            }) { IsBackground = true };
            t.Start();
        }
        public static void SetBoost(bool on)
        {
            if (Process.GetProcessesByName("OmniSearch").Length == 0) Edition.Start(Edition.Exe("OmniSearch"), "--background" + (on ? " --boost" : ""));
            else Signal.Send(on ? Signal.Boost : Signal.Unboost);
        }
    }

    // ------------------------------------------------------------------ pages
    class Page : Panel
    {
        protected readonly HubForm hub;
        protected int Pad { get { return Theme.S(36); } }
        public Page(HubForm h)
        {
            hub = h;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = Theme.Bg;
        }
        public virtual void Refresh1() { Invalidate(); }
        protected void Title(Graphics g, string title, string sub)
        {
            Theme.Draw(g, title, Theme.Semi(20f), new Rectangle(Pad, Theme.S(22), Width - Pad * 2, Theme.S(44)), Theme.Text);
            if (sub != null) Theme.Draw(g, sub, Theme.UI(10f), new Rectangle(Pad, Theme.S(64), Width - Pad * 2, Theme.S(24)), Theme.Text2);
        }
        protected void Card(Graphics g, Rectangle r) { Theme.Fill(g, r, Theme.S(14), Theme.Surface); Theme.Stroke(g, r, Theme.S(14), Theme.LineSoft, 1); }
        protected FlatButton Button(string text, Look look, EventHandler click)
        {
            var b = new FlatButton(text, look); b.Click += click; Controls.Add(b); b.Width = b.Natural; return b;
        }
    }

    class HomePage : Page
    {
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 1500 };
        int procs, cpu, mem; double memUsed, memTotal, timerMs; long pingMs = -1;
        string plan = "", gpu = "";
        readonly Toggle boost = new Toggle(), auto = new Toggle();
        readonly FlatButton change, free, search, browser, tune;
        Ping pinger = new Ping();
        int tick;
        public HomePage(HubForm h) : base(h)
        {
            boost.On = State.Boost; boost.Changed += (s, e) => HubForm.SetBoost(boost.On); Controls.Add(boost);
            auto.On = State.AutoBoost; auto.Changed += (s, e) => { State.AutoBoost = auto.On; Invalidate(); }; Controls.Add(auto);
            change = Button("Change preset", Look.Secondary, (s, e) => hub.Go("presets"));
            free = Button("Free up memory", Look.Secondary, (s, e) => Edition.Start("schtasks.exe", "/run /tn \"OmniDx\\Edition Free Memory\""));
            free.Glyph = G.Memory; free.Width = free.Natural;
            search = Button("OmniDx Search", Look.Secondary, (s, e) => Edition.Start(Edition.Exe("OmniSearch"), null)); search.Glyph = G.Search; search.Width = search.Natural;
            browser = Button("OmniDx Browser", Look.Secondary, (s, e) => Edition.Start(Edition.Exe("OmniBrowser"), null)); browser.Glyph = G.Globe; browser.Width = browser.Natural;
            tune = Button("Run the tune", Look.Secondary, (s, e) => hub.Go("tune")); tune.Glyph = G.Rocket; tune.Width = tune.Natural;
            pinger.PingCompleted += (s, e) => { pingMs = e.Reply != null && e.Reply.Status == IPStatus.Success ? e.Reply.RoundtripTime : -1; };
            gpu = Gpu();
            timer.Tick += (s, e) => Sample();
            Sample(); timer.Start();
        }
        protected override void Dispose(bool disposing) { timer.Stop(); timer.Dispose(); try { pinger.SendAsyncCancel(); } catch { } base.Dispose(disposing); }
        public override void Refresh1() { boost.On = State.Boost; plan = ""; base.Refresh1(); }

        static string Gpu()
        {
            try
            {
                using (var cls = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"))
                    foreach (var n in cls.GetSubKeyNames().Where(x => Regex.IsMatch(x, "^\\d{4}$")))
                        using (var k = cls.OpenSubKey(n))
                        {
                            var d = k == null ? null : k.GetValue("DriverDesc") as string;
                            if (!string.IsNullOrEmpty(d) && !d.Contains("Basic Display") && !d.Contains("Remote")) return d;
                        }
            }
            catch { }
            return "Display adapter";
        }
        void Sample()
        {
            try { procs = Process.GetProcesses().Length; } catch { }
            cpu = Native.CpuLoad();
            mem = Native.MemoryLoad(out memUsed, out memTotal);
            timerMs = Native.TimerMs();
            if (tick++ % 3 == 0) try { pinger.SendAsync("1.1.1.1", 1000, null); } catch { }
            if (plan == "" || tick % 10 == 0)
            {
                var m = Regex.Match(Presets.Run("powercfg.exe", "/getactivescheme"), "\\((.+)\\)");
                plan = m.Success ? m.Groups[1].Value : "";
            }
            if (boost.On != State.Boost) boost.On = State.Boost;
            Invalidate();
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.Clear(Theme.Bg);
            string hello = DateTime.Now.Hour < 12 ? "Good morning" : DateTime.Now.Hour < 18 ? "Good afternoon" : "Good evening";
            Title(g, hello, Environment.MachineName + "  \u00B7  " + gpu);
            int x = Pad, y = Theme.S(106), w = Width - Pad * 2, gap = Theme.S(14);

            // Game Boost.
            var b = new Rectangle(x, y, w, Theme.S(128));
            if (State.Boost) Theme.FillGrad(g, b, Theme.S(16), 255); else Card(g, b);
            Theme.Icon(g, G.Bolt, 22f, new Rectangle(b.X + Theme.S(18), b.Y + Theme.S(18), Theme.S(40), Theme.S(40)), State.Boost ? Color.White : Theme.Accent2);
            Theme.Draw(g, State.Boost ? "Game Boost is on" : "Game Boost", Theme.Semi(15f), new Rectangle(b.X + Theme.S(66), b.Y + Theme.S(18), w - Theme.S(200), Theme.S(34)), State.Boost ? Color.White : Theme.Text);
            string pre = State.Preset;
            string what = pre == "Insane" ? "0.5 ms timer, the OmniDx Insane plan, standby memory emptied, browser tabs asleep" : pre == "Balanced" ? "The performance plan and browser tabs asleep while you play" : "1 ms timer, the performance plan, browser tabs asleep";
            Theme.Draw(g, what, Theme.UI(10f), new Rectangle(b.X + Theme.S(66), b.Y + Theme.S(52), w - Theme.S(200), Theme.S(24)), State.Boost ? Color.FromArgb(235, 255, 255, 255) : Theme.Text2);
            Theme.Draw(g, "Turn on by itself when a game fills the screen", Theme.UI(9.5f), new Rectangle(b.X + Theme.S(122), b.Y + Theme.S(88), w - Theme.S(200), Theme.S(24)), State.Boost ? Color.White : Theme.Text2);
            auto.Location = new Point(b.X + Theme.S(66), b.Y + Theme.S(89));
            boost.Location = new Point(b.Right - Theme.S(24) - boost.Width, b.Y + Theme.S(28));
            boost.Size = new Size(Theme.S(56), Theme.S(28));
            y = b.Bottom + gap;

            // The numbers.
            var stats = new[] {
                new[] { G.Apps, "Processes", procs.ToString(), "running now" },
                new[] { G.Cpu, "CPU", cpu + "%", "in use" },
                new[] { G.Memory, "Memory", memUsed.ToString("0.0") + " GB", "of " + memTotal.ToString("0") + " GB (" + mem + "%)" },
                new[] { G.Timer, "System timer", timerMs > 0 ? timerMs.ToString("0.##") + " ms" : "-", timerMs > 0 && timerMs < 1.1 ? "fine: Boost is holding it" : "Windows' default" },
                new[] { G.Network, "Ping", pingMs >= 0 ? pingMs + " ms" : "-", "to 1.1.1.1" },
                new[] { G.Clock, "Up", Up(), "since the last start" },
            };
            int cols = 3, cw = (w - gap * (cols - 1)) / cols, ch = Theme.S(96);
            for (int i = 0; i < stats.Length; i++)
            {
                var r = new Rectangle(x + (i % cols) * (cw + gap), y + (i / cols) * (ch + gap), cw, ch);
                Card(g, r);
                Theme.Icon(g, stats[i][0], 11f, new Rectangle(r.X + Theme.S(16), r.Y + Theme.S(14), Theme.S(22), Theme.S(22)), Theme.Accent2);
                Theme.Draw(g, stats[i][1], Theme.UI(9.5f), new Rectangle(r.X + Theme.S(44), r.Y + Theme.S(14), r.Width - Theme.S(56), Theme.S(22)), Theme.Text2);
                Theme.Draw(g, stats[i][2], Theme.Semi(18f), new Rectangle(r.X + Theme.S(16), r.Y + Theme.S(38), r.Width - Theme.S(32), Theme.S(36)), Theme.Text);
                Theme.Draw(g, stats[i][3], Theme.UI(8.5f), new Rectangle(r.X + Theme.S(16), r.Y + Theme.S(70), r.Width - Theme.S(32), Theme.S(20)), Theme.Text3);
            }
            y += 2 * (ch + gap);

            // The preset and the power plan, and the shortcuts.
            var pr = new Rectangle(x, y, w, Theme.S(76));
            Card(g, pr);
            Theme.Icon(g, G.Speed, 14f, new Rectangle(pr.X + Theme.S(16), pr.Y, Theme.S(30), pr.Height), Theme.Accent2);
            Theme.Draw(g, State.Preset + " preset", Theme.Semi(12f), new Rectangle(pr.X + Theme.S(56), pr.Y + Theme.S(12), w - Theme.S(260), Theme.S(28)), Theme.Text);
            Theme.Draw(g, "Power plan: " + (plan == "" ? "..." : plan) + (State.Get("Hotkey", "") != "" ? "   \u00B7   Search: " + State.Get("Hotkey", "") : ""), Theme.UI(9f), new Rectangle(pr.X + Theme.S(56), pr.Y + Theme.S(40), w - Theme.S(260), Theme.S(22)), Theme.Text2);
            change.Location = new Point(pr.Right - change.Width - Theme.S(18), pr.Y + (pr.Height - change.Height) / 2);
            y = pr.Bottom + gap;
            int bx = x;
            foreach (var btn in new[] { search, browser, free, tune }) { btn.Location = new Point(bx, y); bx += btn.Width + Theme.S(10); }
        }
        static string Up()
        {
            var t = TimeSpan.FromMilliseconds(Native.GetTickCount64());
            return t.TotalHours >= 24 ? string.Format("{0}d {1}h", (int)t.TotalDays, t.Hours) : string.Format("{0}h {1:00}m", (int)t.TotalHours, t.Minutes);
        }
    }

    class PresetsPage : Page
    {
        readonly List<FlatButton> apply = new List<FlatButton>();
        readonly FlatButton restore;
        string busy;
        public PresetsPage(HubForm h) : base(h)
        {
            foreach (var p in Presets.All)
            {
                var name = p.Name;
                var b = Button("Apply " + name, name == "Insane" ? Look.Primary : Look.Secondary, (s, e) => ApplyPreset(name));
                b.Shield = true; b.Width = b.Natural; apply.Add(b);
            }
            restore = Button("Restore Windows defaults", Look.Danger, (s, e) =>
            {
                busy = "restore";
                Invalidate();
                HubForm.Elevated("--restore", () => { try { BeginInvoke(new Action(() => { busy = null; hub.Invalidate(); Invalidate(); })); } catch { } });
            });
            restore.Glyph = G.Undo; restore.Width = restore.Natural;
        }
        void ApplyPreset(string name)
        {
            busy = name; Invalidate();
            HubForm.Elevated("--apply " + name, () => { try { BeginInvoke(new Action(() => { busy = null; hub.Invalidate(); Invalidate(); })); } catch { } });
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.Clear(Theme.Bg);
            Title(g, "Presets", "Each one is a set of Windows settings, applied together. Every value is written down first; restore puts it back.");
            int x = Pad, y = Theme.S(108), gap = Theme.S(16), w = (Width - Pad * 2 - gap * 2) / 3, hgt = Math.Max(Theme.S(420), Height - Theme.S(108) - Theme.S(90));
            for (int i = 0; i < Presets.All.Length; i++)
            {
                var p = Presets.All[i];
                var r = new Rectangle(x + i * (w + gap), y, w, hgt);
                bool cur = State.Preset == p.Name;
                if (p.Name == "Insane") { Theme.FillGrad(g, r, Theme.S(16), 255); Theme.Fill(g, Rectangle.Inflate(r, -2, -2), Theme.S(15), Theme.Surface); }
                else Card(g, r);
                if (cur) Theme.Stroke(g, r, Theme.S(16), Theme.Ok, 2);
                Theme.Draw(g, p.Tag.ToUpperInvariant(), Theme.Semi(8f), new Rectangle(r.X + Theme.S(20), r.Y + Theme.S(18), r.Width - Theme.S(40), Theme.S(20)), p.Name == "Insane" ? Theme.Pink : Theme.Accent2);
                Theme.Draw(g, p.Name, Theme.Semi(19f), new Rectangle(r.X + Theme.S(20), r.Y + Theme.S(40), r.Width - Theme.S(40), Theme.S(40)), Theme.Text);
                int by = r.Y + Theme.S(86);
                int bh = Theme.WrappedHeight(p.Blurb, Theme.UI(9.5f), r.Width - Theme.S(40));
                Theme.Wrapped(g, p.Blurb, Theme.UI(9.5f), new Rectangle(r.X + Theme.S(20), by, r.Width - Theme.S(40), bh + 4), Theme.Text2);
                by += bh + Theme.S(14);
                foreach (var d in p.Does)
                {
                    int dh = Theme.WrappedHeight(d, Theme.UI(9f), r.Width - Theme.S(66));
                    Theme.Icon(g, G.Check, 8f, new Rectangle(r.X + Theme.S(20), by, Theme.S(18), Theme.S(20)), Theme.Ok);
                    Theme.Wrapped(g, d, Theme.UI(9f), new Rectangle(r.X + Theme.S(44), by + 1, r.Width - Theme.S(66), dh + 4), Theme.Text);
                    by += dh + Theme.S(8);
                }
                var btn = apply[i];
                btn.Width = r.Width - Theme.S(40);
                btn.Location = new Point(r.X + Theme.S(20), r.Bottom - btn.Height - Theme.S(20));
                btn.Enabled = busy == null && !cur;
                btn.Text = busy == p.Name ? "Applying..." : cur ? "Current preset" : "Apply " + p.Name;
                btn.Shield = !cur && busy == null;
            }
            restore.Location = new Point(x, y + hgt + Theme.S(18));
            restore.Enabled = busy == null;
            Theme.Draw(g, busy == "restore" ? "Restoring..." : "Windows asks for administrator rights for each preset: they change settings for the whole PC.", Theme.UI(9f),
                new Rectangle(restore.Right + Theme.S(16), restore.Top, Width - restore.Right - Pad, restore.Height), Theme.Text3);
        }
    }

    class GamesPage : Page
    {
        List<Game> games = new List<Game>();
        readonly Dictionary<Game, Image> art = new Dictionary<Game, Image>();
        readonly List<KeyValuePair<Rectangle, Game>> hits = new List<KeyValuePair<Rectangle, Game>>();
        Game hover;
        readonly Toggle auto = new Toggle();
        int scroll;
        public GamesPage(HubForm h) : base(h)
        {
            auto.On = State.AutoBoost; auto.Changed += (s, e) => State.AutoBoost = auto.On; Controls.Add(auto);
            var t = new Thread(() =>
            {
                var list = Games.Find();
                var pics = new Dictionary<Game, Image>();
                foreach (var g in list)
                {
                    try { if (g.Art != null) pics[g] = Image.FromFile(g.Art); else if (g.IconPath != null) { var b = Native.IconFor(g.IconPath, false); if (b != null) pics[g] = b; } } catch { }
                }
                try { BeginInvoke(new Action(() => { games = list; foreach (var k in pics) art[k.Key] = k.Value; Invalidate(); })); } catch { }
            }) { IsBackground = true };
            t.SetApartmentState(ApartmentState.STA); t.Start();
        }
        protected override void OnMouseWheel(MouseEventArgs e) { scroll = Math.Max(0, scroll - e.Delta / 2); Invalidate(); base.OnMouseWheel(e); }
        protected override void OnMouseMove(MouseEventArgs e)
        {
            Game h = null; foreach (var x in hits) if (x.Key.Contains(e.Location)) h = x.Value;
            if (h != hover) { hover = h; Cursor = h != null ? Cursors.Hand : Cursors.Default; Invalidate(); }
            base.OnMouseMove(e);
        }
        protected override void OnMouseClick(MouseEventArgs e)
        {
            foreach (var x in hits) if (x.Key.Contains(e.Location)) { if (State.AutoBoost) HubForm.SetBoost(true); Games.Launch(x.Value); }
            base.OnMouseClick(e);
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.Clear(Theme.Bg); hits.Clear();
            Title(g, "Games", games.Count == 0 ? "Looking in Steam, Epic, Riot, Battle.net, EA, Ubisoft and Roblox..." : games.Count + " found on this PC. Click one to play.");
            auto.Location = new Point(Width - Pad - auto.Width, Theme.S(34));
            Theme.Draw(g, "Game Boost when one starts", Theme.UI(9.5f), new Rectangle(auto.Left - Theme.S(230), Theme.S(30), Theme.S(220), Theme.S(30)), Theme.Text2, TextFormatFlags.Right | TextFormatFlags.VerticalCenter);
            if (games.Count == 0)
            {
                var r = new Rectangle(Pad, Theme.S(110), Width - Pad * 2, Theme.S(140));
                Card(g, r);
                Theme.Icon(g, G.Game, 26f, new Rectangle(r.X, r.Y + Theme.S(18), r.Width, Theme.S(50)), Theme.Accent2);
                Theme.Draw(g, "Your games show up here once they are installed.", Theme.UI(10.5f), new Rectangle(r.X, r.Y + Theme.S(76), r.Width, Theme.S(30)), Theme.Text2, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                return;
            }
            int cols = Math.Max(2, (Width - Pad * 2) / Theme.S(250)), gap = Theme.S(16), cw = (Width - Pad * 2 - gap * (cols - 1)) / cols, ch = (int)(cw * 0.62) + Theme.S(46);
            for (int i = 0; i < games.Count; i++)
            {
                var gm = games[i];
                var r = new Rectangle(Pad + (i % cols) * (cw + gap), Theme.S(108) + (i / cols) * (ch + gap) - scroll, cw, ch);
                if (r.Bottom < 0 || r.Top > Height) continue;
                Card(g, r);
                var pic = new Rectangle(r.X + 1, r.Y + 1, r.Width - 2, ch - Theme.S(46));
                Image im;
                using (var clip = Theme.Round(new RectangleF(pic.X, pic.Y, pic.Width, pic.Height + Theme.S(14)), Theme.S(14)))
                {
                    var st = g.Save(); g.SetClip(clip); g.SetClip(pic, CombineMode.Intersect);
                    if (art.TryGetValue(gm, out im) && gm.Art != null) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(im, pic); }
                    else
                    {
                        Theme.FillGrad(g, pic, 0, 200);
                        if (im != null) { int s = Theme.S(56); g.DrawImage(im, pic.X + (pic.Width - s) / 2, pic.Y + (pic.Height - s) / 2, s, s); }
                        else Theme.Draw(g, gm.Name.Substring(0, 1), Theme.Semi(28f), pic, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                    }
                    if (hover == gm) using (var b = new SolidBrush(Color.FromArgb(90, 0, 0, 0))) g.FillRectangle(b, pic);
                    g.Restore(st);
                }
                if (hover == gm)
                {
                    var play = new Rectangle(pic.X + (pic.Width - Theme.S(110)) / 2, pic.Y + (pic.Height - Theme.S(40)) / 2, Theme.S(110), Theme.S(40));
                    Theme.FillGrad(g, play, Theme.S(20), 255);
                    Theme.Draw(g, "\u25B6  Play", Theme.Semi(10.5f), play, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                }
                Theme.Draw(g, gm.Name, Theme.Semi(10f), new Rectangle(r.X + Theme.S(14), pic.Bottom + Theme.S(4), r.Width - Theme.S(90), Theme.S(38)), Theme.Text);
                Theme.Draw(g, gm.Source, Theme.UI(8.5f), new Rectangle(r.Right - Theme.S(80), pic.Bottom + Theme.S(4), Theme.S(66), Theme.S(38)), Theme.Text3, TextFormatFlags.Right | TextFormatFlags.VerticalCenter);
                hits.Add(new KeyValuePair<Rectangle, Game>(r, gm));
            }
        }
    }

    class TunePage : Page
    {
        public TunePage(HubForm h) : base(h)
        {
            var run = Button("Run the tune", Look.Primary, (s, e) => Ps("irm omnidx.net/go.ps1 | iex")); run.Glyph = G.Rocket; run.Width = run.Natural;
            var ext = Button("Run it with Extreme", Look.Secondary, (s, e) => Ps("$env:OMNIDX_MODE='extreme'; irm omnidx.net/go.ps1 | iex")); ext.Glyph = G.Bolt; ext.Width = ext.Natural;
            var look = Button("Free look (changes nothing)", Look.Secondary, (s, e) => Ps("$env:OMNIDX_MODE='report'; irm omnidx.net/go.ps1 | iex")); look.Glyph = G.Search; look.Width = look.Natural;
            var status = Button("Status", Look.Secondary, (s, e) => Ps("$env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex")); status.Glyph = G.Info; status.Width = status.Natural;
            var undoLast = Button("Undo the last run", Look.Secondary, (s, e) => Ps("$env:OMNIDX_MODE='undolast'; irm omnidx.net/go.ps1 | iex")); undoLast.Glyph = G.Undo; undoLast.Width = undoLast.Natural;
            var undo = Button("Undo everything", Look.Danger, (s, e) => Ps("$env:OMNIDX_MODE='undo'; irm omnidx.net/go.ps1 | iex")); undo.Glyph = G.Undo; undo.Width = undo.Natural;
            var folder = Button("Open the reports", Look.Ghost, (s, e) => { if (Directory.Exists(@"C:\OmniDx")) Edition.Start(@"C:\OmniDx", null); }); folder.Glyph = G.Folder; folder.Width = folder.Natural;
            Rows = new[] { new[] { run, ext, look }, new[] { status, undoLast, undo, folder } };
        }
        readonly FlatButton[][] Rows;
        static void Ps(string cmd) { Edition.Start("powershell.exe", "-NoExit -NoProfile -ExecutionPolicy Bypass -Command \"" + cmd + "\""); }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.Clear(Theme.Bg);
            Title(g, "The OmniDx tune", "The one command, from inside the Hub. It reads the PC, keeps what you use and cuts the rest, with a restore point first and undo.");
            int x = Pad, y = Theme.S(110), w = Width - Pad * 2;
            var r = new Rectangle(x, y, w, Theme.S(118));
            Card(g, r);
            string last = "Not run on this PC yet.";
            try
            {
                if (Directory.Exists(@"C:\OmniDx"))
                {
                    var f = new DirectoryInfo(@"C:\OmniDx").GetFiles("*.html", SearchOption.TopDirectoryOnly).OrderByDescending(z => z.LastWriteTime).FirstOrDefault();
                    if (f != null) last = "Last run " + f.LastWriteTime.ToString("d MMMM yyyy, HH:mm") + ". The report and the undo script are in C:\\OmniDx.";
                }
            }
            catch { }
            Theme.Icon(g, G.Rocket, 18f, new Rectangle(r.X + Theme.S(18), r.Y + Theme.S(18), Theme.S(40), Theme.S(40)), Theme.Accent2);
            Theme.Draw(g, last, Theme.Semi(11f), new Rectangle(r.X + Theme.S(70), r.Y + Theme.S(20), w - Theme.S(90), Theme.S(28)), Theme.Text);
            Theme.Wrapped(g, "Extreme also switches off animations, notifications, Windows Search indexing and the extra services; OmniDx Search keeps its own list of your files, so searching still works. Undo the last run puts back only Extreme.",
                Theme.UI(9.5f), new Rectangle(r.X + Theme.S(70), r.Y + Theme.S(52), w - Theme.S(100), Theme.S(60)), Theme.Text2);
            y = r.Bottom + Theme.S(22);
            foreach (var row in Rows)
            {
                int bx = x;
                foreach (var b in row) { b.Location = new Point(bx, y); bx += b.Width + Theme.S(10); }
                y += Theme.S(50);
            }
        }
    }

    class AboutPage : Page
    {
        public AboutPage(HubForm h) : base(h)
        {
            var site = Button("omnidx.net", Look.Secondary, (s, e) => Edition.Start(Edition.Exe("OmniBrowser"), "https://omnidx.net")); site.Glyph = G.Globe; site.Width = site.Natural;
            var undo = Button("Remove OmniDx Edition", Look.Danger, (s, e) =>
            {
                if (MessageBox.Show(this, "Put back the Windows look, taskbar, search, browser and presets as they were before OmniDx Edition? The tune's own changes stay (the Tune page undoes those).", "OmniDx Edition", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return;
                try { Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(Edition.Dir, "setup.ps1") + "\" -Undo") { UseShellExecute = true, Verb = "runas" }); } catch { }
            });
            undo.Glyph = G.Undo; undo.Width = undo.Natural;
            Btns = new[] { site, undo };
        }
        readonly FlatButton[] Btns;
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.Clear(Theme.Bg);
            Title(g, "OmniDx Edition " + Edition.Version, "Genuine Windows, set up for games, with OmniDx's own search, browser and hub.");
            int x = Pad, y = Theme.S(110), w = Width - Pad * 2;
            var keys = new[] {
                new[] { State.Get("Hotkey", "Win + S"), "OmniDx Search: apps, games, settings, files, sums, the web" },
                new[] { "Esc", "Close the search" },
                new[] { "Ctrl + Enter", "In the search: open as administrator" },
                new[] { "> command", "In the search: run a command, as in Windows + R" },
                new[] { "Ctrl + T / W / L", "In the browser: new tab, close tab, address bar" },
                new[] { "Ctrl + Shift + T", "In the browser: reopen the tab you closed" },
                new[] { "F11", "In the browser: full screen" },
            };
            var r = new Rectangle(x, y, w, Theme.S(40) + keys.Length * Theme.S(34));
            Card(g, r);
            Theme.Draw(g, "Keys", Theme.Semi(11f), new Rectangle(r.X + Theme.S(20), r.Y + Theme.S(12), w, Theme.S(26)), Theme.Text);
            for (int i = 0; i < keys.Length; i++)
            {
                int ky = r.Y + Theme.S(44) + i * Theme.S(34);
                var kr = new Rectangle(r.X + Theme.S(20), ky, Theme.S(150), Theme.S(26));
                Theme.Fill(g, kr, Theme.S(6), Theme.Surface2);
                Theme.Draw(g, keys[i][0], Theme.Semi(8.5f), kr, Theme.Accent2, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                Theme.Draw(g, keys[i][1], Theme.UI(9.5f), new Rectangle(kr.Right + Theme.S(16), ky, w - Theme.S(220), Theme.S(26)), Theme.Text2);
            }
            y = r.Bottom + Theme.S(18);
            string legal = "Windows is a trademark of Microsoft Corporation. OmniDx Edition is not made or endorsed by Microsoft: it is the Windows you installed from Microsoft, with OmniDx's settings, apps and pictures added on top. Everything it changes is recorded, and Remove OmniDx Edition puts it back.";
            int lh = Theme.WrappedHeight(legal, Theme.UI(9f), w);
            Theme.Wrapped(g, legal, Theme.UI(9f), new Rectangle(x, y, w, lh + 4), Theme.Text3);
            y += lh + Theme.S(18);
            int bx = x;
            foreach (var b in Btns) { b.Location = new Point(bx, y); bx += b.Width + Theme.S(10); }
        }
    }

    // The first sign-in after setup.
    class WelcomePage : Page
    {
        readonly Image logo;
        public WelcomePage(HubForm h, Image logo) : base(h)
        {
            this.logo = logo;
            var pick = Button("Pick a preset", Look.Secondary, (s, e) => hub.Go("presets")); pick.Glyph = G.Speed; pick.Width = pick.Natural;
            var go = Button("Start playing", Look.Primary, (s, e) => hub.Go("home")); go.Glyph = G.Play; go.Width = go.Natural + Theme.S(20);
            Btns = new[] { go, pick };
            State.Set("Welcomed", DateTime.Now.ToString("s"));
        }
        readonly FlatButton[] Btns;
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.Clear(Theme.Bg);
            // A soft violet glow behind the logo, like the site.
            using (var path = new GraphicsPath())
            {
                var glow = new Rectangle(Width / 2 - Theme.S(420), Theme.S(-120), Theme.S(840), Theme.S(520));
                path.AddEllipse(glow);
                using (var b = new PathGradientBrush(path) { CenterColor = Color.FromArgb(70, Theme.Accent), SurroundColors = new[] { Color.FromArgb(0, Theme.Bg) } }) g.FillEllipse(b, glow);
            }
            int y = Theme.S(28);
            if (logo != null)
            {
                int lw = Math.Min(Theme.S(460), Width - Theme.S(80)), lh = lw * logo.Height / logo.Width;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(logo, (Width - lw) / 2, y, lw, lh);
                y += lh + Theme.S(10);
            }
            Theme.Draw(g, "Welcome to OmniDx Edition", Theme.Semi(22f), new Rectangle(0, y, Width, Theme.S(48)), Theme.Text, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            y += Theme.S(50);
            Theme.Draw(g, "Your Windows, set up for games. Three things to know:", Theme.UI(11f), new Rectangle(0, y, Width, Theme.S(28)), Theme.Text2, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            y += Theme.S(48);
            var facts = new[] {
                new[] { G.Search, State.Get("Hotkey", "Win + S"), "opens OmniDx Search: apps, games, settings, files and the web." },
                new[] { G.Bolt, "Game Boost", "turns on by itself when a game fills the screen, and off after." },
                new[] { G.Speed, State.Preset + " preset", "is on. Insane is one click away in Presets; restore is one more." },
            };
            int cw = Math.Min(Theme.S(300), (Width - Theme.S(120)) / 3), gap = Theme.S(18), x = (Width - (cw * 3 + gap * 2)) / 2, ch = Theme.S(150);
            for (int i = 0; i < 3; i++)
            {
                var r = new Rectangle(x + i * (cw + gap), y, cw, ch);
                Card(g, r);
                Theme.Icon(g, facts[i][0], 16f, new Rectangle(r.X + Theme.S(18), r.Y + Theme.S(18), Theme.S(34), Theme.S(34)), Theme.Accent2);
                Theme.Draw(g, facts[i][1], Theme.Semi(12f), new Rectangle(r.X + Theme.S(18), r.Y + Theme.S(58), r.Width - Theme.S(36), Theme.S(28)), Theme.Text);
                Theme.Wrapped(g, facts[i][2], Theme.UI(9.5f), new Rectangle(r.X + Theme.S(18), r.Y + Theme.S(88), r.Width - Theme.S(36), Theme.S(56)), Theme.Text2);
            }
            y += ch + Theme.S(30);
            int total = Btns.Sum(b => b.Width) + Theme.S(12), bx = (Width - total) / 2;
            foreach (var b in Btns) { b.Location = new Point(bx, y); bx += b.Width + Theme.S(12); }
        }
    }
}
