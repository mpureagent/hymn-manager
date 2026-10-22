#!/usr/bin/env python3
"""数据质量断言：任何一项不达标非零退出。

用于每次重建数据后自检，也是 PM 验收的硬门槛。
用法: python3 tools/check_data_quality.py [data_dir]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "books"

TIME_RESIDUE = re.compile(r"^\[?\d{1,2}:\d{2}[.:]\d{1,3}\]?")
LEAD_DIGIT = re.compile(r"^\d{1,4}(?:上|下)?[_\s．.、]")
JUNK = re.compile(r"(www\.|https?://|LRC|lrc|制作|^专辑[:：]|歌词[:：])")
META_RESIDUE = re.compile(r"^(歌手|专辑|词|曲|作词|作曲|演唱|编曲|制作|出品)\s*[:：]")
BOM = re.compile("^[\ufeff\ufffd]")

EXPECT = {
    "red_book": {"min_items": 442, "min_with_verses": 400},
    "black_book_1218": {"min_items": 1217, "min_with_verses": 1190},
}

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def main() -> int:
    for path in sorted(DATA.glob("*.json")):
        book = json.loads(path.read_text(encoding="utf-8"))
        bid = book["book"]
        items = book["items"]
        nums = [i["number"] for i in items]
        with_v = sum(1 for i in items if i.get("verses"))

        exp = EXPECT.get(bid, {})
        if len(items) < exp.get("min_items", 0):
            fail(f"{bid}: 条目 {len(items)} < 期望 {exp['min_items']}")
        if with_v < exp.get("min_with_verses", 0):
            fail(f"{bid}: 有歌词 {with_v} < 期望 {exp['min_with_verses']}")
        if book.get("count") != len(items):
            fail(f"{bid}: count 字段 {book.get('count')} != 实际 {len(items)}")
        if len(set(nums)) != len(nums):
            fail(f"{bid}: 存在重复编号")
        if nums != sorted(nums):
            fail(f"{bid}: 编号未升序")

        time_hits, lead_hits, junk_hits, empty_lines, meta_hits = [], [], [], 0, []
        for it in items:
            for v in it["verses"]:
                for line in v["lines"]:
                    if not line.strip():
                        empty_lines += 1
                    if TIME_RESIDUE.match(line) or BOM.match(line):
                        time_hits.append((it["number"], line[:40]))
                    if LEAD_DIGIT.match(line):
                        lead_hits.append((it["number"], line[:40]))
                    if JUNK.search(line):
                        junk_hits.append((it["number"], line[:40]))
                    if META_RESIDUE.match(line):
                        meta_hits.append((it["number"], line[:40]))

        for tag, hits in (("时间轴/BOM 残留", time_hits), ("段号残留", lead_hits),
                          ("杂行", junk_hits), ("元信息残留", meta_hits)):
            if hits:
                fail(f"{bid}: {tag} {len(hits)} 行，例 {hits[:3]}")
        if empty_lines:
            fail(f"{bid}: 空行 {empty_lines} 行")

        print(f"{bid}: {len(items)} 条，有歌词 {with_v}，"
              f"时间轴残留 {len(time_hits)}，段号残留 {len(lead_hits)}，"
              f"杂行 {len(junk_hits)}，元信息残留 {len(meta_hits)}")

    # 抽查两首关键条目：跨本同名的歌词必须不同
    red = json.loads((DATA / "red_book.json").read_text(encoding="utf-8"))
    black = json.loads((DATA / "black_book_1218.json").read_text(encoding="utf-8"))
    r1 = next(i for i in red["items"] if i["number"] == 1)
    b1 = next(i for i in black["items"] if i["number"] == 1)
    r1_text = "".join("".join(v["lines"]) for v in r1["verses"])
    b1_text = "".join("".join(v["lines"]) for v in b1["verses"])
    if "全能大主宰" in r1_text:
        fail("红本第1首不应含「全能大主宰」（这是千首本译文，说明跨本串味）")
    if "全能大主宰" not in b1_text:
        fail("千首本第1首应含「全能大主宰」")
    print("跨本校验：红本①与千首本①为不同译文 ✓")

    if failures:
        print("\n不合格项：", file=sys.stderr)
        for f in failures:
            print("  - " + f, file=sys.stderr)
        return 1
    print("\n全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
