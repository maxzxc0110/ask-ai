"""
把仓库里的扩展运行文件同步到一个目录，供 Chrome「加载已解压的扩展程序」使用。

【大多数用户不需要这个脚本】Chrome 直接加载仓库根目录（有 manifest.json 的那一层）就行，
仓库根目录本身就是完整可用的扩展。本脚本只给「想把运行文件和文档分开」的人备用。

和 tools/pack.py 共用同一份 RUNTIME 清单，不会出现「打包漏文件」那类问题。

用法（在仓库根目录执行）：
    python tools/sync-extension.py                    # 同步到 ../ask-ai-extension
    python tools/sync-extension.py --out D:\\somewhere # 同步到指定目录
    python tools/sync-extension.py --check            # 只检查是否一致，不写入
    python tools/sync-extension.py --clean            # 顺手删掉目标目录里不属于扩展的文件
"""

import argparse
import filecmp
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from pack import RUNTIME  # noqa: E402  复用同一份运行文件清单


def target_files(out_dir):
    """目标目录里应该存在的文件 → 源文件路径"""
    return [(rel, os.path.join(ROOT, rel.replace("/", os.sep))) for rel in RUNTIME]


def is_same(src, dst):
    return os.path.exists(dst) and filecmp.cmp(src, dst, shallow=False)


def check(out_dir):
    diffs = []
    missing = []
    for rel, src in target_files(out_dir):
        dst = os.path.join(out_dir, rel.replace("/", os.sep))
        if not os.path.exists(dst):
            missing.append(rel)
        elif not is_same(src, dst):
            diffs.append(rel)

    extra = []
    for dirpath, _dirnames, filenames in os.walk(out_dir):
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, out_dir).replace(os.sep, "/")
            if rel not in RUNTIME:
                extra.append(rel)

    print("目标目录:", out_dir)
    print("  缺失:", "、".join(missing) if missing else "无")
    print("  不同步:", "、".join(diffs) if diffs else "无")
    print("  多余文件:", "、".join(extra) if extra else "无")
    return not missing and not diffs


def sync(out_dir, clean=False):
    os.makedirs(out_dir, exist_ok=True)
    copied = []
    for rel, src in target_files(out_dir):
        dst = os.path.join(out_dir, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not is_same(src, dst):
            shutil.copy2(src, dst)
            copied.append(rel)

    removed = []
    if clean:
        keep = set(RUNTIME)
        for dirpath, _dirnames, filenames in os.walk(out_dir, topdown=False):
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, out_dir).replace(os.sep, "/")
                if rel not in keep:
                    os.remove(full)
                    removed.append(rel)
            if not os.listdir(dirpath) and dirpath != out_dir:
                os.rmdir(dirpath)

    print("目标目录:", out_dir)
    print("  已更新:", "、".join(copied) if copied else "无（本来就是最新的）")
    if removed:
        print("  已删除多余文件:", "、".join(removed))
    return copied, removed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(ROOT), "ask-ai-extension"))
    ap.add_argument("--check", action="store_true", help="只检查，不写入")
    ap.add_argument("--clean", action="store_true", help="删掉目标目录里不属于扩展的文件")
    args = ap.parse_args()

    out_dir = os.path.abspath(args.out)
    if not os.path.exists(os.path.join(ROOT, "manifest.json")):
        raise SystemExit("请在仓库根目录执行这个脚本")

    if args.check:
        ok = check(out_dir)
        print("→ " + ("完全一致 ✓" if ok else "有差异，需要同步"))
        return 0 if ok else 1

    sync(out_dir, clean=args.clean)
    print("\n下一步：chrome://extensions → 点扩展卡片的「刷新」")
    return 0


if __name__ == "__main__":
    sys.exit(main())
