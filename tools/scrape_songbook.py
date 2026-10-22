#!/usr/bin/env python3
"""抓 j51.net 诗歌本目录：编号 + 标题。

用法: python3 scrape_songbook.py <songbook-slug> <pages> <out.json>
例:  python3 scrape_songbook.py hymns-bk 9 .raw/1218_index.json
"""
import json, re, sys, time, urllib.request, html, os

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="ignore")


def main():
    slug, pages, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    rows = {}
    for p in range(1, pages + 1):
        url = f"https://www.j51.net/songbook/{slug}.html" + (f"?page={p}" if p > 1 else "")
        try:
            h = fetch(url)
        except Exception as e:
            print("FAIL", url, e, flush=True)
            continue
        # 第12首 <a href="/tab/123.html?songbook=1&index=12" ... title="查看歌谱XXX">XXX</a>
        found = re.findall(
            r'第(\d+)首\s*<a[^>]+href="(/tab/\d+\.html[^"]*)"[^>]*title="查看歌谱([^"]*)"[^>]*>([^<]*)</a>',
            h,
        )
        for num, href, t_attr, t_txt in found:
            n = int(num)
            title = html.unescape(t_attr or t_txt).strip()
            rows[n] = {"number": n, "title": title, "tab": href}
        print(f"page {p}: {len(found)} rows, total {len(rows)}", flush=True)
        time.sleep(0.4)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    nums = sorted(rows)
    seq = [r["number"] for r in rows.values()]
    missing = [i for i in range(1, (max(seq) if seq else 0) + 1) if i not in rows]
    json.dump({"book": slug, "count": len(rows), "missing_numbers": missing,
               "items": [rows[n] for n in nums]}, open(out, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("saved", out, "count", len(rows), "missing", len(missing), missing[:20], flush=True)


if __name__ == "__main__":
    main()
