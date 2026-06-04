#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkify(value) {
  return escapeHtml(value).replace(/https:\/\/[^\s)）]+/g, (url) => {
    return `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`;
  });
}

function sectionTitlePattern() {
  return /^(抓取状态|今日最重要的动态|新模型、新产品、开源\/资源|行业趋势和争议|默认追踪账号状态|我建议你重点看 3 条|原始抓取记录|账号分布|Top items|Resources)$/;
}

function renderMarkdownBody(markdown) {
  const lines = markdown.trimEnd().split(/\r?\n/);
  let htmlBody = '';
  let inList = false;

  function closeList() {
    if (inList) {
      htmlBody += '</ul>\n';
      inList = false;
    }
  }

  lines.forEach((line, index) => {
    if (!line.trim()) {
      closeList();
      return;
    }

    if (index === 0) {
      htmlBody += `<h1>${linkify(line)}</h1>\n`;
      return;
    }

    if (/^(时间窗：|Time window:)/.test(line)) {
      htmlBody += `<p class="window">${linkify(line)}</p>\n`;
      return;
    }

    if (sectionTitlePattern().test(line)) {
      closeList();
      htmlBody += `<h2>${linkify(line)}</h2>\n`;
      return;
    }

    if (/^- /.test(line)) {
      if (!inList) {
        htmlBody += '<ul>\n';
        inList = true;
      }
      htmlBody += `<li>${linkify(line.replace(/^- /, ''))}</li>\n`;
      return;
    }

    closeList();
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      htmlBody += `<article class="item"><div class="num">${numbered[1]}</div><p>${linkify(numbered[2])}</p></article>\n`;
    } else {
      htmlBody += `<p>${linkify(line)}</p>\n`;
    }
  });

  closeList();
  return htmlBody;
}

function renderMarkdownToHtml(markdown, dateLabel = '') {
  const title = markdown.trimStart().split(/\r?\n/, 1)[0] || 'AI X Report';
  const htmlBody = renderMarkdownBody(markdown);
  const titleSuffix = dateLabel ? `｜${escapeHtml(dateLabel)}` : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: light;
    --paper: #f7f7f3;
    --ink: #151515;
    --muted: #6b6b63;
    --line: #d9d8cf;
    --accent: #0f6b57;
    --accent-soft: #e1eee9;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", sans-serif;
    line-height: 1.72;
  }
  main {
    width: min(920px, calc(100% - 32px));
    margin: 0 auto;
    padding: 56px 0 72px;
  }
  h1 {
    margin: 0;
    max-width: 760px;
    font-size: clamp(34px, 6vw, 58px);
    line-height: 1.08;
    letter-spacing: 0;
    font-weight: 760;
  }
  .window {
    display: inline-block;
    margin: 18px 0 34px;
    padding: 7px 11px;
    border: 1px solid var(--line);
    background: rgba(255,255,255,.58);
    color: var(--muted);
    font-size: 14px;
  }
  h2 {
    margin: 44px 0 14px;
    padding-top: 18px;
    border-top: 1px solid var(--line);
    font-size: 21px;
    line-height: 1.25;
    letter-spacing: 0;
  }
  p { margin: 0 0 14px; font-size: 16px; }
  ul { margin: 0 0 18px; padding-left: 20px; }
  li { margin: 9px 0; }
  a {
    color: var(--accent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    word-break: break-word;
  }
  .item {
    display: grid;
    grid-template-columns: 38px 1fr;
    gap: 12px;
    margin: 13px 0;
    padding: 15px 0;
    border-top: 1px solid rgba(217,216,207,.72);
  }
  .item:first-of-type { border-top: 0; }
  .item p { margin: 0; }
  .num {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    color: var(--accent);
    border: 1px solid rgba(15,107,87,.18);
    border-radius: 6px;
    font-weight: 720;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 620px) {
    main { width: min(100% - 22px, 920px); padding: 34px 0 52px; }
    h1 { font-size: 34px; }
    .item { grid-template-columns: 32px 1fr; gap: 10px; }
    .num { width: 28px; height: 28px; }
  }
</style>
</head>
<body>
<main data-date="${escapeHtml(dateLabel)}" aria-label="Report${titleSuffix}">
${htmlBody}</main>
</body>
</html>
`;
}

function runCli(argv) {
  const [, , inputPath, outputPath, dateLabel = ''] = argv;
  if (!inputPath || !outputPath) {
    console.error('Usage: node render-report-html.js <input.md> <output.html> [date-label]');
    process.exitCode = 2;
    return;
  }

  const markdown = fs.readFileSync(inputPath, 'utf8');
  const html = renderMarkdownToHtml(markdown, dateLabel);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
}

if (require.main === module) {
  runCli(process.argv);
}

module.exports = {
  escapeHtml,
  linkify,
  renderMarkdownToHtml,
};
