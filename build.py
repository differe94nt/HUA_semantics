#!/usr/bin/env python3
"""把 content/config.js 嵌進 src/ 的網頁，產生可以直接使用的檔案。

    python3 build.py          # 產生 dist/ 與 artifact_source/
    python3 build.py --check  # 只檢查產出是否已是最新（CI 用）

產出：
  dist/student_tasks.html      學生任務單，獨立檔，雙擊即可開
  dist/teaching_slides.html    教學投影頁，獨立檔
  artifact_source/*.html       claude.ai Artifact 用的原始碼（不含 <html> 外框）
"""
import re, sys, pathlib, subprocess, shutil

ROOT = pathlib.Path(__file__).resolve().parent
CONFIG = ROOT / 'content' / 'config.js'
CONFIG_TAG = '<script src="../content/config.js"></script>'
PAGES = [
    ('src/student_tasks.html',   'dist/student_tasks.html',   'artifact_source/cwn-workshop.html'),
    ('src/teaching_slides.html', 'dist/teaching_slides.html', 'artifact_source/cwn-teach.html'),
]

def fragment(html: str) -> str:
    """<body> 與 </body> 之間的內容，也就是 Artifact 要的部分。"""
    m = re.search(r'<body>\n?(.*)\n?</body>', html, re.S)
    if not m:
        sys.exit('找不到 <body>…</body>')
    return m.group(1).strip('\n') + '\n'

def build() -> dict:
    config = CONFIG.read_text(encoding='utf-8').strip('\n')
    inline = '<script>\n' + config + '\n</script>'
    out = {}
    for src, dist, art in PAGES:
        html = (ROOT / src).read_text(encoding='utf-8')
        if CONFIG_TAG not in html:
            sys.exit(f'{src} 裡沒有 {CONFIG_TAG}')
        html = html.replace(CONFIG_TAG, inline, 1)
        out[dist] = html
        out[art] = fragment(html)
    return out

def syntax_check(path: pathlib.Path):
    """有 node 的話，把每個 <script> 區塊抓出來檢查語法。"""
    node = shutil.which('node')
    if not node:
        return
    html = path.read_text(encoding='utf-8')
    for i, js in enumerate(re.findall(r'<script>(.*?)</script>', html, re.S)):
        tmp = path.with_suffix(f'.check{i}.js')
        tmp.write_text(js, encoding='utf-8')
        try:
            subprocess.run([node, '--check', str(tmp)], check=True)
        finally:
            tmp.unlink()

def main():
    out = build()
    if '--check' in sys.argv:
        stale = [p for p, s in out.items() if not (ROOT / p).exists() or (ROOT / p).read_text(encoding='utf-8') != s]
        if stale:
            sys.exit('這些檔案不是最新的，請執行 python3 build.py：\n  ' + '\n  '.join(stale))
        print('產出都是最新的。')
        return
    for p, s in out.items():
        path = ROOT / p
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(s, encoding='utf-8')
        syntax_check(path)
        print(f'寫入 {p}  ({len(s.encode("utf-8"))//1024} KB)')

if __name__ == '__main__':
    main()
