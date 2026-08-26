# Motor do banco local do DNJ 2026 (espelha as regras do schema.sql)

$script:Root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$script:DataDir = Join-Path $script:Root "data"
$script:DbFile = Join-Path $script:DataDir "db.json"
$script:CfgFile = Join-Path $script:DataDir "config.json"
$script:Mutex = New-Object System.Threading.Mutex($false, "Global\DNJ2026Database")

function New-Id { [guid]::NewGuid().ToString() }
function New-Codigo { "DNJ26-" + ([guid]::NewGuid().ToString("N").Substring(0,8).ToUpper()) }
function Now-Iso { (Get-Date).ToString("o") }
function Arr($v) { if ($null -eq $v) { return @() } return @($v) }
function Push($arr, $item) { return @(Arr $arr) + @($item) }

function To-JsonArray($items) {
  $list = Arr $items
  if ($list.Count -eq 0) { return "[]" }
  $parts = foreach ($item in $list) { ($item | ConvertTo-Json -Depth 12 -Compress) }
  return "[" + ($parts -join ",") + "]"
}

function Get-Age([string]$nasc) {
  $d = [datetime]::Parse($nasc)
  $today = Get-Date
  $age = $today.Year - $d.Year
  if ($today.DayOfYear -lt $d.DayOfYear) { $age-- }
  return [int]$age
}

function New-AdminPassword { return "geracao2026" }

function Test-AdminEmail($db, [string]$email) {
  if (-not $email) { return $false }
  $norm = $email.Trim().ToLower()
  return @(Arr $db.administradores) | Where-Object {
    $_.ativo -ne $false -and ([string]$_.email).Trim().ToLower() -eq $norm
  } | Select-Object -First 1
}

function Ensure-Db {
  if (-not (Test-Path $script:DataDir)) { New-Item -ItemType Directory -Path $script:DataDir | Out-Null }
  if (-not (Test-Path $script:CfgFile)) {
    @{ adminPassword = (New-AdminPassword); criado_em = (Now-Iso) } | ConvertTo-Json | Set-Content $script:CfgFile -Encoding UTF8
  }
  if (-not (Test-Path $script:DbFile)) { Write-Db (New-Seed) }
  else {
    $db = Read-Db
    if (-not $db.onibus -or (Arr $db.onibus).Count -eq 0) { Write-Db (New-Seed) }
    else {
      $hasEduardo = @(Arr $db.administradores) | Where-Object { ([string]$_.email).Trim().ToLower() -eq "eduardo@geucaristica.com.br" }
      if (-not $hasEduardo) {
        $db.administradores = @(Arr $db.administradores) + @([pscustomobject]@{ id=(New-Id); nome="Eduardo"; email="eduardo@geucaristica.com.br"; papel="administrador"; ativo=$true })
        Write-Db $db
      }
    }
  }
}

