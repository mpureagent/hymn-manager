#!/usr/bin/env python3
"""PM 独立验收 T5 第二部分：同步（改样式/切歌）与关闭联动。"""
import json
import time

from pm_verify_ui import Page, targets


def pages():
    ts = targets()
    m = next((t for t in ts if "control" in t.get("url", "")), None)
    p = next((t for t in ts if "projection" in t.get("url", "")), None)
    return m, p


def main():
    m, pj = pages()
    out = {}
    if not pj:
        print(json.dumps({"error": "投屏窗口不在"}, ensure_ascii=False))
        return
    main = Page(m["webSocketDebuggerUrl"])
    proj = Page(pj["webSocketDebuggerUrl"])

    # 1) 主窗口改样式 → 投屏是否即时跟随
    main.js("""(() => {
      const btns=[...document.querySelectorAll('button')];
      const d=btns.find(b=>b.textContent.includes('深底浅字'));
      if(d){d.click();return 'preset';}
      return 'no preset btn';
    })()""")
    time.sleep(1.0)
    out["改样式后投屏"] = proj.js("""(()=>{
      const cs=getComputedStyle(document.documentElement);
      const b=getComputedStyle(document.body);
      return {bgVar:cs.getPropertyValue('--hymn-bg').trim(),
              inkVar:cs.getPropertyValue('--hymn-ink').trim(),
              bodyBg:b.backgroundColor, bodyColor:b.color};
    })()""")
    out["改样式后主窗"] = main.js("""(()=>{
      const cs=getComputedStyle(document.documentElement);
      const pane=document.querySelector('.preview-pane');
      return {bgVar:cs.getPropertyValue('--hymn-bg').trim(),
              inkVar:cs.getPropertyValue('--hymn-ink').trim(),
              paneBg:pane?getComputedStyle(pane).backgroundColor:null};
    })()""")

    # 2) 主窗口切到第2首 → 投屏是否跟随、页码是否重置
    main.js("""(()=>{const i=document.querySelector('#search-input');i.value='2';
      i.dispatchEvent(new Event('input',{bubbles:true}));return true})()""")
    time.sleep(0.6)
    main.js("""(()=>{const r=document.querySelector('.hymn-row');if(r)r.click();return true})()""")
    time.sleep(1.2)
    out["切歌后投屏"] = proj.js("""(()=>{
      const ind=document.querySelector('#indicator,.indicator,[class*=indicator]');
      const lines=[...document.querySelectorAll('.lyric-line')].map(x=>x.textContent.trim());
      return {indicator:ind?ind.textContent.trim():null, first:lines[0]||null, lineCount:lines.length};
    })()""")
    out["切歌后主窗标题"] = main.js("(document.querySelector('#preview-title')||{}).textContent||null")

    # 3) 关闭联动：关闭主窗口能否带走投屏
    out["关闭前窗口数"] = len([t for t in targets() if t.get("type") == "page"])

    print(json.dumps(out, ensure_ascii=False, indent=1))
    main.ws.close()
    proj.ws.close()


if __name__ == "__main__":
    main()
