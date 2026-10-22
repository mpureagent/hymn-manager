#!/usr/bin/env python3
"""抓取 j51 歌谱图片（简谱扫描图）。

两阶段：先取 tab 页解析图片 URL，再下载图片。可续抓（manifest 里已有的跳过）。

用法:
  python3 crawl_scores.py <book> <index.json> <outdir> [start] [end] [workers]
  book: red | black
"""
import json, os, re, sys, time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
BASE = "https://www.j51.net"


def fetch(url, timeout=30, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", errors="ignore")


def score_urls(tab):
    url = BASE + tab if tab.startswith("/") else tab
    h = fetch(url)
    imgs = re.findall(
        r'(?:data-original|data-src|src)="(https://file\.izanm\.org/store/[^"]+\.(?:jpg|jpeg|png|webp))"', h)
    seen, out = set(), []
    for i in imgs:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def one(book, item, outdir, delay):
    time.sleep(delay)
    num = item["number"]
    ext_dir = os.path.join(outdir, book)
    files = []
    try:
        urls = score_urls(item["tab"])
    except Exception as e:
        return {"number": num, "title": item["title"], "error": f"tab:{str(e)[:60]}", "files": []}
    for idx, u in enumerate(urls):
        ext = os.path.splitext(u.split("?")[0])[1].lower() or ".jpg"
        name = f"{num:04d}_{idx}{ext}"
        path = os.path.join(ext_dir, name)
        if os.path.exists(path) and os.path.getsize(path) > 1024:
            files.append(name)
            continue
        try:
            data = fetch(u, binary=True)
            if len(data) < 1024:
                continue
            with open(path, "wb") as f:
                f.write(data)
            files.append(name)
        except Exception as e:
            return {"number": num, "title": item["title"], "error": f"img:{str(e)[:60]}", "files": files}
    return {"number": num, "title": item["title"], "files": files}


def main():
    book, index_json, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    items = json.load(open(index_json))["items"]
    start = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    end = int(sys.argv[5]) if len(sys.argv) > 5 else 10 ** 9
    workers = int(sys.argv[6]) if len(sys.argv) > 6 else 6
    os.makedirs(os.path.join(outdir, book), exist_ok=True)
    manifest_path = os.path.join(outdir, f"{book}_manifest.json")
    manifest = {}
    if os.path.exists(manifest_path):
        manifest = json.load(open(manifest_path))
    todo = [i for i in items if start <= i["number"] <= end and
            not (manifest.get(str(i["number"]), {}).get("files"))]
    print(f"{book}: total {len(items)}, todo {len(todo)}, workers {workers}", flush=True)
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(one, book, it, outdir, 0.15) for it in todo]
        for fu in as_completed(futs):
            r = fu.result()
            manifest[str(r["number"])] = r
            done += 1
            if done % 25 == 0:
                json.dump(manifest, open(manifest_path, "w", encoding="utf-8"),
                          ensure_ascii=False, indent=1)
                ok = sum(1 for v in manifest.values() if v.get("files"))
                print(f"{done}/{len(todo)} ok={ok}", flush=True)
    json.dump(manifest, open(manifest_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ok = sum(1 for v in manifest.values() if v.get("files"))
    bad = [k for k, v in manifest.items() if not v.get("files")]
    print(f"FINISHED {book}: with-score {ok}/{len(manifest)}, no-score {len(bad)}: {bad[:20]}", flush=True)


if __name__ == "__main__":
    main()
