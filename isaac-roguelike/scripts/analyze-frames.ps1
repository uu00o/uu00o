# 分析 Tiny16 图集帧颜色特征，输出候选帧坐标
# 用法: pwsh -File scripts/analyze-frames.ps1 <png路径>
param([string]$PngPath = "assets/raw/characters_1.png")

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $PngPath))
if ($bytes.Length -lt 8) { throw "too small" }
if (([System.BitConverter]::ToString($bytes[0..7])) -ne "89-50-4E-47-0D-0A-1A-0A") { throw "not png" }

$pos = 8
$width = 0; $height = 0; $bitDepth = 0; $colorType = 0
$idat = [System.Collections.Generic.List[byte[]]]::new()
while ($pos -lt $bytes.Length) {
    $len = [System.Net.IPAddress]::NetworkToHostOrder([System.BitConverter]::ToInt32($bytes, $pos))
    $type = [System.Text.Encoding]::ASCII.GetString($bytes, $pos + 4, 4)
    $data = New-Object byte[] $len
    [Array]::Copy($bytes, $pos + 8, $data, 0, $len)
    if ($type -eq "IHDR") {
        $width = [System.Net.IPAddress]::NetworkToHostOrder([System.BitConverter]::ToInt32($data, 0))
        $height = [System.Net.IPAddress]::NetworkToHostOrder([System.BitConverter]::ToInt32($data, 4))
        $bitDepth = $data[8]; $colorType = $data[9]
    } elseif ($type -eq "IDAT") {
        $idat.Add($data)
    } elseif ($type -eq "IEND") { break }
    $pos += 12 + $len
}
if ($bitDepth -ne 8) { throw "bitdepth $bitDepth unsupported" }
if ($colorType -ne 6) { throw "colortype $colorType unsupported" }

$all = New-Object byte[] (($idat | ForEach-Object { $_.Length } | Measure-Object -Sum).Sum)
$off = 0
foreach ($d in $idat) { [Array]::Copy($d, 0, $all, $off, $d.Length); $off += $d.Length }

$ms = [System.IO.MemoryStream]::new($all)
$zs = [System.IO.Compression.ZLibStream]::new($ms, [System.IO.Compression.CompressionMode]::Decompress)
$rawMs = [System.IO.MemoryStream]::new()
$zs.CopyTo($rawMs)
$raw = $rawMs.ToArray()
$zs.Dispose()

$stride = $width * 4
$rgba = New-Object byte[] ($width * $height * 4)
$prev = New-Object byte[] $stride

function Paeth([int]$a, [int]$b, [int]$c) {
    $p = $a + $b - $c
    $pa = [Math]::Abs($p - $a); $pb = [Math]::Abs($p - $b); $pc = [Math]::Abs($p - $c)
    if ($pa -le $pb -and $pa -le $pc) { return $a }
    if ($pb -le $pc) { return $b }
    return $c
}

for ($y = 0; $y -lt $height; $y++) {
    $filter = $raw[$y * ($stride + 1)]
    $cur = New-Object byte[] $stride
    [Array]::Copy($raw, $y * ($stride + 1) + 1, $cur, 0, $stride)
    for ($x = 0; $x -lt $stride; $x++) {
        $a = if ($x -ge 4) { $cur[$x - 4] } else { 0 }
        $b = $prev[$x]
        $c = if ($x -ge 4) { $prev[$x - 4] } else { 0 }
        switch ($filter) {
            1 { $cur[$x] = ($cur[$x] + $a) -band 0xFF }
            2 { $cur[$x] = ($cur[$x] + $b) -band 0xFF }
            3 { $cur[$x] = ($cur[$x] + (($a + $b) -shr 1)) -band 0xFF }
            4 { $cur[$x] = ($cur[$x] + (Paeth $a $b $c)) -band 0xFF }
        }
    }
    for ($x = 0; $x -lt $width; $x++) {
        $si = $x * 4; $di = ($y * $width + $x) * 4
        $rgba[$di] = $cur[$si]; $rgba[$di+1] = $cur[$si+1]; $rgba[$di+2] = $cur[$si+2]; $rgba[$di+3] = $cur[$si+3]
    }
    [Array]::Copy($cur, $prev, $stride)
}

