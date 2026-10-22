#!/usr/bin/env python3
"""PM 验收 T2：在真实窗口里逐项驱动搜索，记录事实。

用法: python3 tools/pm_verify_search.py
前置：应用已以 --remote-debugging-port=9222 启动（xvfb）。
"""
import json
import sys
import time

from pm_verify_ui import Page, targets

# 在页面里设值并等结果稳定的通用步骤
SET = """(() => {
  const q = document.querySelector('#search-input');
  const s = document.querySelector('#book-select');
  return {q: !!q, s: !!s};
})()"""


def type_query(p, text, wait=0.45):
    p.js(f"""(() => {{
      const q = document.querySelector('#search-input');
      q.value = {json.dumps(text)};
      q.dispatchEvent(new Event('input', {{bubbles: true}}));
      return true;
    }})()""")
    time.sleep(wait)


def snapshot(p):
    return p.js("""(() => {
      const rows = Array.from(document.querySelectorAll('.hymn-row'));
      const count = (document.body.innerText.match(/(共|找到)\\s*\\d+\\s*首/) || [null])[0];
      const empty = (document.body.innerText.match(/没有找到[^\\n]*/) || [null])[0];
      return {
        count,
        empty,
        domRows: rows.length,
        first: rows[0] ? rows[0].textContent.replace(/\\s+/g, ' ').trim() : null,
        firstKind: rows[0] ? (rows[0].getAttribute('data-kind') ||
          (rows[0].querySelector('[class*=kind],[class*=tag]') || {}).textContent || null) : null,
        firstHasMark: rows[0] ? !!rows[0].querySelector('mark') : null,
        firstMarkText: rows[0] && rows[0].querySelector('mark') ? rows[0].querySelector('mark').textContent : null,
        names: rows.slice(0, 4).map(r => r.textContent.replace(/\\s+/g, ' ').trim())
      };
    })()""")


def switch_book(p, book_id, wait=0.6):
    p.js(f"""(() => {{
      const s = document.querySelector('#book-select');
      s.value = {json.dumps(book_id)};
      s.dispatchEvent(new Event('change', {{bubbles: true}}));
      return true;
    }})()""")
    time.sleep(wait)


def main():
    ts = targets()
    page = next(t for t in ts if "control" in t.get("url", ""))
    p = Page(page["webSocketDebuggerUrl"])
    out = {}

    switch_book(p, "red_book")
    for q in ["1", "圣哉", "全能大主宰", "圣哉三一歌", "祢"]:
        type_query(p, q)
        out[f"红本 / {q}"] = snapshot(p)

    switch_book(p, "black_book_1218")
    for q in ["1", "全能大主宰", "圣哉"]:
        type_query(p, q)
        out[f"千首本 / {q}"] = snapshot(p)

    # 空查询回全目录
    type_query(p, "")
    out["空查询"] = snapshot(p)

    # 大结果集时虚拟滚动仍生效
    type_query(p, "主")
    out["千首本 / 主（大结果集）"] = snapshot(p)

    print(json.dumps(out, ensure_ascii=False, indent=1))
    p.ws.close()


if __name__ == "__main__":
    main()
