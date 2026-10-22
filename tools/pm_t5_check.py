#!/usr/bin/env python3
"""PM 独立验收 T5：直接读两个窗口的事实，不依赖开发脚本的断言。

用法: python3 tools/pm_t5_check.py
"""
import json
import time

from pm_verify_ui import Page, targets

# 主窗口：选红本第1首（4 段），打开投屏
MAIN_SETUP = """(() => {
  const s = document.querySelector('#book-select');
  s.value = 'red_book';
  s.dispatchEvent(new Event('change'));
  return true;
})()"""

PICK_1 = """(() => {
  const i = document.querySelector('#search-input');
  i.value = '1';
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()"""

CLICK_ROW = """(() => {
  const r = document.querySelector('.hymn-row');
  if (!r) return false;
  r.click();
  return true;
})()"""

READ_MAIN = """(() => {
  const cs = getComputedStyle(document.documentElement);
  const pane = document.querySelector('.preview-pane');
  const pcs = pane ? getComputedStyle(pane) : null;
  const line = document.querySelector('.lyric-line');
  return {
    bgVar: cs.getPropertyValue('--hymn-bg').trim(),
    inkVar: cs.getPropertyValue('--hymn-ink').trim(),
    fontSizeVar: cs.getPropertyValue('--hymn-font-size').trim(),
    paneBg: pcs ? pcs.backgroundColor : null,
    paneInk: pcs ? pcs.color : null,
    lineFont: line ? getComputedStyle(line).fontSize : null,
    title: (document.querySelector('#preview-title') || {}).textContent || null,
    projectBtn: (document.querySelector('#btn-project') || {}).textContent || null
  };
})()"""

READ_PROJ = """(() => {
  const cs = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const indic = document.querySelector('#indicator, .indicator, [class*=indicator]');
  const lines = Array.from(document.querySelectorAll('.lyric-line')).map(x => x.textContent.trim());
  const firstVerse = document.querySelector('.lyric-verse');
  const lh = document.querySelector('.lyric-line');
  return {
    bgVar: cs.getPropertyValue('--hymn-bg').trim(),
    inkVar: cs.getPropertyValue('--hymn-ink').trim(),
    fontSizeVar: cs.getPropertyValue('--hymn-font-size').trim(),
    bodyBg: body.backgroundColor,
    bodyColor: body.color,
    lineFont: lh ? getComputedStyle(lh).fontSize : null,
    lineHeight: lh ? getComputedStyle(lh).lineHeight : null,
    indicator: indic ? indic.textContent.trim() : null,
    bodyText: document.body.innerText.replace(/\\n{2,}/g, '\\n').trim().slice(0, 220),
    lineCount: lines.length,
    firstLines: lines.slice(0, 3)
  };
})()"""


def open_projection(p):
    return p.js("""(() => {
      const b = document.querySelector('#btn-project');
      if (!b) return {err: 'no btn'};
      b.click();
      return true;
    })()""")


def main():
    ts = targets()
    main_page = next(t for t in ts if "control" in t.get("url", ""))
    p = Page(main_page["webSocketDebuggerUrl"])

    p.js(MAIN_SETUP)
    time.sleep(0.5)
    p.js(PICK_1)
    time.sleep(0.5)
    p.js(CLICK_ROW)
    time.sleep(0.8)
    main_before = p.js(READ_MAIN)

    opened = open_projection(p)
    time.sleep(2.0)

    ts2 = targets()
    proj_page = next((t for t in ts2 if "projection" in t.get("url", "")), None)
    if not proj_page:
        print(json.dumps({"error": "投屏窗口未创建", "open": opened,
                          "urls": [t.get("url") for t in ts2]}, ensure_ascii=False, indent=1))
        return
    pj = Page(proj_page["webSocketDebuggerUrl"])
    proj = pj.js(READ_PROJ)

    # 翻页
    pj.js("""(() => { document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown',bubbles:true})); return true })()""")
    time.sleep(0.6)
    proj_after = pj.js(READ_PROJ)

    print(json.dumps({
        "主窗口": main_before,
        "投屏初始": proj,
        "投屏PgDn后": {"indicator": proj_after.get("indicator"),
                    "firstLines": proj_after.get("firstLines")},
        "一致性": {
            "bg相同": main_before.get("bgVar") == proj.get("bgVar"),
            "ink相同": main_before.get("inkVar") == proj.get("inkVar"),
            "fontSize相同": main_before.get("fontSizeVar") == proj.get("fontSizeVar"),
            "实际渲染bg": proj.get("bodyBg"),
            "主窗paneBg": main_before.get("paneBg"),
        },
    }, ensure_ascii=False, indent=1))
    p.ws.close()
    pj.ws.close()


if __name__ == "__main__":
    main()
