#!/usr/bin/env python3
"""按 id 区间抓 j51.net 歌曲页：标题、专辑、LRC 歌词。

可断点续抓：已存在于 jsonl 的 id 会跳过。

用法: python3 crawl_songs.py <start> <end> <out.jsonl> [delay]
"""
import json, os, re, sys, time, urllib.request, html

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="ignore")


def parse_page(h):
    m = re.search(r"<title>([^<]*)</title>", h)
    title = html.unescape(m.group(1)).split(" - ")[0].strip() if m else ""
    alb = re.search(r"专辑《([^》]+)》", h)
    album = html.unescape(alb.group(1)) if alb else ""
    pre = re.search(r'<div id="lyricshow"[^>]*>\s*<pre>(.*?)</pre>', h, re.S)
    lrc = html.unescape(pre.group(1)) if pre else ""
    if not lrc:
        pre = re.search(r"<pre>(.*?)</pre>", h, re.S)
        lrc = html.unescape(pre.group(1)) if pre else ""
    return {"title": title, "album": album, "lrc": lrc.strip()}


def main():
    start, end = int(sys.argv[1]), int(sys.argv[2])
    out = sys.argv[3]
    delay = float(sys.argv[4]) if len(sys.argv) > 4 else 0.25
    done = set()
    if os.path.exists(out):
        for line in open(out, encoding="utf-8"):
            try:
                done.add(json.loads(line)["id"])
            except Exception:
                pass
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    f = open(out, "a", encoding="utf-8")
    miss = 0
    for sid in range(start, end + 1):
        if sid in done:
            continue
        try:
            h = fetch(f"https://www.j51.net/song/{sid}.html")
            rec = parse_page(h)
        except Exception as e:
            rec = {"title": "", "album": "", "lrc": "", "error": str(e)[:80]}
        rec["id"] = sid
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        f.flush()
        if not rec.get("lrc"):
            miss += 1
        if sid % 50 == 0:
            print(f"{sid} done, no-lrc so far {miss}", flush=True)
        time.sleep(delay)
    f.close()
    print("FINISHED", start, end, "no-lrc", miss, flush=True)


if __name__ == "__main__":
    main()
