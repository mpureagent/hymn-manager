#!/usr/bin/env bash
# 启动 Web 端并对外暴露（SSH 反向隧道，无需开放安全组端口）。
#
# 用法：
#   tools/serve-public.sh [本地端口]
# 说明：
#   - 本机公网只开了 22，8080/80/443 等入站端口都被安全组挡住，
#     因此用 serveo.net 的 SSH 反向隧道把本地端口映射成公网 HTTPS 地址。
#   - 隧道地址每次重连都会变；脚本会把地址打到 stdout 并存到 .cache/web-url.txt。
set -uo pipefail

PORT="${1:-8787}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$REPO/.cache"
mkdir -p "$CACHE"

# 1) 清掉可能残留的旧进程（只杀本项目端口的服务与隧道）
pkill -f "src/web/server.mjs" 2>/dev/null || true
pkill -f "serveo.net" 2>/dev/null || true
sleep 1

# 2) 构建 + 启服务
cd "$REPO" || exit 1
npm run build:web >/tmp/hymn-web-build.log 2>&1 || {
  echo "[serve-public] 构建失败，见 /tmp/hymn-web-build.log" >&2
  exit 1
}

PORT="$PORT" \
HYMN_DATA_ROOT="$REPO" \
HYMN_USER_DIR="$CACHE/web-user" \
HYMN_STATIC="$REPO/dist/web" \
  nohup node src/web/server.mjs >"$CACHE/web-server.log" 2>&1 &

for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://127.0.0.1:$PORT/api/history"; then break; fi
  sleep 0.5
done

if ! curl -sf -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "[serve-public] 服务未就绪，见 $CACHE/web-server.log" >&2
  exit 1
fi
echo "[serve-public] 本地服务已就绪：http://127.0.0.1:$PORT"

# 3) 建隧道
nohup ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
  -R "80:localhost:$PORT" serveo.net >"$CACHE/tunnel.log" 2>&1 &

URL=""
for _ in $(seq 1 40); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.serveousercontent\.com' "$CACHE/tunnel.log" 2>/dev/null | head -1)"
  [ -n "$URL" ] && break
  sleep 0.5
done

if [ -z "$URL" ]; then
  echo "[serve-public] 隧道建立失败，见 $CACHE/tunnel.log" >&2
  exit 1
fi

printf '%s\n' "$URL" >"$CACHE/web-url.txt"
echo "[serve-public] 公网地址：$URL"
echo "[serve-public] 投屏页：$URL/projection"
