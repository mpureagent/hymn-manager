#!/usr/bin/env python3
"""探测 j51 歌谱页面：是否存在歌谱图片、尺寸、URL。

用法: python3 probe_scores.py <index.json> <limit>
"""
import json, re, sys, urllib.request, html
from concurrent.futures import ThreadPoolExecutor

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def fetch(url, timeout=25, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", errors="ignore")


def probe(item):
    tab = item["tab"]
    url = "https://www.j51.net" + tab if tab.startswith("/") else tab
    try:
        h = fetch(url)
    except Exception as e:
        return {"number": item["number"], "title": item["title"], "err": str(e)[:50]}
    imgs = re.findall(r'(?:data-original|data-src|src)="(https://file\.izanm\.org/[^"]+\.(?:jpg|jpeg|png|webp))"', h)
    imgs = [i for i in imgs if "/store/" in i]
    return {"number": item["number"], "title": item["title"], "tab": url, "score": imgs[0] if imgs else None,
            "n_imgs": len(imgs)}


if __name__ == "__main__":
    idx = json.load(open(sys.argv[1]))["items"]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    sample = idx[:limit]
    with ThreadPoolExecutor(max_workers=5) as ex:
        for r in ex.map(probe, sample):
            print(json.dumps(r, ensure_ascii=False))