function New-Seed {
  $o1 = New-Id; $o2 = New-Id; $o3 = New-Id
  $f1 = New-Id; $f2 = New-Id; $f3 = New-Id
  $onibus = @(
    [pscustomobject]@{ id=$o1; nome="Onibus Sao Pedro"; numero=1; capacidade=50; capacidade_reservada=0; ativo=$true; descricao="Caminhada com Sao Pedro"; cor="#c45c26"; ordem=1 }
    [pscustomobject]@{ id=$o2; nome="Onibus Sao Paulo"; numero=2; capacidade=50; capacidade_reservada=0; ativo=$true; descricao="Caminhada com Sao Paulo"; cor="#6b1c28"; ordem=2 }
    [pscustomobject]@{ id=$o3; nome="Onibus Sao Joao"; numero=3; capacidade=50; capacidade_reservada=0; ativo=$true; descricao="Caminhada com Sao Joao"; cor="#e8b84a"; ordem=3 }
  )
  $faixas = @(
    [pscustomobject]@{ id=$f1; nome="13 a 17 anos"; idade_minima=13; idade_maxima=17; cor="#c45c26"; prioridade=1; ativo=$true; onibus_preferido_id=$null }
    [pscustomobject]@{ id=$f2; nome="18 a 24 anos"; idade_minima=18; idade_maxima=24; cor="#6b1c28"; prioridade=2; ativo=$true; onibus_preferido_id=$null }
    [pscustomobject]@{ id=$f3; nome="25 anos ou mais"; idade_minima=25; idade_maxima=99; cor="#e8b84a"; prioridade=3; ativo=$true; onibus_preferido_id=$null }
  )
  $assentos = foreach ($o in $onibus) {
    1..([int]$o.capacidade) | ForEach-Object {
      [pscustomobject]@{ id=(New-Id); onibus_id=$o.id; numero=$_; inscricao_id=$null }
    }
  }
  return @{
    criado_em = Now-Iso
    atualizado_em = Now-Iso
    configuracoes = [pscustomobject]@{
      nome_evento="Caravana Geracao Eucaristica ao DNJ"; data_evento="2026-10-18"; local_evento="Orla do Marine - Marica"
      paroquia="Paroquia Santo Antonio - Bacaxa"; grupo="Grupo Jovem Geracao Eucaristica"
      inscricoes_abertas=$true; lista_espera_ativa=$true; limite_maximo=$null
      modo_distribuicao="equilibrado_faixa"
    }
    faixas_etarias = $faixas
    onibus = $onibus
    assentos = @($assentos)
    inscricoes = @()
    checkins = @()
    lista_espera = @()
    administradores = @(
      [pscustomobject]@{ id=(New-Id); nome="Beatriz"; email="beatriz@geucaristica.com.br"; papel="coordenador"; ativo=$true }
      [pscustomobject]@{ id=(New-Id); nome="Lavinia"; email="lavinia@geucaristica.com.br"; papel="administrador"; ativo=$true }
      [pscustomobject]@{ id=(New-Id); nome="Duda"; email="duda@geucaristica.com.br"; papel="administrador"; ativo=$true }
      [pscustomobject]@{ id=(New-Id); nome="Joao Gabriel"; email="joaogabriel@geucaristica.com.br"; papel="administrador"; ativo=$true }
      [pscustomobject]@{ id=(New-Id); nome="Eduardo"; email="eduardo@geucaristica.com.br"; papel="administrador"; ativo=$true }
    )
    logs = @()
  }
}

function Read-Auth { Get-Content $script:CfgFile -Raw -Encoding UTF8 | ConvertFrom-Json }

function Read-Db {
  $raw = Get-Content $script:DbFile -Raw -Encoding UTF8 | ConvertFrom-Json
  return @{
    criado_em = $raw.criado_em
    atualizado_em = $raw.atualizado_em
    configuracoes = $raw.configuracoes
    faixas_etarias = Arr $raw.faixas_etarias
    onibus = Arr $raw.onibus
    assentos = Arr $raw.assentos
    inscricoes = Arr $raw.inscricoes
    checkins = Arr $raw.checkins
    lista_espera = Arr $raw.lista_espera
    administradores = Arr $raw.administradores
    logs = Arr $raw.logs
  }
}

function Write-Db($db) {
  $head = ([ordered]@{ criado_em=$db.criado_em; atualizado_em=(Now-Iso) } | ConvertTo-Json -Compress).TrimEnd("}")
  $cfg = ($db.configuracoes | ConvertTo-Json -Depth 8 -Compress)
  $json = $head + ',"configuracoes":' + $cfg +
    ',"faixas_etarias":' + (To-JsonArray $db.faixas_etarias) +
    ',"onibus":' + (To-JsonArray $db.onibus) +
    ',"assentos":' + (To-JsonArray $db.assentos) +
    ',"inscricoes":' + (To-JsonArray $db.inscricoes) +
    ',"checkins":' + (To-JsonArray $db.checkins) +
    ',"lista_espera":' + (To-JsonArray $db.lista_espera) +
    ',"administradores":' + (To-JsonArray $db.administradores) +
    ',"logs":' + (To-JsonArray $db.logs) + "}"
  [IO.File]::WriteAllText($script:DbFile, $json, [Text.UTF8Encoding]::new($false))
}

function With-Db([scriptblock]$fn) {
  $got = $false
  try {
    $got = $script:Mutex.WaitOne(12000)
    if (-not $got) { throw "Banco ocupado." }
    $db = Read-Db
    $result = & $fn $db
    Write-Db $db
    return $result
  } finally { if ($got) { [void]$script:Mutex.ReleaseMutex() } }
}

