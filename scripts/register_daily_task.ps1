# register_daily_task.ps1 — agenda a máquina pra rodar sozinha todo dia (Windows Task Scheduler).
#
# Roda `python -m orchestrator.daily` às 06:00, todo dia, mesmo sem você logar (com sua senha).
# Isso é o "roda sem clicar": Fase A + Trend Scout + Estrategista + publica o snapshot.
# A publicação em rede social segue MANUAL (copiar-e-colar no /admin) por decisão de produto.
#
# Uso (PowerShell, na pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File scripts\register_daily_task.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\register_daily_task.ps1 -Hora "07:30"
#
# Pra remover:  Unregister-ScheduledTask -TaskName "AlohaBJJ-Daily" -Confirm:$false

param([string]$Hora = "06:00")

$ErrorActionPreference = "Stop"
$proj = Split-Path -Parent $PSScriptRoot          # raiz do projeto (pasta acima de scripts\)
$py = (Get-Command python).Source

Write-Host "Projeto: $proj"
Write-Host "Python:  $py"
Write-Host "Hora:    $Hora (todo dia)"

$action  = New-ScheduledTaskAction -Execute $py -Argument "-m orchestrator.daily" -WorkingDirectory $proj
$trigger = New-ScheduledTaskTrigger -Daily -At $Hora
$set     = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName "AlohaBJJ-Daily" -Action $action -Trigger $trigger `
  -Settings $set -Description "AlohaBJJ: inteligencia + calendario diarios" -Force | Out-Null

Write-Host ""
Write-Host "OK — tarefa 'AlohaBJJ-Daily' criada. Testa agora com:" -ForegroundColor Green
Write-Host "  Start-ScheduledTask -TaskName 'AlohaBJJ-Daily'"
Write-Host "Ver o log em: jobs\daily-<AAAAMMDD>.log"
