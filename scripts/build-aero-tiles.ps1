# build-aero-tiles.ps1
#
# Builds VFR sectional tile pyramids from FAA GeoTIFFs and writes them
# under public/aero-tiles for self-hosted Aero base layer support.
#
# Prereqs:
#   - conda install -y -c conda-forge gdal   (provides gdalwarp, gdal_translate, gdal2tiles.py)
#   - curl, unzip
#
# Usage:
#   .\scripts\build-aero-tiles.ps1                              # default: Detroit, current cycle
#   .\scripts\build-aero-tiles.ps1 -Chart Detroit -Cycle 09-03-2026
#   .\scripts\build-aero-tiles.ps1 -Charts Detroit,Lake_Huron -Zoom 5-12
#
# Notes:
#   - FAA sectionals rotate every 56 days. Find current + next cycle dates at
#     https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/vfr
#   - URL pattern: https://aeronav.faa.gov/visual/<cycle>/sectional-files/<name>.zip
#   - Each chart produces ~250-650 MB of PNG tiles (z5-z12). Don't run on the C: drive
#     if you're low on disk; use a fast SSD.
#
# After running, commit the new tiles under public/aero-tiles/ and bump the
# "Source" comment date in shared/components/map/aero-source.ts if you want
# users to know which chart cycle is live.

[CmdletBinding()]
param(
    [string[]]$Charts = @("Detroit"),
    [string]$Cycle = "07-09-2026",
    [string]$Zoom = "5-12"
)

$ErrorActionPreference = "Stop"

# Use miniconda's GDAL by default; user can override by exporting GDAL_BIN
$GdalBin = if ($env:GDAL_BIN) { $env:GDAL_BIN } else { "$env:USERPROFILE\miniconda3\Library\bin" }
$Gdal2Tiles = if ($env:GDAL2TILES) { $env:GDAL2TILES } else { "$env:USERPROFILE\miniconda3\Scripts\gdal2tiles.py" }
$env:GDAL_DATA = if ($env:GDAL_DATA) { $env:GDAL_DATA } else { "$env:USERPROFILE\miniconda3\Library\share\gdal" }
$env:PATH = "$GdalBin;$env:PATH"

$repoRoot = (Get-Content -Path "$PSScriptRoot\..\package.json" -Raw | ConvertFrom-Json).name | Out-Null
$repoRoot = Resolve-Path "$PSScriptRoot\.."
$workDir = Join-Path $repoRoot "tmp\aero-build"
$outDir  = Join-Path $repoRoot "public\aero-tiles"

New-Item -ItemType Directory -Force -Path $workDir | Out-Null
New-Item -ItemType Directory -Force -Path $outDir  | Out-Null

foreach ($chart in $Charts) {
    Write-Host ""
    Write-Host "==> $chart (cycle $Cycle, zoom $Zoom)" -ForegroundColor Cyan

    $zipUrl  = "https://aeronav.faa.gov/visual/$Cycle/sectional-files/$chart.zip"
    $zipPath = Join-Path $workDir "$chart.zip"
    $tifPath = Join-Path $workDir "$chart SEC.tif"
    $warpPath = Join-Path $workDir "${chart}_3857.tif"
    $rgbPath  = Join-Path $workDir "${chart}_rgb.tif"
    $tileOut  = Join-Path $workDir "aero-tiles-$chart"

    # 1) Download
    if (-not (Test-Path $zipPath)) {
        Write-Host "  downloading $zipUrl"
        curl.exe -s --max-time 300 -o $zipPath $zipUrl
    }

    # 2) Unzip
    if (-not (Test-Path $tifPath)) {
        Write-Host "  unzipping"
        Expand-Archive -Path $zipPath -DestinationPath $workDir -Force
    }

    # 3) Warp to Web Mercator EPSG:3857
    if (-not (Test-Path $warpPath)) {
        Write-Host "  warping to EPSG:3857"
        & "$GdalBin\gdalwarp.exe" -t_srs EPSG:3857 -r near -of GTiff $tifPath $warpPath
    }

    # 4) Expand palette → 8-bit RGB (so resampling produces clean output)
    if (-not (Test-Path $rgbPath)) {
        Write-Host "  expanding to RGB"
        & "$GdalBin\gdal_translate.exe" -expand rgb $warpPath $rgbPath
    }

    # 5) Generate XYZ tile pyramid
    Write-Host "  generating tiles z=$Zoom"
    & python $Gdal2Tiles --xyz -z $Zoom -r near --processes=4 -q -x $rgbPath $tileOut

    # 6) Move tiles under public/aero-tiles/{z}/{x}/{y}.png
    Write-Host "  merging into $outDir"
    Get-ChildItem -Directory -Path $tileOut | Where-Object Name -match '^\d+$' | ForEach-Object {
        $z = $_.Name
        $dest = Join-Path $outDir $z
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        Copy-Item -Path "$($_.FullName)\*" -Destination $dest -Recurse -Force
    }
}

Write-Host ""
Write-Host "Done. Tiles now under public/aero-tiles/{z}/{x}/{y}.png" -ForegroundColor Green
Write-Host "Total size: $((Get-ChildItem -Recurse $outDir | Measure-Object Length -Sum).Sum / 1MB) MB"