#!/usr/bin/env python3
"""PM 验收：截取 Electron 窗口截图（CDP Page.captureScreenshot）。

用法: python3 tools/pm_screenshot.py <输出png> [宽] [高]
"""
import base64
import json
import sys
import time

from pm_verify_ui import Page, targets


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/hymn-ui.png"
    w = int(sys.argv[2]) if len(sys.argv) > 2 else 1400
    h = int(sys.argv[3]) if len(sys.argv) > 3 else 860
    ts = targets()
    page = next(t for t in ts if "control" in t.get("url", ""))
    p = Page(page["webSocketDebuggerUrl"])
    p.i += 1
    p.ws.send(json.dumps({
        "id": p.i, "method": "Emulation.setDeviceMetricsOverride",
        "params": {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": False},
    }))
    while True:
        msg = json.loads(p.ws.recv())
        if msg.get("id") == p.i:
            break
    time.sleep(0.6)
    p.i += 1
    p.ws.send(json.dumps({"id": p.i, "method": "Page.captureScreenshot",
                          "params": {"format": "png"}}))
    while True:
        msg = json.loads(p.ws.recv())
        if msg.get("id") == p.i:
            data = msg["result"]["data"]
            break
    with open(out, "wb") as f:
        f.write(base64.b64decode(data))
    print(out)
    p.ws.close()


if __name__ == "__main__":
    main()
