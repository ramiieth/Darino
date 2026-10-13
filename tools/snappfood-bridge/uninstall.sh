#!/bin/bash
# حذف کامل پل اسنپ‌فود از مک
PLIST="$HOME/Library/LaunchAgents/ir.darino.snappfood-bridge.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
rm -rf "$HOME/.darino-bridge"
echo "✅ پل اسنپ‌فود کاملاً حذف شد. (SHOP_RELAY_KEY را هم از Vercel پاک کنید.)"