function Add-Log($db, $acao, $entidade, $id, $antes, $depois) {
  $db.logs = Push $db.logs ([pscustomobject]@{
    id=(New-Id); usuario_id=$null; acao=$acao; entidade=$entidade; entidade_id="$id"
    dados_anteriores=$antes; dados_novos=$depois; criado_em=(Now-Iso)
  })
}

function Get-Faixa($db, $idade) {
  Arr $db.faixas_etarias | Where-Object { $_.ativo -and $idade -ge $_.idade_minima -and $idade -le $_.idade_maxima } | Sort-Object prioridade | Select-Object -First 1
}

function Get-Capacidade($o) { [Math]::Max(([int]$o.capacidade) - ([int]$o.capacidade_reservada), 0) }

function Get-Ocupacao($db, $onibusId) {
  @(Arr $db.inscricoes | Where-Object { $_.onibus_id -eq $onibusId -and $_.status -eq "confirmada" }).Count
}

function Escolher-Onibus($db, $faixa) {
  $modo = [string]$db.configuracoes.modo_distribuicao
  if ($modo -eq "manual") { return $null }
  $faixaId = $faixa.id
  $best = $null
  $bestScore = 99999
  foreach ($o in @(Arr $db.onibus | Where-Object { $_.ativo } | Sort-Object ordem)) {
    $occ = Get-Ocupacao $db $o.id
    if ($occ -ge (Get-Capacidade $o)) { continue }
    if ($modo -eq "por_faixa" -and $faixa.onibus_preferido_id -eq $o.id) { return $o }
    $sameFaixa = @(Arr $db.inscricoes | Where-Object { $_.onibus_id -eq $o.id -and $_.faixa_etaria_id -eq $faixaId -and $_.status -eq "confirmada" }).Count
    $score = if ($modo -in @("equilibrado_faixa","por_faixa")) { ($sameFaixa * 100) + $occ } else { $occ }
    if ($score -lt $bestScore) { $bestScore = $score; $best = $o }
  }
  return $best
}

function Proximo-Assento($db, $onibusId) {
  $livre = Arr $db.assentos | Where-Object { $_.onibus_id -eq $onibusId -and -not $_.inscricao_id } | Sort-Object numero | Select-Object -First 1
  if ($livre) { return [int]$livre.numero }
  $max = @(Arr $db.inscricoes | Where-Object { $_.onibus_id -eq $onibusId } | ForEach-Object { [int]$_.assento })
  if ($max.Count -eq 0) { return 1 }
  return (($max | Measure-Object -Maximum).Maximum + 1)
}

function Recalcular-Faixas($db) {
  foreach ($i in Arr $db.inscricoes) {
    if ($i.status -eq "cancelada") { continue }
    $i.idade = Get-Age $i.data_nascimento
    $f = Get-Faixa $db ([int]$i.idade)
    $i.faixa_etaria_id = $(if ($f) { $f.id } else { $null })
  }
}

