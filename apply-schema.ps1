param(
  [Parameter(Mandatory = $true)][string]$ConnectionString,
  [string[]]$Files = @("sql\schema.sql", "sql\admin_rpc.sql")
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$script:asmMap = @{}
$ste = Get-ChildItem -Recurse (Join-Path $root "tools\ste43") -Filter "System.Threading.Tasks.Extensions.dll" | Select-Object -First 1
if ($ste) {
  $asm = [Reflection.Assembly]::LoadFrom($ste.FullName)
  $script:asmMap[$asm.GetName().Name] = $asm
  Write-Host ("Loaded " + $asm.FullName)
}
$npg = Join-Path $root "tools\npgsql327\lib\net45\Npgsql.dll"
$asm = [Reflection.Assembly]::LoadFrom($npg)
$script:asmMap[$asm.GetName().Name] = $asm
Write-Host ("Loaded " + $asm.FullName)
[AppDomain]::CurrentDomain.add_AssemblyResolve({
  param($sender, $e)
  $simple = (New-Object Reflection.AssemblyName($e.Name)).Name
  if ($script:asmMap.ContainsKey($simple)) { return $script:asmMap[$simple] }
  return $null
})

$conn = New-Object Npgsql.NpgsqlConnection($ConnectionString)
try {
  $conn.Open()
  Write-Host "Conectado ao Supabase."
  foreach ($rel in $Files) {
    $path = Join-Path $PSScriptRoot $rel
    $sql = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = 180
    $cmd.CommandText = $sql
    [void]$cmd.ExecuteNonQuery()
    Write-Host "OK $rel"
  }
  Write-Host "Schema aplicado."
} catch {
  $ex = $_.Exception
  while ($ex) {
    Write-Host $ex.Message
    $ex = $ex.InnerException
  }
  exit 1
} finally {
  if ($conn.State -eq 'Open') { $conn.Close() }
}
