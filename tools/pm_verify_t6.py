#!/usr/bin/env python3
"""PM 验收 T6：曲谱视图（图片加载、缩放、平移、缺数据、曲谱投屏）。

用法: python3 tools/pm_verify_t6.py
"""
import json
import os
import time

from pm_verify_ui import Page, targets


def main():
    ts = targets()
    m = next((t for t in ts if "control" in t.get("url", "")), None)
    if not m:
        print(json.dumps({"error": "主窗口未找到"}, ensure_ascii=False))
        return
    p = Page(m["webSocketDebuggerUrl"])
    out = {}

    def pick(book, number):
        p.js(f"""(()=>{{const s=document.querySelector('#book-select');s.value='{book}';
          s.dispatchEvent(new Event('change'));return true}})()""")
        time.sleep(0.5)
        p.js(f"""(()=>{{const i=document.querySelector('#search-input');i.value='{number}';
          i.dispatchEvent(new Event('input',{{bubbles:true}}));return true}})()""")
        time.sleep(0.5)
        p.js("""(()=>{const r=document.querySelector('.hymn-row');if(r)r.click();return true})()""")
        time.sleep(0.7)

    def click_tab(name):
        return p.js(f"""(()=>{{
          const tabs=[...document.querySelectorAll('button,[role=tab]')];
          const t=tabs.find(x=>x.textContent.trim()==='{name}');
          if(!t) return {{err:'no tab', labels:tabs.map(x=>x.textContent.trim()).slice(0,12)}};
          t.click(); return true;
        }})()""")

    # 1) 歌词 tab 下不应加载图片
    pick("red_book", 1)
    out["歌词tab时的img"] = p.js("""(()=>{
      const img=document.querySelector('.score-img, img[src*=scores]');
      return {src: img?img.getAttribute('src'):null, exists: !!img};
    })()""")

    # 2) 切到曲谱 tab，检查图片真实加载
    out["切曲谱tab"] = click_tab("曲谱")
    time.sleep(1.2)
    out["曲谱图片"] = p.js("""(()=>{
      const img=document.querySelector('.score-img, img[src*=scores]');
      if(!img) return {err:'no img'};
      const r=img.getBoundingClientRect();
      return {
        src: (img.getAttribute('src')||'').split('/').slice(-2).join('/'),
        naturalW: img.naturalWidth, naturalH: img.naturalHeight,
        complete: img.complete,
        displayW: Math.round(r.width), displayH: Math.round(r.height),
        zoomText: (document.querySelector('[class*=zoom],[class*=percent]')||{}).textContent||null
      };
    })()""")

    # 3) 放大到 200%：找 + 按钮点若干次
    zoom = p.js("""(()=>{
      const btns=[...document.querySelectorAll('button')];
      const plus=btns.find(b=>b.textContent.trim()==='+');
      if(!plus) return {err:'no + button', labels:btns.map(b=>b.textContent.trim()).slice(0,20)};
      for(let i=0;i<20;i++) plus.click();
      return 'clicked 20x';
    })()""")
    time.sleep(0.8)
    out["放大"] = p.js("""(()=>{
      const img=document.querySelector('.score-img, img[src*=scores]');
      const r=img?img.getBoundingClientRect():null;
      const zt=(document.querySelector('[class*=zoom],[class*=percent]')||{}).textContent||null;
      const sc=img?img.parentElement:null;
      return {zoomText:zt, displayW:r?Math.round(r.width):null,
              scrollLeft: sc?sc.scrollLeft:null, scrollTop: sc?sc.scrollTop:null,
              scrollW: sc?sc.scrollWidth:null, clientW: sc?sc.clientWidth:null};
    })()""")
    out["放大操作"] = zoom

    # 4) 切歌后缩放是否回到适应
    pick("red_book", 2)
    time.sleep(0.5)
    out["切歌后缩放"] = p.js("""(()=>{
      const zt=(document.querySelector('[class*=zoom],[class*=percent]')||{}).textContent||null;
      const img=document.querySelector('.score-img, img[src*=scores]');
      const r=img?img.getBoundingClientRect():null;
      return {zoomText:zt, displayH:r?Math.round(r.height):null,
              src:(img?(img.getAttribute('src')||''):'').split('/').pop()};
    })()""")

    # 5) 无歌词但有曲谱的条目（红本1001）
    pick("red_book", 1001)
    time.sleep(0.6)
    out["红本1001"] = p.js("""(()=>{
      const img=document.querySelector('.score-img, img[src*=scores]');
      const body=document.querySelector('.lyrics-body, .score-body');
      return {imgSrc:(img?(img.getAttribute('src')||''):'').split('/').pop(),
              naturalW:img?img.naturalWidth:null,
              pageText:(body?body.innerText:document.body.innerText).slice(0,150)};
    })()""")

    print(json.dumps(out, ensure_ascii=False, indent=1))
    p.ws.close()


if __name__ == "__main__":
    main()
