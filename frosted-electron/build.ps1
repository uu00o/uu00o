# ============================================================================
# DSH Frosted Glass - one-click build script
# Produces a self-contained Windows x64 exe package under dist/
#   - bundles a copy of node.exe (taken from the local Node installation)
#   - bundles the full @deepseek-ai/dsh CLI package (with all its nested deps)
#   - packages the Electron shell with electron-packager (asar disabled so the
#     bundled vendor/ stays readable by the spawned service process)
# Usage:
#   powershell -ExecutionPolicy Bypass -File build.ps1
# ============================================================================
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host '===== DSH Frosted Glass Builder ====='

# --- 1. locate node ---
$nodeExe = $null
foreach ($cand in @($env:NODE_DIR, 'C:\Program Files\nodejs', 'C:\Program Files (x86)\nodejs')) {
  if ($cand -and (Test-Path (Join-Path $cand 'node.exe'))) { $nodeExe = Join-Path $cand 'node.exe'; break }
}
if (-not $nodeExe) {
  $found = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($found) { $nodeExe = $found.Source }
}
if (-not $nodeExe) { Write-Host 'ERROR: node.exe not found. Install Node.js first (https://nodejs.org).' -ForegroundColor Red; exit 1 }
Write-Host "[1/6] node: $nodeExe"

# --- 1.5 check node version (need >= 18 for Electron tooling) ---
try {
  $nodeVer = & $nodeExe -v
  $nodeMajor = [int]($nodeVer -replace 'v', '' -split '\.')[0]
  if ($nodeMajor -lt 18) {
    Write-Host "WARN: Node $nodeVer detected; Node 18+ recommended." -ForegroundColor Yellow
  } else {
    Write-Host "  node version: $nodeVer (ok)"
  }
} catch { Write-Host 'WARN: could not read node version' -ForegroundColor Yellow }

# --- 2. install npm deps (electron, electron-packager, dsh CLI) ---
$npm = Join-Path (Split-Path $nodeExe) 'npm.cmd'
# 本地化 npm 缓存（不污染用户 AppData，构建目录自包含）
$env:npm_config_cache = Join-Path $root '.npm-cache'
Write-Host '[2/6] installing npm dependencies (electron, electron-packager, @deepseek-ai/dsh) ...'
Push-Location $root
try {
  # If you are behind a slow network, uncomment the mirror lines:
  # $env:npm_config_registry = 'https://registry.npmmirror.com'
  # $env:npm_config_electron_mirror = 'https://npmmirror.com/mirrors/electron/'
  & $npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
} finally { Pop-Location }

# --- 3. prepare vendor: node.exe + full dsh package ---
Write-Host '[3/6] preparing vendor/ (node.exe + dsh CLI with nested dependencies) ...'
$vendorNodeDir = Join-Path $root 'vendor\node'
$vendorDshDir  = Join-Path $root 'vendor\dsh'
New-Item -ItemType Directory -Force -Path $vendorNodeDir | Out-Null
Copy-Item $nodeExe (Join-Path $vendorNodeDir 'node.exe') -Force

$dshSrc = Join-Path $root 'node_modules\@deepseek-ai\dsh'
if (-not (Test-Path $dshSrc)) {
  # Fallback: local global install
  $alt = Join-Path $env:APPDATA 'npm\node_modules\@deepseek-ai\dsh'
  if (Test-Path $alt) { $dshSrc = $alt }
}
if (-not (Test-Path (Join-Path $dshSrc 'lib\bin.js'))) {
  Write-Host 'ERROR: @deepseek-ai/dsh not found. Run: npm install @deepseek-ai/dsh@0.1.0-rc.6' -ForegroundColor Red
  exit 1
}
if (Test-Path $vendorDshDir) { Remove-Item -Recurse -Force $vendorDshDir }
robocopy $dshSrc $vendorDshDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) { Write-Host 'ERROR: robocopy failed' -ForegroundColor Red; exit 1 }

