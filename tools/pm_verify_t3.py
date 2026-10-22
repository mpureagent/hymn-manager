#!/usr/bin/env python3
"""PM 验收 T3：歌词渲染 + 历史记录（真实窗口驱动）。

用法: python3 tools/pm_verify_t3.py
"""
import json
import time

from pm_verify_ui import Page, targets


def q(p, js):
    return p.js(js)


def main():
    ts = targets()
    page = next(t for t in ts if "control" in t.get("url", ""))
    p = Page(page["webSocketDebuggerUrl"])
    out = {}

    # 1) 选红本，搜 1，点开第1首
    q(p, """(()=>{const s=document.querySelector('#book-select');s.value='red_book';
      s.dispatchEvent(new Event('change'));return true})()""")
    time.sleep(0.5)
    q(p, """(()=>{const i=document.querySelector('#search-input');i.value='1';
      i.dispatchEvent(new Event('input',{bubbles:true}));return true})()""")
    time.sleep(0.5)
    q(p, """(()=>{const r=document.querySelector('.hymn-row');r.click();return true})()""")
    time.sleep(0.8)

    out["歌词视图"] = q(p, """(()=>{
      const prev = document.querySelector('#preview, .preview, #lyrics, .lyrics');
      const txt = (prev||document.body).innerText.replace(/\\n{2,}/g,'\\n').trim().slice(0,400);
      const firstLine = document.querySelector('#preview p, .lyrics p, .lyric-line');
      const cs = firstLine ? getComputedStyle(firstLine) : null;
      return {head: txt.split('\\n').slice(0,8), lineHeight: cs?cs.lineHeight:null,
              fontSize: cs?cs.fontSize:null, hasVerseLabel: /^1$|^\\d\\s/m.test(txt)};
    })()""")

    out["历史UI"] = q(p, """(()=>{
      const hist = document.querySelector('#history, .history, [class*=history]');
      const rows = hist ? Array.from(hist.querySelectorAll('li,button,.history-item')).map(x=>x.textContent.replace(/\\s+/g,' ').trim()).filter(Boolean) : [];
      return {exists: !!hist, items: rows.slice(0,6), text: hist?hist.innerText.replace(/\\n{2,}/g,'\\n').trim().slice(0,300):null};
    })()""")

    # 2) 无歌词条目
    q(p, """(()=>{const i=document.querySelector('#search-input');i.value='1001';
      i.dispatchEvent(new Event('input',{bubbles:true}));return true})()""")
    time.sleep(0.5)
    q(p, """(()=>{const r=document.querySelector('.hymn-row');if(r)r.click();return true})()""")
    time.sleep(0.6)
    out["无歌词条目"] = q(p, """(()=>{
      const prev = document.querySelector('#preview, .preview, #lyrics, .lyrics');
      return {text: (prev||document.body).innerText.replace(/\\n{2,}/g,'\\n').trim().slice(0,250)};
    })()""")

    # 3) 长歌词滚动后切歌，scrollTop 归零（容器是 .lyrics-body）
    q(p, """(()=>{const i=document.querySelector('#search-input');i.value='389';
      i.dispatchEvent(new Event('input',{bubbles:true}));return true})()""")
    time.sleep(0.5)
    q(p, """(()=>{const r=document.querySelector('.hymn-row');if(r)r.click();return true})()""")
    time.sleep(0.8)
    scroll_info = q(p, """(()=>{
      const sc = document.querySelector('.lyrics-body');
      if(!sc) return {err:'no .lyrics-body'};
      sc.scrollTop = 200;
      return {after: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight,
              scrollable: sc.scrollHeight > sc.clientHeight};
    })()""")
    out["长歌词滚动"] = scroll_info
    q(p, """(()=>{const i=document.querySelector('#search-input');i.value='1';
      i.dispatchEvent(new Event('input',{bubbles:true}));return true})()""")
    time.sleep(0.5)
    q(p, """(()=>{const r=document.querySelector('.hymn-row');if(r)r.click();return true})()""")
    time.sleep(0.8)
    out["切歌后scrollTop"] = q(p, "document.querySelector('.lyrics-body')?.scrollTop ?? 'no container'")

    # 4) 歌词行距与段号
    out["歌词排版"] = q(p, """(()=>{
      const body = document.querySelector('.lyrics-body');
      if(!body) return {err:'no body'};
      const line = body.querySelector('.lyric-line, p');
      const label = body.querySelector('.verse-label, [class*=label]');
      const cs = line ? getComputedStyle(line) : null;
      return {
        lineHeight: cs?cs.lineHeight:null, fontSize: cs?cs.fontSize:null,
        verseLabel: label?label.textContent.trim():null,
        verseLabelSize: label?getComputedStyle(label).fontSize:null,
        firstLines: Array.from(body.querySelectorAll('.lyric-line, p')).slice(0,4).map(x=>x.textContent.trim())
      };
    })()""")

    print(json.dumps(out, ensure_ascii=False, indent=1))
    p.ws.close()


if __name__ == "__main__":
    main()
