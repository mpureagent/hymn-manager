#!/usr/bin/env python3
"""PM 独立验收：用 CDP 驱动已启动的 Electron，核对 UI 事实。

不依赖第三方库：内置最小 WebSocket 客户端（仅文本帧、无分片）。
前置：应用以 --remote-debugging-port=9222 启动（xvfb 虚拟屏）。

用法:
  python3 tools/pm_verify_ui.py                # 打印页面事实
  python3 tools/pm_verify_ui.py <js表达式>      # 额外求值一条表达式
"""
import base64
import json
import os
import socket
import struct
import sys
import time
import urllib.request


class WS:
    """最小 WebSocket 客户端（RFC6455，客户端掩码，文本帧）。"""

    def __init__(self, url, timeout=20):
        assert url.startswith("ws://")
        rest = url[5:]
        hostport, _, path = rest.partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=timeout)
        self.sock.settimeout(timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        if b"101" not in buf.split(b"\r\n")[0]:
            raise RuntimeError(f"握手失败: {buf[:120]!r}")
        self.buf = buf.split(b"\r\n\r\n", 1)[1]

    def _recv_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError("连接关闭")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, text):
        payload = text.encode()
        header = bytearray([0x81])
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        mask = os.urandom(4)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def recv(self):
        while True:
            b0, b1 = self._recv_exact(2)
            opcode = b0 & 0x0F
            n = b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._recv_exact(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._recv_exact(8))[0]
            data = self._recv_exact(n)
            if opcode == 0x8:
                raise RuntimeError("服务器关闭连接")
            if opcode in (0x1, 0x2):
                return data.decode("utf-8", "replace")
            if opcode == 0x9:  # ping
                continue

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


def targets(port=9222):
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2) as r:
                return json.loads(r.read())
        except Exception:
            time.sleep(0.5)
    raise SystemExit("CDP 不可达（应用没起来或没开 --remote-debugging-port）")


class Page:
    def __init__(self, ws_url):
        self.ws = WS(ws_url)
        self.i = 0

    def js(self, expr):
        self.i += 1
        self.ws.send(json.dumps({
            "id": self.i, "method": "Runtime.evaluate",
            "params": {"expression": expr, "returnByValue": True, "awaitPromise": True},
        }))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.i:
                res = msg.get("result", {})
                if "exceptionDetails" in res:
                    return {"__error": res["exceptionDetails"].get("text"),
                            "detail": str(res["exceptionDetails"].get("exception", {}).get("description"))[:300]}
                return res.get("result", {}).get("value")


CHECK = r"""
(() => {
  const sel = document.querySelector('#book-select');
  const q = document.querySelector('#search-input');
  const rows = Array.from(document.querySelectorAll('.hymn-row'));
  return {
    title: document.title,
    selectOptions: sel ? Array.from(sel.options).map(o => o.textContent.trim()) : null,
    selectValue: sel ? sel.value : null,
    searchPlaceholder: q ? q.getAttribute('placeholder') : null,
    controlsSeparate: !!(sel && q && sel !== q && !sel.contains(q) && !q.contains(sel)),
    sameParent: !!(sel && q && sel.parentElement === q.parentElement),
    domRows: rows.length,
    firstRows: rows.slice(0, 3).map(r => r.textContent.replace(/\s+/g, ' ').trim()),
    countText: (document.body.innerText.match(/共\s*\d+\s*首|找到\s*\d+\s*首/) || [null])[0],
    previewText: (document.querySelector('#preview, .preview, #preview-selected') || {}).innerText || null,
    bodyHead: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 260)
  };
})()
"""


def main():
    ts = targets()
    page = next((t for t in ts if "control" in t.get("url", "")), None)
    if not page:
        print(json.dumps({"error": "未找到主窗口", "urls": [t.get("url") for t in ts]},
                         ensure_ascii=False))
        return
    p = Page(page["webSocketDebuggerUrl"])
    print(json.dumps(p.js(CHECK), ensure_ascii=False, indent=1))
    if len(sys.argv) > 1:
        print("--- extra ---")
        print(json.dumps(p.js(sys.argv[1]), ensure_ascii=False, indent=1))
    p.ws.close()


if __name__ == "__main__":
    main()