# npm 默认扁平安装（hoisted）：@deepseek-ai/dsh 的依赖在顶层 node_modules，
# 这里把顶层依赖复制进 vendor/dsh/node_modules（排除构建工具），使 vendor 自包含。
Write-Host '  copying hoisted top-level dependencies into vendor/dsh/node_modules ...'
$topNM = Join-Path $root 'node_modules'
$vendorNM = Join-Path $vendorDshDir 'node_modules'
robocopy $topNM $vendorNM /E /XD .bin electron electron-packager @electron @malept @sindresorhus @szmarczak @types @xmldom /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) { Write-Host 'WARN: top-level dep copy reported issues' -ForegroundColor Yellow }

# --- 3.5 patch the bundled dsh-host-webserver host schema so --host <lan-ip> is accepted ---
# DSH 0.1.0-rc.6 官方 schema 只允许 127.0.0.1 / 0.0.0.0；放宽为任意 host 字符串，
# 使"移动端控制"（绑定局域网 IP）可用。0.0.0.0 仍由 launcher 启动逻辑拒绝。
Write-Host '[3.5] patching bundled dsh-host-webserver host schema (allow LAN IP) ...'
$schemaFile = Join-Path $vendorDshDir 'node_modules\@deepseek-ai\dsh-host-webserver\lib\index.js'
$schemaOld = 'host: z.union([z.const("127.0.0.1"), z.const("0.0.0.0")]).required(),'
$schemaNew = 'host: z.string().required(),'
if (Test-Path $schemaFile) {
  $schemaContent = Get-Content $schemaFile -Raw
  if ($schemaContent.Contains($schemaOld)) {
    $schemaContent = $schemaContent.Replace($schemaOld, $schemaNew)
    [System.IO.File]::WriteAllText($schemaFile, $schemaContent)
    Write-Host '  patched: host schema relaxed to accept concrete LAN IPs'
  } else {
    Write-Host '  SKIP: schema already patched or pattern changed' -ForegroundColor Yellow
  }
} else {
  Write-Host '  WARN: schema file not found under vendor/dsh' -ForegroundColor Yellow
}

# --- 4. package the Electron app (asar disabled) ---
Write-Host '[4/6] packaging with electron-packager (this downloads the Electron runtime on first run) ...'
$packager = Join-Path $root 'node_modules\electron-packager\bin\electron-packager.js'
$cache = Join-Path $root '.electron-cache'
$out   = Join-Path $root 'dist'
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
& (Join-Path (Split-Path $nodeExe) 'node.exe') $packager $root 'DSHFrostedGlass' `
  --platform=win32 --arch=x64 --out=$out --overwrite --asar=false `
  --icon=(Join-Path $root 'icon.ico') `
  --download.cacheRoot=$cache `
  --prune=false `
  --ignore='\.npm-cache' --ignore='\.electron-cache' --ignore='^/dist$' `
  --ignore='^/node_modules$' --ignore='^/vendor$' --ignore='^/\.git$' `
  --ignore='^/build\.ps1$' --ignore='^/README\.md$' --ignore='^/\.gitignore$' `
  --ignore='^/start\.bat$' --ignore='^/自启开关\.bat$' --ignore='^/make-icon\.ps1$' `
  --ignore='^/screen\.png$' --ignore='^/package-lock\.json$' `
  --ignore='^/diag-.*\.js$' --ignore='^/build\.bat$'
if ($LASTEXITCODE -ne 0) { Write-Host 'ERROR: electron-packager failed' -ForegroundColor Red; exit 1 }

# --- 5. copy vendor into the packaged app (robocopy keeps every file intact) ---
Write-Host '[5/6] copying vendor/ into packaged app ...'
$appDir = Join-Path $out 'DSHFrostedGlass-win32-x64\resources\app'
robocopy (Join-Path $root 'vendor') (Join-Path $appDir 'vendor') /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) { Write-Host 'ERROR: vendor copy failed' -ForegroundColor Red; exit 1 }

# --- 6. done ---
$final = Join-Path $out 'DSHFrostedGlass-win32-x64'
try {
  $sizeMB = [math]::Round(((Get-ChildItem $final -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 0)
} catch { $sizeMB = -1 }
Write-Host ''
Write-Host "===== BUILD DONE =====" -ForegroundColor Green
Write-Host "Package folder: $final  ($sizeMB MB)"
Write-Host 'Share the WHOLE folder (or zip it). Double-click DSHFrostedGlass.exe to launch.'
