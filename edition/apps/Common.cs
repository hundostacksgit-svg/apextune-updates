// OmniDx Edition: what the three apps share. The look (the site's black and
// purple), the window frame, the few Windows calls they make, the settings
// they keep, how they signal each other, and where the games are.
//
// Plain C# 5 for the compiler every Windows 10 and 11 PC already has
// (.NET Framework 4.8's csc.exe): build.ps1 compiles it on the PC itself, so
// nothing here arrives as a ready-made program.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;

namespace OmniDx
{
    static class Edition
    {
        public const string Version = "1.0.0";
        public static string Dir { get { return AppDomain.CurrentDomain.BaseDirectory; } }
        public static string Data
        {
            get { var d = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), @"OmniDx\Edition"); Directory.CreateDirectory(d); return d; }
        }
        public static string Local
        {
            get { var d = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OmniDx"); Directory.CreateDirectory(d); return d; }
        }
        public static string Exe(string name) { return Path.Combine(Dir, name + ".exe"); }
        public static void Start(string file, string args)
        {
            try { Process.Start(new ProcessStartInfo(file, args ?? "") { UseShellExecute = true }); }
            catch (Exception e) { Log("start " + file + ": " + e.Message); }
        }
        public static void Log(string line)
        {
            try { File.AppendAllText(Path.Combine(Local, "edition-log.txt"), DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + line + "\r\n"); } catch { }
        }
    }

    // ------------------------------------------------------------------ the look
    static class Theme
    {
        public static readonly Color Bg = Hex("#0B0812"), Panel = Hex("#110B1B"), Surface = Hex("#181027"), Surface2 = Hex("#21163A"),
            Hover = Hex("#261A3E"), Selected = Hex("#312050"), Line = Hex("#2A1F45"), LineSoft = Hex("#1B1430"),
            Text = Hex("#F1ECFF"), Text2 = Hex("#B3A8CF"), Text3 = Hex("#8A7EA6"),
            Accent = Hex("#8B5CF6"), Accent2 = Hex("#C084FC"), Deep = Hex("#6D28D9"), Pink = Hex("#D946EF"),
            Ok = Hex("#30D38A"), Warn = Hex("#FFC247"), Bad = Hex("#FF5D6C"), CloseRed = Hex("#C42B1C");
        public static float Scale = 1f;

        public static Color Hex(string h)
        {
            h = h.TrimStart('#');
            return Color.FromArgb(Convert.ToInt32(h.Substring(0, 2), 16), Convert.ToInt32(h.Substring(2, 2), 16), Convert.ToInt32(h.Substring(4, 2), 16));
        }
        public static int S(float v) { return (int)Math.Round(v * Scale); }
        public static void Init()
        {
            try { Native.SetProcessDPIAware(); } catch { }
            using (var g = Graphics.FromHwnd(IntPtr.Zero)) Scale = g.DpiX / 96f;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
        }

        static readonly Dictionary<string, Font> fonts = new Dictionary<string, Font>();
        static string iconFamily;
        // Points at 96 DPI; the apps are DPI aware, so a point is scaled by the system for us.
        public static Font UI(float pt) { return Get("Segoe UI", pt, FontStyle.Regular); }
        public static Font Semi(float pt) { return Get("Segoe UI Semibold", pt, FontStyle.Regular); }
        public static Font Bold(float pt) { return Get("Segoe UI", pt, FontStyle.Bold); }
        public static Font Mono(float pt) { return Get("Consolas", pt, FontStyle.Regular); }
        // Windows 11's icon font, or Windows 10's.
        public static Font Glyph(float pt)
        {
            if (iconFamily == null)
            {
                iconFamily = "Segoe MDL2 Assets";
                using (var fc = new InstalledFontCollection())
                    if (fc.Families.Any(f => f.Name == "Segoe Fluent Icons")) iconFamily = "Segoe Fluent Icons";
            }
            return Get(iconFamily, pt, FontStyle.Regular);
        }
        static Font Get(string family, float pt, FontStyle st)
        {
            string k = family + "|" + pt + "|" + st;
            Font f;
            if (!fonts.TryGetValue(k, out f)) { f = new Font(family, pt, st, GraphicsUnit.Point); fonts[k] = f; }
            return f;
        }

        public static GraphicsPath Round(RectangleF r, float rad)
        {
            var p = new GraphicsPath();
            float d = Math.Min(rad * 2, Math.Min(r.Width, r.Height));
            if (d <= 0.5f) { p.AddRectangle(r); return p; }
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }
        public static void Fill(Graphics g, Rectangle r, float rad, Color c)
        {
            var old = g.SmoothingMode; g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var p = Round(r, rad)) using (var b = new SolidBrush(c)) g.FillPath(b, p);
            g.SmoothingMode = old;
        }
        public static void Stroke(Graphics g, Rectangle r, float rad, Color c, float w)
        {
            var old = g.SmoothingMode; g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var p = Round(new RectangleF(r.X + w / 2, r.Y + w / 2, r.Width - w, r.Height - w), rad)) using (var pen = new Pen(c, w)) g.DrawPath(pen, p);
            g.SmoothingMode = old;
        }
        // The site's gradient: deep violet, violet, magenta.
        public static void FillGrad(Graphics g, Rectangle r, float rad, int alpha)
        {
            if (r.Width < 2 || r.Height < 2) return;
            var old = g.SmoothingMode; g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var p = Round(r, rad))
            using (var b = new LinearGradientBrush(r, Color.FromArgb(alpha, Deep), Color.FromArgb(alpha, Pink), 35f))
            {
                var cb = new ColorBlend(3);
                cb.Colors = new[] { Color.FromArgb(alpha, Deep), Color.FromArgb(alpha, Accent), Color.FromArgb(alpha, Pink) };
                cb.Positions = new[] { 0f, .45f, 1f };
                b.InterpolationColors = cb;
                g.FillPath(b, p);
            }
            g.SmoothingMode = old;
        }
        public static void Draw(Graphics g, string s, Font f, Rectangle r, Color c, TextFormatFlags extra)
        {
            TextRenderer.DrawText(g, s ?? "", f, r, c, TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine | extra);
        }
        public static void Draw(Graphics g, string s, Font f, Rectangle r, Color c) { Draw(g, s, f, r, c, TextFormatFlags.VerticalCenter | TextFormatFlags.Left); }
        public static void Wrapped(Graphics g, string s, Font f, Rectangle r, Color c)
        {
            TextRenderer.DrawText(g, s ?? "", f, r, c, TextFormatFlags.NoPrefix | TextFormatFlags.WordBreak | TextFormatFlags.Left | TextFormatFlags.Top);
        }
        public static int Measure(string s, Font f) { return TextRenderer.MeasureText(s ?? "", f, Size.Empty, TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding).Width; }
        public static int WrappedHeight(string s, Font f, int width)
        {
            return TextRenderer.MeasureText(s ?? "", f, new Size(width, 10000), TextFormatFlags.NoPrefix | TextFormatFlags.WordBreak).Height;
        }
        public static void Icon(Graphics g, string glyph, float pt, Rectangle r, Color c)
        {
            TextRenderer.DrawText(g, glyph, Glyph(pt), r, c, TextFormatFlags.NoPrefix | TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        }
        public static Color Mix(Color a, Color b, float t)
        {
            return Color.FromArgb((int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t));
        }
    }

    // Segoe Fluent Icons / MDL2 code points used here.
    static class G
    {
        public const string Search = "\uE721", Settings = "\uE713", Globe = "\uE774", Calc = "\uE8EF", Folder = "\uE8B7", Doc = "\uE8A5",
            Game = "\uE7FC", Power = "\uE7E8", Restart = "\uE777", Lock = "\uE72E", Moon = "\uE708", Bolt = "\uE945", Terminal = "\uE756",
            Link = "\uE71B", Copy = "\uE8C8", History = "\uE81C", Back = "\uE72B", Forward = "\uE72A", Refresh = "\uE72C", Stop = "\uE711",
            Add = "\uE710", Close = "\uE8BB", More = "\uE712", Home = "\uE80F", Min = "\uE921", Max = "\uE922", Restore = "\uE923",
            Shield = "\uEA18", Speed = "\uEC4A", Cpu = "\uE950", Memory = "\uEEA0", Clock = "\uE917", Timer = "\uE916", Download = "\uE896",
            Apps = "\uE71D", Info = "\uE946", Check = "\uE73E", Undo = "\uE7A7", Play = "\uE768", Star = "\uE734", Wrench = "\uE90F",
            Network = "\uE968", Leaf = "\uEC0A", Rocket = "\uF3B1", Task = "\uE9D9", Zoom = "\uE71E", Pin = "\uE718", Tab = "\uE7C4";
    }

    // ------------------------------------------------------------------ Windows calls
    static class Native
    {
        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int v, int size);
        [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
        [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr h, int id);
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
        [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int pid);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
        [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, int flags);
        [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int RegisterWindowMessage(string s);
        [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
        [DllImport("user32.dll")] public static extern bool TrackMouseEvent(ref TRACKMOUSEEVENT t);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
        [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);
        [DllImport("user32.dll")] public static extern bool ChangeWindowMessageFilterEx(IntPtr h, int msg, int action, IntPtr p);
        [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)] public static extern int SetWindowTheme(IntPtr h, string app, string idList);
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SHGetFileInfo(string path, uint attrs, ref SHFILEINFO sfi, uint size, uint flags);
        [DllImport("shell32.dll")] static extern IntPtr SHGetFileInfo(IntPtr pidl, uint attrs, ref SHFILEINFO sfi, uint size, uint flags);
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern int SHParseDisplayName(string name, IntPtr bc, out IntPtr pidl, uint want, out uint got);
        [DllImport("shell32.dll")] static extern void ILFree(IntPtr pidl);
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)] public static extern int SHEmptyRecycleBin(IntPtr h, string root, int flags);
        [DllImport("ntdll.dll")] public static extern int NtSetTimerResolution(uint want, bool set, out uint current);
        [DllImport("ntdll.dll")] public static extern int NtQueryTimerResolution(out uint min, out uint max, out uint current);
        [DllImport("ntdll.dll")] static extern int NtSetSystemInformation(int cls, ref int info, int len);
        [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX m);
        [DllImport("kernel32.dll")] static extern bool GetSystemTimes(out long idle, out long kernel, out long user);
        [DllImport("kernel32.dll")] public static extern ulong GetTickCount64();
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr p, int access, out IntPtr token);
        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool LookupPrivilegeValue(string sys, string name, out long luid);
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool AdjustTokenPrivileges(IntPtr token, bool none, ref TOKEN_PRIVILEGES tp, int len, IntPtr prev, IntPtr ret);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
        [DllImport("user32.dll")] public static extern bool LockWorkStation();
        [DllImport("powrprof.dll")] public static extern bool SetSuspendState(bool hibernate, bool force, bool wakeOff);

        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public int dwFlags; }
        [StructLayout(LayoutKind.Sequential)] public struct TRACKMOUSEEVENT { public int cbSize; public uint dwFlags; public IntPtr hwndTrack; public uint dwHoverTime; }
        [StructLayout(LayoutKind.Sequential)] public struct NCCALCSIZE_PARAMS { public RECT r0, r1, r2; public IntPtr pos; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct SHFILEINFO { public IntPtr hIcon; public int iIcon; public uint attrs; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string name; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string type; }
        [StructLayout(LayoutKind.Sequential)] struct MEMORYSTATUSEX { public uint len, load; public ulong total, avail, pageTotal, pageAvail, virtTotal, virtAvail, ext; }
        [StructLayout(LayoutKind.Sequential, Pack = 4)] struct TOKEN_PRIVILEGES { public int count; public long luid; public int attrs; }

        // Dark, rounded, with a thin violet border, the way Windows 11 draws its own.
        public static void DarkWindow(IntPtr h, bool round, Color border)
        {
            int on = 1; try { DwmSetWindowAttribute(h, 20, ref on, 4); } catch { }
            int corner = round ? 2 : 1; try { DwmSetWindowAttribute(h, 33, ref corner, 4); } catch { }
            int bc = border.R | (border.G << 8) | (border.B << 16); try { DwmSetWindowAttribute(h, 34, ref bc, 4); } catch { }
        }
        public static void Caption(IntPtr h, Color caption, Color text)
        {
            int c = caption.R | (caption.G << 8) | (caption.B << 16); try { DwmSetWindowAttribute(h, 35, ref c, 4); } catch { }
            int t = text.R | (text.G << 8) | (text.B << 16); try { DwmSetWindowAttribute(h, 36, ref t, 4); } catch { }
        }
        public static void DarkScrollbars(Control c) { try { SetWindowTheme(c.Handle, "DarkMode_Explorer", null); } catch { } }

        const uint SHGFI_ICON = 0x100, SHGFI_LARGEICON = 0, SHGFI_SMALLICON = 1, SHGFI_PIDL = 8;
        // The icon Explorer shows for a file, a shortcut (without the arrow) or a shell name (shell:AppsFolder\...).
        public static Bitmap IconFor(string path, bool small)
        {
            var sfi = new SHFILEINFO(); uint flags = SHGFI_ICON | (small ? SHGFI_SMALLICON : SHGFI_LARGEICON);
            try
            {
                if (path.StartsWith("shell:", StringComparison.OrdinalIgnoreCase) || path.StartsWith("::", StringComparison.Ordinal))
                {
                    IntPtr pidl; uint got;
                    if (SHParseDisplayName(path, IntPtr.Zero, out pidl, 0, out got) != 0 || pidl == IntPtr.Zero) return null;
                    try { SHGetFileInfo(pidl, 0, ref sfi, (uint)Marshal.SizeOf(sfi), flags | SHGFI_PIDL); } finally { ILFree(pidl); }
                }
                else SHGetFileInfo(path, 0, ref sfi, (uint)Marshal.SizeOf(sfi), flags);
                if (sfi.hIcon == IntPtr.Zero) return null;
                using (var ic = System.Drawing.Icon.FromHandle(sfi.hIcon)) { var b = ic.ToBitmap(); DestroyIcon(sfi.hIcon); return b; }
            }
            catch { return null; }
        }

        public static int MemoryLoad(out double usedGb, out double totalGb)
        {
            var m = new MEMORYSTATUSEX(); m.len = (uint)Marshal.SizeOf(m);
            usedGb = totalGb = 0;
            if (!GlobalMemoryStatusEx(ref m)) return 0;
            totalGb = m.total / 1073741824.0; usedGb = (m.total - m.avail) / 1073741824.0;
            return (int)m.load;
        }
        static long lastIdle, lastBusy;
        // Percent of the CPU in use since the last call.
        public static int CpuLoad()
        {
            long idle, kernel, user;
            if (!GetSystemTimes(out idle, out kernel, out user)) return 0;
            long busy = kernel + user - idle, dIdle = idle - lastIdle, dBusy = busy - lastBusy;
            bool first = lastBusy == 0; lastIdle = idle; lastBusy = busy;
            if (first || dBusy + dIdle <= 0) return 0;
            return (int)Math.Round(100.0 * dBusy / (dBusy + dIdle));
        }
        // The system timer, in milliseconds.
        public static double TimerMs()
        {
            uint min, max, cur;
            try { if (NtQueryTimerResolution(out min, out max, out cur) == 0) return cur / 10000.0; } catch { }
            return 0;
        }
        public static bool EnablePrivilege(string name)
        {
            IntPtr tok;
            if (!OpenProcessToken(Process.GetCurrentProcess().Handle, 0x28, out tok)) return false;
            try
            {
                long luid; if (!LookupPrivilegeValue(null, name, out luid)) return false;
                var tp = new TOKEN_PRIVILEGES { count = 1, luid = luid, attrs = 2 };
                return AdjustTokenPrivileges(tok, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero) && Marshal.GetLastWin32Error() == 0;
            }
            finally { CloseHandle(tok); }
        }
        // Empties the standby list: memory Windows keeps filled with old file data, handed back as free. Needs an
        // administrator (the privilege below); Windows refills it from use, which is the point of it.
        public static bool PurgeStandby()
        {
            if (!EnablePrivilege("SeProfileSingleProcessPrivilege")) return false;
            int cmd = 4; // MemoryPurgeStandbyList
            return NtSetSystemInformation(80, ref cmd, 4) == 0; // SystemMemoryListInformation
        }
        // Is the window in front covering its whole screen (a game, a video)? Not the desktop, not the taskbar.
        public static bool ForegroundFullscreen(out int pid)
        {
            pid = 0;
            IntPtr h = GetForegroundWindow();
            if (h == IntPtr.Zero) return false;
            var cls = new StringBuilder(64); GetClassName(h, cls, 64);
            string c = cls.ToString();
            if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Windows.UI.Core.CoreWindow") return false;
            RECT r; if (!GetWindowRect(h, out r)) return false;
            var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(mi);
            if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
            GetWindowThreadProcessId(h, out pid);
            return r.Left <= mi.rcMonitor.Left && r.Top <= mi.rcMonitor.Top && r.Right >= mi.rcMonitor.Right && r.Bottom >= mi.rcMonitor.Bottom;
        }
    }

    // ------------------------------------------------------------------ what the apps remember
    static class State
    {
        const string KeyPath = @"Software\OmniDx\Edition";
        public static string Get(string name, string def)
        {
            try { using (var k = Registry.CurrentUser.OpenSubKey(KeyPath)) { var v = k == null ? null : k.GetValue(name); return v == null ? def : v.ToString(); } }
            catch { return def; }
        }
        public static void Set(string name, object v)
        {
            try { using (var k = Registry.CurrentUser.CreateSubKey(KeyPath)) k.SetValue(name, v is bool ? ((bool)v ? 1 : 0) : v); } catch { }
        }
        public static bool Flag(string name, bool def) { return Get(name, def ? "1" : "0") == "1"; }
        public static string Preset { get { return Get("Preset", "Competitive"); } set { Set("Preset", value); } }
        public static bool Boost { get { return Flag("Boost", false); } set { Set("Boost", value); } }
        public static bool AutoBoost { get { return Flag("AutoBoost", true); } set { Set("AutoBoost", value); } }
        public static string Engine { get { return Get("SearchEngine", "Google"); } set { Set("SearchEngine", value); } }
        public static string SearchUrl(string q)
        {
            string e = Uri.EscapeDataString(q);
            switch (Engine)
            {
                case "DuckDuckGo": return "https://duckduckgo.com/?q=" + e;
                case "Bing": return "https://www.bing.com/search?q=" + e;
                case "Brave": return "https://search.brave.com/search?q=" + e;
                default: return "https://www.google.com/search?q=" + e;
            }
        }
    }

    // One message every OmniDx window listens for: "the state changed, look again" (Boost on or off, a preset, the
    // search engine) or "show yourself". Sent to every top-level window; only ours know it.
    static class Signal
    {
        public const int Changed = 1, ShowSearch = 2, Boost = 3, Unboost = 4;
        static int msg;
        public static int Msg { get { if (msg == 0) msg = Native.RegisterWindowMessage("OmniDx.Edition.Signal"); return msg; } }
        public static void Send(int what) { Native.PostMessage((IntPtr)0xFFFF, Msg, (IntPtr)what, IntPtr.Zero); }
        // A window run as administrator still hears the apps that are not.
        public static void Listen(IntPtr h) { try { Native.ChangeWindowMessageFilterEx(h, Msg, 1, IntPtr.Zero); } catch { } }
    }

    // ------------------------------------------------------------------ the games on this PC
    class Game
    {
        public string Name, Launch, Args, IconPath, Art, Source, Id;
        public override string ToString() { return Name; }
    }

    static class Games
    {
        static string Read(string p) { try { return File.ReadAllText(p); } catch { return ""; } }
        static string Field(string text, string name)
        {
            var m = Regex.Match(text, "\"" + name + "\"\\s*[:]?\\s*\"((?:[^\"\\\\]|\\\\.)*)\"", RegexOptions.IgnoreCase);
            return m.Success ? Regex.Unescape(m.Groups[1].Value) : null;
        }
        static readonly string[] NotGames = { "Steamworks Common Redistributables", "Steam Linux Runtime", "Proton", "SteamVR", "Wallpaper Engine", "Source SDK", "Dedicated Server", "Redistributable" };

        public static List<Game> Find()
        {
            var list = new List<Game>();
            try { Steam(list); } catch (Exception e) { Edition.Log("steam: " + e.Message); }
            try { Epic(list); } catch (Exception e) { Edition.Log("epic: " + e.Message); }
            try { Riot(list); } catch (Exception e) { Edition.Log("riot: " + e.Message); }
            try { Others(list); } catch (Exception e) { Edition.Log("others: " + e.Message); }
            return list.GroupBy(g => g.Name.ToLowerInvariant()).Select(x => x.First()).OrderBy(g => g.Name).ToList();
        }

        static void Steam(List<Game> list)
        {
            string steam = null;
            using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam")) if (k != null) steam = k.GetValue("SteamPath") as string;
            if (string.IsNullOrEmpty(steam)) return;
            steam = steam.Replace('/', '\\');
            var libs = new List<string> { steam };
            string vdf = Read(Path.Combine(steam, @"steamapps\libraryfolders.vdf"));
            foreach (Match m in Regex.Matches(vdf, "\"path\"\\s+\"([^\"]+)\"")) libs.Add(m.Groups[1].Value.Replace("\\\\", "\\"));
            foreach (var lib in libs.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                string apps = Path.Combine(lib, "steamapps");
                if (!Directory.Exists(apps)) continue;
                foreach (var acf in Directory.GetFiles(apps, "appmanifest_*.acf"))
                {
                    string t = Read(acf), id = Field(t, "appid"), name = Field(t, "name"), dir = Field(t, "installdir");
                    if (id == null || name == null || NotGames.Any(n => name.IndexOf(n, StringComparison.OrdinalIgnoreCase) >= 0)) continue;
                    var g = new Game { Name = name, Launch = "steam://rungameid/" + id, Source = "Steam", Id = id };
                    foreach (var art in new[] { Path.Combine(steam, @"appcache\librarycache\" + id + @"\header.jpg"), Path.Combine(steam, @"appcache\librarycache\" + id + "_header.jpg") })
                        if (File.Exists(art)) { g.Art = art; break; }
                    g.IconPath = BiggestExe(Path.Combine(apps, @"common\" + dir)) ?? Path.Combine(steam, "steam.exe");
                    list.Add(g);
                }
            }
        }

        static void Epic(List<Game> list)
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), @"Epic\EpicGamesLauncher\Data\Manifests");
            if (!Directory.Exists(dir)) return;
            foreach (var f in Directory.GetFiles(dir, "*.item"))
            {
                string t = Read(f), name = Field(t, "DisplayName"), app = Field(t, "AppName"), loc = Field(t, "InstallLocation"), exe = Field(t, "LaunchExecutable");
                if (name == null || app == null) continue;
                if (t.IndexOf("\"bIsApplication\": false", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                list.Add(new Game { Name = name, Launch = "com.epicgames.launcher://apps/" + Uri.EscapeDataString(app) + "?action=launch&silent=true", Source = "Epic", Id = app,
                    IconPath = loc != null && exe != null ? Path.Combine(loc, exe) : null });
            }
        }

        static void Riot(List<Game> list)
        {
            string pd = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            string rc = Field(Read(Path.Combine(pd, @"Riot Games\RiotClientInstalls.json")), "rc_default");
            if (rc == null || !File.Exists(rc)) return;
            var products = new[] { new[] { "valorant", "VALORANT" }, new[] { "league_of_legends", "League of Legends" }, new[] { "lion", "2XKO" } };
            foreach (var p in products)
            {
                string settings = Path.Combine(pd, @"Riot Games\Metadata\" + p[0] + ".live\\" + p[0] + ".live.product_settings.yaml");
                if (!File.Exists(settings)) continue;
                string root = null;
                var m = Regex.Match(Read(settings), "product_install_full_path:\\s*\"?([^\"\\r\\n]+)");
                if (m.Success) root = m.Groups[1].Value.Trim();
                string icon = root != null && p[0] == "valorant" ? Path.Combine(root, @"live\VALORANT.exe") : root != null ? Path.Combine(root, @"LeagueClient.exe") : rc;
                list.Add(new Game { Name = p[1], Launch = rc, Args = "--launch-product=" + p[0] + " --launch-patchline=live", Source = "Riot", Id = p[0], IconPath = File.Exists(icon) ? icon : rc });
            }
        }

        // Launchers and games with their own installer, found by where they always install.
        static void Others(List<Game> list)
        {
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            var known = new[] {
                new[] { "Battle.net", pf86 + @"\Battle.net\Battle.net Launcher.exe" },
                new[] { "EA app", pf + @"\Electronic Arts\EA Desktop\EA Desktop\EALauncher.exe" },
                new[] { "Ubisoft Connect", pf86 + @"\Ubisoft\Ubisoft Game Launcher\UbisoftConnect.exe" },
                new[] { "Minecraft Launcher", pf86 + @"\Minecraft Launcher\MinecraftLauncher.exe" },
                new[] { "Roblox", Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + @"\Roblox\Versions" },
                new[] { "osu!", Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + @"\osu!\osu!.exe" },
            };
            foreach (var k in known)
            {
                if (k[0] == "Roblox")
                {
                    if (!Directory.Exists(k[1])) continue;
                    var exe = Directory.GetFiles(k[1], "RobloxPlayerBeta.exe", SearchOption.AllDirectories).FirstOrDefault();
                    if (exe != null) list.Add(new Game { Name = "Roblox", Launch = "roblox-player:", Source = "Roblox", IconPath = exe });
                    continue;
                }
                if (File.Exists(k[1])) list.Add(new Game { Name = k[0], Launch = k[1], Source = "Launcher", IconPath = k[1] });
            }
        }

        static string BiggestExe(string dir)
        {
            try
            {
                if (!Directory.Exists(dir)) return null;
                var skip = new[] { "unins", "crash", "redist", "setup", "vc_", "dxsetup", "launcher_helper", "easyanticheat", "be_service", "report" };
                return Directory.GetFiles(dir, "*.exe", SearchOption.TopDirectoryOnly).Concat(SafeSub(dir))
                    .Where(f => !skip.Any(s => Path.GetFileName(f).ToLowerInvariant().Contains(s)))
                    .OrderByDescending(f => new FileInfo(f).Length).FirstOrDefault();
            }
            catch { return null; }
        }
        static IEnumerable<string> SafeSub(string dir)
        {
            var o = new List<string>();
            try { foreach (var d in Directory.GetDirectories(dir).Take(12)) try { o.AddRange(Directory.GetFiles(d, "*.exe")); } catch { } } catch { }
            return o;
        }

        public static void Launch(Game g)
        {
            Edition.Log("launch " + g.Name);
            if (g.Args != null) Edition.Start(g.Launch, g.Args); else Edition.Start(g.Launch, null);
        }
    }

    // ------------------------------------------------------------------ a button, drawn the OmniDx way
    enum Look { Primary, Secondary, Ghost, Danger }

    class FlatButton : Control
    {
        public Look Look = Look.Secondary;
        public string Glyph;
        public bool Shield;
        bool hover, down;
        public FlatButton(string text, Look look)
        {
            Text = text; Look = look;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
            Cursor = Cursors.Hand; Font = Theme.Semi(9.5f); Height = Theme.S(36);
            BackColor = Color.Transparent;
        }
        public int Natural { get { return Theme.Measure(Text, Font) + Theme.S(32) + (Glyph != null || Shield ? Theme.S(22) : 0); } }
        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; var r = new Rectangle(0, 0, Width - 1, Height - 1);
            float rad = Theme.S(8);
            Color fg = Theme.Text;
            if (!Enabled) { Theme.Fill(g, r, rad, Theme.Surface); fg = Theme.Text3; }
            else if (Look == Look.Primary) { Theme.FillGrad(g, r, rad, 255); if (hover) Theme.Fill(g, r, rad, Color.FromArgb(down ? 50 : 30, Color.White)); }
            else if (Look == Look.Danger) { Theme.Fill(g, r, rad, hover ? Theme.Mix(Theme.Surface2, Theme.Bad, .35f) : Theme.Surface2); fg = hover ? Color.White : Theme.Bad; }
            else if (Look == Look.Ghost) { if (hover) Theme.Fill(g, r, rad, down ? Theme.Selected : Theme.Hover); fg = hover ? Theme.Text : Theme.Text2; }
            else { Theme.Fill(g, r, rad, down ? Theme.Selected : hover ? Theme.Hover : Theme.Surface2); Theme.Stroke(g, r, rad, Theme.Line, 1); }
            int x = 0, w = Width;
            string glyph = Shield ? G.Shield : Glyph;
            if (glyph != null)
            {
                int tw = Theme.Measure(Text, Font), gw = Theme.S(18), gap = string.IsNullOrEmpty(Text) ? 0 : Theme.S(8), total = gw + gap + tw;
                x = (Width - total) / 2;
                Theme.Icon(g, glyph, 10.5f, new Rectangle(x, 0, gw, Height), Shield && Look != Look.Primary ? Theme.Warn : fg);
                x += gw + gap; w = tw + 2;
                if (!string.IsNullOrEmpty(Text)) Theme.Draw(g, Text, Font, new Rectangle(x, 0, w + Theme.S(4), Height), fg);
            }
            else Theme.Draw(g, Text, Font, new Rectangle(0, 0, Width, Height), fg, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
    }

    // A switch, as in Windows' own Settings, in OmniDx colours.
    class Toggle : Control
    {
        bool on;
        public event EventHandler Changed;
        public Toggle()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent; Size = new Size(Theme.S(44), Theme.S(22)); Cursor = Cursors.Hand;
        }
        public bool On { get { return on; } set { if (on != value) { on = value; Invalidate(); } } }
        protected override void OnClick(EventArgs e) { on = !on; Invalidate(); if (Changed != null) Changed(this, e); base.OnClick(e); }
        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new Rectangle(0, 0, Width - 1, Height - 1);
            if (on) Theme.FillGrad(g, r, Height / 2f, 255); else { Theme.Fill(g, r, Height / 2f, Theme.Surface2); Theme.Stroke(g, r, Height / 2f, Theme.Text3, 1); }
            int d = Height - Theme.S(8), x = on ? Width - d - Theme.S(4) : Theme.S(4);
            using (var b = new SolidBrush(on ? Color.White : Theme.Text2)) g.FillEllipse(b, x, Theme.S(4), d - 1, d - 1);
        }
    }

    // ------------------------------------------------------------------ a window with its own title bar
    // The title bar is part of the window's own painting (tabs in it, for the browser), while Windows keeps what
    // makes a window a window: resizing from every edge, snap, Aero shake, the Windows 11 snap layouts on the
    // maximise button, the shadow and the rounded corners.
    class ChromeForm : Form
    {
        protected int Caption = Theme.S(40);
        protected Rectangle BtnMin, BtnMax, BtnClose;
        int hover, pressed;
        const int HTCLIENT = 1, HTCAPTION = 2, HTMINBUTTON = 8, HTMAXBUTTON = 9, HTTOP = 12, HTTOPLEFT = 13, HTTOPRIGHT = 14, HTCLOSE = 20;

        public ChromeForm()
        {
            FormBorderStyle = FormBorderStyle.Sizable;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            BackColor = Theme.Bg; ForeColor = Theme.Text; Font = Theme.UI(9.5f);
            StartPosition = FormStartPosition.CenterScreen;
        }
        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            Native.DarkWindow(Handle, true, Theme.Line);
            Signal.Listen(Handle);
            Native.SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0020 | 0x0002 | 0x0001 | 0x0004 | 0x0010); // frame changed
        }
        protected override void OnResize(EventArgs e)
        {
            int bw = Theme.S(46), bh = Math.Min(Caption, Theme.S(40));
            BtnClose = new Rectangle(ClientSize.Width - bw, 0, bw, bh);
            BtnMax = new Rectangle(BtnClose.X - bw, 0, bw, bh);
            BtnMin = new Rectangle(BtnMax.X - bw, 0, bw, bh);
            base.OnResize(e); Invalidate();
        }
        // Where dragging moves the window. Subclasses leave out whatever they draw there (tabs).
        protected virtual bool IsCaption(Point p) { return p.Y < Caption; }

        protected void PaintButtons(Graphics g)
        {
            var list = new[] { new { R = BtnMin, H = HTMINBUTTON, Gl = G.Min }, new { R = BtnMax, H = HTMAXBUTTON, Gl = WindowState == FormWindowState.Maximized ? G.Restore : G.Max }, new { R = BtnClose, H = HTCLOSE, Gl = G.Close } };
            foreach (var b in list)
            {
                bool hot = hover == b.H, down = pressed == b.H && hot;
                if (hot) using (var br = new SolidBrush(b.H == HTCLOSE ? (down ? Theme.Mix(Theme.CloseRed, Color.Black, .2f) : Theme.CloseRed) : (down ? Theme.Selected : Theme.Hover))) g.FillRectangle(br, b.R);
                Theme.Icon(g, b.Gl, 7.5f, b.R, hot && b.H == HTCLOSE ? Color.White : (ContainsFocus || hot ? Theme.Text : Theme.Text3));
            }
        }
        void SetHover(int h) { if (h != hover) { hover = h; Invalidate(Rectangle.Union(BtnMin, BtnClose)); } }
        protected override void OnMouseMove(MouseEventArgs e) { SetHover(0); base.OnMouseMove(e); }
        protected override void OnActivated(EventArgs e) { Invalidate(); base.OnActivated(e); }
        protected override void OnDeactivate(EventArgs e) { Invalidate(); base.OnDeactivate(e); }

        int FrameY() { return Native.GetSystemMetrics(33) + Native.GetSystemMetrics(92); }
        protected override void WndProc(ref Message m)
        {
            switch (m.Msg)
            {
                case 0x0083: // WM_NCCALCSIZE: keep Windows' side and bottom borders, drop its title bar
                    if (m.WParam != IntPtr.Zero)
                    {
                        var p = (Native.NCCALCSIZE_PARAMS)Marshal.PtrToStructure(m.LParam, typeof(Native.NCCALCSIZE_PARAMS));
                        int top = p.r0.Top;
                        base.WndProc(ref m);
                        p = (Native.NCCALCSIZE_PARAMS)Marshal.PtrToStructure(m.LParam, typeof(Native.NCCALCSIZE_PARAMS));
                        p.r0.Top = top + (WindowState == FormWindowState.Maximized ? FrameY() : 0);
                        Marshal.StructureToPtr(p, m.LParam, false);
                        m.Result = IntPtr.Zero;
                        return;
                    }
                    break;
                case 0x0084: // WM_NCHITTEST
                    base.WndProc(ref m);
                    if ((int)m.Result == HTCLIENT)
                    {
                        long lp = m.LParam.ToInt64();
                        var pt = PointToClient(new Point((short)(lp & 0xFFFF), (short)((lp >> 16) & 0xFFFF)));
                        int ht = HitTest(pt);
                        if (ht != HTCLIENT) m.Result = (IntPtr)ht;
                    }
                    return;
                case 0x00A0: // WM_NCMOUSEMOVE
                    SetHover(Button((int)m.WParam));
                    var t = new Native.TRACKMOUSEEVENT { cbSize = Marshal.SizeOf(typeof(Native.TRACKMOUSEEVENT)), dwFlags = 0x12, hwndTrack = Handle };
                    Native.TrackMouseEvent(ref t);
                    break;
                case 0x02A2: // WM_NCMOUSELEAVE
                    SetHover(0); pressed = 0;
                    break;
                case 0x00A1: // WM_NCLBUTTONDOWN
                    if (Button((int)m.WParam) != 0) { pressed = (int)m.WParam; Invalidate(Rectangle.Union(BtnMin, BtnClose)); m.Result = IntPtr.Zero; return; }
                    break;
                case 0x00A2: // WM_NCLBUTTONUP
                    if (Button((int)m.WParam) != 0)
                    {
                        int w = (int)m.WParam; bool go = pressed == w; pressed = 0;
                        if (go)
                        {
                            if (w == HTCLOSE) Close();
                            else if (w == HTMAXBUTTON) WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
                            else WindowState = FormWindowState.Minimized;
                        }
                        m.Result = IntPtr.Zero; return;
                    }
                    pressed = 0;
                    break;
            }
            if (m.Msg == Signal.Msg) { OnSignal((int)m.WParam); return; }
            base.WndProc(ref m);
        }
        static int Button(int ht) { return ht == HTMINBUTTON || ht == HTMAXBUTTON || ht == HTCLOSE ? ht : 0; }
        int HitTest(Point p)
        {
            if (WindowState != FormWindowState.Maximized && p.Y < Theme.S(5))
            {
                if (p.X < Theme.S(12)) return HTTOPLEFT;
                if (p.X > ClientSize.Width - Theme.S(12)) return HTTOPRIGHT;
                return HTTOP;
            }
            if (BtnClose.Contains(p)) return HTCLOSE;
            if (BtnMax.Contains(p)) return HTMAXBUTTON;
            if (BtnMin.Contains(p)) return HTMINBUTTON;
            if (IsCaption(p)) return HTCAPTION;
            return HTCLIENT;
        }
        protected virtual void OnSignal(int what) { }
    }
}
