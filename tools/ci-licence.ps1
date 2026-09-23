<#  A stand-in licence server for the Windows check.

    The tune will not do a first run without a server that vouches for the
    key, and the build machine has no Cloudflare. This answers the three
    routes the script uses, on 127.0.0.1 only, accepting any key that
    passes the format check and binding nothing. It exists so the check can
    run the whole tune; it is not, and must never be, reachable from
    anywhere else.

      Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File tools\ci-licence.ps1'
      .\tune\omnidx.ps1 -Key ... -Api http://127.0.0.1:8787
#>
param([int]$Port = 8787)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add(("http://127.0.0.1:{0}/" -f $Port))
$listener.Start()
$claims = @{}
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  $body = ''
  if ($req.HasEntityBody) { $body = (New-Object IO.StreamReader($req.InputStream, $req.ContentEncoding)).ReadToEnd() }
  $answer = '{"ok":false,"error":"no such route"}'; $status = 404
  switch -Regex ($req.Url.AbsolutePath) {
    '/v1/health$' { $answer = '{"ok":true,"mock":true}'; $status = 200 }
    '/v1/tune/claim$' {
      $key = ''; try { $key = [string](ConvertFrom-Json $body).key } catch { }
      # The script sends the key as it was typed; the real server normalises too.
      $key = ($key -replace '[^A-Za-z0-9]', '').ToUpper()
      if ($key -match '^(TUNE|SQUAD)[A-Z2-9]{16}$') { $claims[$key] = $true; $answer = '{"ok":true,"used":1,"seats":1}'; $status = 200 }
      else { $answer = '{"ok":false,"error":"That key was not issued by us."}'; $status = 404 }
    }
    '/v1/tune/check$' { $answer = '{"ok":true,"bound":1,"seats":1}'; $status = 200 }
    '/v1/tune/release$' { $answer = '{"ok":true,"seats":1}'; $status = 200 }
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes($answer)
  $res.StatusCode = $status; $res.ContentType = 'application/json'; $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length); $res.OutputStream.Close()
}
