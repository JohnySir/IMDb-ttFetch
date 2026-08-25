# make-icons.ps1 — regenerate the extension icons (16/48/128 PNG).
# Requires PowerShell + .NET System.Drawing (Windows).
# Usage: pwsh tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function New-Icon {
  param([int]$Size, [string]$Path)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)

  # Rounded dark navy square
  $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
  $radius = [int]($Size * 0.22)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [float]$radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Width - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Width - $d, $rect.Height - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Height - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 17, 20, 29))), $path)

  # Gold "tt" glyph
  $font = New-Object System.Drawing.Font(
    'Segoe UI',
    [float]($Size * 0.42),
    [System.Drawing.FontStyle]::Bold,
    [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 245, 197, 24))
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = 'Center'
  $sf.LineAlignment = 'Center'
  $textRect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
  $g.DrawString('tt', $font, $brush, $textRect, $sf)

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "Wrote $path"
}

New-Icon -Size 16  -Path (Join-Path $dir 'icon16.png')
New-Icon -Size 48  -Path (Join-Path $dir 'icon48.png')
New-Icon -Size 128 -Path (Join-Path $dir 'icon128.png')