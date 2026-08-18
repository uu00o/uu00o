# 生成 DSH 磨砂玻璃 exe 图标 (icon.ico)：蓝紫渐变圆角底 + 半透明白玻璃层 + 雪花
# 输出: 与本脚本同目录的 icon.ico（内嵌 256/64/48/32/16 五档 PNG 的合法 ICO）
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-RoundedPath([int]$s, [int]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc(0, 0, $d, $d, 180, 90)
  $p.AddArc($s - $d, 0, $d, $d, 270, 90)
  $p.AddArc($s - $d, $s - $d, $d, $d, 0, 90)
  $p.AddArc(0, $s - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-IconPng([int]$s) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $rect = New-Object System.Drawing.Rectangle(0, 0, $s, $s)
  $path = New-RoundedPath $s ([int]($s * 0.22))
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 132, 152, 255),
    [System.Drawing.Color]::FromArgb(255, 36, 52, 128),
    45)
  $g.FillPath($brush, $path)

  # 半透明白 "玻璃面板"（磨砂质感）
  $gx = [int]($s * 0.16); $gy = [int]($s * 0.30); $gw = [int]($s * 0.68); $gh = [int]($s * 0.48)
  $panel = New-RoundedPath $s ([int]($s * 0.14))
  $panelPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $panelRect = New-Object System.Drawing.Rectangle($gx, $gy, $gw, $gh)
  $panelPath.AddArc($gx, $gy, [int]($s*0.28), [int]($s*0.28), 180, 90)
  $panelPath.AddArc($gx + $gw - [int]($s*0.28), $gy, [int]($s*0.28), [int]($s*0.28), 270, 90)
  $panelPath.AddArc($gx + $gw - [int]($s*0.28), $gy + $gh - [int]($s*0.28), [int]($s*0.28), [int]($s*0.28), 0, 90)
  $panelPath.AddArc($gx, $gy + $gh - [int]($s*0.28), [int]($s*0.28), [int]($s*0.28), 90, 90)
  $panelPath.CloseFigure()
  $panelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(170, 255, 255, 255))
  $g.FillPath($panelBrush, $panelPath)
  # 顶部亮边
  $edgePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 255, 255, 255), [Math]::Max(1, $s * 0.03))
  $edgePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $edgePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($edgePen, [int]($s*0.22), [int]($s*0.36), [int]($s*0.78), [int]($s*0.36))

  # 雪花 ❄（Segoe UI Symbol 或默认字体）
  $font = New-Object System.Drawing.Font('Segoe UI Symbol', [float]($s * 0.42), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $txtRect = New-Object System.Drawing.RectangleF([float]($s*0.08), [float]($s*0.16), [float]($s*0.84), [float]($s*0.72))
  $snowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
  $g.DrawString([char]0x2744, $font, $snowBrush, $txtRect, $fmt)

  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $data = $ms.ToArray()
  $ms.Dispose()
  $bmp.Dispose()
  return ,$data
}

$sizes = @(256, 64, 48, 32, 16)
$pngData = @{}
foreach ($s in $sizes) { $pngData[$s] = New-IconPng $s }

# 拼装 ICO: ICONDIR + N * ICONDIRENTRY + PNG blobs
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($out)
$bw.Write([uint16]0)          # reserved
$bw.Write([uint16]1)          # type: icon
$bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
foreach ($s in $sizes) {
  $d = $pngData[$s]
  $dim = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([byte]$dim)
  $bw.Write([byte]$dim)
  $bw.Write([byte]0)          # colors
  $bw.Write([byte]0)          # reserved
  $bw.Write([uint16]1)        # planes
  $bw.Write([uint16]32)       # bpp
  $bw.Write([uint32]$d.Length)
  $bw.Write([uint32]$offset)
  $offset += $d.Length
}
foreach ($s in $sizes) { $bw.Write($pngData[$s]) }
$bw.Flush()
$icoPath = Join-Path $PSScriptRoot 'icon.ico'
[System.IO.File]::WriteAllBytes($icoPath, $out.ToArray())
$bw.Dispose()
$out.Dispose()
Write-Host "ICO written: $icoPath ($((Get-Item $icoPath).Length) bytes)"