function Registrar-Inscricao($body) {
  return With-Db {
    param($db)
    $cfg = $db.configuracoes
    if (-not $cfg.inscricoes_abertas) { throw "Inscricoes fechadas." }
    if (-not $body.aceitou_termos) { throw "E preciso aceitar os termos." }
    $phone = ([regex]::Replace([string]$body.whatsapp, "\D", ""))
    if ($phone.Length -lt 10) { throw "WhatsApp invalido." }
    $dup = Arr $db.inscricoes | Where-Object { ([regex]::Replace([string]$_.whatsapp,"\D","")) -eq $phone -and $_.status -ne "cancelada" } | Select-Object -First 1
    if ($dup) { return @{ error="duplicate"; inscricao=$dup } }
    $idade = Get-Age ([string]$body.data_nascimento)
    $faixa = Get-Faixa $db $idade
    $onibus = $null
    if ($faixa) { $onibus = Escolher-Onibus $db $faixa }
    $confirmadas = @(Arr $db.inscricoes | Where-Object { $_.status -eq "confirmada" }).Count
    if ($cfg.limite_maximo -and $confirmadas -ge [int]$cfg.limite_maximo) { $onibus = $null }
    $status = if ($onibus) { "confirmada" } else { "lista_espera" }
    if ($status -eq "lista_espera" -and -not $cfg.lista_espera_ativa) { throw "Onibus lotados." }
    $codigo = New-Codigo
    $id = New-Id
    $assento = $null
    if ($onibus) {
      $assento = Proximo-Assento $db $onibus.id
      foreach ($a in Arr $db.assentos) {
        if ($a.onibus_id -eq $onibus.id -and [int]$a.numero -eq $assento) { $a.inscricao_id = $id }
      }
    }
    $onibusNome = if ($onibus) { $onibus.nome } else { $null }
    $row = [pscustomobject]@{
      id=$id; codigo_inscricao=$codigo; qr_code=$codigo
      nome_completo=[string]$body.nome_completo; data_nascimento=[string]$body.data_nascimento
      idade=$idade; sexo=[string]$body.sexo; cpf=$(if($body.cpf){[string]$body.cpf}else{$null})
      whatsapp=[string]$body.whatsapp; email=$(if($body.email){[string]$body.email}else{$null})
      paroquia=$(if($body.paroquia){[string]$body.paroquia}else{$null})
      comunidade=$(if($body.comunidade){[string]$body.comunidade}else{$null})
      grupo_movimento=$(if($body.grupo_movimento){[string]$body.grupo_movimento}else{$null})
      cidade=$(if($body.cidade){[string]$body.cidade}else{$null})
      bairro=$(if($body.bairro){[string]$body.bairro}else{$null})
      membro_geracao_eucaristica=[bool]$body.membro_geracao_eucaristica
      ja_participou_dnj=[bool]$body.ja_participou_dnj
      como_conheceu=$(if($body.como_conheceu){[string]$body.como_conheceu}else{$null})
      necessidade_especifica=$(if($body.necessidade_especifica){[string]$body.necessidade_especifica}else{$null})
      observacoes=$(if($body.observacoes){[string]$body.observacoes}else{$null})
      aceitou_termos=$true; status=$status; presente=$false
      onibus_id=$(if($onibus){$onibus.id}else{$null}); onibus_nome=$onibusNome
      faixa_etaria_id=$(if($faixa){$faixa.id}else{$null})
      faixa_nome=$(if($faixa){$faixa.nome}else{$null})
      assento=$assento; criado_em=(Now-Iso); atualizado_em=(Now-Iso)
    }
    $db.inscricoes = Push $db.inscricoes $row
    if ($status -eq "lista_espera") {
      $pos = (@(Arr $db.lista_espera | Where-Object { $_.status -eq "aguardando" }).Count) + 1
      $db.lista_espera = Push $db.lista_espera ([pscustomobject]@{
        id=(New-Id); inscricao_id=$id; prioridade=1; posicao=$pos; criado_em=(Now-Iso); status="aguardando"
      })
    }
    Add-Log $db "inscricao_criada" "inscricoes" $id $null $row
    return @{ inscricao = $row }
  }
}

function Admin-Lookup($codigo) {
  $db = Read-Db
  $q = [string]$codigo
  $i = Arr $db.inscricoes | Where-Object {
    $_.codigo_inscricao -eq $q -or $_.qr_code -eq $q -or $_.id -eq $q
  } | Select-Object -First 1
  if (-not $i) { return $null }
  $onibus = Arr $db.onibus | Where-Object { $_.id -eq $i.onibus_id } | Select-Object -First 1
  $i | Add-Member -NotePropertyName onibus_nome -NotePropertyValue $(if($onibus){$onibus.nome}else{$i.onibus_nome}) -Force
  return $i
}

