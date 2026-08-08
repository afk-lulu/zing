<#
.SYNOPSIS
  Regenerates api/fixtures/worksheet.jpg — the synthetic demo worksheet the
  pipeline smoke test feeds to S1 /api/extract (ARCH §2, "vision path").

.DESCRIPTION
  Draws a printed-looking grade 4 homework sheet (mixed elementary math +
  science, PRD §2) onto an A4-at-150dpi bitmap with System.Drawing and saves it
  as JPEG quality 85. Text-only fixtures make for a boring extraction, so the
  fraction questions carry real geometry: a shaded 1x4 bar and an eighths pie.

  The worksheet text lives in make-fixture.mjs (WORKSHEET) as the single source
  of truth for the PDF twin; keep the two in sync by hand if you edit either.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File api/scripts/make-fixture.ps1
#>
[CmdletBinding()]
param(
  [string]$OutPath,
  [int]$Quality = 85
)

$ErrorActionPreference = 'Stop'
# $PSScriptRoot is not populated inside param() defaults on PowerShell 5.1.
if (-not $OutPath) {
  $OutPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'fixtures\worksheet.jpg'
}
Add-Type -AssemblyName System.Drawing

# --- page -------------------------------------------------------------------
$W = 1240; $H = 1754          # A4 @ 150 dpi
$MarginL = 96; $MarginR = 96
$ContentW = $W - $MarginL - $MarginR

$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$bmp.SetResolution(150, 150)  # so font *points* map to a real A4 print size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::FromArgb(252, 251, 246))   # slightly off-white paper

# --- ink & type -------------------------------------------------------------
$Ink      = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(28, 28, 32))
$InkSoft  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(92, 92, 100))
$Shade    = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(176, 178, 186))
$RulePen  = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 122, 130)), 1.4
$LinePen  = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(64, 66, 72)), 1.8
$ThinPen  = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150, 152, 160)), 1.2

$FTitle   = New-Object System.Drawing.Font 'Arial', 21, ([System.Drawing.FontStyle]::Bold)
$FSub     = New-Object System.Drawing.Font 'Arial', 11.5
$FSection = New-Object System.Drawing.Font 'Arial', 13.5, ([System.Drawing.FontStyle]::Bold)
$FBody    = New-Object System.Drawing.Font 'Arial', 11.5
$FBodyB   = New-Object System.Drawing.Font 'Arial', 11.5, ([System.Drawing.FontStyle]::Bold)
$FSmall   = New-Object System.Drawing.Font 'Arial', 9.5
$FMath    = New-Object System.Drawing.Font 'Arial', 13

$fmt = New-Object System.Drawing.StringFormat
$fmt.Trimming = [System.Drawing.StringTrimming]::None

$script:y = 92

function Draw-Text {
  param([string]$Text, $Font, [int]$X, [int]$Y, $Brush = $Ink)
  $g.DrawString($Text, $Font, $Brush, [single]$X, [single]$Y, $fmt)
}

# Wraps inside $Width and returns the height consumed.
function Draw-Wrapped {
  param([string]$Text, $Font, [int]$X, [int]$Y, [int]$Width, $Brush = $Ink)
  $rect = New-Object System.Drawing.RectangleF $X, $Y, $Width, 400
  $size = $g.MeasureString($Text, $Font, $Width, $fmt)
  $g.DrawString($Text, $Font, $Brush, $rect, $fmt)
  return [int][math]::Ceiling($size.Height)
}

# One numbered question: "3." hanging indent, wrapped body.
function Draw-Question {
  param([string]$Number, [string]$Text, [int]$Gap = 14, $Font = $FBody)
  Draw-Text $Number $FBodyB ($MarginL + 4) $script:y
  $h = Draw-Wrapped $Text $Font ($MarginL + 48) $script:y ($ContentW - 48)
  $script:y += $h + $Gap
}

function Draw-Blank {
  param([int]$X, [int]$Y, [int]$Len)
  $g.DrawLine($LinePen, [single]$X, [single]$Y, [single]($X + $Len), [single]$Y)
}

