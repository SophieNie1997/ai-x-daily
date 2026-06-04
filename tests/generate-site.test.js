const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { generateSite } = require('../scripts/generate-site');

test('generates GitHub Pages site artifacts from Markdown reports', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-x-public-site-'));
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'reports', '2026-06-03.md'),
    [
      'AI 大拿 X 日报｜2026-06-03',
      '时间窗：2026-06-02 - 2026-06-03',
      '',
      '今日最重要的动态',
      '1. @sama sample update https://x.com/sama/status/1',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(root, 'reports', '2026-06-04.md'),
    [
      'AI 大拿 X 日报｜2026-06-04',
      '时间窗：2026-06-03 - 2026-06-04',
      '',
      '今日最重要的动态',
      '1. @sama 强调 AI 应该“提升人”，而不是替代人。重点不在末日叙事，而在把 AI 做成增强人类能力的工具。原帖：https://x.com/sama/status/1',
      '2. @gdb latest update https://x.com/gdb/status/3',
    ].join('\n'),
    'utf8',
  );

  const result = generateSite(root);

  assert.equal(result.reports.length, 2);
  assert.equal(result.reports[0].date, '2026-06-04');
  assert.ok(fs.existsSync(path.join(root, 'index.html')));
  assert.ok(fs.existsSync(path.join(root, 'daily', '2026-06-04.html')));
  assert.ok(fs.existsSync(path.join(root, 'assets', 'site.css')));
  assert.ok(fs.existsSync(path.join(root, 'site-data', 'reports.json')));

  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(index, /AI X Daily/);
  assert.match(index, /Latest Issue/);
  assert.match(index, /AI 叙事转向：增强人类能力/);
  assert.doesNotMatch(index, /<h2>@sama 强调 AI 应该/);
  assert.match(index, /daily\/2026-06-04\.html/);

  const detail = fs.readFileSync(path.join(root, 'daily', '2026-06-04.html'), 'utf8');
  assert.match(detail, /@sama 强调 AI 应该/);
  assert.match(detail, /<a href="https:\/\/x\.com\/sama\/status\/1"/);
});
