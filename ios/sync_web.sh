#!/bin/bash
# Script de sincronização dos arquivos web para o bundle do iOS

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_WEBAPP_DIR="$PROJECT_DIR/ios/AgendaPessoal/WebApp"

echo "📦 Sincronizando arquivos web para o app iOS..."
cp "$PROJECT_DIR/index.html" "$IOS_WEBAPP_DIR/"
cp "$PROJECT_DIR/style.css" "$IOS_WEBAPP_DIR/"
cp "$PROJECT_DIR/app.js" "$IOS_WEBAPP_DIR/"
cp "$PROJECT_DIR/icon.png" "$IOS_WEBAPP_DIR/"
cp "$PROJECT_DIR/icon-192.png" "$IOS_WEBAPP_DIR/"
cp "$PROJECT_DIR/manifest.json" "$IOS_WEBAPP_DIR/"

echo "✅ Sincronização concluída com sucesso!"
