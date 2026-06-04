const assert = require('node:assert/strict');
const test = require('node:test');
const { renderMarkdownToHtml } = require('../scripts/render-report-html');

test('renders a self-contained single-report HTML page', () => {
  const markdown = [
    'AI 大拿 X 日报｜2026-06-04',
    '时间窗：2026-06-03 - 2026-06-04',
    '',
    '今日最重要的动态',
    '1. @sama <unsafe> update https://x.com/sama/status/1',
    '',
    '账号分布',
    '- @sama: 1',
  ].join('\n');

  const html = renderMarkdownToHtml(markdown, '2026-06-04');

  assert.match(html, /<!doctype html>/);
  assert.match(html, /<title>AI 大拿 X 日报｜2026-06-04<\/title>/);
  assert.match(html, /<h2>今日最重要的动态<\/h2>/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.match(html, /<a href="https:\/\/x\.com\/sama\/status\/1"/);
  assert.doesNotMatch(html, /<script\b|cdn\.|fonts\.googleapis/i);
});