# --- masthead ---------------------------------------------------------------
Draw-Text 'Oakridge Elementary School' $FSmall $MarginL $script:y $InkSoft
$script:y += 26
Draw-Text 'Weekly Practice: Fractions & Living Things' $FTitle $MarginL $script:y
$script:y += 44
Draw-Text 'Grade 4  -  Unit 6  -  Homework Packet B' $FSub $MarginL $script:y $InkSoft
$script:y += 34

Draw-Text 'Name:' $FBody $MarginL $script:y
Draw-Blank ($MarginL + 62) ($script:y + 26) 380
Draw-Text 'Date:' $FBody ($MarginL + 500) $script:y
Draw-Blank ($MarginL + 556) ($script:y + 26) 240
$script:y += 40
$g.DrawLine($RulePen, [single]$MarginL, [single]$script:y, [single]($W - $MarginR), [single]$script:y)
$script:y += 22

Draw-Text 'Show your work. Answer the science questions in complete sentences.' $FSmall $MarginL $script:y $InkSoft
$script:y += 34

# --- Part A: math -----------------------------------------------------------
Draw-Text 'Part A  -  Math: Fractions' $FSection $MarginL $script:y
$script:y += 34

# Q1: shade 3/4 of a 1x4 bar
Draw-Question '1.' 'Shade 3/4 of the bar below. Then write the fraction that is NOT shaded.' 8
$barX = $MarginL + 48; $barY = $script:y; $cellW = 96; $cellH = 62
for ($i = 0; $i -lt 4; $i++) {
  $g.DrawRectangle($LinePen, ($barX + $i * $cellW), $barY, $cellW, $cellH)
}
Draw-Text 'Not shaded:' $FBody ($barX + 4 * $cellW + 40) ($barY + 16)
Draw-Blank ($barX + 4 * $cellW + 178) ($barY + 46) 140
$script:y += $cellH + 24

# Q2: eighths pie, 3 shaded
Draw-Question '2.' 'The circle is cut into 8 equal slices. Write the fraction of the circle that is shaded.' 8
$cx = $MarginL + 116; $cy = $script:y + 76; $r = 74
for ($i = 0; $i -lt 8; $i++) {
  $start = -90 + $i * 45
  if ($i -lt 3) {
    $g.FillPie($Shade, ($cx - $r), ($cy - $r), (2 * $r), (2 * $r), $start, 45)
  }
  $g.DrawPie($LinePen, ($cx - $r), ($cy - $r), (2 * $r), (2 * $r), $start, 45)
}
Draw-Text 'Shaded =' $FMath ($cx + $r + 60) ($cy - 34)
Draw-Blank ($cx + $r + 178) ($cy - 4) 130
Draw-Text 'of the whole circle' $FSmall ($cx + $r + 60) ($cy + 16) $InkSoft
$script:y += 2 * $r + 26

# Q3-Q5: arithmetic row
Draw-Question '3.' 'Add. Write each answer in its simplest form.' 10
$rowY = $script:y
$col = @(
  @('1/5  +  2/5  =', 0),
  @('3/8  +  4/8  =', 350),
  @('2/6  +  2/6  =', 700)
)
foreach ($c in $col) {
  Draw-Text $c[0] $FMath ($MarginL + 48 + $c[1]) $rowY
  Draw-Blank ($MarginL + 48 + $c[1] + 172) ($rowY + 30) 110
}
$script:y += 62

Draw-Question '4.' 'Circle the larger fraction in each pair:        2/3   or   2/5              5/8   or   3/8' 16 $FMath

Draw-Question '5.' 'Maya cut a pizza into 6 equal slices and ate 2 of them. What fraction of the pizza is left? Explain how you know.' 8
Draw-Blank ($MarginL + 48) ($script:y + 26) ($ContentW - 48)
$script:y += 46

# --- Part B: science --------------------------------------------------------
$g.DrawLine($RulePen, [single]$MarginL, [single]$script:y, [single]($W - $MarginR), [single]$script:y)
$script:y += 20
Draw-Text 'Part B  -  Science: Habitats & the Water Cycle' $FSection $MarginL $script:y
$script:y += 34