function Public-Lookup($codigo, $nascimento) {
  $db = Read-Db
  $q = [string]$codigo
  $phone = [regex]::Replace($q, "\D", "")
  $i = $null
  if ($q -match "^DNJ26" -or $q.Contains("-")) {
    $i = Arr $db.inscricoes | Where-Object { $_.codigo_inscricao -eq $q -or $_.qr_code -eq $q } | Select-Object -First 1
  } elseif ($phone.Length -ge 10) {
    $i = Arr $db.inscricoes | Where-Object {
      ([regex]::Replace([string]$_.whatsapp, "\D", "")) -eq $phone -and $_.status -ne "cancelada"
    } | Sort-Object criado_em -Descending | Select-Object -First 1
  }
  if (-not $i) { return $null }
  if (-not $nascimento -or [string]$i.data_nascimento -ne [string]$nascimento) { return $null }
  $onibus = Arr $db.onibus | Where-Object { $_.id -eq $i.onibus_id } | Select-Object -First 1
  return [pscustomobject]@{
    codigo_inscricao=$i.codigo_inscricao; nome_completo=$i.nome_completo; idade=$i.idade
    status=$i.status; assento=$i.assento
    onibus_nome=$(if($onibus){$onibus.nome}else{$i.onibus_nome})
    faixa_nome=$i.faixa_nome
  }
}

function Dashboard($q) {
  $db = Read-Db
  $items = Arr $db.inscricoes
  if ($q) {
    $n = $q.ToLower()
    $items = @($items | Where-Object { ("$($_.nome_completo) $($_.codigo_inscricao) $($_.whatsapp) $($_.cidade) $($_.comunidade) $($_.grupo_movimento)").ToLower().Contains($n) })
  }
  $confirmadas = @(Arr $db.inscricoes | Where-Object { $_.status -eq "confirmada" })
  $caps = 0; foreach ($o in Arr $db.onibus) { if ($o.ativo) { $caps += Get-Capacidade $o } }
  $onibusView = foreach ($o in (Arr $db.onibus | Sort-Object ordem)) {
    $pax = @(Arr $db.inscricoes | Where-Object { $_.onibus_id -eq $o.id -and $_.status -eq "confirmada" })
    $porFaixa = foreach ($f in Arr $db.faixas_etarias) {
      [pscustomobject]@{ id=$f.id; nome=$f.nome; cor=$f.cor; total=@( $pax | Where-Object { $_.faixa_etaria_id -eq $f.id }).Count }
    }
    [pscustomobject]@{
      id=$o.id; nome=$o.nome; numero=$o.numero; cor=$o.cor; descricao=$o.descricao
      capacidade=(Get-Capacidade $o); ocupados=$pax.Count
      livres=((Get-Capacidade $o) - $pax.Count)
      percentual=$(if ((Get-Capacidade $o) -gt 0) { [math]::Round(100.0 * $pax.Count / (Get-Capacidade $o)) } else { 0 })
      faixas=@($porFaixa)
      passageiros=$pax
    }
  }
  $matriz = foreach ($f in Arr $db.faixas_etarias) {
    $cols = foreach ($o in (Arr $db.onibus | Sort-Object ordem)) {
      @(Arr $db.inscricoes | Where-Object { $_.faixa_etaria_id -eq $f.id -and $_.onibus_id -eq $o.id -and $_.status -eq "confirmada" }).Count
    }
    [pscustomobject]@{ faixa=$f.nome; cor=$f.cor; valores=@($cols) }
  }
  $cidades = Arr $db.inscricoes | Where-Object { $_.cidade } | Group-Object cidade | ForEach-Object { [pscustomobject]@{ nome=$_.Name; total=$_.Count } }
  $porDia = Arr $db.inscricoes | Group-Object { ([string]$_.criado_em).Substring(0,10) } | ForEach-Object { [pscustomobject]@{ dia=$_.Name; total=$_.Count } }
  $hoje = (Get-Date).ToString("yyyy-MM-dd")
  $greetingHour = (Get-Date).Hour
  $saudacao = if ($greetingHour -lt 12) { "Bom dia" } elseif ($greetingHour -lt 18) { "Boa tarde" } else { "Boa noite" }
  return [pscustomobject]@{
    saudacao = "$saudacao, administrador!"
    configuracoes = $db.configuracoes
    faixas = @(Arr $db.faixas_etarias)
    onibus = @($onibusView)
    matriz = @($matriz)
    espera = @(Arr $db.lista_espera | Where-Object { $_.status -eq "aguardando" })
    logs = @(Arr $db.logs | Sort-Object criado_em -Descending | Select-Object -First 40)
    inscricoes = @($items | Sort-Object criado_em -Descending)
    graficos = [pscustomobject]@{
      faixas = @(Arr $db.faixas_etarias | ForEach-Object { $id=$_.id; [pscustomobject]@{ nome=$_.nome; cor=$_.cor; total=@(Arr $db.inscricoes | Where-Object { $_.faixa_etaria_id -eq $id }).Count } })
      cidades = @($cidades)
      dias = @($porDia)
      checkins = [pscustomobject]@{ presentes=@(Arr $db.inscricoes | Where-Object { $_.presente }).Count; total=$confirmadas.Count }
    }
    stats = [pscustomobject]@{
      total = @(Arr $db.inscricoes).Count
      confirmadas = $confirmadas.Count
      presentes = @(Arr $db.inscricoes | Where-Object { $_.presente }).Count
      espera = @(Arr $db.lista_espera | Where-Object { $_.status -eq "aguardando" }).Count
      vagas = [Math]::Max($caps - $confirmadas.Count, 0)
      capacidade = $caps
      hoje = @(Arr $db.inscricoes | Where-Object { ([string]$_.criado_em).StartsWith($hoje) }).Count
    }
  }
}

