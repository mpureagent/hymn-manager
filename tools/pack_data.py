#!/usr/bin/env python3
"""把 data/books/*.json 与 .raw/scores/ 打包成可分发数据包 hymns-data/。

输出：
  hymns-data/manifest.json
  hymns-data/books/<book_id>.json      （原样复制）
  hymns-data/scores/<dir>/<NNNN>_<i>.<ext>

幂等：重复执行覆盖同名文件，并清掉本次不再存在的旧文件；不会产生重复条目。
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parents[1]

# manifest 顺序即下拉框顺序：红本在前。
BOOK_ORDER = ["red_book", "black_book_1218"]
SCORE_DIRS = {"red_book": "red", "black_book_1218": "black"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def repo_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (ROOT / path).resolve()


def fail(message: str) -> NoReturn:
    print(f"pack_data: 错误：{message}", file=sys.stderr)
    raise SystemExit(2)


def load_books(data_dir: Path) -> list[dict]:
    files = sorted(data_dir.glob("*.json"))
    if not files:
        fail(f"没有找到诗歌本 JSON：{data_dir}")

    books: list[dict] = []
    seen: set[str] = set()
    for path in files:
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except Exception as error:
            fail(f"{path.name} 读取失败：{error}")

        if not isinstance(raw, dict):
            fail(f"{path.name} 不是 JSON 对象")
        book_id = raw.get("book") or path.stem
        if not isinstance(book_id, str) or not book_id:
            fail(f"{path.name} 缺少 book id")
        if book_id != path.stem:
            fail(f"{path.name} 的 book 字段（{book_id}）与文件名不一致")
        if book_id in seen:
            fail(f"诗歌本 id 重复：{book_id}")
        seen.add(book_id)

        for field in ("name", "alias"):
            if not isinstance(raw.get(field), str) or not raw.get(field).strip():
                fail(f"{path.name} 缺少 {field}")
        items = raw.get("items")
        if not isinstance(items, list):
            fail(f"{path.name} 的 items 不是数组")
        declared = raw.get("count")
        if not isinstance(declared, int) or declared < 0:
            fail(f"{path.name} 的 count 非法：{declared!r}")
        if declared != len(items):
            fail(
                f"{path.name} 条目数不一致：count 声明 {declared} 条，"
                f"items 实际 {len(items)} 条"
            )

        books.append(
            {
                "id": book_id,
                "name": raw["name"],
                "alias": raw["alias"],
                "count": len(items),
                "path": path,
            }
        )

    order = {book_id: index for index, book_id in enumerate(BOOK_ORDER)}
    books.sort(key=lambda book: (order.get(book["id"], len(order)), book["id"]))
    return books


def sync_books(out_dir: Path, books: list[dict]) -> None:
    books_dir = out_dir / "books"
    books_dir.mkdir(parents=True, exist_ok=True)
    expected = {f"{book['id']}.json" for book in books}
    for path in books_dir.iterdir():
        if path.is_file() and path.name not in expected:
            path.unlink()
    for book in books:
        shutil.copyfile(book["path"], books_dir / f"{book['id']}.json")


def sync_scores(out_dir: Path, books: list[dict], scores_root: Path) -> dict[str, int]:
    scores_dir = out_dir / "scores"
    scores_dir.mkdir(parents=True, exist_ok=True)

    counts: dict[str, int] = {}
    expected_dirs: set[str] = set()
    for book in books:
        score_dir_name = SCORE_DIRS.get(book["id"], book["id"])
        expected_dirs.add(score_dir_name)
        src = scores_root / score_dir_name
        dst = scores_dir / score_dir_name

        if dst.exists():
            shutil.rmtree(dst)
        if not src.is_dir():
            print(f"pack_data: 警告：{src} 不存在，{book['id']} 将没有曲谱图", file=sys.stderr)
            counts[book["id"]] = 0
            continue

        shutil.copytree(
            src,
            dst,
            ignore=shutil.ignore_patterns(".*", "*.json"),
        )
        counts[book["id"]] = sum(
            1
            for path in dst.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_EXTS
        )

    for path in scores_dir.iterdir():
        if path.is_dir() and path.name not in expected_dirs:
            shutil.rmtree(path)
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="生成 hymns-data 数据包")
    parser.add_argument("--data", default="data/books", help="诗歌本 JSON 目录")
    parser.add_argument("--raw-scores", default=".raw/scores", help="曲谱图根目录")
    parser.add_argument("--out", default="hymns-data", help="输出目录")
    args = parser.parse_args()

    data_dir = repo_path(args.data)
    scores_root = repo_path(args.raw_scores)
    out_dir = repo_path(args.out)

    books = load_books(data_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sync_books(out_dir, books)
    score_counts = sync_scores(out_dir, books, scores_root)

    manifest = {
        "version": 1,
        "books": [
            {
                "id": book["id"],
                "name": book["name"],
                "alias": book["alias"],
                "count": book["count"],
            }
            for book in books
        ],
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"数据包：{out_dir}")
    for book in books:
        print(
            f"  {book['id']}: {book['count']} 条，"
            f"{score_counts.get(book['id'], 0)} 张曲谱"
        )
    total_scores = sum(score_counts.values())
    print(f"  曲谱合计：{total_scores} 张")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())