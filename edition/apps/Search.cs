// OmniDx Search: Windows + S, or the lens on the taskbar. Apps, games, settings, files, sums and the web in one box,
// open before the key comes back up. It lives in the background (about 20 MB) so there is nothing to start when
// you ask for it, and it is also what runs Game Boost: the finer system timer, the performance power plan and the
// browser's tabs put to sleep while a game has the screen.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace OmniDx
{
    static class SearchProgram
    {
        [STAThread]
        static void Main(string[] args)
        {
            Theme.Init();
            bool background = args.Any(a => a == "--background");
            bool created;
            var one = new Mutex(true, @"Local\OmniDx.Search", out created);
            var showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\OmniDx.Search.Show");
            if (!created)
            {
                // Already running: let it take the foreground and ask it to open.
                foreach (var p in Process.GetProcessesByName(Process.GetCurrentProcess().ProcessName))
                    if (p.Id != Process.GetCurrentProcess().Id) Native.AllowSetForegroundWindow(p.Id);
                if (args.Any(a => a == "--boost")) { Signal.Send(Signal.Boost); return; }
                if (args.Any(a => a == "--unboost")) { Signal.Send(Signal.Unboost); return; }
                if (!background) showEvent.Set();
                return;
            }
            var form = new SearchForm();
            var h = form.Handle; // the window exists, hidden, from the start: the hot key and the signals need it
            var waiter = new Thread(() => { while (true) { showEvent.WaitOne(); try { form.BeginInvoke(new Action(form.ShowSearch)); } catch { } } }) { IsBackground = true };
            waiter.Start();
            if (!background) form.Shown1 = true;
            if (args.Any(a => a == "--boost")) form.Boost.Set(true, false);
            Application.Run(new SearchContext(form));
            GC.KeepAlive(one);
        }
    }

    class SearchContext : ApplicationContext
    {
        public SearchContext(SearchForm f)
        {
            if (f.Shown1) f.ShowSearch();
        }
    }

    // One thing the box can find.
    class Item
    {
        public string Title, Sub, Kind, Target, Args, Glyph, Key, Keywords;
        public Bitmap Icon;
        public string IconSource;
        public Game Game;
        public Action Run;
        public bool Confirm;      // Enter twice (restart, shut down)
        public string Lower;
        public string[] Words;
        public string Initials;
        public int Weight;
        public void Prepare()
        {
            Lower = (Title ?? "").ToLowerInvariant();
            Words = Regex.Split(Lower, "[^a-z0-9]+").Where(w => w.Length > 0).ToArray();
            Initials = new string(Words.Select(w => w[0]).ToArray());
            if (Key == null) Key = Kind + ":" + (Target ?? Title);
        }
    }

    // ------------------------------------------------------------------ everything the box knows about
    class Index
    {
        public List<Item> Apps = new List<Item>(), Settings = new List<Item>(), Actions = new List<Item>(), Games = new List<Item>(), Files = new List<Item>();
        public DateTime Built = DateTime.MinValue;
        public bool Building;
        public event Action Ready;
        readonly Dictionary<string, int> uses = new Dictionary<string, int>();
        readonly string usesFile = Path.Combine(Edition.Local, "search-usage.txt");

        public Index()
        {
            try { foreach (var l in File.ReadAllLines(usesFile)) { var p = l.Split('\t'); int n; if (p.Length == 2 && int.TryParse(p[1], out n)) uses[p[0]] = n; } } catch { }
        }
        public int Uses(string key) { int n; return uses.TryGetValue(key, out n) ? n : 0; }
        public void Used(string key)
        {
            uses[key] = Uses(key) + 1;
            try { File.WriteAllLines(usesFile, uses.OrderByDescending(k => k.Value).Take(400).Select(k => k.Key + "\t" + k.Value)); } catch { }
        }

        public void Build(Action<Action> ui)
        {
            if (Building) return;
            Building = true;
            var t = new Thread(() =>
            {
                var sw = Stopwatch.StartNew();
                var apps = new List<Item>(); var games = new List<Item>(); var files = new List<Item>();
                try { apps = FindApps(); } catch (Exception e) { Edition.Log("apps: " + e.Message); }
                try { games = global::OmniDx.Games.Find().Select(ToItem).ToList(); } catch (Exception e) { Edition.Log("games: " + e.Message); }
                var settings = SettingsList();
                var actions = ActionsList();
                foreach (var i in apps.Concat(games).Concat(settings).Concat(actions)) i.Prepare();
                ui(() => { Apps = apps; Games = games; Settings = settings; Actions = actions; if (Ready != null) Ready(); });
                // Icons, then files: the list is usable before either is done.
                foreach (var i in apps.Concat(games)) { if (i.Icon == null && i.IconSource != null) i.Icon = Native.IconFor(i.IconSource, false); }
                ui(() => { if (Ready != null) Ready(); });
                try { files = FindFiles(); } catch (Exception e) { Edition.Log("files: " + e.Message); }
                ui(() => { Files = files; Built = DateTime.Now; Building = false; if (Ready != null) Ready(); });
                Edition.Log(string.Format("index: {0} apps, {1} games, {2} files in {3} ms", apps.Count, games.Count, files.Count, sw.ElapsedMilliseconds));
            });
            t.IsBackground = true; t.SetApartmentState(ApartmentState.STA); t.Priority = ThreadPriority.BelowNormal;
            t.Start();
        }

        static Item ToItem(Game g)
        {
            return new Item { Title = g.Name, Sub = g.Source + " game", Kind = "Game", Game = g, IconSource = g.IconPath, Glyph = G.Game, Weight = 60, Key = "Game:" + g.Source + ":" + g.Name };
        }

        static object Call(object o, string name, params object[] a) { return o.GetType().InvokeMember(name, BindingFlags.InvokeMethod, null, o, a); }
        static object Prop(object o, string name) { return o.GetType().InvokeMember(name, BindingFlags.GetProperty, null, o, null); }
        static readonly string[] Junk = { "uninstall", "readme", "read me", "release notes", "website", "help", "documentation", "license", "manual", "changelog", "support" };

        // Every app Start knows about, desktop and Store alike: the same list as All apps.
        static List<Item> FindApps()
        {
            var list = new List<Item>();
            var shellType = Type.GetTypeFromProgID("Shell.Application");
            object shell = Activator.CreateInstance(shellType);
            try
            {
                object folder = Call(shell, "NameSpace", "shell:AppsFolder");
                object items = Call(folder, "Items");
                int n = (int)Prop(items, "Count");
                for (int i = 0; i < n; i++)
                {
                    object it = Call(items, "Item", i);
                    string name = (string)Prop(it, "Name"), path = (string)Prop(it, "Path");
                    if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(path)) continue;
                    string low = name.ToLowerInvariant();
                    if (Junk.Any(j => low.Contains(j))) continue;
                    if (path.StartsWith("http", StringComparison.OrdinalIgnoreCase)) continue;
                    var item = new Item { Title = name, Kind = "App", Target = path, IconSource = "shell:AppsFolder\\" + path, Weight = 50 };
                    item.Sub = File.Exists(path) ? Path.GetDirectoryName(path) : (path.Contains("!") ? "App" : "App");
                    if (name == "OmniDx Browser" || name == "OmniDx Hub" || name == "OmniDx Search") item.Weight = 80;
                    list.Add(item);
                    Marshal.ReleaseComObject(it);
                }
            }
            finally { Marshal.ReleaseComObject(shell); }
            return list;
        }

        // The pages of Settings people look for, by the words they use.
        static List<Item> SettingsList()
        {
            var s = new[] {
                "Display|ms-settings:display|screen resolution scale brightness monitor",
                "Advanced display (refresh rate)|ms-settings:display-advanced|hz refresh rate 144 240 monitor",
                "Graphics (GPU per app, HAGS)|ms-settings:display-advancedgraphics|gpu hardware accelerated scheduling high performance",
                "HDR|ms-settings:display-hdr|hdr auto hdr",
                "Night light|ms-settings:nightlight|blue light",
                "Sound|ms-settings:sound|audio volume speakers headphones microphone output input",
                "Sound devices|ms-settings:sound-devices|audio",
                "Volume mixer|ms-settings:apps-volume|app volume",
                "Bluetooth & devices|ms-settings:bluetooth|pair controller headset",
                "Mouse|ms-settings:mousetouchpad|pointer speed sensitivity",
                "Keyboard|ms-settings:typing|typing",
                "Game Mode|ms-settings:gaming-gamemode|gaming",
                "Game Bar|ms-settings:gaming-gamebar|xbox overlay",
                "Captures|ms-settings:gaming-gamedvr|record clips",
                "Wi-Fi|ms-settings:network-wifi|wireless internet",
                "Ethernet|ms-settings:network-ethernet|wired internet",
                "Network & internet|ms-settings:network|connection dns proxy vpn",
                "Windows Update|ms-settings:windowsupdate|updates patch",
                "Apps (installed)|ms-settings:appsfeatures|uninstall programs installed",
                "Startup apps|ms-settings:startupapps|boot startup",
                "Default apps|ms-settings:defaultapps|browser default",
                "Storage|ms-settings:storagesense|disk space cleanup",
                "Power & battery|ms-settings:powersleep|sleep power plan",
                "About this PC|ms-settings:about|specs ram cpu name rename",
                "Personalization|ms-settings:personalization|theme wallpaper",
                "Background (wallpaper)|ms-settings:personalization-background|wallpaper",
                "Colors|ms-settings:colors|dark mode accent",
                "Taskbar|ms-settings:taskbar|alignment pins",
                "Notifications|ms-settings:notifications|do not disturb focus",
                "Privacy & security|ms-settings:privacy|permissions",
                "Windows Security|windowsdefender:|antivirus defender virus",
                "Time & language|ms-settings:dateandtime|clock time zone",
                "Accounts|ms-settings:yourinfo|account sign in",
                "Recovery|ms-settings:recovery|reset restore",
                "Optional features|ms-settings:optionalfeatures|features",
                "Device Manager|devmgmt.msc|drivers hardware",
                "Disk Management|diskmgmt.msc|partition drive",
                "Services|services.msc|service",
                "Event Viewer|eventvwr.msc|logs errors",
                "Task Scheduler|taskschd.msc|tasks",
                "Registry Editor|regedit.exe|regedit",
                "Control Panel|control.exe|classic",
                "Sound (classic)|mmsys.cpl|playback recording devices",
                "Network Connections|ncpa.cpl|adapters",
                "Power Options (classic)|powercfg.cpl|power plan",
                "Mouse properties|main.cpl|pointer",
                "System properties|sysdm.cpl|environment variables",
                "Performance options|SystemPropertiesPerformance.exe|visual effects virtual memory pagefile",
                "Resource Monitor|resmon.exe|resources",
                "DirectX Diagnostic|dxdiag.exe|dxdiag directx",
                "System Information|msinfo32.exe|msinfo specs",
                "Disk Cleanup|cleanmgr.exe|clean temp",
                "Task Manager|taskmgr.exe|processes end task",
                "Command Prompt|cmd.exe|cmd terminal",
                "PowerShell|powershell.exe|terminal shell",
            };
            var list = new List<Item>();
            foreach (var l in s)
            {
                var p = l.Split('|');
                bool ms = p[1].StartsWith("ms-settings", StringComparison.Ordinal) || p[1] == "windowsdefender:";
                list.Add(new Item { Title = p[0], Target = p[1], Keywords = p[2], Kind = ms ? "Setting" : "Tool", Sub = ms ? "Settings" : "Windows tool", Glyph = ms ? G.Settings : G.Wrench, Weight = 30,
                    IconSource = ms ? null : p[1] });
            }
            return list;
        }

        public Item BoostItem;
        List<Item> ActionsList()
        {
            var list = new List<Item>();
            BoostItem = new Item { Title = "Game Boost", Kind = "Action", Glyph = G.Bolt, Keywords = "boost game mode performance fps latency timer", Weight = 70, Key = "Action:boost" };
            list.Add(BoostItem);
            list.Add(new Item { Title = "OmniDx Hub", Sub = "Presets, Game Boost, your games and the tune", Kind = "Action", Glyph = G.Speed, Target = Edition.Exe("OmniHub"), IconSource = Edition.Exe("OmniHub"), Keywords = "omnidx hub presets tune", Weight = 75 });
            list.Add(new Item { Title = "Presets (Balanced, Competitive, Insane)", Sub = "OmniDx Hub", Kind = "Action", Glyph = G.Speed, Target = Edition.Exe("OmniHub"), Args = "--page presets", Keywords = "preset insane competitive balanced", Weight = 60 });
            list.Add(new Item { Title = "Free up memory", Sub = "Empty the standby list (Windows refills it as you use the PC)", Kind = "Action", Glyph = G.Memory, Keywords = "ram memory standby clean", Weight = 40,
                Run = () => Edition.Start("schtasks.exe", "/run /tn \"OmniDx\\Edition Free Memory\"") });
            list.Add(new Item { Title = "Run the OmniDx tune", Sub = "irm omnidx.net/go.ps1 | iex", Kind = "Action", Glyph = G.Rocket, Keywords = "tune optimize omnidx", Weight = 40,
                Run = () => Edition.Start("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"irm omnidx.net/go.ps1 | iex\"") });
            list.Add(new Item { Title = "OmniDx status", Sub = "What the tune still has in place", Kind = "Action", Glyph = G.Info, Keywords = "status tune", Weight = 30,
                Run = () => Edition.Start("powershell.exe", "-NoExit -NoProfile -ExecutionPolicy Bypass -Command \"$env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex\"") });
            list.Add(new Item { Title = "Restart", Sub = "Restart the PC", Kind = "Action", Glyph = G.Restart, Keywords = "reboot restart", Confirm = true, Weight = 20, Run = () => Edition.Start("shutdown.exe", "/r /t 0") });
            list.Add(new Item { Title = "Shut down", Sub = "Turn the PC off", Kind = "Action", Glyph = G.Power, Keywords = "shutdown power off turn off", Confirm = true, Weight = 20, Run = () => Edition.Start("shutdown.exe", "/s /hybrid /t 0") });
            list.Add(new Item { Title = "Sleep", Sub = "Put the PC to sleep", Kind = "Action", Glyph = G.Moon, Keywords = "sleep suspend", Confirm = true, Weight = 20, Run = () => Native.SetSuspendState(false, false, false) });
            list.Add(new Item { Title = "Lock", Sub = "Lock the PC", Kind = "Action", Glyph = G.Lock, Keywords = "lock", Weight = 20, Run = () => Native.LockWorkStation() });
            list.Add(new Item { Title = "Sign out", Sub = "Sign out of Windows", Kind = "Action", Glyph = G.Power, Keywords = "logoff log off sign out", Confirm = true, Weight = 15, Run = () => Edition.Start("shutdown.exe", "/l") });
            list.Add(new Item { Title = "Empty Recycle Bin", Sub = "Delete what is in the Recycle Bin", Kind = "Action", Glyph = G.Close, Keywords = "trash recycle", Confirm = true, Weight = 15, Run = () => Native.SHEmptyRecycleBin(IntPtr.Zero, null, 7) });
            list.Add(new Item { Title = "Flush DNS", Sub = "Clear the DNS cache (a site that will not load after a change)", Kind = "Action", Glyph = G.Network, Keywords = "dns network internet ipconfig", Weight = 15,
                Run = () => { var p = new ProcessStartInfo("ipconfig.exe", "/flushdns") { CreateNoWindow = true, UseShellExecute = false }; try { Process.Start(p); } catch { } } });
            list.Add(new Item { Title = "Restart Windows Explorer", Sub = "The taskbar and desktop, restarted", Kind = "Action", Glyph = G.Refresh, Keywords = "explorer taskbar frozen", Weight = 10,
                Run = () => { foreach (var p in Process.GetProcessesByName("explorer")) try { p.Kill(); } catch { } } });
            return list;
        }

        // Names of files and folders in your own folders: a quick list kept in memory, since the tune's Extreme mode
        // switches Windows' search indexing off.
        static List<Item> FindFiles()
        {
            var list = new List<Item>();
            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            var roots = new[] { "Desktop", "Documents", "Downloads", "Pictures", "Videos", "Music", "OneDrive" }.Select(r => Path.Combine(home, r)).Where(Directory.Exists).ToList();
            var skip = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "node_modules", ".git", "AppData", "$RECYCLE.BIN", "__pycache__", ".vs", "obj", "bin", "Cache", "cache" };
            var stack = new Stack<KeyValuePair<string, int>>();
            foreach (var r in roots) stack.Push(new KeyValuePair<string, int>(r, 0));
            while (stack.Count > 0 && list.Count < 40000)
            {
                var cur = stack.Pop();
                try
                {
                    foreach (var d in Directory.EnumerateDirectories(cur.Key))
                    {
                        string n = Path.GetFileName(d);
                        if (n.StartsWith(".") || skip.Contains(n)) continue;
                        try { if ((File.GetAttributes(d) & (FileAttributes.Hidden | FileAttributes.System | FileAttributes.ReparsePoint)) != 0) continue; } catch { continue; }
                        var it = new Item { Title = n, Sub = d, Kind = "Folder", Target = d, Glyph = G.Folder, Weight = 5 };
                        it.Lower = n.ToLowerInvariant(); it.Key = "Folder:" + d; list.Add(it);
                        if (cur.Value < 5) stack.Push(new KeyValuePair<string, int>(d, cur.Value + 1));
                    }
                    foreach (var f in Directory.EnumerateFiles(cur.Key))
                    {
                        string n = Path.GetFileName(f);
                        if (n.StartsWith(".") || n.StartsWith("~$") || n.Equals("desktop.ini", StringComparison.OrdinalIgnoreCase)) continue;
                        var it = new Item { Title = n, Sub = Path.GetDirectoryName(f), Kind = "File", Target = f, Glyph = G.Doc, Weight = 0 };
                        it.Lower = n.ToLowerInvariant(); it.Key = "File:" + f; list.Add(it);
                    }
                }
                catch { }
            }
            return list;
        }
    }

    // ------------------------------------------------------------------ sums typed into the box
    static class Calc
    {
        public static bool TryEval(string s, out double v)
        {
            v = 0;
            s = s.Trim().TrimStart('=').Replace(",", "").Replace("\u00D7", "*").Replace("\u00F7", "/").Replace("x", "*");
            if (s.Length < 2 || !Regex.IsMatch(s, @"^[\d\s\.\+\-\*/%\^\(\)a-z]+$") || !Regex.IsMatch(s, @"\d")) return false;
            if (!Regex.IsMatch(s, @"[\+\-\*/%\^\(]|sqrt|sin|cos|tan|log|ln|abs|pi")) return false;
            try { int i = 0; v = Expr(s.Replace(" ", ""), ref i); return i == s.Replace(" ", "").Length && !double.IsNaN(v) && !double.IsInfinity(v); }
            catch { return false; }
        }
        static double Expr(string s, ref int i)
        {
            double v = Term(s, ref i);
            while (i < s.Length && (s[i] == '+' || s[i] == '-')) { char op = s[i++]; double r = Term(s, ref i); v = op == '+' ? v + r : v - r; }
            return v;
        }
        static double Term(string s, ref int i)
        {
            double v = Power(s, ref i);
            while (i < s.Length && (s[i] == '*' || s[i] == '/' || s[i] == '%'))
            {
                char op = s[i++]; double r = Power(s, ref i);
                v = op == '*' ? v * r : op == '/' ? v / r : v % r;
            }
            return v;
        }
        static double Power(string s, ref int i)
        {
            double b = Unary(s, ref i);
            if (i < s.Length && s[i] == '^') { i++; return Math.Pow(b, Power(s, ref i)); }
            return b;
        }
        static double Unary(string s, ref int i)
        {
            if (i < s.Length && s[i] == '-') { i++; return -Unary(s, ref i); }
            if (i < s.Length && s[i] == '+') { i++; return Unary(s, ref i); }
            return Atom(s, ref i);
        }
        static double Atom(string s, ref int i)
        {
            if (i < s.Length && s[i] == '(') { i++; double v = Expr(s, ref i); if (i >= s.Length || s[i] != ')') throw new FormatException(); i++; return v; }
            var m = Regex.Match(s.Substring(i), @"^(sqrt|sin|cos|tan|log|ln|abs|pi|e)(?![a-z])");
            if (m.Success)
            {
                string f = m.Groups[1].Value; i += f.Length;
                if (f == "pi") return Math.PI;
                if (f == "e") return Math.E;
                double a = Atom(s, ref i);
                switch (f) { case "sqrt": return Math.Sqrt(a); case "sin": return Math.Sin(a); case "cos": return Math.Cos(a); case "tan": return Math.Tan(a); case "log": return Math.Log10(a); case "ln": return Math.Log(a); default: return Math.Abs(a); }
            }
            int st = i;
            while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '.')) i++;
            if (st == i) throw new FormatException();
            return double.Parse(s.Substring(st, i - st), CultureInfo.InvariantCulture);
        }
        public static string Show(double v)
        {
            if (Math.Abs(v - Math.Round(v)) < 1e-9 && Math.Abs(v) < 1e15) return Math.Round(v).ToString("#,0", CultureInfo.InvariantCulture);
            return v.ToString("#,0.##########", CultureInfo.InvariantCulture);
        }
    }

    // ------------------------------------------------------------------ Game Boost
    // Turned on by hand (the box, the Hub, the tray) or by itself when a game fills the screen.
    class Booster
    {
        public bool On { get; private set; }
        public bool Auto { get; private set; }
        uint heldTimer;
        DateTime lastFull = DateTime.MinValue;
        int ownPid = Process.GetCurrentProcess().Id;
        public event Action Changed;

        public void Set(bool on, bool auto)
        {
            if (on == On) { if (!on) Auto = false; return; }
            On = on; Auto = on && auto;
            string preset = State.Preset;
            if (on)
            {
                uint want = preset == "Insane" ? 5000u : preset == "Competitive" ? 10000u : 0u;
                if (want > 0) { uint cur; try { if (Native.NtSetTimerResolution(want, true, out cur) == 0) heldTimer = want; } catch { } }
                string prev = ActiveScheme();
                string perf = PerformanceScheme();
                if (prev != null && perf != null && !prev.Equals(perf, StringComparison.OrdinalIgnoreCase)) { State.Set("BoostPrevScheme", prev); Powercfg("/setactive " + perf); }
                if (preset == "Insane") Edition.Start("schtasks.exe", "/run /tn \"OmniDx\\Edition Free Memory\"");
            }
            else
            {
                if (heldTimer > 0) { uint cur; try { Native.NtSetTimerResolution(heldTimer, false, out cur); } catch { } heldTimer = 0; }
                string prev = State.Get("BoostPrevScheme", null);
                if (!string.IsNullOrEmpty(prev)) { Powercfg("/setactive " + prev); State.Set("BoostPrevScheme", ""); }
            }
            State.Boost = on;
            Edition.Log("boost " + (on ? "on" : "off") + (auto ? " (a game has the screen)" : ""));
            Signal.Send(on ? Signal.Boost : Signal.Unboost);
            if (Changed != null) Changed();
        }

        // Every two seconds: is something other than the desktop or our own windows filling the screen?
        public void Tick()
        {
            if (!State.AutoBoost) { if (On && Auto) Set(false, false); return; }
            int pid;
            bool full = Native.ForegroundFullscreen(out pid) && pid != ownPid && !IsOurs(pid);
            if (full) { lastFull = DateTime.Now; if (!On) Set(true, true); }
            else if (On && Auto && (DateTime.Now - lastFull).TotalSeconds > 20) Set(false, false);
        }
        static bool IsOurs(int pid)
        {
            try
            {
                string n = Process.GetProcessById(pid).ProcessName.ToLowerInvariant();
                return n == "omnibrowser" || n == "omnihub" || n == "explorer" || n == "msedgewebview2" || n == "applicationframehost" || n == "searchhost" || n == "startmenuexperiencehost" || n == "lockapp";
            }
            catch { return true; }
        }

        static string Run(string args)
        {
            try
            {
                var p = Process.Start(new ProcessStartInfo("powercfg.exe", args) { UseShellExecute = false, RedirectStandardOutput = true, CreateNoWindow = true });
                string o = p.StandardOutput.ReadToEnd(); p.WaitForExit(4000); return o;
            }
            catch { return ""; }
        }
        static void Powercfg(string args) { Run(args); }
        public static string ActiveScheme()
        {
            var m = Regex.Match(Run("/getactivescheme"), "([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})");
            return m.Success ? m.Groups[1].Value : null;
        }
        // The Insane plan if the preset made one, the tune's OmniDx plan, else Windows' High performance.
        public static string PerformanceScheme()
        {
            string list = Run("/list");
            foreach (var name in new[] { State.Preset == "Insane" ? "OmniDx Insane" : "\u0000", "OmniDx" })
            {
                var m = Regex.Match(list, "([0-9a-fA-F\\-]{36})\\s+\\(" + Regex.Escape(name) + "\\)");
                if (m.Success) return m.Groups[1].Value;
            }
            return "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";
        }
    }

    // ------------------------------------------------------------------ the window
    class SearchForm : Form
    {
        public bool Shown1;
        readonly Index index = new Index();
        readonly Booster boost = new Booster();
        readonly TextBox box = new TextBox();
        readonly ResultsView view;
        readonly NotifyIcon tray = new NotifyIcon();
        readonly System.Windows.Forms.Timer ticker = new System.Windows.Forms.Timer { Interval = 2000 };
        DateTime shownAt;
        string hotkey = "";

        public SearchForm()
        {
            FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true; StartPosition = FormStartPosition.Manual;
            BackColor = Theme.Panel; KeyPreview = true;
            Size = new Size(Theme.S(720), Theme.S(580));
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
            Text = "OmniDx Search";

            box.BorderStyle = BorderStyle.None; box.BackColor = Theme.Surface; box.ForeColor = Theme.Text; box.Font = Theme.UI(14f);
            box.TextChanged += (s, e) => Query();
            Controls.Add(box);
            view = new ResultsView(this) { Dock = DockStyle.None };
            Controls.Add(view);
            index.Ready += () => { if (Visible) Query(); };
            boost.Changed += () => { UpdateTray(); if (Visible) { Query(); Invalidate(); } };

            try { tray.Icon = new Icon(Path.Combine(Edition.Dir, @"assets\search.ico")); } catch { tray.Icon = SystemIcons.Application; }
            tray.Text = "OmniDx Search";
            var menu = new ContextMenuStrip { Renderer = new DarkMenu(), ShowImageMargin = false };
            menu.Items.Add("Open search", null, (s, e) => ShowSearch());
            menu.Items.Add("Game Boost", null, (s, e) => boost.Set(!boost.On, false));
            menu.Items.Add("OmniDx Hub", null, (s, e) => Edition.Start(Edition.Exe("OmniHub"), null));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Quit OmniDx Search", null, (s, e) => { if (boost.On) boost.Set(false, false); tray.Visible = false; Application.Exit(); });
            foreach (ToolStripItem i in menu.Items) i.ForeColor = Theme.Text;
            tray.ContextMenuStrip = menu;
            tray.MouseClick += (s, e) => { if (e.Button == MouseButtons.Left) ShowSearch(); };
            tray.Visible = true;
            UpdateTray();

            ticker.Tick += (s, e) => boost.Tick();
            ticker.Start();
            Layout1();
        }

        public Index Index { get { return index; } }
        public Booster Boost { get { return boost; } }
        public string QueryText { get { return box.Text; } }

        protected override CreateParams CreateParams
        {
            get { var cp = base.CreateParams; cp.ExStyle |= 0x80; /* tool window: not in Alt+Tab */ cp.ClassStyle |= 0x20000; /* drop shadow */ return cp; }
        }
        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Native.DarkWindow(Handle, true, Theme.Line);
            Signal.Listen(Handle);
            Hotkeys();
            index.Build(a => { try { BeginInvoke(a); } catch { } });
        }
        // Windows + S, which setup frees from Windows' own search (Explorer lets go of it when it next starts). Until
        // then, Alt + Space. Asked again each time the taskbar starts, so a restarted Explorer hands Windows + S over.
        void Hotkeys()
        {
            if (hotkey == "Win + S") return;
            if (Native.RegisterHotKey(Handle, 1, 0x8 | 0x4000, 0x53)) { if (hotkey == "Alt + Space") Native.UnregisterHotKey(Handle, 2); hotkey = "Win + S"; }
            else if (hotkey == "" && Native.RegisterHotKey(Handle, 2, 0x1 | 0x4000, 0x20)) hotkey = "Alt + Space";
            State.Set("Hotkey", hotkey);
            Edition.Log("hot key " + (hotkey == "" ? "none" : hotkey));
        }
        static int taskbarCreated;
        protected override void WndProc(ref Message m)
        {
            if (taskbarCreated == 0) taskbarCreated = Native.RegisterWindowMessage("TaskbarCreated");
            if (m.Msg == taskbarCreated) { Hotkeys(); base.WndProc(ref m); return; }
            if (m.Msg == 0x0312) { if (Visible && ContainsFocus) HideSearch(); else ShowSearch(); return; } // WM_HOTKEY
            if (m.Msg == Signal.Msg)
            {
                int w = (int)m.WParam;
                if (w == Signal.ShowSearch) ShowSearch();
                else if (w == Signal.Boost && !boost.On) boost.Set(true, false);
                else if (w == Signal.Unboost && boost.On) boost.Set(false, false);
                return;
            }
            base.WndProc(ref m);
        }

        void UpdateTray()
        {
            tray.Text = "OmniDx Search" + (boost.On ? " - Game Boost on" : "");
            if (tray.ContextMenuStrip != null) tray.ContextMenuStrip.Items[1].Text = boost.On ? "Game Boost: on (turn off)" : "Game Boost: off (turn on)";
            if (index.BoostItem != null)
            {
                index.BoostItem.Title = boost.On ? "Game Boost is on" : "Game Boost";
                index.BoostItem.Sub = boost.On ? "Turn it off: timer and power plan back as they were" : "Finer timer, the performance power plan, browser tabs asleep (" + State.Preset + " preset)";
            }
        }

        void Layout1()
        {
            box.Location = new Point(Theme.S(62), Theme.S(29));
            box.Width = Width - Theme.S(62) - Theme.S(80);
            view.Location = new Point(Theme.S(8), Theme.S(86));
            view.Size = new Size(Width - Theme.S(16), Height - Theme.S(86) - Theme.S(44));
        }

        public void ShowSearch()
        {
            var wa = Screen.FromPoint(Cursor.Position).WorkingArea;
            bool left = State.Get("TaskbarLeft", "") == "1";
            try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced")) { var v = k == null ? null : k.GetValue("TaskbarAl"); if (v != null) left = (int)v == 0; } } catch { }
            int x = left ? wa.Left + Theme.S(12) : wa.Left + (wa.Width - Width) / 2;
            Location = new Point(x, wa.Bottom - Height - Theme.S(12));
            if ((DateTime.Now - index.Built).TotalMinutes > 10 && !index.Building) index.Build(a => { try { BeginInvoke(a); } catch { } });
            UpdateTray();
            box.Text = "";
            Query();
            shownAt = DateTime.Now;
            Show(); Activate(); Native.SetForegroundWindow(Handle);
            box.Focus();
        }
        public void HideSearch() { view.Pending = null; Hide(); }
        protected override void OnDeactivate(EventArgs e) { base.OnDeactivate(e); if ((DateTime.Now - shownAt).TotalMilliseconds > 150) HideSearch(); }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape) { if (box.Text.Length > 0) box.Text = ""; else HideSearch(); e.Handled = e.SuppressKeyPress = true; }
            else if (e.KeyCode == Keys.Down) { view.Step(1); e.Handled = true; }
            else if (e.KeyCode == Keys.Up) { view.Step(-1); e.Handled = true; }
            else if (e.KeyCode == Keys.Right && view.Home) { view.Step(1); e.Handled = true; }
            else if (e.KeyCode == Keys.Left && view.Home) { view.Step(-1); e.Handled = true; }
            else if (e.KeyCode == Keys.PageDown) { view.Step(6); e.Handled = true; }
            else if (e.KeyCode == Keys.PageUp) { view.Step(-6); e.Handled = true; }
            else if (e.KeyCode == Keys.Enter) { view.Open(view.Current, e.Control, false); e.Handled = e.SuppressKeyPress = true; }
            base.OnKeyDown(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(Theme.Panel);
            // The field.
            var field = new Rectangle(Theme.S(16), Theme.S(16), Width - Theme.S(32), Theme.S(52));
            Theme.Fill(g, field, Theme.S(12), Theme.Surface);
            Theme.Stroke(g, field, Theme.S(12), ContainsFocus ? Theme.Accent : Theme.Line, Theme.S(1.5f));
            Theme.Icon(g, G.Search, 14f, new Rectangle(field.X + Theme.S(10), field.Y, Theme.S(32), field.Height), Theme.Accent2);
            if (box.Text.Length == 0)
                Theme.Draw(g, "Search apps, games, settings, files and the web", Theme.UI(14f), new Rectangle(box.Left + 1, field.Y, box.Width, field.Height), Theme.Text3);
            Theme.Draw(g, "Esc", Theme.Semi(8f), new Rectangle(field.Right - Theme.S(52), field.Y, Theme.S(40), field.Height), Theme.Text3, TextFormatFlags.VerticalCenter | TextFormatFlags.HorizontalCenter);
            // The foot: what the keys do, and Game Boost.
            var foot = new Rectangle(0, Height - Theme.S(44), Width, Theme.S(44));
            using (var p = new Pen(Theme.LineSoft)) g.DrawLine(p, 0, foot.Y, Width, foot.Y);
            Theme.Draw(g, "\u2191\u2193 move   Enter open   Ctrl+Enter as administrator   " + (hotkey == "" ? "" : hotkey + " any time"), Theme.UI(8.5f), new Rectangle(Theme.S(18), foot.Y, Width - Theme.S(200), foot.Height), Theme.Text3);
            BoostChip = new Rectangle(Width - Theme.S(176), foot.Y + Theme.S(8), Theme.S(160), Theme.S(28));
            if (boost.On) Theme.FillGrad(g, BoostChip, Theme.S(14), 255); else { Theme.Fill(g, BoostChip, Theme.S(14), Theme.Surface2); Theme.Stroke(g, BoostChip, Theme.S(14), Theme.Line, 1); }
            Theme.Icon(g, G.Bolt, 9f, new Rectangle(BoostChip.X + Theme.S(8), BoostChip.Y, Theme.S(20), BoostChip.Height), boost.On ? Color.White : Theme.Accent2);
            Theme.Draw(g, boost.On ? (boost.Auto ? "Boost on (game)" : "Game Boost on") : "Game Boost off", Theme.Semi(8.5f), new Rectangle(BoostChip.X + Theme.S(30), BoostChip.Y, BoostChip.Width - Theme.S(34), BoostChip.Height), boost.On ? Color.White : Theme.Text2);
        }
        Rectangle BoostChip;
        protected override void OnMouseClick(MouseEventArgs e)
        {
            if (BoostChip.Contains(e.Location)) { boost.Set(!boost.On, false); Invalidate(); }
            base.OnMouseClick(e);
        }
        protected override void OnMouseMove(MouseEventArgs e) { Cursor = BoostChip.Contains(e.Location) ? Cursors.Hand : Cursors.Default; base.OnMouseMove(e); }

        // ---------------------------------------------------------------- matching
        void Query()
        {
            string q = box.Text.Trim();
            Invalidate(new Rectangle(0, 0, Width, Theme.S(84)));
            if (q.Length == 0) { view.ShowHome(HomeSections()); return; }
            var results = new List<KeyValuePair<Item, int>>();
            string lq = q.ToLowerInvariant();
            string[] qw = Regex.Split(lq, "[^a-z0-9]+").Where(w => w.Length > 0).ToArray();

            // A sum.
            double v;
            if (Calc.TryEval(lq, out v))
            {
                string shown = Calc.Show(v);
                results.Add(new KeyValuePair<Item, int>(new Item { Title = "= " + shown, Sub = q + "   (Enter copies the answer)", Kind = "Sum", Glyph = G.Calc, Key = "calc",
                    Run = () => { try { Clipboard.SetText(shown.Replace(",", "")); } catch { } } }, 100000));
            }
            // A command.
            if (q.StartsWith(">"))
            {
                string cmd = q.Substring(1).Trim();
                if (cmd.Length > 0) results.Add(new KeyValuePair<Item, int>(new Item { Title = "Run: " + cmd, Sub = "As in Windows + R. Ctrl+Enter runs it as administrator", Kind = "Command", Glyph = G.Terminal, Key = "cmd", Target = cmd }, 100000));
            }
            foreach (var list in new[] { index.Games, index.Apps, index.Actions, index.Settings })
                foreach (var it in list)
                {
                    int s = Score(it, lq, qw);
                    if (s > 0) results.Add(new KeyValuePair<Item, int>(it, s + it.Weight + Math.Min(150, index.Uses(it.Key) * 15)));
                }
            if (lq.Length >= 2)
            {
                int nf = 0;
                foreach (var it in index.Files)
                {
                    int p = it.Lower.IndexOf(lq, StringComparison.Ordinal);
                    if (p < 0) continue;
                    results.Add(new KeyValuePair<Item, int>(it, (p == 0 ? 320 : 220) + it.Weight + Math.Min(150, index.Uses(it.Key) * 15) - Math.Min(60, it.Lower.Length)));
                    if (++nf >= 400) break;
                }
            }
            var top = results.OrderByDescending(r => r.Value).Select(r => r.Key).ToList();
            // Files at most eight, so apps and settings stay in view.
            int files = 0;
            top = top.Where(i => (i.Kind != "File" && i.Kind != "Folder") || ++files <= 8).Take(40).ToList();
            // A web address, then the web.
            if (Regex.IsMatch(q, @"^(https?://)?[\w\-]+(\.[\w\-]+)+(:\d+)?(/\S*)?$") && !q.Contains(" "))
            {
                string url = q.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? q : "https://" + q;
                top.Insert(top.Count > 0 && top[0].Kind == "Sum" ? 1 : Math.Min(top.Count, 1), new Item { Title = "Open " + q, Sub = url, Kind = "Web", Glyph = G.Link, Target = url, Key = "url" });
            }
            top.Add(new Item { Title = "Search " + State.Engine + " for \u201C" + q + "\u201D", Sub = "In OmniDx Browser", Kind = "Web", Glyph = G.Globe, Target = State.SearchUrl(q), Key = "web" });
            view.ShowList(top);
        }

        static int Score(Item it, string q, string[] qw)
        {
            string t = it.Lower;
            if (t == null) return 0;
            if (t == q) return 1000;
            if (t.StartsWith(q, StringComparison.Ordinal)) return 900 - Math.Min(100, t.Length - q.Length);
            if (it.Words != null && it.Words.Any(w => w.StartsWith(q, StringComparison.Ordinal))) return 800;
            if (qw.Length > 1 && it.Words != null && qw.All(x => it.Words.Any(w => w.StartsWith(x, StringComparison.Ordinal)))) return 720;
            if (q.Length >= 2 && it.Initials != null && it.Initials.StartsWith(q, StringComparison.Ordinal)) return 680;
            if (t.Contains(q)) return 520;
            if (it.Keywords != null)
            {
                var kw = it.Keywords.Split(' ');
                if (kw.Any(k => k.StartsWith(q, StringComparison.Ordinal))) return 460;
                if (qw.Length > 1 && qw.All(x => kw.Any(k => k.StartsWith(x, StringComparison.Ordinal)) || (it.Words != null && it.Words.Any(w => w.StartsWith(x, StringComparison.Ordinal))))) return 440;
            }
            // Letters in order ("vsc" finds Visual Studio Code), tighter is better.
            if (q.Length >= 3)
            {
                int j = 0, first = -1, last = -1;
                for (int i = 0; i < t.Length && j < q.Length; i++) if (t[i] == q[j]) { if (first < 0) first = i; last = i; j++; }
                if (j == q.Length) return 200 + Math.Max(0, 100 - (last - first - q.Length) * 8);
            }
            return 0;
        }

        List<KeyValuePair<string, List<Item>>> HomeSections()
        {
            var s = new List<KeyValuePair<string, List<Item>>>();
            var games = index.Games.OrderByDescending(g => index.Uses(g.Key)).Take(6).ToList();
            if (games.Count > 0) s.Add(new KeyValuePair<string, List<Item>>("Your games", games));
            var pinned = new List<Item>();
            foreach (var n in new[] { "OmniDx Browser", "OmniDx Hub", "File Explorer", "Settings", "Task Manager", "Terminal", "Discord", "Steam", "Spotify", "OBS Studio" })
            {
                var it = index.Apps.FirstOrDefault(a => a.Title == n) ?? index.Settings.FirstOrDefault(a => a.Title == n);
                if (it != null) pinned.Add(it);
                if (pinned.Count == 6) break;
            }
            var most = index.Apps.Where(a => index.Uses(a.Key) > 0 && !pinned.Contains(a)).OrderByDescending(a => index.Uses(a.Key)).Take(6 - Math.Min(6, pinned.Count % 6 == 0 ? 0 : 6 - pinned.Count % 6)).ToList();
            if (pinned.Count > 0) s.Add(new KeyValuePair<string, List<Item>>("Pinned", pinned));
            if (most.Count > 0) s.Add(new KeyValuePair<string, List<Item>>("Most used", most.Take(6).ToList()));
            var quick = new List<Item>();
            if (index.BoostItem != null) quick.Add(index.BoostItem);
            foreach (var n in new[] { "Free up memory", "Presets (Balanced, Competitive, Insane)", "Lock", "Restart", "Shut down" })
            { var it = index.Actions.FirstOrDefault(a => a.Title == n); if (it != null) quick.Add(it); }
            s.Add(new KeyValuePair<string, List<Item>>("Quick actions", quick));
            return s;
        }

        // ---------------------------------------------------------------- opening
        public void Launch(Item it, bool admin)
        {
            if (it == null) return;
            if (it.Confirm && view.Pending != it) { view.Pending = it; view.Invalidate(); return; }
            view.Pending = null;
            index.Used(it.Key);
            if (it == index.BoostItem) { boost.Set(!boost.On, false); view.Invalidate(); return; }
            HideSearch();
            try
            {
                if (it.Run != null) { it.Run(); return; }
                switch (it.Kind)
                {
                    case "Game":
                        if (State.AutoBoost && !boost.On) boost.Set(true, true);
                        Games.Launch(it.Game); break;
                    case "App":
                        if (File.Exists(it.Target) && it.Target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                            Process.Start(new ProcessStartInfo(it.Target) { UseShellExecute = true, Verb = admin ? "runas" : "", WorkingDirectory = Path.GetDirectoryName(it.Target) });
                        else Process.Start(new ProcessStartInfo("explorer.exe", "shell:AppsFolder\\" + it.Target) { UseShellExecute = true });
                        break;
                    case "Web":
                        string browser = Edition.Exe("OmniBrowser");
                        if (File.Exists(browser)) Edition.Start(browser, "\"" + it.Target + "\""); else Edition.Start(it.Target, null);
                        break;
                    case "Command":
                        string cmd = it.Target, file = cmd, args = "";
                        var m = Regex.Match(cmd, "^\\s*(\"[^\"]+\"|\\S+)\\s*(.*)$");
                        if (m.Success) { file = m.Groups[1].Value.Trim('"'); args = m.Groups[2].Value; }
                        Process.Start(new ProcessStartInfo(file, args) { UseShellExecute = true, Verb = admin ? "runas" : "" });
                        break;
                    default:
                        if (it.Target != null) Process.Start(new ProcessStartInfo(it.Target, it.Args ?? "") { UseShellExecute = true, Verb = admin && it.Kind == "Tool" ? "runas" : "" });
                        break;
                }
            }
            catch (Exception e) { Edition.Log("open " + it.Title + ": " + e.Message); }
        }
    }

    // ------------------------------------------------------------------ the list (and, when the box is empty, the tiles)
    class ResultsView : Control
    {
        readonly SearchForm owner;
        List<Item> items = new List<Item>();
        List<KeyValuePair<string, List<Item>>> sections;
        readonly List<KeyValuePair<Rectangle, Item>> hits = new List<KeyValuePair<Rectangle, Item>>();
        int sel, hover = -1, scroll;
        public Item Pending;
        public bool Home { get { return sections != null; } }

        public ResultsView(SearchForm f)
        {
            owner = f;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = Theme.Panel;
        }
        public void ShowList(List<Item> list) { sections = null; items = list; sel = 0; scroll = 0; Pending = null; Invalidate(); }
        public void ShowHome(List<KeyValuePair<string, List<Item>>> s) { sections = s; items = s.SelectMany(x => x.Value).ToList(); sel = -1; scroll = 0; Pending = null; Invalidate(); }
        public Item Current { get { return sel >= 0 && sel < items.Count ? items[sel] : (Home ? null : items.FirstOrDefault()); } }
        public void Step(int d)
        {
            if (items.Count == 0) return;
            sel = Math.Max(0, Math.Min(items.Count - 1, (sel < 0 ? -1 : sel) + d));
            Pending = null; EnsureVisible(); Invalidate();
        }
        public void Open(Item it, bool admin, bool unused) { owner.Launch(it, admin); }

        int RowH { get { return Theme.S(52); } }
        int BestH { get { return Theme.S(68); } }
        void EnsureVisible()
        {
            if (Home) return;
            int top = RowTop(sel), h = sel == 0 ? BestH : RowH;
            if (top - scroll < 0) scroll = top;
            else if (top + h - scroll > Height) scroll = top + h - Height;
        }
        int RowTop(int i) { return i == 0 ? Theme.S(22) : Theme.S(22) + BestH + Theme.S(28) + (i - 1) * RowH; }

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            if (!Home) { int max = Math.Max(0, RowTop(items.Count) - Height + Theme.S(8)); scroll = Math.Max(0, Math.Min(max, scroll - e.Delta / 2)); Invalidate(); }
            base.OnMouseWheel(e);
        }
        protected override void OnMouseMove(MouseEventArgs e)
        {
            int h = -1;
            for (int i = 0; i < hits.Count; i++) if (hits[i].Key.Contains(e.Location)) { h = items.IndexOf(hits[i].Value); break; }
            if (h != hover) { hover = h; Cursor = h >= 0 ? Cursors.Hand : Cursors.Default; Invalidate(); }
            base.OnMouseMove(e);
        }
        protected override void OnMouseLeave(EventArgs e) { hover = -1; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseClick(MouseEventArgs e)
        {
            foreach (var h in hits) if (h.Key.Contains(e.Location)) { sel = items.IndexOf(h.Value); owner.Launch(h.Value, false); Invalidate(); break; }
            base.OnMouseClick(e);
        }

        void DrawIcon(Graphics g, Item it, Rectangle r)
        {
            if (it.Icon != null) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(it.Icon, r); return; }
            Theme.Fill(g, r, Theme.S(8), it.Kind == "Action" || it.Kind == "Game" ? Theme.Deep : Theme.Surface2);
            Theme.Icon(g, it.Glyph ?? G.Apps, r.Height > Theme.S(34) ? 14f : 11f, r, it.Kind == "Action" || it.Kind == "Game" ? Color.White : Theme.Accent2);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.Clear(Theme.Panel); hits.Clear();
            if (Home) { PaintHome(g); return; }
            if (items.Count == 0) { Theme.Draw(g, "Nothing found", Theme.UI(10f), new Rectangle(Theme.S(14), Theme.S(20), Width, Theme.S(30)), Theme.Text3); return; }
            Theme.Draw(g, "Best match", Theme.Semi(8.5f), new Rectangle(Theme.S(14), -scroll, Width, Theme.S(22)), Theme.Text3);
            for (int i = 0; i < items.Count; i++)
            {
                int y = RowTop(i) - scroll, h = i == 0 ? BestH : RowH;
                if (y + h < 0) continue;
                if (y > Height) break;
                if (i == 1) Theme.Draw(g, "More", Theme.Semi(8.5f), new Rectangle(Theme.S(14), y - Theme.S(24), Width, Theme.S(22)), Theme.Text3);
                var it = items[i];
                var r = new Rectangle(Theme.S(4), y, Width - Theme.S(8), h - Theme.S(4));
                bool on = i == sel, hot = i == hover;
                if (on) { Theme.Fill(g, r, Theme.S(10), Theme.Selected); Theme.FillGrad(g, new Rectangle(r.X, r.Y + Theme.S(10), Theme.S(3), r.Height - Theme.S(20)), 1, 255); }
                else if (hot) Theme.Fill(g, r, Theme.S(10), Theme.Hover);
                int ic = i == 0 ? Theme.S(40) : Theme.S(32);
                DrawIcon(g, it, new Rectangle(r.X + Theme.S(12), r.Y + (r.Height - ic) / 2, ic, ic));
                int tx = r.X + Theme.S(12) + ic + Theme.S(14), tw = r.Width - (tx - r.X) - Theme.S(110);
                string sub = Pending == it ? "Press Enter again to " + it.Title.ToLowerInvariant() : it.Sub;
                Theme.Draw(g, it.Title, i == 0 ? Theme.Semi(12f) : Theme.Semi(10.5f), new Rectangle(tx, r.Y + Theme.S(i == 0 ? 8 : 5), tw, Theme.S(i == 0 ? 28 : 24)), Theme.Text);
                Theme.Draw(g, sub, Theme.UI(8.5f), new Rectangle(tx, r.Y + Theme.S(i == 0 ? 36 : 27), tw, Theme.S(18)), Pending == it ? Theme.Warn : Theme.Text3);
                string right = on ? "Enter \u21B5" : Kind(it);
                Theme.Draw(g, right, Theme.UI(8.5f), new Rectangle(r.Right - Theme.S(104), r.Y, Theme.S(92), r.Height), on ? Theme.Accent2 : Theme.Text3, TextFormatFlags.VerticalCenter | TextFormatFlags.Right);
                hits.Add(new KeyValuePair<Rectangle, Item>(r, it));
            }
        }
        static string Kind(Item it)
        {
            switch (it.Kind) { case "Tool": return "Windows tool"; case "Sum": return "Calculator"; case "Web": return "Web"; default: return it.Kind; }
        }

        void PaintHome(Graphics g)
        {
            int y = Theme.S(8), idx = 0;
            foreach (var s in sections)
            {
                Theme.Draw(g, s.Key, Theme.Semi(9f), new Rectangle(Theme.S(14), y, Width, Theme.S(24)), Theme.Text2);
                y += Theme.S(30);
                bool chips = s.Key == "Quick actions";
                if (chips)
                {
                    int x = Theme.S(10);
                    foreach (var it in s.Value)
                    {
                        string label = it == owner.Index.BoostItem ? (owner.Boost.On ? "Game Boost: on" : "Game Boost") : it.Title.Replace(" (Balanced, Competitive, Insane)", "");
                        int w = Theme.Measure(label, Theme.Semi(9f)) + Theme.S(52);
                        if (x + w > Width - Theme.S(10)) { x = Theme.S(10); y += Theme.S(44); }
                        var r = new Rectangle(x, y, w, Theme.S(36));
                        bool on = idx == sel, hot = items.IndexOf(it) == hover;
                        bool boostOn = it == owner.Index.BoostItem && owner.Boost.On;
                        if (boostOn) Theme.FillGrad(g, r, Theme.S(18), 255);
                        else { Theme.Fill(g, r, Theme.S(18), on || hot ? Theme.Selected : Theme.Surface); Theme.Stroke(g, r, Theme.S(18), on ? Theme.Accent : Theme.Line, 1); }
                        Theme.Icon(g, it.Glyph ?? G.Apps, 10f, new Rectangle(r.X + Theme.S(10), r.Y, Theme.S(22), r.Height), boostOn ? Color.White : Theme.Accent2);
                        Theme.Draw(g, Pending == it ? "Again to confirm" : label, Theme.Semi(9f), new Rectangle(r.X + Theme.S(36), r.Y, r.Width - Theme.S(40), r.Height), Pending == it ? Theme.Warn : (boostOn ? Color.White : Theme.Text));
                        hits.Add(new KeyValuePair<Rectangle, Item>(r, it));
                        x += w + Theme.S(8); idx++;
                    }
                    y += Theme.S(52);
                    continue;
                }
                int cols = 6, tw = (Width - Theme.S(20)) / cols, th = Theme.S(92), n = 0;
                foreach (var it in s.Value)
                {
                    var r = new Rectangle(Theme.S(10) + (n % cols) * tw, y + (n / cols) * th, tw - Theme.S(6), th - Theme.S(6));
                    bool on = idx == sel, hot = items.IndexOf(it) == hover;
                    if (on) { Theme.Fill(g, r, Theme.S(10), Theme.Selected); Theme.Stroke(g, r, Theme.S(10), Theme.Accent, 1); }
                    else if (hot) Theme.Fill(g, r, Theme.S(10), Theme.Hover);
                    int ic = Theme.S(36);
                    DrawIcon(g, it, new Rectangle(r.X + (r.Width - ic) / 2, r.Y + Theme.S(12), ic, ic));
                    Theme.Draw(g, it.Title, Theme.UI(8.5f), new Rectangle(r.X + Theme.S(4), r.Y + Theme.S(54), r.Width - Theme.S(8), Theme.S(22)), Theme.Text, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                    hits.Add(new KeyValuePair<Rectangle, Item>(r, it));
                    n++; idx++;
                }
                y += ((n + cols - 1) / cols) * th + Theme.S(10);
            }
        }
    }

    // A dark menu for the tray icon.
    class DarkMenu : ToolStripProfessionalRenderer
    {
        public DarkMenu() : base(new DarkColors()) { RoundedEdges = false; }
        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e) { e.TextColor = Theme.Text; base.OnRenderItemText(e); }
    }
    class DarkColors : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground { get { return Theme.Surface; } }
        public override Color MenuItemSelected { get { return Theme.Selected; } }
        public override Color MenuItemBorder { get { return Theme.Accent; } }
        public override Color MenuBorder { get { return Theme.Line; } }
        public override Color SeparatorDark { get { return Theme.Line; } }
        public override Color SeparatorLight { get { return Theme.Surface; } }
        public override Color ImageMarginGradientBegin { get { return Theme.Surface; } }
        public override Color ImageMarginGradientMiddle { get { return Theme.Surface; } }
        public override Color ImageMarginGradientEnd { get { return Theme.Surface; } }
    }
}