function Transferir($id, $onibusId, $usuario) {
  return With-Db {
    param($db)
    $i = Arr $db.inscricoes | Where-Object { $_.id -eq $id } | Select-Object -First 1
    if (-not $i) { throw "Inscricao nao encontrada." }
    $dest = Arr $db.onibus | Where-Object { $_.id -eq $onibusId } | Select-Object -First 1
    if (-not $dest) { throw "Onibus nao encontrado." }
    if ((Get-Ocupacao $db $dest.id) -ge (Get-Capacidade $dest) -and $i.onibus_id -ne $dest.id) { throw "Onibus lotado." }
    $antes = $i.onibus_id
    foreach ($a in Arr $db.assentos) { if ($a.inscricao_id -eq $i.id) { $a.inscricao_id = $null } }
    $i.onibus_id = $dest.id; $i.onibus_nome = $dest.nome
    $i.assento = Proximo-Assento $db $dest.id
    $i.status = "confirmada"; $i.atualizado_em = Now-Iso
    foreach ($a in Arr $db.assentos) {
      if ($a.onibus_id -eq $dest.id -and [int]$a.numero -eq [int]$i.assento) { $a.inscricao_id = $i.id }
    }
    foreach ($e in Arr $db.lista_espera) { if ($e.inscricao_id -eq $i.id -and $e.status -eq "aguardando") { $e.status = "promovida" } }
    Add-Log $db "participante_transferido" "inscricoes" $i.id $antes $dest.id
    return $i
  }
}

function Check-In($codigo, $usuario) {
  return With-Db {
    param($db)
    $i = Arr $db.inscricoes | Where-Object { $_.codigo_inscricao -eq $codigo -or $_.qr_code -eq $codigo -or $_.id -eq $codigo } | Select-Object -First 1
    if (-not $i) { throw "Inscricao nao encontrada." }
    $exist = Arr $db.checkins | Where-Object { $_.inscricao_id -eq $i.id } | Select-Object -First 1
    if ($exist -or $i.presente) {
      return @{ already=$true; inscricao=$i; checkin=$exist }
    }
    $ck = [pscustomobject]@{ id=(New-Id); inscricao_id=$i.id; realizado_em=(Now-Iso); realizado_por=$usuario; tipo="qr"; observacao=$null }
    $db.checkins = Push $db.checkins $ck
    $i.presente = $true; $i.atualizado_em = Now-Iso
    Add-Log $db "checkin_realizado" "checkins" $i.id $null $ck
    return @{ already=$false; inscricao=$i; checkin=$ck }
  }
}

function Update-Inscricao($id, $body) {
  return With-Db {
    param($db)
    $i = Arr $db.inscricoes | Where-Object { $_.id -eq $id } | Select-Object -First 1
    if (-not $i) { throw "Inscricao nao encontrada." }
    $antes = $i.psobject.Copy()
    foreach ($k in @("nome_completo","sexo","cpf","whatsapp","email","paroquia","comunidade","grupo_movimento","cidade","bairro","observacoes","status")) {
      if ($null -ne $body.$k) { $i.$k = $body.$k }
    }
    if ($body.status -eq "cancelada") {
      foreach ($a in Arr $db.assentos) { if ($a.inscricao_id -eq $i.id) { $a.inscricao_id = $null } }
      $i.onibus_id = $null; $i.assento = $null
    }
    $i.atualizado_em = Now-Iso
    Add-Log $db "inscricao_editada" "inscricoes" $i.id $antes $i
    return $i
  }
}

