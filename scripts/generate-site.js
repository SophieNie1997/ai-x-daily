#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const SECTION_TITLES = new Set([
  '抓取状态',
  '今日最重要的动态',
  '新模型、新产品、开源/资源',
  '行业趋势和争议',
  '默认追踪账号状态',
  '我建议你重点看 3 条',
  '原始抓取记录',
  '账号分布',
]);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function renderInline(text) {
  const placeholders = [];
  const store = (fragment) => {
    placeholders.push(fragment);
    return `__HTML_${placeholders.length - 1}__`;
  };
  let value = String(text);
  value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, url) => {
    return store(`<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`);
  });
  value = value.replace(/`([^`]+)`/g, (_, code) => store(`<code>${escapeHtml(code)}</code>`));
  value = value.replace(/https:\/\/[^\s)）]+/g, (url) => {
    return store(`<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`);
  });
  let escaped = escapeHtml(value);
  placeholders.forEach((fragment, index) => {
    escaped = escaped.replace(`__HTML_${index}__`, fragment);
  });
  return escaped;
}

function plainText(text) {
  return String(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https:\/\/[^\s)）]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(text, limit = 120) {
  const value = plainText(text);
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).replace(/[，、；：,. ]+$/g, '')}...`;
}

function stripLeadingHandle(text) {
  return plainText(text)
    .replace(/^@\w+\s*/, '')
    .replace(/^（?[^）]{1,18}）?\s*/, '')
    .replace(/原帖：.*$/g, '')
    .trim();
}

function featureHeadlineFor(report) {
  const text = plainText(report.text);
  if (report.rawOnly) return `${report.date} 原始抓取记录`;
  if (/提升人/.test(text) && /替代人/.test(text)) return 'AI 叙事转向：增强人类能力';
  if (/Codex|coding agent|code review|agentic coding/i.test(text)) return 'Coding Agent 进入工作流竞争';
  if (/医疗|心理健康|therapy|临床/.test(text)) return '医疗与心理健康 AI 证据升温';
  if (/开源|蒸馏|监管|open-weight/i.test(text)) return '开源模型与监管争议升温';

  const cleaned = stripLeadingHandle(report.archiveHeadline)
    .replace(/^(强调|认为|关注|发布|转向|连续转发\/评论)\s*/, '')
    .replace(/[。；].*$/g, '')
    .replace(/，.*$/g, '')
    .trim();
  return summarize(cleaned || report.title, 24);
}

function extractNumberedItems(text) {
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*\d+\.\s+(.+)$/);
    if (match) items.push(match[1].trim());
  }
  return items;
}

function findWindow(lines) {
  return lines.find((line) => /^(时间窗：|统计窗口：|Time window:)/.test(line.trim())) || '';
}

function parseReport(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  const lines = text.split(/\r?\n/);
  const title = lines[0].trim();
  const dateFromFile = path.basename(filePath, '.md').match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const date = dateFromFile || title.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (!date) throw new Error(`Could not determine report date: ${filePath}`);

  const numbered = extractNumberedItems(text);
  const summaryItems = numbered.length ? numbered.slice(0, 5) : [title];
  const archiveHeadline = summaryItems[0] || title;
  const archiveSummary = summaryItems[1] || archiveHeadline;

  return {
    date,
    title,
    window: findWindow(lines),
    text,
    summaryItems,
    archiveHeadline,
    archiveSummary,
    rawOnly: /原始抓取记录/.test(title),
    detailPath: `daily/${date}.html`,
    sourcePath: filePath,
  };
}

