# 生成美甲试戴 PWA 图标（纯 System.Drawing，无第三方依赖）
param(
  [string]$OutDir = "D:\ccgpt国内ai中转站\美甲项目\assets\icons"
)

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function New-RoundedPath([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc([single]$x, [single]$y, [single]$d, [single]$d, 180, 90)
  $p.AddArc([single]($x + $w - $d), [single]$y, [single]$d, [single]$d, 270, 90)
  $p.AddArc([single]($x + $w - $d), [single]($y + $h - $d), [single]$d, [single]$d, 0, 90)
  $p.AddArc([single]$x, [single]($y + $h - $d), [single]$d, [single]$d, 90, 90)
  $p.CloseFigure()
  return $p
}

# 指甲形状：杏仁头，底部圆角；坐标为 0..1 归一化，$S 为画布边长
function New-NailPath([double]$cx, [double]$top, [double]$bottom, [double]$w, [double]$S) {
  $cx = $cx * $S; $top = $top * $S; $bottom = $bottom * $S; $w = $w * $S
  $hw = $w / 2.0
  $left = $cx - $hw
  $right = $cx + $hw
  $shoulder = $top + ($bottom - $top) * 0.42
  $baseR = $w * 0.22
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.StartFigure()
  $p.AddLine([single]$left, [single]($bottom - $baseR), [single]$left, [single]$shoulder)
  $rise = ($shoulder - $top) * 0.55
  $p.AddBezier(
    [single]$left, [single]$shoulder,
    [single]$left, [single]($shoulder - $rise),
    [single]($cx - $hw * 0.52), [single]$top,
    [single]$cx, [single]$top)
  $p.AddBezier(
    [single]$cx, [single]$top,
    [single]($cx + $hw * 0.52), [single]$top,
    [single]$right, [single]($shoulder - $rise),
    [single]$right, [single]$shoulder)
  $p.AddLine([single]$right, [single]$shoulder, [single]$right, [single]($bottom - $baseR))
  $p.AddArc([single]($right - $baseR * 2), [single]($bottom - $baseR * 2), [single]($baseR * 2), [single]($baseR * 2), 0, 90)
  $p.AddLine([single]($right - $baseR), [single]$bottom, [single]($left + $baseR), [single]$bottom)
  $p.AddArc([single]$left, [single]($bottom - $baseR * 2), [single]($baseR * 2), [single]($baseR * 2), 90, 90)
  $p.CloseFigure()
  return $p
}

function New-SparklePath([double]$cx, [double]$cy, [double]$r) {
  $w = $r * 0.24
  [System.Drawing.PointF[]]$pts = @(
    (New-Object System.Drawing.PointF([single]$cx, [single]($cy - $r))),
    (New-Object System.Drawing.PointF([single]($cx + $w), [single]($cy - $w))),
    (New-Object System.Drawing.PointF([single]($cx + $r), [single]$cy)),
    (New-Object System.Drawing.PointF([single]($cx + $w), [single]($cy + $w))),
    (New-Object System.Drawing.PointF([single]$cx, [single]($cy + $r))),
    (New-Object System.Drawing.PointF([single]($cx - $w), [single]($cy + $w))),
    (New-Object System.Drawing.PointF([single]($cx - $r), [single]$cy)),
    (New-Object System.Drawing.PointF([single]($cx - $w), [single]($cy - $w)))
  )
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddPolygon($pts)
  return $p
}

function New-NailIcon([int]$Size, [bool]$Maskable) {
  $S = [double]$Size
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  # 背景（maskable 用满幅，普通图标用圆角）
  $bgRect = New-Object System.Drawing.RectangleF(0, 0, [single]$S, [single]$S)
  $c1 = [System.Drawing.ColorTranslator]::FromHtml('#FFE0E8')
  $c2 = [System.Drawing.ColorTranslator]::FromHtml('#E08CA6')
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, $c1, $c2, 52.0)
  if ($Maskable) {
    $g.FillRectangle($bgBrush, $bgRect)
  } else {
    $bgPath = New-RoundedPath 0 0 $S $S ($S * 0.235)
    $g.FillPath($bgBrush, $bgPath)
  }
  # 背景柔光
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse([single](-$S * 0.30), [single](-$S * 0.42), [single]($S * 1.30), [single]($S * 1.10))
  $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 255, 255, 255))
  $g.FillPath($glowBrush, $glow)

  # 内容缩放（maskable 收进安全区）
  $g.TranslateTransform([single]($S / 2), [single]($S / 2))
  $k = if ($Maskable) { 0.70 } else { 0.94 }
  $g.ScaleTransform([single]$k, [single]$k)
  $g.TranslateTransform([single](-$S / 2), [single](-$S / 2))

  # 影子
  $shadowPath = New-NailPath 0.50 0.235 0.815 0.325 $S
  $shadowM = New-Object System.Drawing.Drawing2D.Matrix
  $shadowM.Translate([single]($S * 0.012), [single]($S * 0.022))
  $shadowPath.Transform($shadowM)
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(46, 92, 28, 48))
  $g.FillPath($shadowBrush, $shadowPath)

  # 甲片
  $nailPath = New-NailPath 0.50 0.225 0.815 0.330 $S
  $nailRect = New-Object System.Drawing.RectangleF([single]($S * 0.30), [single]($S * 0.20), [single]($S * 0.40), [single]($S * 0.65))
  $n1 = [System.Drawing.ColorTranslator]::FromHtml('#FFFFFF')
  $n2 = [System.Drawing.ColorTranslator]::FromHtml('#EFD3DC')
  $nailBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($nailRect, $n1, $n2, 105.0)
  $g.FillPath($nailBrush, $nailPath)
  $edge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 190, 120, 145), [single]($S * 0.008))
  $g.DrawPath($edge, $nailPath)

  # 甲面高光（裁到甲片里）
  $state = $g.Save()
  $g.SetClip($nailPath)
  $gloss1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 255, 255, 255))
  $g.FillEllipse($gloss1, [single]($S * 0.375), [single]($S * 0.285), [single]($S * 0.075), [single]($S * 0.30))
  $gloss2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(95, 255, 255, 255))
  $g.FillEllipse($gloss2, [single]($S * 0.545), [single]($S * 0.430), [single]($S * 0.050), [single]($S * 0.20))
  $g.Restore($state)

  # 星星点缀
  $sparks = @(
    @(0.745, 0.285, 0.105, 235),
    @(0.255, 0.640, 0.070, 200),
    @(0.700, 0.700, 0.052, 170)
  )
  foreach ($sp in $sparks) {
    $p = New-SparklePath ($S * $sp[0]) ($S * $sp[1]) ($S * $sp[2])
    $b = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb([int]$sp[3], 255, 255, 255))
    $g.FillPath($b, $p)
    $p.Dispose(); $b.Dispose()
  }

  $g.Dispose()
  return $bmp
}

$targets = @(
  @{ Name = 'icon-192.png'; Size = 192; Mask = $false },
  @{ Name = 'icon-512.png'; Size = 512; Mask = $false },
  @{ Name = 'icon-maskable-512.png'; Size = 512; Mask = $true },
  @{ Name = 'apple-touch-icon.png'; Size = 180; Mask = $false },
  @{ Name = 'favicon-64.png'; Size = 64; Mask = $false }
)

foreach ($t in $targets) {
  $img = New-NailIcon -Size $t.Size -Maskable $t.Mask
  $path = Join-Path $OutDir $t.Name
  $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $img.Dispose()
  $len = (Get-Item -LiteralPath $path).Length
  Write-Output ("{0}  {1}x{1}  {2} bytes" -f $t.Name, $t.Size, $len)
}
