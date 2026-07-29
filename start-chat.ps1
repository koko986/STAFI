$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $projectRoot "backend"
$frontendPath = Join-Path $projectRoot "frontend"
$backendEnvPath = Join-Path $backendPath ".env"
$bundledJava21 = Join-Path $env:USERPROFILE ".vscode\extensions\redhat.java-1.55.0-win32-x64\jre\21.0.11-win32-x86_64"

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_SECRET_KEY)) {
    $configuredSecret = if (Test-Path $backendEnvPath) {
        Get-Content -LiteralPath $backendEnvPath |
            Where-Object { $_ -match "^SUPABASE_SECRET_KEY=(.+)$" } |
            Select-Object -First 1
    }
    if (-not $configuredSecret -or $configuredSecret -match "your-secret-key") {
        Write-Error "Missing backend Supabase key. Copy backend/.env.example to backend/.env and set SUPABASE_SECRET_KEY."
        exit 1
    }
}

if (Test-Path (Join-Path $bundledJava21 "bin\java.exe")) {
    $backendCommand = "set `"JAVA_HOME=$bundledJava21`" && set `"PATH=$bundledJava21\bin;%PATH%`" && cd /d `"$backendPath`" && mvn.cmd spring-boot:run"
}
else {
    $backendCommand = "cd /d `"$backendPath`" && mvn.cmd spring-boot:run"
}
$frontendCommand = "cd /d `"$frontendPath`" && npm.cmd run dev -- --host 0.0.0.0 --port 5173 --strictPort"

function Test-LocalPort {
    param([int]$Port)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.ConnectAsync("127.0.0.1", $Port)
        return $connection.Wait(500) -and $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

if (Test-LocalPort -Port 8080) {
    Write-Host "Backend is already running on http://localhost:8080"
}
else {
    Start-Process -FilePath $env:ComSpec -ArgumentList @("/k", $backendCommand) -WindowStyle Normal
}

if (Test-LocalPort -Port 5173) {
    Write-Host "Frontend is already running on http://localhost:5173"
}
else {
    Start-Process -FilePath $env:ComSpec -ArgumentList @("/k", $frontendCommand) -WindowStyle Normal
}

Start-Sleep -Seconds 5
Start-Process "http://localhost:5173/"
