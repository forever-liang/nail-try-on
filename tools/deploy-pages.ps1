<#
  一键把「美甲试戴」发布到 GitHub Pages

  用法（在项目根目录）：
    pwsh -File .\tools\deploy-pages.ps1 -Repo nail-try-on

  可选参数：
    -Token <PAT>      显式指定 GitHub 令牌（不填就自动找）
    -Visibility public|private   仓库可见性（默认 public，免费账号的 Pages 必须 public）
    -CommitMessage "..."         提交信息

  令牌来源优先级：
    1) -Token 参数
    2) 环境变量 GITHUB_TOKEN / GH_TOKEN
    3) gh auth token（装了 GitHub CLI 并登录过）
    4) git 凭据管理器里已保存的 github.com 凭据
#>
[CmdletBinding()]
param(
  [string]$Repo = 'nail-try-on',
  [string]$Token = '',
  [ValidateSet('public', 'private')][string]$Visibility = 'public',
  [string]$CommitMessage = '美甲试戴 v2 + 离线 PWA'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$env:GIT_TERMINAL_PROMPT = '0'

function Get-GitToken {
  if ($Token) { return $Token }
  if ($env:GITHUB_TOKEN) { return $env:GITHUB_TOKEN }
  if ($env:GH_TOKEN) { return $env:GH_TOKEN }
  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if ($gh) {
    try { $t = (& gh auth token 2>$null); if ($t) { return $t.Trim() } } catch { }
  }
  try {
    $out = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
    $line = ($out | Select-String '^password=' | Select-Object -First 1)
    if ($line) { return ($line -replace '^password=', '') }
  } catch { }
  return ''
}

$Token = Get-GitToken
if (-not $Token) {
  throw '没找到 GitHub 令牌。请先执行 gh auth login，或用 -Token <PAT> 传入一个有 repo 权限的令牌。'
}

$headers = @{
  Authorization          = "Bearer $Token"
  Accept                 = 'application/vnd.github+json'
  'User-Agent'           = 'nail-tryon-deploy'
  'X-GitHub-Api-Version' = '2022-11-28'
}

Write-Host '· 读取 GitHub 账号…'
$me = Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $headers
$owner = $me.login
Write-Host ("  登录身份：{0}" -f $owner)

Write-Host ("· 检查仓库 {0}/{1} …" -f $owner, $Repo)
$exists = $true
try {
  Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$Repo" -Headers $headers | Out-Null
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 404) { $exists = $false } else { throw }
}

if (-not $exists) {
  Write-Host '  仓库不存在，正在创建…'
  $body = @{
    name        = $Repo
    private     = ($Visibility -eq 'private')
    description = '美甲试戴：拍自己的手，自动识别手指并贴甲片，纯前端、可离线使用'
    has_issues  = $true
    has_wiki    = $false
  } | ConvertTo-Json
  Invoke-RestMethod -Uri 'https://api.github.com/user/repos' -Method Post -Headers $headers -Body $body | Out-Null
} else {
  Write-Host '  仓库已存在，直接推送最新代码。'
}

$remote = "https://github.com/$owner/$Repo.git"

Write-Host '· 提交本地代码…'
if (-not (Test-Path (Join-Path $Root '.git'))) {
  git init -b main | Out-Null
}
git symbolic-ref -q HEAD *> $null
if ($LASTEXITCODE -ne 0) { git checkout -b main | Out-Null }

# 没有全局身份时补一个仓库级身份，避免 commit 直接失败
if (-not (git config user.email)) {
  git config user.name  $owner
  git config user.email "$owner@users.noreply.github.com"
}

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m $CommitMessage | Out-Null
  Write-Host '  已生成新提交。'
} else {
  Write-Host '  没有新改动需要提交。'
}

$remotes = git remote
if ($remotes -contains 'origin') { git remote set-url origin $remote } else { git remote add origin $remote }

Write-Host '· 推送到 GitHub…'
git push -u origin main
if ($LASTEXITCODE -ne 0) { throw '推送失败。请确认令牌有 repo 权限、且网络能访问 github.com。' }

Write-Host '· 开启 GitHub Pages…'
$pagesBody = @{ source = @{ branch = 'main'; path = '/' } } | ConvertTo-Json
try {
  Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$Repo/pages" -Method Post -Headers $headers -Body $pagesBody | Out-Null
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$Repo/pages" -Method Put -Headers $headers -Body $pagesBody | Out-Null
  } else {
    Write-Warning ('自动开启 Pages 失败：' + $_.Exception.Message)
    Write-Warning '请手动到 仓库 → Settings → Pages 选择 main / (root) 后保存。'
  }
}

$url = "https://$owner.github.io/$Repo/"
Write-Host ''
Write-Host ("完成！站点地址（首次发布约需 1 分钟）：{0}" -f $url)
Write-Host '手机打开该网址 → 添加到主屏幕 → 之后可离线使用。'
