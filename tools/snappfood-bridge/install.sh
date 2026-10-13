#!/bin/bash
# نصب پل اسنپ‌فود دارینو روی مک: ./install.sh https://دامنهٔ-دارینو
set -euo pipefail
URL="${1:-}"
if [[ ! "$URL" =~ ^https://[a-zA-Z0-9.-]+$ ]]; then echo "استفاده: ./install.sh https://YOUR-DARINO.vercel.app"; exit 1; fi
SRC="$(cd "$(dirname "$0")" && pwd)"
DIR="$HOME/.darino-bridge"
PLIST="$HOME/Library/LaunchAgents/ir.darino.snappfood-bridge.plist"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "Node.js پیدا نشد"; exit 1; }
NODE_REAL="$(perl -MCwd -e 'print Cwd::abs_path shift' "$NODE")"
NODE_DIR="$(dirname "$(dirname "$NODE_REAL")")"

mkdir -p "$DIR" "$HOME/Library/LaunchAgents"; chmod 700 "$DIR"
cp "$SRC/bridge.mjs" "$DIR/bridge.mjs"
sed -e "s#__HOME__#$HOME#g" -e "s#__DIR__#$DIR#g" -e "s#__NODE_DIR__#$NODE_DIR#g" "$SRC/sandbox.sb" > "$DIR/sandbox.sb"

KEY=""
[ -f "$DIR/config.json" ] && KEY="$(/usr/bin/sed -n 's/.*"key":"\([0-9a-f]\{64\}\)".*/\1/p' "$DIR/config.json")"
[ -n "$KEY" ] || KEY="$(openssl rand -hex 32)"
umask 077
printf '{"url":"%s","key":"%s"}\n' "$URL" "$KEY" > "$DIR/config.json"
chmod 600 "$DIR/config.json"

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ir.darino.snappfood-bridge</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/sandbox-exec</string><string>-f</string><string>$DIR/sandbox.sb</string>
    <string>$NODE_REAL</string><string>$DIR/bridge.mjs</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$DIR/bridge.log</string>
  <key>StandardErrorPath</key><string>$DIR/bridge.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
printf '%s' "$KEY" | pbcopy
echo "✅ پل نصب و روشن شد. پوشه: $DIR"
echo "🔑 کلید پل در کلیپ‌بورد کپی شد؛ در Vercel با نام SHOP_RELAY_KEY ذخیره کنید و Redeploy بزنید."
echo "📄 گزارش: tail -f $DIR/bridge.log"
