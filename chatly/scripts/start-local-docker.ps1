param(
  [int]$Port = 3000,
  [string]$ContainerName = 'chatly-local'
)

$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $projectPath '.env.local'

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Missing $envPath"
}

Push-Location $projectPath
try {
  $publicEnvJson = node -e "require('@next/env').loadEnvConfig(process.cwd(), true); process.stdout.write(JSON.stringify({url:process.env.NEXT_PUBLIC_SUPABASE_URL||'',key:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||''}))"
  $publicEnv = $publicEnvJson | ConvertFrom-Json
  if (-not $publicEnv.url -or -not $publicEnv.key) {
    throw 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  }

  docker build `
    --file Dockerfile.local `
    --tag chatly-local:latest `
    --build-arg "NEXT_PUBLIC_SUPABASE_URL=$($publicEnv.url)" `
    --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=$($publicEnv.key)" `
    .
  if ($LASTEXITCODE -ne 0) { throw 'Docker build failed' }

  $existingContainer = docker container ls --all --quiet --filter "name=^/$ContainerName$"
  if ($existingContainer) {
    docker container rm --force $ContainerName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not replace container $ContainerName" }
  }

  Start-Sleep -Milliseconds 500
  $portOwner = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($portOwner) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($portOwner.OwningProcess)"
    throw "Port $Port is already used by PID $($portOwner.OwningProcess) ($($process.Name)). Stop that process and run this script again."
  }

  docker run `
    --detach `
    --name $ContainerName `
    --restart unless-stopped `
    --publish "127.0.0.1:${Port}:3000" `
    --publish "[::1]:${Port}:3000" `
    --env-file $envPath `
    chatly-local:latest
  if ($LASTEXITCODE -ne 0) { throw 'Could not start Chatly container' }

  Write-Host "Chatly is running at http://localhost:$Port in container $ContainerName"
} finally {
  Pop-Location
}
