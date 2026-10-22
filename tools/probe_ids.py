#!/usr/bin/env python3
"""探测 j51.net 歌曲 id 与诗歌本编号的对应关系。

用法: python3 probe_ids.py <start> <end> <step>
"""
import re, sys, time, urllib.request, html

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="ignore")


def parse(song_id):
    """返回 (title, first_lrc_line, album) 或 None。"""
    try:
        h = fetch(f"https://www.j51.net/song/{song_id}.html")
    except Exception as e:
        return ("ERR", str(e)[:60], "")
    m = re.search(r"<title>([^<]*)</title>", h)
    title = html.unescape(m.group(1)).split(" - ")[0].strip() if m else ""
    alb = re.search(r'专辑《([^》]+)》', h)
    pre = re.search(r'<pre>(.*?)</pre>', h, re.S)
    first = ""
    if pre:
        lines = [l for l in pre.group(1).split("\n") if l.strip()]
        first = lines[0].strip() if lines else ""
    return (title, first, alb.group(1) if alb else "")


if __name__ == "__main__":
    start, end, step = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
    for sid in range(start, end + 1, step):
        t = parse(sid)
        print(sid, "|", " | ".join(t), flush=True)
        time.sleep(0.2)
