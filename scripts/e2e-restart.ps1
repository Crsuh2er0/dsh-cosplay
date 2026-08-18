# dsh-cosplay — 隔离 e2e 实例同步与重启脚本
#
# 用途：手动修改了仓库代码后，同步到 e2e profile 并重启 3081 实例。
# 用法：在 PowerShell 中执行  scripts/e2e-restart.ps1（前台阻塞，Ctrl+C 停止实例）。
# 注意：与主实例（3080）共享 $DSH_HOME；本脚本只操作 web-e2e profile 与 3081 端口。
$ErrorActionPreference = 'Stop'

$repo = 'F:\dsh-cosplay'
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\web-e2e'
$target = Join-Path $profileDir 'node_modules\dsh-cosplay'
$port = 3081

# 1) 同步代码到隔离 profile（排除 .git / node_modules）
Write-Host '[1/3] 同步代码 ->' $target
robocopy $repo $target /E /XD .git node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'robocopy 同步失败' }

# 2) 停掉占用端口的旧实例
Write-Host '[2/3] 停止旧实例 (port' $port ')'
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  $pids = $conn | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    Write-Host "     停止 PID $procId"
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 800
} else {
  Write-Host '     未发现运行中的实例'
}

# 3) 启动新实例（前台阻塞；Ctrl+C 停止）
Write-Host '[3/3] 启动 e2e 实例: http://127.0.0.1:' $port
$dshCmd = (Get-Command dsh.cmd -ErrorAction SilentlyContinue).Source
if (-not $dshCmd) { $dshCmd = Join-Path (Split-Path $env:APPDATA -Parent) "Roaming\npm\dsh.cmd" }
& $dshCmd --profile web-e2e --port $port
