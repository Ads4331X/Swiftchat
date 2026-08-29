#!/usr/bin/env bash
# Forwards the connected device's localhost:3000 to this machine's port 3000
# over USB, so the app can reach the backend server without relying on
# Wi-Fi/LAN routing — the same mechanism Expo uses for Metro on :8081.
#
# Re-run this after re-plugging the device or restarting `adb`.
set -e

ADB="${ADB:-adb}"

"$ADB" reverse tcp:8081 tcp:8081 2>/dev/null || true
"$ADB" reverse tcp:3000 tcp:3000

echo "adb reverse set: device localhost:3000 -> host:3000 (Metro 8081 already covered)"