#!/usr/bin/env bash
# 启动 Web 端并对外暴露（隧道，无需开放安全组端口）。
#
# 用法：tools/serve-public.sh [本地端口]
#
# 为什么需要隧道：本机公网只开放 22，80/443/8080 等入站端口都被安全组挡住，
# 已用 check-host.net 多节点验证全部超时。
#
# 隧道选型（都实测过）：
#   - cloudflared: 无中间页、加载最快（首页 1.7s / 列表 3.1s），首选
#   - serveo:      有「Browser Warning」点击页，且未压缩响应会被截断
#   - pinggy:      有「Enter site」点击页，免费版 60 分钟过期
set -uo pipefail

PORT="${1:-8787}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$REPO/.cache"
mkdir -p "$CACHE"

# 1) 清掉可能残留的旧进程（只杀本项目端口的服务与隧道）
pkill -f "src/web/server.mjs" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
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

# 3) 建隧道（优先 cloudflared：无中间页）
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "[serve-public] 未安装 cloudflared，回退到 serveo（有中间页）" >&2
  nohup ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
    -R "80:localhost:$PORT" serveo.net >"$CACHE/tunnel.log" 2>&1 &
  PATTERN='https://[a-z0-9-]+\.serveousercontent\.com'
else
  # --protocol http2：本机所在区域 QUIC 节点不通，http2 实测稳定
  nohup cloudflared tunnel --url "http://127.0.0.1:$PORT" \
    --no-autoupdate --protocol http2 >"$CACHE/tunnel.log" 2>&1 &
  PATTERN='https://[a-z0-9-]+\.trycloudflare\.com'
fi

URL=""
for _ in $(seq 1 60); do
  URL="$(grep -oE "$PATTERN" "$CACHE/tunnel.log" 2>/dev/null | head -1)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "[serve-public] 隧道建立失败，见 $CACHE/tunnel.log" >&2
  exit 1
fi

printf '%s\n' "$URL" >"$CACHE/web-url.txt"
echo "[serve-public] 公网地址：$URL"
echo "[serve-public] 投屏页：$URL/projection"
