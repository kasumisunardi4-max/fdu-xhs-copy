# FDU 线下典礼 · 小红书打卡文案生成器

手机端优先的单页工具。学员参加 FDU（菲尔莱狄更斯大学）线下典礼后，选择「专业方向 + 打卡风格」即可一键生成第一人称的现场打卡文案（标题 + 正文 + 10 个话题 + 字数统计），并一键复制粘贴到小红书发布。

定位：生成的是**学员本人参加典礼后的真实记录**，不是招生宣传文案。

## 文件

- `index.html` —— 完整页面，单文件、零依赖、图片已内联，可直接用浏览器 / 微信内打开，也可直接丢到任意静态托管（Render / Netlify / Vercel / GitHub Pages）。

## 当前为纯前端 mock

- 文案在浏览器本地生成，逻辑全部封装在 `generateCopy(program, mood)`，返回 `{ title, body, tags, count }`。
- 复制次数（发布代理指标）用 `localStorage` 本地计数，封装在 `COUNTER`。
- **前端不含任何 API Key。**

## 接入真实后端

### 1）文案生成
把 `generateCopy` 的函数体替换为对自有后端的调用（文件内已留 `callBackend` 注释模板）：

```
POST /api/generate-copy
body: { "program": "gtp|cp|iop|mha", "mood": "ceremony|newstage|classmates|lowkey" }
resp: { "title": "...", "body": "...", "tags": ["#...", ...], "count": 363 }
```

模型 Key 只放在后端环境变量里，前端只请求自己的接口。本项目默认接入火山方舟 / 豆包 OpenAI-compatible 接口。

需要配置的环境变量：

```
ARK_API_KEY=你的火山方舟 API Key
ARK_MODEL=Doubao-Seed-2.1-turbo
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

### 2）复制 / 发布计数（全局聚合）
把 `COUNTER.getCopyCount / trackCopy` 替换为：

```
GET  /api/copy-count   -> { "count": 1234 }      # 页面加载时展示
POST /api/track-copy   -> { "count": 1235 }      # 复制成功后 +1 并回传
```

## 文案风控（已内置）

- 第一人称学员视角，自然真诚、有仪式感，不写成广告、不过度宣传。
- 各方向只加入少量专业相关表达。
- 禁用：包毕业 / 轻松拿证 / 保录取 / 快速拿证 / 学历捷径 等；不承诺执业、落户、涨薪、转行结果。
- 正文 300–500 字；话题固定 7 个必带 + 3 个方向相关，共 10 个。
