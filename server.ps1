# DNJ 2026 - servidor com banco automatico
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
. (Join-Path $root "engine.ps1")
Ensure-Db

$port = 4176
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$port/")
try { $listener.Start() } catch {
  Write-Host "Feche o servidor anterior e rode iniciar.bat de novo."
  Write-Host $_.Exception.Message
  exit 1
}

Write-Host ""
Write-Host " DNJ 2026 ligado"
Write-Host " Site:     http://127.0.0.1:$port/"
Write-Host " Dashboard: http://127.0.0.1:$port/admin.html"
Write-Host " Check-in: http://127.0.0.1:$port/checkin.html"
Write-Host " Senha admin local: veja data/config.json"
Write-Host ""
Start-Process "http://127.0.0.1:$port/"

function Read-Body($req) {
  if ($req.ContentLength64 -le 0) { return $null }
  $r = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
  $t = $r.ReadToEnd(); $r.Close()
  if (-not $t) { return $null }
  return $t | ConvertFrom-Json
}
function Send-Json($res, $status, $obj) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 12 -Compress))
  $res.StatusCode = $status
  $res.ContentType = "application/json; charset=utf-8"
  $res.Headers.Add("Access-Control-Allow-Origin","*")
  $res.Headers.Add("Cache-Control","no-store")
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes,0,$bytes.Length)
  $res.Close()
}
function Send-File($res, $file) {
  $ext = [IO.Path]::GetExtension($file).ToLower()
  $mimes = @{
    ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="text/javascript; charset=utf-8"
    ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".png"="image/png"; ".svg"="image/svg+xml"; ".sql"="text/plain; charset=utf-8"
  }
  $bytes = [IO.File]::ReadAllBytes($file)
  $res.StatusCode = 200
  $res.ContentType = $(if ($mimes.ContainsKey($ext)) { $mimes[$ext] } else { "application/octet-stream" })
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes,0,$bytes.Length)
  $res.Close()
}
function Get-ShareBase($req) {
  $cfgPath = Join-Path $root "js\config.js"
  if (Test-Path $cfgPath) {
    $cfgText = [IO.File]::ReadAllText($cfgPath)
    if ($cfgText -match 'siteUrl:\s*"([^"]+)"') {
      $u = $Matches[1].Trim()
      if ($u) { return $u.TrimEnd('/') }
    }
  }
  return $req.Url.GetLeftPart([UriPartial]::Authority)
}
function Send-IndexHtml($res, $file, $req) {
  $html = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8)
  $base = Get-ShareBase $req
  $page = "$base/"
  $image = "$base/assets/dnj-2026-oficial.jpg"
  $html = $html -replace '(<meta property="og:url" content=")[^"]*(")', "`${1}$page`${2}"
  $html = $html -replace '(<meta property="og:image" content=")[^"]*(")', "`${1}$image`${2}"
  $html = $html -replace '(<meta property="og:image:secure_url" content=")[^"]*(")', "`${1}$image`${2}"
  $html = $html -replace '(<meta name="twitter:image" content=")[^"]*(")', "`${1}$image`${2}"
  $html = $html -replace '(<link rel="canonical" href=")[^"]*(")', "`${1}$page`${2}"
  $bytes = [Text.Encoding]::UTF8.GetBytes($html)
  $res.StatusCode = 200
  $res.ContentType = "text/html; charset=utf-8"
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes,0,$bytes.Length)
  $res.Close()
}
function Is-Admin($req) {
  $cfg = Read-Auth
  $db = Read-Db
  $email = [string]$req.Headers["X-Admin-Email"]
  $pass = [string]$req.Headers["X-Admin-Password"]
  if (-not $pass) {
    $auth = [string]$req.Headers["Authorization"]
    if ($auth -and $auth.StartsWith("Bearer ")) { $pass = $auth.Substring(7) }
  }
  if (-not $email -or -not $pass) { return $false }
  $admin = Test-AdminEmail $db $email
  return ($admin -and $pass -eq $cfg.adminPassword)
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
  $method = $req.HttpMethod.ToUpper()
  try {
    if ($method -eq "OPTIONS") {
      $res.StatusCode = 204
      $res.Headers.Add("Access-Control-Allow-Origin","*")
      $res.Headers.Add("Access-Control-Allow-Headers","Content-Type, X-Admin-Email, X-Admin-Password, Authorization")
      $res.Headers.Add("Access-Control-Allow-Methods","GET, POST, PATCH, OPTIONS")
      $res.Close(); continue
    }
    if ($path -eq "/api/health") { Send-Json $res 200 @{ ok=$true; banco="automatico" }; continue }
    if ($path -eq "/api/config" -and $method -eq "GET") { Send-Json $res 200 (Read-Db).configuracoes; continue }

    if ($path -eq "/api/inscricoes" -and $method -eq "POST") {
      $result = Registrar-Inscricao (Read-Body $req)
      if ($result.error -eq "duplicate") { Send-Json $res 409 @{ error="duplicate"; message="Este WhatsApp ja possui inscricao."; inscricao=$result.inscricao } }
      else { Send-Json $res 201 $result.inscricao }
      continue
    }
    if ($path -match "^/api/inscricoes/([^/]+)$" -and $method -eq "GET") {
      $code = [Uri]::UnescapeDataString($Matches[1])
      if (Is-Admin $req) {
        $item = Admin-Lookup $code
        if (-not $item) { Send-Json $res 404 @{ error="not_found" } } else { Send-Json $res 200 $item }
        continue
      }
      $nasc = $req.QueryString["nascimento"]
      $item = Public-Lookup $code $nasc
      if (-not $item) { Send-Json $res 404 @{ error="not_found" } } else { Send-Json $res 200 $item }
      continue
    }
    if ($path -eq "/api/admin/login" -and $method -eq "POST") {
      $body = Read-Body $req; $cfg = Read-Auth; $db = Read-Db
      $admin = Test-AdminEmail $db ([string]$body.email)
      if ($admin -and $body.password -eq $cfg.adminPassword) {
        Send-Json $res 200 @{ ok=$true; nome=$admin.nome; email=$admin.email; papel=$admin.papel }
      } else { Send-Json $res 401 @{ ok=$false } }
      continue
    }
    if ($path -eq "/api/dashboard" -and $method -eq "GET") {
      if (-not (Is-Admin $req)) { Send-Json $res 401 @{ error="unauthorized" }; continue }
      Send-Json $res 200 (Dashboard $req.QueryString["q"])
      continue
    }
    if ($path -eq "/api/inscricoes" -and $method -eq "GET") {
      if (-not (Is-Admin $req)) { Send-Json $res 401 @{ error="unauthorized" }; continue }
      Send-Json $res 200 (Dashboard $req.QueryString["q"])
      continue
    }
    if ($path -match "^/api/inscricoes/([^/]+)$" -and $method -eq "PATCH") {
      if (-not (Is-Admin $req)) { Send-Json $res 401 @{ error="unauthorized" }; continue }
      Send-Json $res 200 (Update-Inscricao ([Uri]::UnescapeDataString($Matches[1])) (Read-Body $req))
      continue
    }
    if ($path -match "^/api/inscricoes/([^/]+)$" -and $method -eq "DELETE") {
      if (-not (Is-Admin $req)) { Send-Json $res 401 @{ error="unauthorized" }; continue }
      Send-Json $res 200 (Remove-Inscricao ([Uri]::UnescapeDataString($Matches[1])))
      continue
    }
    if ($path -eq "/api/transferir" -and $method -eq "POST") {
      if (-not (Is-Admin $req)) { Send-Json $res 401 @{ error="unauthorized" }; continue }
      $b = Read-Body $req
      Send-Json $res 200 (Transferir $b.inscricao_id $b.onibus_id $null)
      continue
    }
    if ($path -eq "/api/checkin" -and $method -eq "POST") {
      if (-not (Is-Admin $req)) { Send-Json $res 401 @{ error="unauthorized" }; continue }
      $b = Read-Body $req
      $r = Check-In $b.codigo $null
      if ($r.already) { Send-Json $res 200 @{ already=$true; message="CHECK-IN JA REALIZADO"; inscricao=$r.inscricao; checkin=$r.checkin } }
      else { Send-Json $res 200 @{ already=$false; message="CHECK-IN REALIZADO"; inscricao=$r.inscricao; checkin=$r.checkin } }
      continue
    }
    if ($path -eq "/api/config" -and $method -eq "POST") {
      if (-not (Is-Admin $req)) { Send-Json $res 401 @{ error="unauthorized" }; continue }
      Send-Json $res 200 (Save-Config (Read-Body $req))
      continue
    }
    if ($path -eq "/api/espera/promover" -and $method -eq "POST") {
      if (-not (Is-Admin $req)) { Send-Json $res 401 @{ error="unauthorized" }; continue }
      $b = Read-Body $req
      Send-Json $res 200 (Promover-Espera $b.onibus_id)
      continue
    }
    if ($path -eq "/api/export.csv" -and $method -eq "GET") {
      if (-not (Is-Admin $req)) { Send-Json $res 401 @{ error="unauthorized" }; continue }
      $rows = Export-Rows $req.QueryString["filtro"]
      $lines = New-Object System.Collections.Generic.List[string]
      $lines.Add("codigo,nome,idade,sexo,whatsapp,email,paroquia,comunidade,cidade,onibus,assento,faixa,status,presente,criado_em")
      foreach ($i in $rows) {
        $vals = @($i.codigo_inscricao,$i.nome_completo,$i.idade,$i.sexo,$i.whatsapp,$i.email,$i.paroquia,$i.comunidade,$i.cidade,$i.onibus_nome,$i.assento,$i.faixa_nome,$i.status,$i.presente,$i.criado_em) | ForEach-Object { '"' + (([string]$_) -replace '"','""') + '"' }
        $lines.Add(($vals -join ","))
      }
      $bytes = [Text.Encoding]::UTF8.GetPreamble() + [Text.Encoding]::UTF8.GetBytes([string]::Join("`r`n", $lines))
      $res.StatusCode = 200; $res.ContentType = "text/csv; charset=utf-8"
      $res.Headers.Add("Content-Disposition","attachment; filename=dnj-2026.csv")
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes,0,$bytes.Length); $res.Close()
      continue
    }

    if ($path -eq "/") { $path = "/index.html" }
    $safe = $path.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
    if ($safe.StartsWith("data" + [IO.Path]::DirectorySeparatorChar)) { Send-Json $res 403 @{ error="forbidden" }; continue }
    $file = [IO.Path]::GetFullPath((Join-Path $root $safe))
    $fullRoot = [IO.Path]::GetFullPath($root)
    if (-not $file.StartsWith($fullRoot)) { Send-Json $res 403 @{ error="forbidden" }; continue }
    if (Test-Path $file -PathType Leaf) {
      if ($safe -eq "index.html") { Send-IndexHtml $res $file $req }
      else { Send-File $res $file }
    } else { Send-Json $res 404 @{ error="not_found" } }
  } catch {
    try { Send-Json $res 500 @{ error = $_.Exception.Message } } catch {}
  }
}
