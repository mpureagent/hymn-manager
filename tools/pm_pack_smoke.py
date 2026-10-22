#!/usr/bin/env python3
"""PM 验收 T7：验证生产态（app.isPackaged=true）下的数据包查找与引导页。

做法：把一个 packaging 布局的 dist 放到临时目录，用 asar 打包后的 app.asar
直接以 electron 运行（app.asar 可作为 electron 的 app 路径），
从而让 app.isPackaged 为 true。然后分别验证：
  A. 数据包缺失 → 引导页，且不列出开发态路径
  B. 数据包放在 exe 同目录 → 正常加载

用法: python3 tools/pm_pack_smoke.py <case>
      case: missing | present
"""
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = "/data/.cache/hymn-packsig"
ELECTRON = os.path.join(ROOT, "node_modules", "electron", "dist", "electron")
PORT = 9333


def build_layout(case: str) -> str:
    """构造 <work>/app/resources/app.asar + <work>/app/hymns-data？"""
    shutil.rmtree(WORK, ignore_errors=True)
    app_dir = os.path.join(WORK, "app")
    res = os.path.join(app_dir, "resources")
    os.makedirs(res, exist_ok=True)
    shutil.copy(os.path.join(ROOT, "release", "win-unpacked", "resources", "app.asar"),
                os.path.join(res, "app.asar"))
    # electron 需要 package.json 指到入口；app.asar 已含，但 electron 直接跑 asar 需要它可执行
    if case == "present":
        # 数据包放在启动目录下，验证查找链能命中
        src = os.path.join(ROOT, "hymns-data")
        dst = os.path.join(WORK, "hymns-data")
        os.makedirs(dst, exist_ok=True)
        for sub in ("books",):
            shutil.copytree(os.path.join(src, sub), os.path.join(dst, sub))
        os.makedirs(os.path.join(dst, "scores", "red"), exist_ok=True)
        os.makedirs(os.path.join(dst, "scores", "black"), exist_ok=True)
        shutil.copy(os.path.join(src, "manifest.json"), os.path.join(dst, "manifest.json"))
    return app_dir


def main():
    case = sys.argv[1] if len(sys.argv) > 1 else "missing"
    app_dir = build_layout(case)
    asar = os.path.join(app_dir, "resources", "app.asar")
    userdata = os.path.join(WORK, "userdata")
    os.makedirs(userdata, exist_ok=True)
    env = dict(os.environ)
    env["XDG_CONFIG_HOME"] = userdata
    env.pop("ELECTRON_RUN_AS_NODE", None)
    cmd = [
        "xvfb-run", "-a", "--server-args=-screen 0 1400x900x24",
        ELECTRON, "--no-sandbox", f"--remote-debugging-port={PORT}",
        f"--user-data-dir={userdata}", asar,
    ]
    proc = subprocess.Popen(cmd, cwd=WORK if case == "present" else None,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, text=True)
    time.sleep(9)
    out = {}
    try:
        sys.path.insert(0, os.path.join(ROOT, "tools"))
        from pm_verify_ui import Page, targets  # noqa: E402
        ts = targets(PORT)
        page = next((t for t in ts if "control" in t.get("url", "")), None)
        if not page:
            out = {"error": "主窗口未创建", "urls": [t.get("url") for t in ts]}
        else:
            p = Page(page["webSocketDebuggerUrl"])
            out = p.js("""(() => {
              const t = document.body.innerText;
              return {
                url: location.href,
                hasGuide: t.includes('未找到数据包'),
                count: (t.match(/共\\s*\\d+\\s*首/) || [null])[0],
                bodyHead: t.replace(/\\n{2,}/g, '\\n').slice(0, 420),
                showsDevPath: t.includes('/hymn-manager/dist') || t.includes('node_modules/electron')
              };
            })()""")
            p.ws.close()
    except Exception as e:
        out = {"error": str(e)[:200]}
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except Exception:
            proc.kill()
        # xvfb-run 的子进程可能残留并占用端口，清掉免得后续用例连到旧实例
        subprocess.run(["pkill", "-f", f"remote-debugging-port={PORT}"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(2)
    print(json.dumps({"case": case, "result": out}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
