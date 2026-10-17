# Builds the production site folder from Nyaega-working.html:
#   site\index.html          the app with a Content-Security-Policy and integrity hashes on the CDN libraries
#   site\sw.js               service worker (offline app shell, safe update flow)
#   site\manifest.webmanifest, site\icon-*.png
# Re-run this after every change to Nyaega-working.html: the CSP contains a hash of the app's script,
# so an edited script is refused by the browser until the site is rebuilt.
# The three CDN libraries are read once (into memory) to compute their integrity hashes; hashes are cached in site\lib-hashes.json.
param([string]$Source = "$PSScriptRoot\Nyaega-working.html", [string]$Out = "$PSScriptRoot\site")
$ErrorActionPreference = 'Stop'
# The app is edited as parts in src\ and joined into Nyaega-working.html first (see build-app.ps1).
if ($Source -eq "$PSScriptRoot\Nyaega-working.html" -and (Test-Path "$PSScriptRoot\src")) { & "$PSScriptRoot\build-app.ps1" }
$utf8 = New-Object System.Text.UTF8Encoding($false)
New-Item -ItemType Directory -Force $Out | Out-Null

$html = [IO.File]::ReadAllText($Source, $utf8).Replace("`r`n", "`n")

# ---- integrity hashes for the CDN libraries
$hashFile = Join-Path $Out 'lib-hashes.json'
$known = @{}
if (Test-Path $hashFile) { (Get-Content $hashFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $known[$_.Name] = $_.Value } }
$libs = @()
foreach ($m in [regex]::Matches($html, '<script src="(https://cdnjs\.cloudflare\.com/[^"]+)"></script>')) {
  $url = $m.Groups[1].Value; $libs += $url
  if (-not $known.ContainsKey($url)) {
    Write-Host "Reading $url to compute its integrity hash..."
    $bytes = (Invoke-WebRequest -UseBasicParsing -Uri $url).Content
    if ($bytes -is [string]) { $bytes = $utf8.GetBytes($bytes) }
    $known[$url] = 'sha384-' + [Convert]::ToBase64String([Security.Cryptography.SHA384]::Create().ComputeHash($bytes))
  }
  $html = $html.Replace($m.Value, '<script src="' + $url + '" integrity="' + $known[$url] + '" crossorigin="anonymous"></script>')
}
($known | ConvertTo-Json) | Set-Content -Encoding UTF8 $hashFile

# ---- hash of the app's inline script (browsers normalise line endings to LF before hashing)
$sm = [regex]::Match($html, '<script>(.*?)</script>', 'Singleline')
if (-not $sm.Success) { throw 'inline app script not found' }
$scriptHash = 'sha256-' + [Convert]::ToBase64String([Security.Cryptography.SHA256]::Create().ComputeHash($utf8.GetBytes($sm.Groups[1].Value)))
$supabase = [regex]::Match($html, "const SUPABASE_URL = '([^']+)'").Groups[1].Value
$connect = "'self'"; if ($supabase) { $connect += ' ' + $supabase }

$csp = "default-src 'none'; script-src '$scriptHash' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src $connect; font-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'"
$headExtra = @"
<meta http-equiv="Content-Security-Policy" content="$csp">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#142b25">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
"@
$html = $html.Replace('<meta charset="utf-8">', "<meta charset=`"utf-8`">`n" + $headExtra)
[IO.File]::WriteAllText((Join-Path $Out 'index.html'), $html, $utf8)

# ---- icons
Add-Type -AssemblyName System.Drawing
function New-Icon($size, $path) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#142b25'))
  $font = New-Object System.Drawing.Font('Segoe UI', [single]($size * 0.46), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#c4e58d'))
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $g.DrawString('N', $font, $brush, (New-Object System.Drawing.RectangleF 0, 0, $size, $size), $fmt)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}
foreach ($i in @(@(192, 'icon-192.png'), @(512, 'icon-512.png'), @(180, 'apple-touch-icon.png'))) { $p = Join-Path $Out $i[1]; if (-not (Test-Path $p)) { New-Icon $i[0] $p } }

# ---- manifest
$manifest = @{
  name = 'Nyaega'; short_name = 'Nyaega'; description = '1:1 and semi-private coaching'
  start_url = './'; scope = './'; display = 'standalone'; background_color = '#142b25'; theme_color = '#142b25'
  icons = @(@{ src = 'icon-192.png'; sizes = '192x192'; type = 'image/png'; purpose = 'any maskable' }, @{ src = 'icon-512.png'; sizes = '512x512'; type = 'image/png'; purpose = 'any maskable' })
}
[IO.File]::WriteAllText((Join-Path $Out 'manifest.webmanifest'), ($manifest | ConvertTo-Json -Depth 5), $utf8)

# ---- service worker: versioned cache of the app shell only. No client data and no API responses are ever cached here.
$version = ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($utf8.GetBytes($html))) -replace '-', '').Substring(0, 12).ToLower()
$libJson = ($libs | ConvertTo-Json -Compress); if ($libs.Count -eq 1) { $libJson = "[$libJson]" }
$sw = @"
const CACHE = 'nyaega-$version';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const LIBS = $libJson;
self.addEventListener('install', e => {
  // No skipWaiting here: a new version waits until the coach taps "Reload to update".
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    await Promise.all(LIBS.map(u => fetch(u, { mode: 'cors', credentials: 'omit' }).then(r => { if (!r.ok) throw new Error(u); return c.put(u, r); })));
  }));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('nyaega-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !LIBS.includes(req.url)) return;   // API calls and everything else go straight to the network
  if (req.mode === 'navigate'){ e.respondWith(caches.match('index.html').then(r => r || fetch(req))); return; }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
"@
[IO.File]::WriteAllText((Join-Path $Out 'sw.js'), $sw, $utf8)
Write-Host "Built $Out  (cache version $version, script hash $scriptHash)"
