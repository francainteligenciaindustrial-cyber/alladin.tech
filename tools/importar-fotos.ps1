# Aladdin Tech — publica as fotos da pasta "fotos-para-o-site" no site.
#  - arquivo com "equipe" no nome  -> foto da seção "Quem vai te atender"
#  - todas as outras               -> Mural dos Upgrades (faixas que deslizam)
# Uso:  powershell -ExecutionPolicy Bypass -File tools\importar-fotos.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root   = Split-Path -Parent $PSScriptRoot
$inbox  = Join-Path $root 'fotos-para-o-site'
$done   = Join-Path $inbox 'publicadas'
$outDir = Join-Path $root 'public\uploads\loja'
New-Item -ItemType Directory -Force $done, $outDir | Out-Null

$files = Get-ChildItem $inbox -File | Where-Object { $_.Extension -match '^\.(jpe?g|png|bmp|gif)$' } | Sort-Object Name
if (-not $files) { Write-Host 'Nenhuma foto encontrada em fotos-para-o-site (use JPG ou PNG).'; exit 0 }

$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$enc  = New-Object System.Drawing.Imaging.EncoderParameters 1
$enc.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]86)

$wall = @(); $team = ''
foreach ($f in $files) {
  $img = [System.Drawing.Image]::FromFile($f.FullName)
  # respeita a orientação do celular (EXIF)
  if ($img.PropertyIdList -contains 0x0112) {
    switch ([int]$img.GetPropertyItem(0x0112).Value[0]) { 3 { $img.RotateFlip('Rotate180FlipNone') } 6 { $img.RotateFlip('Rotate90FlipNone') } 8 { $img.RotateFlip('Rotate270FlipNone') } }
  }
  $max = 1400; $k = [Math]::Min(1, $max / [Math]::Max($img.Width, $img.Height))
  $w = [int]($img.Width * $k); $h = [int]($img.Height * $k)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.Clear([System.Drawing.Color]::Black)
  $g.DrawImage($img, 0, 0, $w, $h)
  $name = ('foto' + [Guid]::NewGuid().ToString('N').Substring(0, 16) + '.jpg')
  $bmp.Save((Join-Path $outDir $name), $jpeg, $enc)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  $url = "/uploads/loja/$name"
  if ($f.BaseName -match 'equipe') { $team = $url } else { $wall += $url }
  Move-Item $f.FullName (Join-Path $done $f.Name) -Force
  Write-Host ("  ok  " + $f.Name + "  ->  " + $(if ($f.BaseName -match 'equipe') { 'equipe' } else { 'mural' }))
}

$json = (@{ wall = $wall; team = $team } | ConvertTo-Json -Compress)
$tmp = Join-Path $env:TEMP 'aladdin-import.json'
[IO.File]::WriteAllText($tmp, $json)
node (Join-Path $PSScriptRoot 'aplicar-fotos.js') $tmp (Join-Path $root 'data\loja.db')
