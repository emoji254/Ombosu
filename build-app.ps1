# Builds Nyaega-working.html from the source parts in src\ (a plain concatenation: no transformation, no bundler).
#
#   src\head.html, src\styles.css, src\body.html, src\js\NN-*.js (in number order), src\tail.html
#
# The JavaScript files are NOT modules: they are pieces of one script, run in file-name order in one shared scope, exactly as
# the old single script ran. A file may use anything defined in an earlier file at load time, and anything at all once the
# app is running. Keep the numbers in order when adding a file.
#
# Edit the files in src\, not Nyaega-working.html (it is regenerated). If Nyaega-working.html was changed by hand since the
# last build, this script stops instead of overwriting that change; copy it into src\ first, or use -Force.
#   powershell -ExecutionPolicy Bypass -File build-app.ps1
param([string]$Out = "$PSScriptRoot\Nyaega-working.html", [switch]$Force, [switch]$Check)
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'src'
$files = @('head.html', 'styles.css', 'body.html') | ForEach-Object { Join-Path $src $_ }
$files += (Get-ChildItem (Join-Path $src 'js') -Filter '*.js' | Sort-Object Name | ForEach-Object { $_.FullName })
$files += Join-Path $src 'tail.html'
$ms = New-Object IO.MemoryStream
foreach ($f in $files) { if (-not (Test-Path $f)) { throw "missing source file: $f" }; $b = [IO.File]::ReadAllBytes($f); $ms.Write($b, 0, $b.Length) }
$built = $ms.ToArray()
$sha = [Security.Cryptography.SHA256]::Create()
$hash = [BitConverter]::ToString($sha.ComputeHash($built)).Replace('-', '').ToLower()
$stamp = Join-Path $src '.last-build.sha256'
if ($Check) {
  $now = if (Test-Path $Out) { [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Out))).Replace('-', '').ToLower() } else { '' }
  if ($now -eq $hash) { Write-Host "OK: $Out matches src\ ($($files.Count) files)"; exit 0 } else { Write-Host "DIFFERENT: $Out does not match src\"; exit 1 }
}
if ((Test-Path $Out) -and (Test-Path $stamp) -and -not $Force) {
  $now = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Out))).Replace('-', '').ToLower()
  $last = (Get-Content $stamp -Raw).Trim()
  if ($now -ne $last -and $now -ne $hash) { throw "$Out was changed by hand since the last build. Move that change into src\ (or run with -Force to overwrite it)." }
}
[IO.File]::WriteAllBytes($Out, $built)
Set-Content -Path $stamp -Value $hash -Encoding ASCII
Write-Host "Built $Out from $($files.Count) source files ($([Math]::Round($built.Length / 1024)) KB)"
