#!/bin/bash
# Requires: Inkscape, ImageMagick v7 (magick), tauri CLI

set -e

SVG="public/meditor.svg"
BG="#e8e8e8"                # Le gris macOS (apparaîtra bien gris clair, pas noir)
OUTPUT="icon_prepared.png"

echo "🎨 Préparation de l'icône (Style macOS) depuis $SVG..."

# --- Paramètres de l'icône macOS ---
CANVAS_SIZE=1024
SQUIRCLE_SIZE=832           
MARGIN=$(( (CANVAS_SIZE - SQUIRCLE_SIZE) / 2 )) # 96
RADIUS=$(( SQUIRCLE_SIZE * 225 / 1000 ))        # Arrondi Apple
INNER=700                   # Taille du logo central

# 1. Export du SVG propre
inkscape "$SVG" \
  --export-type=png \
  --export-filename=/tmp/icon_inner.png \
  --export-width="$INNER" \
  --export-height="$INNER"

# 2. Création de la forme de base stricte
# On utilise explicitement TrueColorAlpha pour garder la transparence
magick -size "${CANVAS_SIZE}x${CANVAS_SIZE}" xc:transparent \
  -fill "$BG" \
  -stroke "rgba(0,0,0,0.05)" -strokewidth 2 \
  -draw "roundrectangle ${MARGIN},${MARGIN} $((CANVAS_SIZE-MARGIN)),$((CANVAS_SIZE-MARGIN)) ${RADIUS},${RADIUS}" \
  -colorspace sRGB -type TrueColorAlpha -define png:color-type=6 \
  /tmp/squircle_shape.png

# 3. Ajout de l'ombre en forçant le format de sortie RGBA
magick -size "${CANVAS_SIZE}x${CANVAS_SIZE}" xc:transparent \
  \( /tmp/squircle_shape.png -background black -shadow 30x25+0+15 \) -gravity center -composite \
  /tmp/squircle_shape.png -gravity center -composite \
  -colorspace sRGB -type TrueColorAlpha -define png:color-type=6 \
  /tmp/icon_bg.png

# 4. Composition finale (Ajout du logo au centre)
magick /tmp/icon_bg.png /tmp/icon_inner.png \
  -gravity center \
  -composite \
  -colorspace sRGB \
  -type TrueColorAlpha \
  -define png:color-type=6 \
  "$OUTPUT"

echo "✅ Icône base générée (1024x1024 stricte, colorée et transparente) : $OUTPUT"

# 5. Génération des icônes Tauri
if command -v cargo &>/dev/null &&[ -d "src-tauri" ]; then
  echo "🚀 Génération des icônes Tauri..."
  npm run tauri icon "$OUTPUT"
  echo "✅ Icônes générées dans src-tauri/icons/"
else
  echo "⚠️  Tauri non détecté. Lance manuellement : npm run tauri icon $OUTPUT"
fi

# Nettoyage
rm -f /tmp/icon_inner.png /tmp/squircle_shape.png /tmp/icon_bg.png
rm -f $OUTPUT

echo "✨ Terminé."
