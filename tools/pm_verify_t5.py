#!/usr/bin/env python3
"""PM 验收 T5：投屏窗口、样式复用、按段分页、切歌/改样式同步、Esc 关闭。

前置：应用以 --remote-debugging-port=9222 启动（xvfb 虚拟屏）。
用法: python3 tools/pm_verify_t5.py
"""
import json
import time
import urllib.request

from pm_verify_ui import Page, targets

PROJECTION_STYLE = r"""
(() => {
  const root = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const line = document.querySelector('.lyric-line');
  const indicator = document.querySelector('#indicator');
  return {
    bgVar: root.getPropertyValue('--hymn-bg').trim(),
    inkVar: root.getPropertyValue('--hymn-ink').trim(),
    fontSizeVar: root.getPropertyValue('--hymn-font-size').trim(),
    lineHeightVar: root.getPropertyValue('--hymn-line-height').trim(),
    bodyBg: body.backgroundColor,
    bodyColor: body.color,
    lineFont: line ? getComputedStyle(line).fontSize : null,
    lineColor: line ? getComputedStyle(line).color : null,
    lineHeight: line ? getComputedStyle(line).lineHeight : null,
    page: indicator && !indicator.hidden ? indicator.textContent.trim() : null,
    controlPage: document.querySelector('#control-page')?.textContent.trim() ?? null,
    lines: Array.from(document.querySelectorAll('.lyric-line')).map((node) => node.textContent),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()
"""


def projection_target():
    for target in targets():
        if 'projection' in target.get('url', ''):
            return target
    return None


def wait_projection(label='投影', timeout=8):
    deadline = time.time() + timeout
    while time.time() < deadline:
        target = projection_target()
        if target:
            page = Page(target['webSocketDebuggerUrl'])
            value = page.js("document.querySelectorAll('.lyric-line').length")
            if value:
                return page
            page.ws.close()
        time.sleep(0.3)
    raise SystemExit(f'{label}：投屏窗口未出现或没有歌词')


def wait_js(page, expression, label='等待条件', timeout=6):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if page.js(expression):
            return True
        time.sleep(0.1)
    raise SystemExit(f'{label}：超时')


def target_urls():
    try:
        with urllib.request.urlopen('http://127.0.0.1:9222/json/list', timeout=1) as response:
            return [target.get('url', '') for target in json.loads(response.read())]
    except Exception:
        return []


def wait_all_closed(timeout=8):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not target_urls():
            return True
        time.sleep(0.3)
    return False


def wait_closed(timeout=6):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if projection_target() is None:
            return True
        time.sleep(0.3)
    return False