# Q6: matching
Draw-Question '6.' 'Draw a line to match each animal to the habitat where it lives.' 10
$mY = $script:y
$animals  = @('Polar bear', 'Cactus wren', 'Bottlenose dolphin')
$habitats = @('Sonoran desert', 'Ocean', 'Arctic tundra')
for ($i = 0; $i -lt 3; $i++) {
  $ry = $mY + $i * 38
  Draw-Text $animals[$i] $FBody ($MarginL + 80) $ry
  $g.FillEllipse($Ink, ($MarginL + 330), ($ry + 12), 7, 7)
  $g.FillEllipse($Ink, ($MarginL + 560), ($ry + 12), 7, 7)
  Draw-Text $habitats[$i] $FBody ($MarginL + 592) $ry
}
$script:y = $mY + 3 * 38 + 14

Draw-Question '7.' 'Name two things every habitat must give an animal so it can survive.' 8
Draw-Text '1)' $FBody ($MarginL + 48) $script:y
Draw-Blank ($MarginL + 84) ($script:y + 26) 380
Draw-Text '2)' $FBody ($MarginL + 520) $script:y
Draw-Blank ($MarginL + 556) ($script:y + 26) 380
$script:y += 48

Draw-Question '8.' 'Fill in the missing word. When the sun heats a lake, water changes into water vapour and rises into the air. This step of the water cycle is called e _ _ _ _ _ _ _ _ _ _ .' 14

Draw-Question '9.' 'Number the steps of the water cycle in order from 1 to 4.' 10
$sY = $script:y
$steps = @('Precipitation', 'Evaporation', 'Collection', 'Condensation')
for ($i = 0; $i -lt 4; $i++) {
  $sx = $MarginL + 48 + $i * 262
  $g.DrawRectangle($ThinPen, $sx, $sY, 34, 34)
  Draw-Text $steps[$i] $FBody ($sx + 44) ($sY + 4)
}
$script:y += 52

Draw-Question '10.' 'Water vapour rises high into the sky, where the air is much colder. Explain in one or two sentences why clouds form there.' 10
Draw-Blank ($MarginL + 48) ($script:y + 22) ($ContentW - 48)
Draw-Blank ($MarginL + 48) ($script:y + 62) ($ContentW - 48)
$script:y += 84

# --- footer -----------------------------------------------------------------
$g.DrawLine($RulePen, [single]$MarginL, [single]$script:y, [single]($W - $MarginR), [single]$script:y)
$script:y += 12
Draw-Text 'Mrs. Alvarez  -  Room 12  -  Return by Friday' $FSmall $MarginL $script:y $InkSoft
Draw-Text 'page 1 of 1' $FSmall ($W - $MarginR - 96) $script:y $InkSoft

if ($script:y -gt ($H - 60)) { throw "Layout overflowed the page: y=$($script:y), page height=$H" }

# --- a whisper of phone-camera falloff (kept weak: legibility beats realism) --
$vw = [int]($W * 1.5); $vh = [int]($H * 1.5)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddEllipse((($W - $vw) / 2), (($H - $vh) / 2), $vw, $vh)
$vignette = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
$vignette.CenterColor = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
$vignette.SurroundColors = @([System.Drawing.Color]::FromArgb(34, 20, 18, 12))
$vignette.FocusScales = New-Object System.Drawing.PointF 0.45, 0.45
$g.FillRectangle($vignette, 0, 0, $W, $H)
$vignette.Dispose(); $path.Dispose()

# --- save as JPEG -----------------------------------------------------------
$dir = Split-Path -Parent $OutPath
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)
$bmp.Save($OutPath, $codec, $params)

$g.Dispose(); $bmp.Dispose()
$bytes = (Get-Item $OutPath).Length
Write-Output "wrote $OutPath  ${W}x${H}  q$Quality  $bytes bytes  (content ends at y=$($script:y))"
