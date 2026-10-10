#!/usr/bin/env python3
"""把學生答案整理成 CSV，存進 data/exports/。

來源可以是：
  --from-json FILE     教師端「匯出 JSON」下載的檔案
  --from-dir DIR       一個資料夾，裡面每組一個 .json（例如 Claude 用 ArtifactData 匯出的 groups/）
  --from-sheet URL     Google Apps Script 網址（backend/README.md），直接抓最新資料

例：
  python3 tools/export.py --from-json ~/Downloads/偏誤句小組任務-2026-10-17.json
  python3 tools/export.py --from-sheet https://script.google.com/macros/s/XXX/exec

每次會寫出兩個檔：<日期>.json（原始資料）與 <日期>.csv（和教師端匯出相同的欄位）。
"""
import argparse, csv, json, pathlib, re, sys, urllib.request
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'data' / 'exports'

# 和 src/student_tasks.html 裡的 EXPORT_COLUMNS 一致
COLUMNS = [
    ('組', None), ('偏誤句', 'sentence'), ('1點選', 's1.markedWords'), ('1改成', 's1.fix'), ('1為什麼', 's1.why'),
    ('人類_用錯的詞', 'human.wrongWord'), ('人類_用錯詞義項', 'human.wrongSense'),
    ('人類_正確的詞', 'human.rightWord'), ('人類_正確詞義項', 'human.rightSense'),
    ('人類_差別', 'human.diff'), ('人類_解釋', 'human.explain'), ('人類_教學計畫', 'human.plan'),
    ('AI_改法', 'ai.aiFix'), ('AI_理由', 'ai.aiExplain'), ('AI_網頁', 'ai.result'),
    ('AI_過程', 'ai.notes'), ('AI_prompt', 'ai.prompt'),
    ('3比一比', 's3.compare'), ('3AI分數', 's3.score'), ('3最終答案', 's3.final'), ('3一句話', 's3.share'),
    ('更新時間', 'updatedAt'),
]

def load_config_tokens():
    """從 content/config.js 取出各句的斷詞，讓舊資料（只有 marked 序號）也能還原成詞。"""
    text = (ROOT / 'content' / 'config.js').read_text(encoding='utf-8')
    toks = {}
    for m in re.finditer(r"id:\s*(\d+),\s*groups:\s*\[[^\]]*\],\s*toks:\s*'([^']*)'", text):
        toks[int(m.group(1))] = m.group(2).split('|')
    return toks

def get_path(o, p):
    for k in p.split('.'):
        if not isinstance(o, dict):
            return None
        o = o.get(k)
    return o

def group_number(gid, doc):
    m = re.fullmatch(r'g(\d+)', str(gid))
    return int(m.group(1)) if m else doc.get('group')

def to_rows(groups):
    toks = load_config_tokens()
    rows = []
    for gid, doc in groups.items():
        if not isinstance(doc, dict) or not doc.get('updatedAt'):
            continue
        g = group_number(gid, doc)
        row = []
        for name, key in COLUMNS:
            if name == '組':
                row.append(g)
            elif name == '1點選':
                words = get_path(doc, 's1.markedWords')
                if not words:
                    idx = get_path(doc, 's1.marked') or []
                    t = toks.get(doc.get('sentence'), [])
                    words = '、'.join(t[i] for i in idx if isinstance(i, int) and i < len(t))
                row.append(words or '')
            else:
                v = get_path(doc, key)
                row.append('' if v is None else v)
        rows.append(row)
    rows.sort(key=lambda r: (r[0] is None, r[0]))
    return rows

def read_source(args):
    if args.from_json:
        data = json.loads(pathlib.Path(args.from_json).read_text(encoding='utf-8'))
        return data.get('groups', data)
    if args.from_dir:
        groups = {}
        for f in sorted(pathlib.Path(args.from_dir).glob('*.json')):
            groups[f.stem] = json.loads(f.read_text(encoding='utf-8'))
        return groups
    if args.from_sheet:
        url = args.from_sheet + ('&' if '?' in args.from_sheet else '?') + 'action=all'
        with urllib.request.urlopen(url, timeout=30) as r:
            data = json.loads(r.read().decode('utf-8'))
        if not data.get('ok'):
            sys.exit('試算表回傳錯誤：' + str(data.get('error')))
        return data.get('groups', {})
    sys.exit('請指定 --from-json、--from-dir 或 --from-sheet')

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from-json'); ap.add_argument('--from-dir'); ap.add_argument('--from-sheet')
    ap.add_argument('--name', default=date.today().isoformat(), help='輸出檔名（不含副檔名），預設今天日期')
    args = ap.parse_args()
    groups = read_source(args)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f'{args.name}.json').write_text(json.dumps({'groups': groups}, ensure_ascii=False, indent=2), encoding='utf-8')
    rows = to_rows(groups)
    with open(OUT_DIR / f'{args.name}.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f); w.writerow([c[0] for c in COLUMNS]); w.writerows(rows)
    print(f'{len(rows)} 組 → {OUT_DIR / (args.name + ".csv")}')

if __name__ == '__main__':
    main()
