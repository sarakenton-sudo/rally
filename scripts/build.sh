#!/bin/bash
set -e

echo "=== Building RALLY consumer app ==="
npx expo export --platform web

# Rearrange for homepage vs SPA routing
cp dist/index.html dist/app.html
cp -r public/* dist/
cp public/homepage.html dist/index.html

echo "=== Building RallyHUB admin panel ==="
cd admin
npm ci
npm run build
cp -r dist ../dist/admin
cd ..

echo "=== Build complete ==="
