#!/usr/bin/env python3
"""Generate locale/<lang>/citation-phoenix.ftl from content/localization.json.

Equivalent of scripts/generate-schema-ftl.ps1 for machines without PowerShell
(e.g. macOS). locale/ is gitignored and MUST be present in the built xpi:
without citation-phoenix.ftl, Zotero's menu localization fails and the item
context menu does not open. Output is UTF-8 with LF line endings.

Usage: python3 scripts/generate-schema-ftl.py [source_dir]
"""
import json
import os
import re
import sys

src = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(src, 'content', 'localization.json'), encoding='utf-8') as f:
    localization = json.load(f)

count = 0
for name, value in localization['locales'].items():
    lines = ['# Generated from content/localization.json by scripts/generate-schema-ftl.ps1.']
    for field, label in value['fields'].items():
        message = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', field)
        message = re.sub(r'[^a-zA-Z0-9-]+', '-', message)
        message = re.sub(r'-+', '-', message).strip('-').lower()
        lines.append('citation-phoenix-field-%s = %s' % (message, re.sub(r'[\r\n]+', ' ', str(label))))
    directory = os.path.join(src, 'locale', name)
    os.makedirs(directory, exist_ok=True)
    with open(os.path.join(directory, 'citation-phoenix.ftl'), 'w', encoding='utf-8', newline='') as out:
        out.write('\n'.join(lines) + '\n')
    count += 1
print('Generated %d schema field Fluent files in %s' % (count, os.path.join(src, 'locale')))