function collectReports(root) {
  const reportsDir = path.join(root, 'reports');
  const files = fs.existsSync(reportsDir)
    ? fs.readdirSync(reportsDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    : [];
  return files
    .map((name) => parseReport(path.join(reportsDir, name)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function renderMarkdownForDetail(report) {
  const lines = report.text.split(/\r?\n/).slice(1);
  let html = '';
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += '</ul>\n';
      inList = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }
    if (/^(时间窗：|统计窗口：|Time window:)/.test(trimmed)) {
      html += `<p class="window-line">${renderInline(trimmed)}</p>\n`;
      continue;
    }
    if (SECTION_TITLES.has(trimmed)) {
      closeList();
      html += `<h2>${escapeHtml(trimmed)}</h2>\n`;
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (!inList) {
        html += '<ul>\n';
        inList = true;
      }
      html += `<li>${renderInline(bullet[1])}</li>\n`;
      continue;
    }
    closeList();
    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      html += `<article class="detail-item"><div class="num">${numbered[1]}</div><p>${renderInline(numbered[2])}</p></article>\n`;
    } else {
      html += `<p>${renderInline(trimmed)}</p>\n`;
    }
  }
  closeList();
  return html;
}

function reportBadge(report) {
  return report.rawOnly ? '原始记录' : '日报';
}

function renderFeatureBullets(report) {
  return report.summaryItems.slice(0, 3).map((item) => `<li>${renderInline(summarize(item, 150))}</li>`).join('');
}

function renderTrendCard(report, index) {
  return `
    <article class="trend-card">
      <div class="tag">${escapeHtml(reportBadge(report))} ${index}</div>
      <h3>${renderInline(summarize(report.archiveHeadline, 64))}</h3>
      <p>${renderInline(summarize(report.archiveSummary, 92))}</p>
    </article>
  `;
}

function renderArchiveItem(report) {
  return `
    <article class="archive-item">
      <strong>${escapeHtml(report.date)}</strong>
      <div>
        <div class="headline">${renderInline(summarize(report.archiveHeadline, 110))}</div>
        <p>${renderInline(summarize(report.archiveSummary, 145))}</p>
      </div>
      <a class="jump" href="${escapeHtml(report.detailPath)}">阅读全文</a>
    </article>
  `;
}

function renderIndex(reports) {
  const latest = reports[0];
  const trends = reports.slice(0, 5).map((report, index) => renderTrendCard(report, index + 1)).join('');
  const archive = reports.map(renderArchiveItem).join('');
  const latestDate = latest ? latest.date.replace(/-/g, ' / ') : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI X Daily</title>
  <link rel="stylesheet" href="assets/site.css">
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="eyebrow">AI X Daily</div>
      <h1>每天一页<br>追踪 AI 大拿在 X 上的公开动态。</h1>
      <p>按日期归档重点观点、模型/产品资源、趋势争议和原帖链接。手机上从这里进入每天的详情页。</p>
    </section>

    ${latest ? `<section class="feature">
      <div class="feature-copy">
        <div class="eyebrow">Latest Issue</div>
        <div class="feature-tag">${escapeHtml(reportBadge(latest))}</div>
        <h2>${renderInline(featureHeadlineFor(latest))}</h2>
        <p class="feature-lead">${renderInline(summarize(latest.archiveSummary, 160))}</p>
        <ol class="bullet-list">${renderFeatureBullets(latest)}</ol>
      </div>
      <article class="summary-card">
        <div>
          <div class="card-label">最新日报</div>
          <div class="date-chip">${escapeHtml(latestDate)}</div>
        </div>
        <div class="claim">${renderInline(summarize(latest.archiveHeadline, 130))}</div>
        <a class="cta" href="${escapeHtml(latest.detailPath)}">查看当日详情页 →</a>
      </article>
    </section>` : ''}

    <section class="section">
      <div class="section-head">
        <h2>最近几天</h2>
        <p>横向扫一眼近期 AI 圈最值得回看的信号。</p>
      </div>
      <div class="trend-grid">${trends}</div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>历史归档</h2>
        <p>按日期浏览，进入单日报详情页。</p>
      </div>
      <div class="archive-wrap">${archive}</div>
    </section>
  </main>
</body>
</html>
`;
}

function renderDetail(report, reports) {
  const index = reports.findIndex((item) => item.date === report.date);
  const previous = reports[index + 1];
  const next = reports[index - 1];
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.title)}</title>
  <link rel="stylesheet" href="../assets/site.css">
</head>
<body>
  <main class="page">
    <header class="detail-hero">
      <a class="back-link" href="../index.html">← 返回日报首页</a>
      <div class="eyebrow">${escapeHtml(reportBadge(report))} · ${escapeHtml(report.date)}</div>
      <h1>${escapeHtml(report.title)}</h1>
      ${report.window ? `<p>${renderInline(report.window)}</p>` : ''}
    </header>
    <article class="detail-card">
      ${renderMarkdownForDetail(report)}
    </article>
    <nav class="footer-nav">
      ${previous ? `<a href="${escapeHtml(previous.date)}.html">← ${escapeHtml(previous.date)}</a>` : '<span></span>'}
      ${next ? `<a href="${escapeHtml(next.date)}.html">${escapeHtml(next.date)} →</a>` : '<span></span>'}
    </nav>
  </main>
</body>
</html>
`;
}

function writeAssets(root) {
  const assetsDir = path.join(root, 'assets');
  ensureDir(assetsDir);
  const css = `:root {
  --bg: linear-gradient(180deg, #edf0ec 0%, #f7f7f3 42%, #e2e8e3 100%);
  --paper: rgba(255,255,255,.72);
  --paper-strong: rgba(255,255,255,.88);
  --ink: #151716;
  --muted: #676d67;
  --line: rgba(18,28,22,.09);
  --accent: #0f6b57;
  --link: #0a66d1;
  --shadow: 0 22px 70px rgba(25, 50, 39, .08);
  --radius-xl: 34px;
  --radius-lg: 26px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  color: var(--ink);
  background:
    radial-gradient(circle at 12% 0%, rgba(145, 190, 169, .28), transparent 24%),
    radial-gradient(circle at 88% 8%, rgba(255, 255, 255, .82), transparent 20%),
    radial-gradient(circle at 70% 100%, rgba(102, 137, 122, .20), transparent 30%),
    var(--bg);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
}
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.page { width: min(1120px, calc(100vw - 32px)); margin: 0 auto; padding: 42px 0 72px; }
.hero, .detail-hero { padding: 28px 0 24px; }
.hero { text-align: center; }
.eyebrow, .feature-tag, .tag, .card-label { color: var(--accent); font-size: 12px; font-weight: 760; letter-spacing: .08em; text-transform: uppercase; }
.hero h1, .detail-hero h1 { margin: 0; font-size: clamp(42px, 6vw, 64px); line-height: 1.03; letter-spacing: 0; font-weight: 780; }
.hero p, .detail-hero p { color: var(--muted); font-size: clamp(17px, 2.1vw, 21px); line-height: 1.55; max-width: 760px; margin: 18px auto 0; }
.detail-hero p { margin-left: 0; }
.feature, .trend-card, .summary-card, .detail-card, .archive-wrap {
  background: var(--paper);
  border: 1px solid rgba(255,255,255,.58);
  box-shadow: var(--shadow);
  backdrop-filter: blur(14px);
}
.feature { border-radius: var(--radius-xl); padding: 28px; display: grid; grid-template-columns: 1.25fr .85fr; gap: 20px; }
.feature-copy h2 { max-width: 15ch; margin: 8px 0 12px; font-size: clamp(26px, 3.4vw, 42px); line-height: 1.16; letter-spacing: 0; }
.feature-lead { margin: 0; color: var(--muted); line-height: 1.72; max-width: 58ch; }
.bullet-list { margin: 20px 0 0; padding-left: 22px; line-height: 1.85; }
.bullet-list li { margin-bottom: 9px; }
.summary-card { border-radius: var(--radius-lg); padding: 22px; display: flex; flex-direction: column; justify-content: space-between; gap: 18px; background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(247,249,246,.84)); }
.date-chip { display: inline-flex; width: fit-content; margin-top: 10px; border-radius: 999px; background: rgba(15,107,87,.1); color: var(--accent); border: 1px solid rgba(15,107,87,.16); padding: 9px 13px; font-size: 13px; font-weight: 760; letter-spacing: .08em; }
.claim { font-size: clamp(18px, 1.8vw, 24px); line-height: 1.5; letter-spacing: 0; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.cta, .jump, .back-link { color: var(--accent); font-weight: 760; }
.section { margin-top: 42px; }
.section-head { text-align: center; margin-bottom: 18px; }
.section-head h2 { margin: 0; font-size: 38px; line-height: 1.1; letter-spacing: 0; }
.section-head p { color: var(--muted); margin: 8px 0 0; font-size: 17px; }
.trend-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.trend-card { border-radius: 28px; padding: 22px; }
.trend-card h3 { margin: 10px 0 12px; font-size: clamp(20px, 1.9vw, 28px); line-height: 1.24; letter-spacing: 0; }
.trend-card p { margin: 0; color: var(--muted); line-height: 1.68; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.archive-wrap { border-radius: var(--radius-xl); overflow: hidden; }
.archive-item { display: grid; grid-template-columns: 120px 1fr 110px; gap: 18px; padding: 20px 24px; border-top: 1px solid var(--line); align-items: center; }
.archive-item:first-child { border-top: 0; }
.archive-item .headline { font-size: 18px; line-height: 1.56; margin-bottom: 8px; }
.archive-item p { margin: 0; color: var(--muted); line-height: 1.62; font-size: 14px; }
.archive-item .jump { justify-self: end; }
.detail-card { border-radius: var(--radius-xl); padding: 30px; }
.detail-card h2 { margin: 34px 0 14px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 28px; line-height: 1.18; letter-spacing: 0; }
.detail-card h2:first-child { margin-top: 0; border-top: 0; padding-top: 0; }
.detail-card p, .detail-card li { line-height: 1.82; }
.detail-card ul { padding-left: 22px; }
.detail-item { display: grid; grid-template-columns: 38px 1fr; gap: 12px; padding: 15px 0; border-top: 1px solid var(--line); }
.detail-item .num { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 8px; background: rgba(15,107,87,.1); color: var(--accent); font-weight: 760; }
.detail-item p { margin: 0; }
.window-line { display: inline-block; padding: 7px 11px; border: 1px solid var(--line); border-radius: 10px; color: var(--muted); background: rgba(255,255,255,.54); }
.footer-nav { margin-top: 24px; display: flex; justify-content: space-between; gap: 12px; }
code { border-radius: 8px; padding: 1px 6px; background: rgba(15,107,87,.09); border: 1px solid rgba(15,107,87,.12); color: #0b5d4b; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; }
@media (max-width: 900px) {
  .page { width: min(100vw - 20px, 1120px); padding-top: 24px; }
  .feature, .trend-grid, .archive-item { grid-template-columns: 1fr; }
  .archive-item .jump { justify-self: start; }
  .hero h1, .detail-hero h1 { font-size: 38px; }
}
`;
  fs.writeFileSync(path.join(assetsDir, 'site.css'), css, 'utf8');
}

function writeSiteData(root, reports) {
  const siteDataDir = path.join(root, 'site-data');
  ensureDir(siteDataDir);
  const data = reports.map((report) => ({
    date: report.date,
    title: report.title,
    rawOnly: report.rawOnly,
    detailPath: report.detailPath,
    headline: plainText(report.archiveHeadline),
    summary: plainText(report.archiveSummary),
  }));
  fs.writeFileSync(path.join(siteDataDir, 'reports.json'), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function cleanMirrorRoot(mirrorRoot) {
  if (!fs.existsSync(mirrorRoot)) return;
  for (const entry of fs.readdirSync(mirrorRoot)) {
    if (/^\d{4}-\d{2}-\d{2}\.(html|md)$/.test(entry)) {
      fs.rmSync(path.join(mirrorRoot, entry), { force: true });
    }
  }
}

function syncToMirror(root, mirrorRoot, reports) {
  ensureDir(mirrorRoot);
  cleanMirrorRoot(mirrorRoot);
  for (const dir of ['assets', 'daily', 'site-data']) {
    fs.rmSync(path.join(mirrorRoot, dir), { recursive: true, force: true });
    copyRecursive(path.join(root, dir), path.join(mirrorRoot, dir));
  }
  fs.copyFileSync(path.join(root, 'index.html'), path.join(mirrorRoot, 'index.html'));
  const markdownDir = path.join(mirrorRoot, 'Markdown');
  ensureDir(markdownDir);
  for (const report of reports) {
    fs.copyFileSync(report.sourcePath, path.join(markdownDir, `${report.date}.md`));
  }
}

function generateSite(rootInput, options = {}) {
  const root = path.resolve(rootInput);
  const reports = collectReports(root);
  if (!reports.length) throw new Error(`No reports found under ${path.join(root, 'reports')}`);

  ensureDir(path.join(root, 'daily'));
  writeAssets(root);
  writeSiteData(root, reports);
  fs.writeFileSync(path.join(root, 'index.html'), renderIndex(reports), 'utf8');
  for (const report of reports) {
    fs.writeFileSync(path.join(root, 'daily', `${report.date}.html`), renderDetail(report, reports), 'utf8');
  }
  if (options.mirrorRoot) syncToMirror(root, options.mirrorRoot, reports);
  return { reports, root };
}

function runCli(argv) {
  const root = argv[2] && !argv[2].startsWith('--') ? argv[2] : process.cwd();
  const mirrorIndex = argv.indexOf('--mirror');
  const mirrorRoot = mirrorIndex >= 0 ? argv[mirrorIndex + 1] : '';
  const result = generateSite(root, { mirrorRoot });
  console.log(JSON.stringify({ root: result.root, reports: result.reports.length, latest: result.reports[0].date, mirrorRoot }));
}

if (require.main === module) {
  runCli(process.argv);
}

module.exports = {
  collectReports,
  generateSite,
  parseReport,
  renderInline,
  renderMarkdownForDetail,
};
