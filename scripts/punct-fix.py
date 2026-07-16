import re, sys

CJK = r'[㐀-鿿　-〿！-～「」『』、]'

def convert_text(t):
    t = re.sub(rf'({CJK})\s*,\s*(?={CJK})', lambda m: m.group(1) + '，', t)
    t = re.sub(rf'({CJK}),', r'\1，', t)
    t = re.sub(rf',(?={CJK})', '，', t)
    t = re.sub(rf'({CJK})\s*:(?!//)\s*(?={CJK})', r'\1：', t)
    t = re.sub(rf'({CJK}):(?!//)(?![0-9])', r'\1：', t)
    return t

def protect(body):
    slots = []
    def stash(m):
        slots.append(m.group(0)); return f'\x00{len(slots)-1}\x00'
    for pat in [r'```.*?```', r'`[^`\n]*`', r'\{%.*?%\}', r'\{\{.*?\}\}',
                r'<[^>\n]*>', r'\]\([^)\n]*\)', r'https?://\S+']:
        body = re.sub(pat, stash, body, flags=re.S)
    return body, slots

def restore(body, slots):
    while '\x00' in body:
        body = re.sub(r'\x00(\d+)\x00', lambda m: slots[int(m.group(1))], body)
    return body

def process(path):
    raw = open(path, encoding='utf-8').read()
    m = re.match(r'^(---\n.*?\n---\n)(.*)$', raw, flags=re.S)
    if m:
        fm, body = m.group(1), m.group(2)
        def fm_fix(mm):
            return f'{mm.group(1)}"{convert_text(mm.group(2))}"'
        fm = re.sub(r'^(title:\s*)"(.*)"$', fm_fix, fm, flags=re.M)
        fm = re.sub(r'^(subtitle:\s*)"(.*)"$', fm_fix, fm, flags=re.M)
    else:
        fm, body = '', raw
    prot, slots = protect(body)
    fixed = restore(convert_text(prot), slots)
    out = fm + fixed
    if out != raw:
        open(path, 'w', encoding='utf-8').write(out)
        return True
    return False

changed = 0
for p in sys.argv[1:]:
    if process(p): changed += 1
print('changed files:', changed)