function Remove-Inscricao($id) {
  return With-Db {
    param($db)
    $i = Arr $db.inscricoes | Where-Object { $_.id -eq $id } | Select-Object -First 1
    if (-not $i) { throw "Inscricao nao encontrada." }
    foreach ($a in Arr $db.assentos) { if ($a.inscricao_id -eq $i.id) { $a.inscricao_id = $null } }
    $db.checkins = @(Arr $db.checkins | Where-Object { $_.inscricao_id -ne $i.id })
    $db.lista_espera = @(Arr $db.lista_espera | Where-Object { $_.inscricao_id -ne $i.id })
    $db.inscricoes = @(Arr $db.inscricoes | Where-Object { $_.id -ne $i.id })
    Add-Log $db "inscricao_excluida" "inscricoes" $i.id $i $null
    return @{ ok = $true }
  }
}

function Save-Config($body) {
  return With-Db {
    param($db)
    $cfg = $db.configuracoes
    foreach ($k in $body.psobject.Properties.Name) {
      if ($k -eq "nova_senha" -or $k -eq "onibus" -or $k -eq "faixas") { continue }
      $cfg | Add-Member -NotePropertyName $k -NotePropertyValue $body.$k -Force
    }
    if ($body.faixas) { $db.faixas_etarias = Arr $body.faixas; Recalcular-Faixas $db }
    if ($body.onibus) { $db.onibus = Arr $body.onibus }
    if ($body.nova_senha) {
      $nova = [string]$body.nova_senha
      if ($nova.Length -lt 10) { throw "Senha fraca: use pelo menos 10 caracteres." }
      if ($nova.ToLower() -eq "geracao2026") { throw "Senha fraca: escolha outra senha." }
      $auth = Read-Auth
      $auth.adminPassword = $nova
      $auth | ConvertTo-Json | Set-Content $script:CfgFile -Encoding UTF8
    }
    Add-Log $db "configuracao_alterada" "configuracoes" "evento" $null $cfg
    return $cfg
  }
}

function Promover-Espera($onibusId) {
  return With-Db {
    param($db)
    $e = Arr $db.lista_espera | Where-Object { $_.status -eq "aguardando" } | Sort-Object posicao | Select-Object -First 1
    if (-not $e) { return $null }
    $i = Arr $db.inscricoes | Where-Object { $_.id -eq $e.inscricao_id } | Select-Object -First 1
    $dest = if ($onibusId) { Arr $db.onibus | Where-Object { $_.id -eq $onibusId } | Select-Object -First 1 } else { Escolher-Onibus $db (Get-Faixa $db ([int]$i.idade)) }
    if (-not $dest) { throw "Sem vaga." }
    $i.onibus_id = $dest.id; $i.onibus_nome = $dest.nome; $i.status = "confirmada"
    $i.assento = Proximo-Assento $db $dest.id; $i.atualizado_em = Now-Iso
    $e.status = "promovida"
    Add-Log $db "espera_promovida" "lista_espera" $e.id $null $i
    return @{ alerta = "Uma vaga foi liberada no $($dest.nome)."; inscricao = $i }
  }
}

function Export-Rows($filtro) {
  $db = Read-Db
  $items = Arr $db.inscricoes
  if ($filtro -eq "presentes") { $items = @($items | Where-Object { $_.presente }) }
  elseif ($filtro -eq "ausentes") { $items = @($items | Where-Object { -not $_.presente -and $_.status -eq "confirmada" }) }
  elseif ($filtro -eq "espera") { $items = @($items | Where-Object { $_.status -eq "lista_espera" }) }
  elseif ($filtro -match "^onibus:") {
    $oid = $filtro.Substring(7); $items = @($items | Where-Object { $_.onibus_id -eq $oid })
  } elseif ($filtro -match "^faixa:") {
    $fid = $filtro.Substring(6); $items = @($items | Where-Object { $_.faixa_etaria_id -eq $fid })
  }
  return $items
}
