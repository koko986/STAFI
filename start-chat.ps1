$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $projectRoot "backend"
$frontendPath = Join-Path $projectRoot "frontend"

$backendCommand = "Set-Location -LiteralPath '$($backendPath.Replace("'", "''"))'; mvn.cmd spring-boot:run"
$frontendCommand = "Set-Location -LiteralPath '$($frontendPath.Replace("'", "''"))'; npm.cmd run dev -- --host localhost"

Start-Process powershell.exe -ArgumentList @("-NoExit", "-NoProfile", "-Command", $backendCommand)
Start-Process powershell.exe -ArgumentList @("-NoExit", "-NoProfile", "-Command", $frontendCommand)

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173/"
