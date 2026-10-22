#!/usr/bin/env python3
"""并发版 j51 歌曲页抓取（可续抓）。比串行版快 5-8 倍。

用法: python3 crawl_songs_par.py <start> <end> <out.jsonl> [workers] [delay]
"""
import json, os, re, sys, time, html
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

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
    pre = re.search(r'<div id="lyricshow"[^>]*>\s*<pre>(.*?)</pre>', h, re.S) or \
          re.search(r"<pre>(.*?)</pre>", h, re.S)
    lrc = html.unescape(pre.group(1)) if pre else ""
    return {"title": title, "album": album, "lrc": lrc.strip()}


def one(sid, delay):
    time.sleep(delay)
    try:
        rec = parse_page(fetch(f"https://www.j51.net/song/{sid}.html"))
    except Exception as e:
        rec = {"title": "", "album": "", "lrc": "", "error": str(e)[:80]}
    rec["id"] = sid
    return rec


def main():
    start, end = int(sys.argv[1]), int(sys.argv[2])
    out = sys.argv[3]
    workers = int(sys.argv[4]) if len(sys.argv) > 4 else 6
    delay = float(sys.argv[5]) if len(sys.argv) > 5 else 0.1
    done = set()
    if os.path.exists(out):
        for line in open(out, encoding="utf-8"):
            try:
                done.add(json.loads(line)["id"])
            except Exception:
                pass
    todo = [i for i in range(start, end + 1) if i not in done]
    print(f"todo {len(todo)} (done {len(done)})", flush=True)
    f = open(out, "a", encoding="utf-8")
    n = miss = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(one, sid, delay) for sid in todo]
        for fu in as_completed(futs):
            rec = fu.result()
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            f.flush()
            n += 1
            if not rec.get("lrc"):
                miss += 1
            if n % 100 == 0:
                print(f"{n}/{len(todo)} no-lrc={miss}", flush=True)
    f.close()
    print("FINISHED", start, end, "fetched", n, "no-lrc", miss, flush=True)


if __name__ == "__main__":
    main()
