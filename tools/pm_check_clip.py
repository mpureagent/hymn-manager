#!/usr/bin/env python3
"""验证长段落是否被裁切（T5 P2 第 2 条的真实性量化）。

在多个字号下，打开红本第 96 首（单段 51 行），检查投屏窗口：
- 内容实际高度 vs 可视高度
- 是否有行被裁掉（scrollHeight > clientHeight）
"""
import json
import time

from pm_verify_ui import Page, targets


def proj_page():
    ts = targets()
    return next((t for t in ts if "projection" in t.get("url", "")), None)


def main_page():
    ts = targets()
    return next((t for t in ts if "control" in t.get("url", "")), None)


MEASURE = """(() => {
  const host = document.querySelector('#lyrics, .lyrics, #stage, .stage, body');
  const lines = Array.from(document.querySelectorAll('.lyric-line'));
  const bodyEl = document.body;
  const de = document.documentElement;
  const last = lines[lines.length - 1];
  let lastBottom = null, clipped = null;
  if (last) {
    const r = last.getBoundingClientRect();
    lastBottom = Math.round(r.bottom);
    clipped = r.bottom > window.innerHeight + 1;
  }
  return {
    viewportH: window.innerHeight,
    docScrollH: de.scrollHeight,
    bodyScrollH: bodyEl.scrollHeight,
    overflowScroll: de.scrollHeight > window.innerHeight + 1,
    lineCount: lines.length,
    lastLineBottom: lastBottom,
    lastLineClipped: clipped,
    indicator: (document.querySelector('#indicator,.indicator,[class*=indicator]')||{}).textContent
  };
})()"""


def main():
    m = main_page()
    p = Page(m["webSocketDebuggerUrl"])
    p.js("""(()=>{const s=document.querySelector('#book-select');s.value='red_book';
      s.dispatchEvent(new Event('change'));return true})()""")
    time.sleep(0.5)

    out = {}
    for size in (24, 48, 72, 120):
        p.js(f"""(()=>{{const n=document.querySelector('input[type=number]');
          if(n){{n.value='{size}';n.dispatchEvent(new Event('input',{{bubbles:true}}));
          n.dispatchEvent(new Event('change',{{bubbles:true}}));}}return true}})()""")
        time.sleep(0.4)
        # 打开第 96 首（单段 51 行）
        p.js("""(()=>{const i=document.querySelector('#search-input');i.value='96';
          i.dispatchEvent(new Event('input',{bubbles:true}));return true})()""")
        time.sleep(0.5)
        p.js("""(()=>{const r=document.querySelector('.hymn-row');if(r)r.click();return true})()""")
        time.sleep(0.7)
        # 确保投屏开着
        p.js("""(()=>{const b=document.querySelector('#btn-project');
          if(b && b.textContent.indexOf('投屏中')<0) b.click(); return true})()""")
        time.sleep(1.8)
        pj = proj_page()
        if not pj:
            out[f"{size}px"] = {"error": "no projection"}
            continue
        pjp = Page(pj["webSocketDebuggerUrl"])
        out[f"{size}px"] = pjp.js(MEASURE)
        pjp.ws.close()

    print(json.dumps(out, ensure_ascii=False, indent=1))
    p.ws.close()


if __name__ == "__main__":
    main()