def main():
    control = next(t for t in targets() if 'control' in t.get('url', ''))
    page = Page(control['webSocketDebuggerUrl'])
    out = {}

    # 0. 清理上次运行残留：关闭投屏并重载控制页，回到「未选中」状态
    if projection_target() is not None:
        page.js("document.querySelector('#btn-project').click()")
        wait_closed()
    page.js("location.reload()")
    time.sleep(2)
    wait_js(
        page,
        "document.querySelector('#btn-project') && !document.querySelector('#btn-project').disabled",
        '控制页就绪',
    )

    # 1. 未选中诗歌时点投屏 → 提示
    out['无选中提示'] = page.js(r"""
    (() => {
      const btn = document.querySelector('#btn-project');
      const before = { disabled: btn.disabled, text: btn.textContent.trim() };
      btn.click();
      return new Promise((resolve) => setTimeout(() => {
        const toast = document.querySelector('#toast');
        resolve({ ...before, toast: toast && !toast.hidden ? toast.textContent.trim() : null });
      }, 500));
    })()
    """)

    # 1. 选红本第 1 首（4 段）
    page.js(r"""
    (() => {
      const select = document.querySelector('#book-select');
      select.value = 'red_book';
      select.dispatchEvent(new Event('change'));
      const input = document.querySelector('#search-input');
      input.value = '1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
    """)
    wait_js(page, "document.querySelector('#list-heading').textContent.trim() === '检索结果' && document.querySelector('.hymn-row')?.dataset.number === '1'", '搜索第1首')
    page.js("document.querySelector('.hymn-row').click()")
    wait_js(page, "!document.querySelector('#preview-panel').hidden", '预览第1首')
    time.sleep(0.3)
    out['主窗当前首'] = page.js(r"""
    (() => ({
      eyebrow: document.querySelector('#preview-eyebrow').textContent.trim(),
      title: document.querySelector('#preview-title').textContent.trim(),
      verseCount: document.querySelectorAll('.lyric-verse').length
    }))()
    """)

    # 2. 打开投屏
    page.js("document.querySelector('#btn-project').click()")
    projection = wait_projection('初次打开')
    time.sleep(0.4)
    out['投屏初始'] = projection.js(PROJECTION_STYLE)
    # 投屏页重载后主动 pull，验证不会空白
    projection.js("location.reload()")
    wait_js(projection, "document.querySelectorAll('.lyric-line').length > 0", '投屏重载拉取')
    out['投屏重载拉取'] = projection.js(PROJECTION_STYLE)

    out['投屏按钮'] = page.js(r"""
    (() => {
      const btn = document.querySelector('#btn-project');
      return { text: btn.textContent.trim(), active: btn.classList.contains('active'),
               pressed: btn.getAttribute('aria-pressed'),
               toast: document.querySelector('#toast').hidden ? null : document.querySelector('#toast').textContent.trim() };
    })()
    """)

    # 3. PgDn 翻页（合成键盘事件，与真实按键走同一个 keydown 处理器）
    projection.js(r"""
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }))
    """)
    time.sleep(0.25)
    out['PgDn后'] = projection.js(PROJECTION_STYLE)
    projection.js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))")
    time.sleep(0.2)
    arrow_up = projection.js(PROJECTION_STYLE)['page']
    projection.js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))")
    time.sleep(0.2)
    out['方向键翻页'] = {'ArrowUp': arrow_up, 'ArrowDown': projection.js(PROJECTION_STYLE)['page']}

    # 控制条：鼠标移动浮出，3 秒后自动隐藏
    projection.js("window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))")
    time.sleep(0.2)
    out['控制条'] = projection.js("""(() => {
      const controls = document.querySelector('#controls');
      return {
        visible: controls.classList.contains('visible'),
        buttons: Array.from(controls.querySelectorAll('button')).map((b) => b.textContent.trim()),
        page: document.querySelector('#control-page').textContent.trim()
      };
    })()""")
    time.sleep(3.2)
    out['控制条3秒后'] = projection.js(
        "document.querySelector('#controls').classList.contains('visible')"
    )

    # 4. 主窗口切到第 2 首 → 投屏跟随
    page.js(r"""
    (() => {
      const input = document.querySelector('#search-input');
      input.value = '2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
    """)
    wait_js(page, "document.querySelector('#list-heading').textContent.trim() === '检索结果' && document.querySelector('.hymn-row')?.dataset.number === '2'", '搜索第2首')
    page.js("document.querySelector('.hymn-row').click()")
    wait_js(page, "!document.querySelector('#preview-panel').hidden", '预览第2首')
    time.sleep(0.5)
    out['切歌后投屏'] = projection.js(PROJECTION_STYLE)
    out['切歌后主窗'] = page.js("document.querySelector('#preview-title').textContent.trim()")

    # 4b. 投屏控制条「下一首/上一首」→ 投屏与主窗预览同时跟随
    projection.js("document.querySelector('[data-action=next-hymn]').click()")
    time.sleep(0.7)
    out['投屏下一首'] = {
        'firstLine': projection.js("document.querySelector('.lyric-line')?.textContent"),
        'page': projection.js("document.querySelector('#indicator')?.textContent.trim()"),
        'controlTitle': page.js("document.querySelector('#preview-title').textContent.trim()"),
    }
    projection.js("document.querySelector('[data-action=prev-hymn]').click()")
    time.sleep(0.7)
    out['投屏上一首'] = {
        'firstLine': projection.js("document.querySelector('.lyric-line')?.textContent"),
        'page': projection.js("document.querySelector('#indicator')?.textContent.trim()"),
        'controlTitle': page.js("document.querySelector('#preview-title').textContent.trim()"),
    }

    # 5. 主窗口改样式（深底浅字 + 字号 64）→ 投屏即时变化
    page.js("document.querySelector('#btn-style').click()")
    time.sleep(0.4)
    page.js(r"""
    (() => {
      const dark = Array.from(document.querySelectorAll('.style-panel button'))
        .find((button) => button.textContent.includes('深底浅字'));
      if (dark) dark.click();
      const number = document.querySelector('.style-panel input[type=number]');
      number.value = '64';
      number.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
    """)
    time.sleep(0.8)
    out['改样式后投屏'] = projection.js(PROJECTION_STYLE)
    out['改样式后主窗'] = page.js(r"""
    (() => {
      const line = document.querySelector('.lyric-line');
      return {
        bg: getComputedStyle(document.documentElement).getPropertyValue('--hymn-bg').trim(),
        ink: getComputedStyle(document.documentElement).getPropertyValue('--hymn-ink').trim(),
        fontSize: line ? getComputedStyle(line).fontSize : null
      };
    })()
    """)
    # 关闭样式面板，避免遮挡
    page.js("document.querySelector('.style-close').click()")

    # 6. 按钮 toggle 关闭
    page.js("document.querySelector('#btn-project').click()")
    out['toggle关闭'] = wait_closed()
    out['关闭后按钮'] = page.js(r"""
    (() => {
      const btn = document.querySelector('#btn-project');
      return { text: btn.textContent.trim(), active: btn.classList.contains('active'),
               pressed: btn.getAttribute('aria-pressed') };
    })()
    """)

    # 7. F5 重新打开 → 投屏内 Esc 关闭 → 按钮恢复
    page.js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }))")
    projection = wait_projection('F5 重新打开')
    time.sleep(0.3)
    projection.js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    out['Esc关闭'] = wait_closed()
    out['Esc后按钮'] = page.js("document.querySelector('#btn-project').textContent.trim()")

    # 8. 重新投屏后关闭主窗口 → 投屏窗口一并关闭，无残留
    page.js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }))")
    projection = wait_projection('关闭主窗前重新投屏')
    time.sleep(0.3)
    try:
        page.js("window.close()")
    except Exception:
        pass
    out['主窗关闭联动'] = wait_all_closed()

    print(json.dumps(out, ensure_ascii=False, indent=1))
    page.ws.close()
    projection.ws.close()


if __name__ == '__main__':
    main()