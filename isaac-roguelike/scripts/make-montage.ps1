# 提取候选帧 → 拼成一张带标签的蒙太奇 PNG（System.Drawing）
# 用法: & scripts/make-montage.ps1 <sheet.png> <输出.png> <帧坐标列表 "x,y x,y ..."> <标签前缀>
param(
    [string]$Sheet = "assets/raw/characters_1.png",
    [string]$Out = "assets/raw/montage.png",
    [string]$Coords = "0,0 1,0 2,0",
    [string]$Prefix = "F"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Sheet))
$scale = 8
$framePx = 16 * $scale
$labels = $Coords.Split(" ")
$n = $labels.Count
$perRow = 6
$rows = [Math]::Ceiling($n / $perRow)
$font = New-Object System.Drawing.Font("Consolas", 14, [System.Drawing.FontStyle]::Bold)
$labelH = 26

$canvas = New-Object System.Drawing.Bitmap(($perRow * $framePx), ($rows * ($framePx + $labelH)))
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.Clear([System.Drawing.Color]::FromArgb(30, 30, 40))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

for ($i = 0; $i -lt $n; $i++) {
    $c = $labels[$i].Split(",")
    $fx = [int]$c[0]; $fy = [int]$c[1]
    $cx = ($i % $perRow) * $framePx
    $cy = [Math]::Floor($i / $perRow) * ($framePx + $labelH)
    $src = New-Object System.Drawing.Rectangle(($fx * 16), ($fy * 16), 16, 16)
    $dst = New-Object System.Drawing.Rectangle($cx, $cy, $framePx, $framePx)
    $g.DrawImage($bmp, $dst, $src, [System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawRectangle([System.Drawing.Pens]::Yellow, $cx, $cy, $framePx - 1, $framePx - 1)
    $label = "$Prefix$i($fx,$fy)"
    $g.DrawString($label, $font, [System.Drawing.Brushes]::Yellow, ($cx + 2), ($cy + $framePx + 2))
}
$g.Dispose()
$canvas.Save((Resolve-Path (Split-Path $Out)).Path + "\" + (Split-Path $Out -Leaf), [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose(); $bmp.Dispose()
"wrote $Out"