function Classify([int]$r, [int]$g, [int]$b) {
    if ($r -gt 150 -and $g -gt 90 -and $b -gt 60 -and $r -gt $g -and $g -gt $b -and ($r-$g) -lt 110 -and ($g-$b) -lt 90) { return "skin" }
    if ($r -gt 200 -and $g -gt 150 -and $b -lt 130 -and $r -gt $g) { return "skin" }
    if ($r -gt 80 -and $r -lt 190 -and $g -gt 40 -and $g -lt 130 -and $b -gt 20 -and $b -lt 90 -and $r -gt $g -and $g -gt $b) { return "brown" }
    if ($b -gt 90 -and $b -gt ($r + 20) -and $g -gt 60 -and $g -lt ($b + 40)) { return "blue" }
    if ($g -gt 90 -and $g -gt ($r + 30) -and $g -gt ($b + 30)) { return "green" }
    if ($r -gt 120 -and $r -gt ($g + 60) -and $r -gt ($b + 60)) { return "red" }
    if ($r -gt 150 -and $g -gt 130 -and $b -lt 90 -and $r -gt ($b + 60) -and $g -gt ($b + 60)) { return "yellow" }
    if ($r -gt 180 -and $g -gt 180 -and $b -gt 180) { return "white" }
    if ($r -gt 40 -and $r -lt 130 -and $b -gt 80 -and $g -lt ($b - 20) -and $b -gt $g) { return "purple" }
    if ($r -lt 90 -and $g -lt 90 -and $b -lt 90) { return "dark" }
    return "other"
}

$cols = $width / 16; $rows = $height / 16
"sheet: $PngPath frames: ${cols}x${rows}"

$frames = @()
for ($fy = 0; $fy -lt $rows; $fy++) {
    for ($fx = 0; $fx -lt $cols; $fx++) {
        $hist = @{}
        $opaque = 0
        for ($y = 0; $y -lt 16; $y++) {
            for ($x = 0; $x -lt 16; $x++) {
                $si = (($fy * 16 + $y) * $width + ($fx * 16 + $x)) * 4
                if ($rgba[$si + 3] -lt 128) { continue }
                $opaque++
                $c = Classify $rgba[$si] $rgba[$si+1] $rgba[$si+2]
                if ($hist.ContainsKey($c)) { $hist[$c]++ } else { $hist[$c] = 1 }
            }
        }
        $frames += [PSCustomObject]@{ X = $fx; Y = $fy; H = $hist; Opaque = $opaque }
    }
}

function Show-Top([string]$Label, [scriptblock]$Score, [int]$N) {
    "-- $Label --"
    $ranked = $frames | ForEach-Object {
        $s = & $Score $_.H
        [PSCustomObject]@{ F = $_; S = $s }
    } | Where-Object { $_.S -gt 0 } | Sort-Object -Descending { $_.S } | Select-Object -First $N
    foreach ($r in $ranked) {
        $hstr = ($r.F.H.GetEnumerator() | ForEach-Object { "$($_.Key):$($_.Value)" }) -join " "
        "  ($($r.F.X),$($r.F.Y)) score=$([Math]::Round($r.S,1)) $hstr"
    }
}

Show-Top "player (skin+brown+blue)" { param($h) ($h.skin) * 1.0 + ($h.brown) * 0.8 + ($h.blue) * 0.6 } 6
Show-Top "green slime" { param($h) [double]$h.green } 4
Show-Top "purple bat" { param($h) [double]$h.purple } 4
Show-Top "skeleton white" { param($h) [double]$h.white + ($h.dark) * 0.3 } 4
Show-Top "red things" { param($h) [double]$h.red } 6
Show-Top "yellow/gold" { param($h) [double]$h.yellow } 6
Show-Top "brown things" { param($h) [double]$h.brown } 6
