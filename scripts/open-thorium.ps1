param([string]$VideoUrl = 'https://www.youtube.com/')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$thoriumExe = Join-Path $env:LOCALAPPDATA 'Thorium\Application\thorium.exe'
if (-not (Test-Path -LiteralPath $thoriumExe)) { throw 'Không tìm thấy Thorium. Cài Thorium hoặc sửa đường dẫn script.' }
$sessionName = 'sync-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$outputPath = Join-Path $projectRoot 'output\playwright'
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$extensionPath = Join-Path $projectRoot 'extension'
$configPath = Join-Path $outputPath ($sessionName + '.json')
$profilePath = Join-Path $outputPath ($sessionName + '-profile')
$configuration = @{browser=@{browserName='chromium';isolated=$false;launchOptions=@{executablePath=$thoriumExe;headless=$false;args=@("--disable-extensions-except=$extensionPath", "--load-extension=$extensionPath")}}}
[IO.File]::WriteAllText($configPath, ($configuration | ConvertTo-Json -Depth 6))
Push-Location $projectRoot
try {
  & node (Join-Path $projectRoot 'node_modules\@playwright\cli\playwright-cli.js') "-s=$sessionName" open $VideoUrl --config $configPath --profile $profilePath --headed
} finally { Pop-Location }
