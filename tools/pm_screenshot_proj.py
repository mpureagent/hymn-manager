#!/usr/bin/env python3
"""截投屏窗口（projection target），不是主窗口。

用法: python3 pm_screenshot_proj.py <输出png> [宽] [高]
"""
import base64
import json
import sys
import time

from pm_verify_ui import Page, targets


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/proj.png"
    w = int(sys.argv[2]) if len(sys.argv) > 2 else 1600
    h = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
    ts = targets()
    page = next((t for t in ts if "projection" in t.get("url", "")), None)
    if not page:
        raise SystemExit("没有投屏窗口")
    p = Page(page["webSocketDebuggerUrl"])
    p.i += 1
    p.ws.send(json.dumps({"id": p.i, "method": "Emulation.setDeviceMetricsOverride",
                          "params": {"width": w, "height": h, "deviceScaleFactor": 1,
                                     "mobile": False}}))
    while True:
        if json.loads(p.ws.recv()).get("id") == p.i:
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
