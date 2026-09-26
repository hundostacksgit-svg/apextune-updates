// A person at the mouse and keyboard, as Windows sees one: SendInput clicks and
// keys, and a pointer that travels on a curve, eases in and out, overshoots a
// little and settles, the way a hand does. Nothing here is faked on screen:
// Windows gets the same input a real mouse and keyboard would send.
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class Human {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll", EntryPoint = "SetCursorPos")] static extern bool SetCursorPosApi(int x, int y);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [StructLayout(LayoutKind.Sequential)] struct CURSORINFO { public int cbSize, flags; public IntPtr hCursor; public POINT pt; }
  [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO ci);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hgt, bool repaint);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

  static readonly Random R = new Random(20260925);
  const uint MOVE = 0x0001, LDOWN = 0x0002, LUP = 0x0004, WHEEL = 0x0800, ABSOLUTE = 0x8000, KEYUP = 0x0002, UNICODE = 0x0004;

  /// The pointer to (x, y) as mouse input, the way a mouse moves it (absolute, like a tablet or a remote desktop):
  /// Windows treats it as a mouse being used, and draws the pointer, which it hides on a machine with no mouse.
  static void SetCursorPos(int x, int y) {
    int w = Math.Max(2, GetSystemMetrics(0)), h = Math.Max(2, GetSystemMetrics(1));
    var inp = new INPUT[1]; inp[0].type = 0;
    inp[0].u.mi.dx = (int)Math.Round(x * 65535.0 / (w - 1)); inp[0].u.mi.dy = (int)Math.Round(y * 65535.0 / (h - 1));
    inp[0].u.mi.dwFlags = MOVE | ABSOLUTE;
    SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
  }

  // Where the pointer was, 60 times a second, and whether Windows drew it: for the edit, which puts the pointer
  // back where it really was if the recording did not show it.
  static Thread tracker; static volatile bool tracking; static System.Text.StringBuilder track = new System.Text.StringBuilder();
  public static void StartTrack() {
    tracking = true; track.Clear();
    var sw = System.Diagnostics.Stopwatch.StartNew();
    tracker = new Thread(() => {
      while (tracking) {
        var ci = new CURSORINFO(); ci.cbSize = Marshal.SizeOf(typeof(CURSORINFO)); GetCursorInfo(ref ci);
        lock (track) track.AppendFormat("{0:0.000},{1},{2},{3}\n", sw.Elapsed.TotalSeconds, ci.pt.X, ci.pt.Y, ci.flags);
        Thread.Sleep(16);
      }
    });
    tracker.IsBackground = true; tracker.Start();
  }
  public static string StopTrack() { tracking = false; if (tracker != null) tracker.Join(500); lock (track) return track.ToString(); }

  public static POINT Where() { POINT p; GetCursorPos(out p); return p; }
  static double Gauss() { double u = 1 - R.NextDouble(), v = R.NextDouble(); return Math.Sqrt(-2 * Math.Log(u)) * Math.Cos(2 * Math.PI * v); }

  /// Travel to (x, y): a bent path, fast in the middle, a small overshoot on long moves, then settle.
  public static void MoveTo(int x, int y, int ms = 0) {
    POINT a = Where();
    double dx = x - a.X, dy = y - a.Y, dist = Math.Sqrt(dx * dx + dy * dy);
    if (dist < 2) return;
    if (ms <= 0) ms = (int)(260 + 110 * Math.Log(1 + dist / 18) + R.Next(0, 90)); // Fitts-like: longer moves take a little longer
    // The bend: a control point off the straight line, to one side, like a wrist pivoting.
    double side = (R.NextDouble() < 0.5 ? -1 : 1) * dist * (0.08 + 0.12 * R.NextDouble());
    double cx = a.X + dx * 0.45 - dy / dist * side, cy = a.Y + dy * 0.45 + dx / dist * side;
    bool over = dist > 250;
    double ox = x + (over ? dx / dist * (4 + R.Next(0, 9)) : 0), oy = y + (over ? dy / dist * (3 + R.Next(0, 7)) : 0);
    int steps = Math.Max(8, ms / 8);
    for (int i = 1; i <= steps; i++) {
      double t = (double)i / steps;
      double e = t * t * t * (10 - 15 * t + 6 * t * t); // minimum-jerk ease
      double bx = (1 - e) * (1 - e) * a.X + 2 * (1 - e) * e * cx + e * e * ox;
      double by = (1 - e) * (1 - e) * a.Y + 2 * (1 - e) * e * cy + e * e * oy;
      double shake = (1 - t) * 0.6;
      SetCursorPos((int)Math.Round(bx + Gauss() * shake), (int)Math.Round(by + Gauss() * shake));
      Thread.Sleep(8);
    }
    if (over) { // settle back onto the target
      Thread.Sleep(40 + R.Next(0, 50));
      POINT b = Where(); int n = 10 + R.Next(0, 6);
      for (int i = 1; i <= n; i++) { double t = (double)i / n, e = 1 - Math.Pow(1 - t, 3); SetCursorPos((int)Math.Round(b.X + (x - b.X) * e), (int)Math.Round(b.Y + (y - b.Y) * e)); Thread.Sleep(10); }
    }
    SetCursorPos(x, y);
  }

  /// A slow drift while reading: a few pixels, the hand resting on the mouse.
  public static void Drift(int ms) {
    POINT a = Where(); int n = ms / 16; double px = 0, py = 0;
    for (int i = 0; i < n; i++) { px += Gauss() * 0.35; py += Gauss() * 0.3; px *= 0.96; py *= 0.96; SetCursorPos(a.X + (int)Math.Round(px * 3), a.Y + (int)Math.Round(py * 3)); Thread.Sleep(16); }
  }

  static void Mouse(uint flags, uint data = 0) {
    var inp = new INPUT[1]; inp[0].type = 0; inp[0].u.mi.dwFlags = flags; inp[0].u.mi.mouseData = data;
    SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Click() { Mouse(LDOWN); Thread.Sleep(55 + R.Next(0, 60)); Mouse(LUP); }
  public static void ClickAt(int x, int y) { MoveTo(x, y); Thread.Sleep(90 + R.Next(0, 140)); Click(); }
  public static void DoubleClickAt(int x, int y) { MoveTo(x, y); Thread.Sleep(120 + R.Next(0, 120)); Click(); Thread.Sleep(70 + R.Next(0, 40)); Click(); }
  public static void Wheel(int notches) { for (int i = 0; i < Math.Abs(notches); i++) { Mouse(WHEEL, (uint)(notches < 0 ? -120 : 120)); Thread.Sleep(45 + R.Next(0, 60)); } }

  static void Key(ushort vk, bool up) {
    var inp = new INPUT[1]; inp[0].type = 1; inp[0].u.ki.wVk = vk; inp[0].u.ki.dwFlags = up ? KEYUP : 0;
    SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
  }
  public static void Press(params ushort[] vks) { foreach (var k in vks) { Key(k, false); Thread.Sleep(28 + R.Next(0, 30)); } for (int i = vks.Length - 1; i >= 0; i--) { Key(vks[i], true); Thread.Sleep(18 + R.Next(0, 20)); } }
  static void Char(char c) {
    var inp = new INPUT[2];
    inp[0].type = 1; inp[0].u.ki.wScan = c; inp[0].u.ki.dwFlags = UNICODE;
    inp[1].type = 1; inp[1].u.ki.wScan = c; inp[1].u.ki.dwFlags = UNICODE | KEYUP;
    SendInput(2, inp, Marshal.SizeOf(typeof(INPUT)));
  }
  /// Type like a person who knows the line: bursts, a beat after spaces and symbols, now and then a slip put right.
  public static void Type(string text, double pace = 1.0, string slipAfter = null) {
    int slipAt = slipAfter == null ? -1 : text.IndexOf(slipAfter) + slipAfter.Length;
    for (int i = 0; i < text.Length; i++) {
      if (i == slipAt) { Char('z'); Thread.Sleep((int)(160 * pace)); Thread.Sleep((int)(260 * pace)); Press(0x08); Thread.Sleep((int)(140 * pace)); }
      char c = text[i];
      Char(c);
      double d = 70 + Math.Abs(Gauss()) * 55;
      if (c == ' ') d += 60 + R.Next(0, 90);
      if ("|./-'$=;".IndexOf(c) >= 0) d += 90 + R.Next(0, 120);
      if (i > 0 && char.IsLetter(c) && char.IsLetter(text[i - 1]) && R.NextDouble() < 0.35) d *= 0.6; // a familiar pair runs together
      Thread.Sleep((int)(d * pace));
    }
  }
}
