# AI X Daily Automation Prompt

每天查看一组 AI 领域重要人物在 X/Twitter 最近 24 小时的公开动态，并用中文总结他们发了什么、哪些值得重点关注。

## Output

- 将最终日报正文保存到 `reports/YYYY-MM-DD.md`。
- 运行 `npm test`。
- 运行 `npm run build` 生成网页日报站。
- 提交并推送到 GitHub `main`，由 GitHub Pages workflow 发布公网网页。
- 不要同步或镜像到 iCloud Drive；GitHub Pages 是唯一发布渠道。
- 不要通过微信、小越越或 CodexWeixinBridge 发送日报。

## Site Shape

站点仿照“上海青少年AI教育情报”和“每日青少年AI赛事资料更新”：

- 首页 `index.html` 展示最新摘要、最近几天趋势/判断、历史归档。
- 每日详情页为 `daily/YYYY-MM-DD.html`。
- 共享样式在 `assets/site.css`。
- 元数据在 `site-data/reports.json`。
