"""Check the chapter navigation in each part against the book's contents."""
import argparse
from collections import defaultdict
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
HEADER = "| 章节 | 本章解决的问题 | 阅读入口 |"
DIVIDER = "| --- | --- | --- |"
APPENDIX = "## 附录：本章必要技术点速查"
ANCHOR = "附录本章必要技术点速查"
CHAPTER = re.compile(r"part-[^/]+/chapter-[^/]+/(?:outline|chapter)\.md")


def check(staged):
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=ROOT).decode()

    def read(path):
        return git("show", ":" + path) if staged else (ROOT / path).read_text()

    errors = []
    paths = git("ls-files", "-z") if staged else git(
        "ls-files", "-z", "--cached", "--others", "--exclude-standard"
    )
    files = {p for p in paths.split("\0") if p and (staged or (ROOT / p).is_file())}
    chapters = {p for p in files if CHAPTER.fullmatch(p)}
    contents = read("README.md")
    if "### 篇章跳转" in contents.splitlines():
        errors.append("README.md 重复列出了篇章跳转")
    entries = defaultdict(list)
    listed = set()
    for title, path in re.findall(r"^#### \[([^\]]+)\]\(([^)]+)\)$", contents, re.M):
        if CHAPTER.fullmatch(path):
            part, target = path.split("/", 1)
            entries[part].append((title, target))
            listed.add(path)
    for path in sorted(chapters ^ listed):
        errors.append(f"{path} 与全书目录不一致")
    for part, expected in entries.items():
        guide = part + "/README.md"
        lines = read(guide).splitlines() if guide in files else []
        if lines.count("## 章节导航") != 1:
            errors.append(f"{guide} 应有一处章节导航")
            continue
        start = lines.index("## 章节导航") + 1
        while start < len(lines) and not lines[start].strip():
            start += 1
        if lines[start:start + 2] != [HEADER, DIVIDER]:
            errors.append(f"{guide}:{start + 1} 导航表应为「章节、本章解决的问题、阅读入口」")
            continue
        rows = []
        for line in lines[start + 2:]:
            if not line.startswith("|"):
                break
            rows.append(line)
        if len(rows) != len(expected):
            errors.append(f"{guide} 导航应有 {len(expected)} 行，实有 {len(rows)} 行")
        for number, ((title, target), row) in enumerate(zip(expected, rows), start + 3):
            path = part + "/" + target
            if target.endswith("/outline.md"):
                links = f"[阅读提要]({target})"
            else:
                links = f"[阅读正文]({target}) · [技术点速查]({target}#{ANCHOR})"
                if path in chapters and read(path).splitlines().count(APPENDIX) != 1:
                    errors.append(f"{path} 缺少唯一的速查附录标题")
            cells = [s.strip() for s in row.split("|")]
            if len(cells) != 5 or cells[0] or cells[-1] or cells[1] != title or not cells[2] or cells[3] != links:
                errors.append(f"{guide}:{number} 应使用纯文本章题「{title}」，阅读入口应为 {links}")
    for error in errors:
        print(error, file=sys.stderr)
    if not errors:
        print(f"章节导航通过，已核对 {len(entries)} 篇中的 {len(chapters)} 个正文或提要入口。")
    return bool(errors)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true", help="check the Git index")
    sys.exit(check(parser.parse_args().staged))
