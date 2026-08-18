# 检测"泪滴"特征帧：浅蓝色像素紧邻肤色像素（以撒风格哭泣小孩）
# 用法: & scripts/teardrop-scan.ps1 <png>
param([string]$PngPath = "assets/raw/characters_1.png")
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $PngPath))
$pos = 8; $width = 0; $height = 0
$idat = [System.Collections.Generic.List[byte[]]]::new()
while ($pos -lt $bytes.Length) {
    $len = [System.Net.IPAddress]::NetworkToHostOrder([System.BitConverter]::ToInt32($bytes, $pos))
    $type = [System.Text.Encoding]::ASCII.GetString($bytes, $pos + 4, 4)
    $data = New-Object byte[] $len
    [Array]::Copy($bytes, $pos + 8, $data, 0, $len)
    if ($type -eq "IHDR") { $width = [System.Net.IPAddress]::NetworkToHostOrder([System.BitConverter]::ToInt32($data, 0)); $height = [System.Net.IPAddress]::NetworkToHostOrder([System.BitConverter]::ToInt32($data, 4)) }
    elseif ($type -eq "IDAT") { $idat.Add($data) }
    elseif ($type -eq "IEND") { break }
    $pos += 12 + $len
}
$all = New-Object byte[] (($idat | ForEach-Object { $_.Length } | Measure-Object -Sum).Sum)
$off = 0
foreach ($d in $idat) { [Array]::Copy($d, 0, $all, $off, $d.Length); $off += $d.Length }
$ms = [System.IO.MemoryStream]::new($all)
$zs = [System.IO.Compression.ZLibStream]::new($ms, [System.IO.Compression.CompressionMode]::Decompress)
$rawMs = [System.IO.MemoryStream]::new(); $zs.CopyTo($rawMs); $raw = $rawMs.ToArray(); $zs.Dispose()

$stride = $width * 4
$rgba = New-Object byte[] ($width * $height * 4)
$prev = New-Object byte[] $stride
function Paeth([int]$a, [int]$b, [int]$c) {
    $p = $a + $b - $c
    $pa = [Math]::Abs($p - $a); $pb = [Math]::Abs($p - $b); $pc = [Math]::Abs($p - $c)
    if ($pa -le $pb -and $pa -le $pc) { return $a }; if ($pb -le $pc) { return $b }; return $c
}
for ($y = 0; $y -lt $height; $y++) {
    $filter = $raw[$y * ($stride + 1)]
    $cur = New-Object byte[] $stride
    [Array]::Copy($raw, $y * ($stride + 1) + 1, $cur, 0, $stride)
    for ($x = 0; $x -lt $stride; $x++) {
        $a = if ($x -ge 4) { $cur[$x - 4] } else { 0 }; $b = $prev[$x]
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

function IsSkin([int]$r, [int]$g, [int]$b) {
    return ($r -gt 170 -and $g -gt 110 -and $b -gt 60 -and $r -gt $g -and $g -gt $b -and ($r - $b) -gt 40)
}
function IsTear([int]$r, [int]$g, [int]$b) {
    return ($b -gt 140 -and $r -lt 160 -and $g -gt 130 -and $b -gt $r -and ($b - $r) -gt 15 -and ($b - $g) -gt 5)
}

$cols = $width / 16; $rows = $height / 16
"teardrop scan: ${cols}x${rows} frames"
$results = @()
for ($fy = 0; $fy -lt $rows; $fy++) {
    for ($fx = 0; $fx -lt $cols; $fx++) {
        $tear = 0; $skinAdj = 0
        for ($y = 1; $y -lt 15; $y++) {
            for ($x = 1; $x -lt 15; $x++) {
                $si = (($fy * 16 + $y) * $width + ($fx * 16 + $x)) * 4
                if ($rgba[$si + 3] -lt 128) { continue }
                if (IsTear $rgba[$si] $rgba[$si+1] $rgba[$si+2]) {
                    $tear++
                    # 检查邻域是否有肤色
                    for ($dy = -1; $dy -le 1; $dy++) {
                        for ($dx = -1; $dx -le 1; $dx++) {
                            if ($dx -eq 0 -and $dy -eq 0) { continue }
                            $nj = (($fy * 16 + $y + $dy) * $width + ($fx * 16 + $x + $dx)) * 4
                            if ($nj -ge 0 -and $nj + 2 -lt $rgba.Length) {
                                if (IsSkin $rgba[$nj] $rgba[$nj+1] $rgba[$nj+2]) { $skinAdj++; break }
                            }
                        }
                        if ($skinAdj -gt 0) { break }
                    }
                }
            }
        }
        if ($tear -gt 0) {
            $results += [PSCustomObject]@{ X = $fx; Y = $fy; Tear = $tear; SkinAdj = $skinAdj }
        }
    }
}
$results | Sort-Object -Descending { $_.Tear + $_.SkinAdj * 3 } | Select-Object -First 10 | ForEach-Object {
    "  ($($_.X),$($_.Y)) tearPx=$($_.Tear) skinAdjacent=$($_.SkinAdj)"
}
if ($results.Count -eq 0) { "  no teardrop frames found" }
