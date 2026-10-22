#!/usr/bin/env python3
"""把抓到的原始歌词整理成结构化数据。

输入:
  .raw/hallelujah/public/static/lrc/*.lrc  红本 400（GitHub）
  .raw/442_index.json                      红本目录（j51，442 = 400 + 短歌 1001-1042）
  .raw/j51_songs.jsonl                     1218 歌曲页抓取结果
  .raw/1218_index.json                     1218 目录（j51）

输出:
  .raw/books/red_book.json
  .raw/books/black_book_1218.json
"""
import json, os, re, sys, glob, unicodedata

RAW = os.path.join(os.path.dirname(__file__), "..", ".raw")
RAW = os.path.abspath(RAW)

TS = re.compile(r"^\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*")
JUNK = re.compile(
    r"(www\.|https?://|LRC制作|lrc制作|Lrc编辑|Lrc是|制作[:：]|"
    r"^专辑[:：]|^第?\s*\d{1,4}\s*[_．.、\-]|^第?\s*\d{1,4}\s*首.*$|"
    r"^《.*》$|制作$|歌词[:：]|^[\s\-—_=*~·。]*$)"
)


def norm(s: str) -> str:
    """标题归一化：全半角、去括号内容、去「歌」尾、去空白标点。"""
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"[（(][^)）]*[)）]", "", s)
    s = re.sub(r"[\s·・.,，。、!！?？:：;；'\"“”‘’\-—_/\\|]", "", s)
    return s.strip()


def clean_lines(lrc: str):
    out = []
    for raw in lrc.split("\n"):
        line = TS.sub("", raw).strip()
        if not line or JUNK.search(line):
            continue
        out.append(line)
    return out


def split_verses(lines):
    """按 '1.' '2.' 之类标记切段；无标记则整首为一段。"""
    verses, cur, label = [], None, ""
    for line in lines:
        m = re.match(r"^(\d{1,2})\s*[.．、]\s*(.*)$", line)
        if m:
            if cur:
                verses.append({"label": label, "lines": cur})
            label, cur = m.group(1), [m.group(2).strip()] if m.group(2).strip() else []
        else:
            if cur is None:
                cur, label = [], ""
            cur.append(line)
    if cur:
        verses.append({"label": label, "lines": cur})
    return [v for v in verses if any(x.strip() for x in v["lines"])]


def build_red():
    idx = {i["number"]: i["title"] for i in json.load(open(f"{RAW}/442_index.json"))["items"]}
    items, missing = [], []
    files = glob.glob(f"{RAW}/hallelujah/public/static/lrc/*.lrc")
    for fp in files:
        base = os.path.basename(fp)[:-4]
        num, _, title = base.partition("_")
        num = int(num)
        lrc = open(fp, encoding="utf-8", errors="ignore").read()
        lines = clean_lines(lrc)
        verses = split_verses(lines)
        items.append({
            "book": "red_book",
            "number": num,
            "title": title.strip(),
            "title_official": idx.get(num, ""),
            "verses": verses,
            "source": "github:AlanQtten/hallelujah",
        })
    items.sort(key=lambda x: x["number"])
    got = {i["number"] for i in items}
    for n in range(1, 401):
        if n not in got:
            missing.append(n)
    # 短歌 1001-1042 只有目录，暂无歌词
    for n in range(1001, 1043):
        items.append({"book": "red_book", "number": n, "title": idx.get(n, ""),
                      "title_official": idx.get(n, ""), "verses": [], "source": "index-only"})
    os.makedirs(f"{RAW}/books", exist_ok=True)
    json.dump({"book": "red_book", "name": "赞美诗（新编）", "alias": "红本",
               "count": len(items), "missing_lyrics": missing, "items": items},
              open(f"{RAW}/books/red_book.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    return items, missing


def parse_num_from_lrc(lrc, title=""):
    """从 LRC 首行抽编号。[00:00.1]第1152首-xxx / 97_xxx / 445奉献 / 第395首 - xxx"""
    for raw in lrc.split("\n")[:3]:
        line = TS.sub("", raw).strip()
        m = re.search(r"第\s*(\d{1,4})\s*首", line)
        if m:
            return int(m.group(1))
        m = re.match(r"^(\d{1,4})\s*[_．.、\-]", line)
        if m:
            return int(m.group(1))
        m = re.match(r"^(\d{1,4})(?=[\u4e00-\u9fff])", line)
        if m and 1 <= int(m.group(1)) <= 1218:
            return int(m.group(1))
    return None


def build_1218():
    idx = {i["number"]: i["title"] for i in json.load(open(f"{RAW}/1218_index.json"))["items"]}
    by_title = {}
    for n, t in idx.items():
        by_title.setdefault(norm(t), []).append(n)
    best = {}
    unmatched = []
    for line in open(f"{RAW}/j51_songs.jsonl", encoding="utf-8"):
        rec = json.loads(line)
        if not rec.get("lrc"):
            continue
        num = parse_num_from_lrc(rec["lrc"], rec["title"])
        if num is None:
            cand = by_title.get(norm(rec["title"]))
            if cand and len(cand) == 1:
                num = cand[0]
            else:
                unmatched.append((rec["id"], rec["title"]))
                continue
        if num not in idx:
            unmatched.append((rec["id"], rec["title"], f"num {num} 不在目录"))
            continue
        # 同号多来源时，优先歌词与目录标题一致的
        same = norm(idx[num]) == norm(rec["title"])
        if num in best and best[num]["same_title"] and not same:
            continue
        best[num] = {
            "book": "black_book_1218",
            "number": num,
            "title": idx[num],
            "title_alt": rec["title"],
            "same_title": same,
            "verses": split_verses(clean_lines(rec["lrc"])),
            "source": f"j51:song/{rec['id']}",
        }
    items = [best[n] for n in sorted(best)]
    missing = [n for n in sorted(idx) if n not in best]
    os.makedirs(f"{RAW}/books", exist_ok=True)
    json.dump({"book": "black_book_1218", "name": "赞美诗歌（1218首）", "alias": "千首本/黑皮",
               "count": len(items), "missing_lyrics": missing, "items": items},
              open(f"{RAW}/books/black_book_1218.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    return items, missing, unmatched


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "red"):
        items, missing = build_red()
        print(f"红本: {len(items)} 条, 缺歌词 {len(missing)}: {missing[:10]}")
        print("示例:", json.dumps(items[0], ensure_ascii=False)[:300])
    if which in ("all", "1218"):
        items, missing, unmatched = build_1218()
        print(f"1218: {len(items)} 条, 缺 {len(missing)}")
        print("缺号前20:", missing[:20])
        print("未匹配:", len(unmatched), unmatched[:5])
        if items:
            print("示例:", json.dumps(items[0], ensure_ascii=False)[:300])
