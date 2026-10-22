#!/usr/bin/env python3
"""PM 验收 T4：样式面板、字号 120、深底预设、持久化、DOM 不重建。

用法: python3 tools/pm_verify_t4.py
"""
import json
import time

from pm_verify_ui import Page, targets


def main():
    ts = targets()
    page = next(t for t in ts if "control" in t.get("url", ""))
    p = Page(page["webSocketDebuggerUrl"])
    out = {}

    # 打开一首歌，便于看歌词
    p.js("""(()=>{const s=document.querySelector('#book-select');s.value='red_book';
      s.dispatchEvent(new Event('change'));return true})()""")
    time.sleep(0.5)
    p.js("""(()=>{const i=document.querySelector('#search-input');i.value='1';
      i.dispatchEvent(new Event('input',{bubbles:true}));return true})()""")
    time.sleep(0.5)
    p.js("""(()=>{const r=document.querySelector('.hymn-row');r.click();return true})()""")
    time.sleep(0.6)

    out["初始"] = p.js("""(()=>{
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      const body = document.querySelector('.lyrics-body');
      return {
        vars: ['--hymn-font-size','--hymn-line-height','--hymn-bg','--hymn-ink']
          .reduce((a,k)=>(a[k]=cs.getPropertyValue(k).trim(),a),{}),
        lyricsBg: body?getComputedStyle(body).backgroundColor:null,
        docOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    })()""")

    # 标记 DOM 节点，用于验证改样式不重建
    p.js("""(()=>{const el=document.querySelector('.lyric-line');
      window.__pmMarker = el; el.setAttribute('data-pm-mark','1'); return true})()""")

    # 打开样式面板
    out["面板"] = p.js("""(()=>{
      const btn=document.querySelector('#btn-style');
      if(!btn) return {err:'no #btn-style'};
      const disabled=btn.disabled; btn.click();
      return new Promise(r=>setTimeout(()=>{
        const panel=document.querySelector('#style-panel,.style-panel,[class*=style-drawer]');
        r({wasDisabled:disabled, opened:!!panel,
           fields: panel?Array.from(panel.querySelectorAll('input,select,button')).map(x=>({
             tag:x.tagName, type:x.type||'', id:x.id||'', label:(x.textContent||'').trim().slice(0,10)
           })).slice(0,18):null});
      },400));
    })()""")

    # 字号 120
    out["字号120"] = p.js("""(()=>{
      const num=document.querySelector('#style-panel input[type=number],.style-panel input[type=number],input[type=number]');
      if(!num) return {err:'no number input'};
      num.value='120'; num.dispatchEvent(new Event('input',{bubbles:true}));
      num.dispatchEvent(new Event('change',{bubbles:true}));
      return new Promise(r=>setTimeout(()=>{
        const root=document.documentElement; const cs=getComputedStyle(root);
        const body=document.querySelector('.lyrics-body');
        const line=document.querySelector('.lyric-line');
        r({fontSizeVar:cs.getPropertyValue('--hymn-font-size').trim(),
           lineFont: line?getComputedStyle(line).fontSize:null,
           lineHeight: line?getComputedStyle(line).lineHeight:null,
           overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
           bodyScrollW: body?body.scrollWidth:null, bodyClientW: body?body.clientWidth:null,
           sameNode: line && line.hasAttribute('data-pm-mark')});
      },500));
    })()""")

    # 深底浅字预设
    out["深底预设"] = p.js("""(()=>{
      const btns=Array.from(document.querySelectorAll('#style-panel button,.style-panel button,button'));
      const dark=btns.find(b=>b.textContent.includes('深底浅字'));
      if(!dark) return {err:'no dark preset button', buttons:btns.map(b=>b.textContent.trim()).slice(0,15)};
      dark.click();
      return new Promise(r=>setTimeout(()=>{
        const cs=getComputedStyle(document.documentElement);
        const body=document.querySelector('.lyrics-body');
        r({bgVar:cs.getPropertyValue('--hymn-bg').trim(),
           inkVar:cs.getPropertyValue('--hymn-ink').trim(),
           bodyBg: body?getComputedStyle(body).backgroundColor:null,
           bodyColor: body?getComputedStyle(body).color:null});
      },500));
    })()""")

    print(json.dumps(out, ensure_ascii=False, indent=1))
    p.ws.close()


if __name__ == "__main__":
    main()
