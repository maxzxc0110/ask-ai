"""打包 Chrome 商店上传 / 分发用的 zip。

用法（在仓库根目录）：
    python tools/pack.py                 # 输出到 dist/
    python tools/pack.py --out D:\\somewhere

只收录扩展运行必需的文件，不含文档、脚本与开发产物。
"""
import argparse
import json
import os
import re
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

RUNTIME = [
    "manifest.json",
    "background.js",
    "providers.js",
    "sidepanel.html",
    "sidepanel.css",
    "sidepanel.js",
    "options.html",
    "options.css",
    "options.js",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "dist"))
    args = ap.parse_args()

    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
        mf = json.load(f)
    version = mf["version"]
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", mf["name"]).strip("-").lower() or "extension"
    out = os.path.join(out_dir, f"{slug}-{version}.zip")
    if os.path.exists(out):
        os.remove(out)

    missing = [f for f in RUNTIME if not os.path.exists(os.path.join(ROOT, f.replace("/", os.sep)))]
    if missing:
        raise SystemExit("缺少文件: " + ", ".join(missing))

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in RUNTIME:
            z.write(os.path.join(ROOT, rel.replace("/", os.sep)), rel)

    with zipfile.ZipFile(out) as z:
        assert z.testzip() is None, "zip 损坏"
        json.loads(z.read("manifest.json").decode("utf-8"))

    print("built:", out)
    print("size :", os.path.getsize(out), "bytes")
    print("files:", len(RUNTIME))


if __name__ == "__main__":
    main()
