#!/usr/bin/env python3
"""PM 验收 T5F：逐页扫描投屏，确认没有任何一页被裁切。

这是对 P0 修复的硬验收：不只看首页，而是翻遍每一页检查最后一行是否越界。

用法: python3 tools/pm_check_all_pages.py <book> <number> <sizes...>
例:   python3 tools/pm_check_all_pages.py red_book 96 24 48 72 120
"""
import json
import sys
import time

from pm_verify_ui import Page, targets

MEASURE = """(() => {
  const lines = Array.from(document.querySelectorAll('.lyric-line'));
  const last = lines[lines.length - 1];
  const ind = document.querySelector('#indicator,.indicator,[class*=indicator]');
  let clipped = false, lastBottom = null;
  if (last) {
    const r = last.getBoundingClientRect();
    lastBottom = Math.round(r.bottom);
    clipped = r.bottom > window.innerHeight + 1;
  }
  return {
    indicator: ind ? ind.textContent.trim() : null,
    lineCount: lines.length,
    lastLineBottom: lastBottom,
    viewportH: window.innerHeight,
    clipped,
    docOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
    firstLine: lines[0] ? lines[0].textContent.trim().slice(0, 30) : null,
    lastLine: last ? last.textContent.trim().slice(0, 30) : null
  };
})()"""

NEXT = """(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', {key: 'PageDown', bubbles: true}));
  return true;
})()"""


def main():
    book = sys.argv[1]
    number = int(sys.argv[2])
    sizes = [int(x) for x in sys.argv[3:]] or [48]

    ts = targets()
    m = next((t for t in ts if "control" in t.get("url", "")), None)
    if not m:
        print(json.dumps({"error": "主窗口未找到"}, ensure_ascii=False))
        return
    p = Page(m["webSocketDebuggerUrl"])

    results = {}
    for size in sizes:
        # 设字号
        p.js(f"""(()=>{{const n=document.querySelector('input[type=number]');
          if(n){{n.value='{size}';n.dispatchEvent(new Event('input',{{bubbles:true}}));
          n.dispatchEvent(new Event('change',{{bubbles:true}}));}}return true}})()""")
        time.sleep(0.4)
        # 选书 + 打开目标歌
        p.js(f"""(()=>{{const s=document.querySelector('#book-select');s.value='{book}';
          s.dispatchEvent(new Event('change'));return true}})()""")
        time.sleep(0.5)
        p.js(f"""(()=>{{const i=document.querySelector('#search-input');i.value='{number}';
          i.dispatchEvent(new Event('input',{{bubbles:true}}));return true}})()""")
        time.sleep(0.5)
        p.js("""(()=>{const r=document.querySelector('.hymn-row');if(r)r.click();return true})()""")
        time.sleep(0.7)
        # 开投屏
        p.js("""(()=>{const b=document.querySelector('#btn-project');
          if(b && b.textContent.indexOf('投屏中')<0) b.click(); return true})()""")
        time.sleep(2.0)

        ts2 = targets()
        pj = next((t for t in ts2 if "projection" in t.get("url", "")), None)
        if not pj:
            results[f"{size}px"] = {"error": "投屏窗口未创建"}
            continue
        pp = Page(pj["webSocketDebuggerUrl"])

        pages = []
        first = pp.js(MEASURE)
        total = 0
        if first.get("indicator"):
            try:
                total = int(first["indicator"].split("/")[1])
            except Exception:
                total = 1
        pages.append(first)
        for _ in range(total + 3):
            pp.js(NEXT)
            time.sleep(0.35)
            cur = pp.js(MEASURE)
            pages.append(cur)
            if cur.get("indicator") == f"{total}/{total}":
                break

        clipped = [x for x in pages if x.get("clipped")]
        results[f"{size}px"] = {
            "声明总页数": total,
            "实际扫描页数": len(pages),
            "裁切页数": len(clipped),
            "各页行数": [x.get("lineCount") for x in pages],
            "各页lastLineBottom": [x.get("lastLineBottom") for x in pages],
            "浏览器视口": pages[0].get("viewportH"),
            "首行": pages[0].get("firstLine"),
            "末页行": pages[-1].get("lastLine"),
            "末页页码": pages[-1].get("indicator"),
            "裁切详情": clipped[:2],
        }
        pp.ws.close()
        # 关投屏，下一档字号重开
        p.js("""(()=>{const b=document.querySelector('#btn-project');
          if(b && b.textContent.indexOf('投屏中')>=0) b.click(); return true})()""")
        time.sleep(0.8)

    print(json.dumps(results, ensure_ascii=False, indent=1))
    p.ws.close()


if __name__ == "__main__":
    main()
