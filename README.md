# FDU 线下典礼 · 小红书文案生成器

手机端优先的单页工具。学员参加 FDU（菲尔莱狄更斯大学）线下典礼后，选择「专业方向 + 分享风格」即可一键生成第一人称的现场文案（标题 + 正文 + 10 个话题 + 字数统计），并一键复制粘贴到小红书发布。

定位：生成的是**学员本人参加典礼后的真实记录**，不是招生宣传文案。

## 文件

- `index.html` —— 完整页面，单文件、零依赖、图片已内联，可直接用浏览器 / 微信内打开，也可直接丢到任意静态托管（Render / Netlify / Vercel / GitHub Pages）。

## 当前部署结构

- 页面由 `index.html` 提供，文案生成请求后端 `POST /api/generate-copy`。
- 后端在 `server.js`，通过火山方舟 / 豆包 OpenAI-compatible 接口生成文案。
- 如果豆包接口未接通，会返回备用文案，并带 `source: "fallback"`；接通时返回 `source: "ark"`。
- **前端不含任何 API Key。**

## 接入真实后端

### 1）文案生成
```
POST /api/generate-copy
body: { "program": "gtp|cp|iop|mha", "stage": "open|grad" }
resp: { "title": "...", "body": "...", "tags": ["#...", ...], "count": 363, "source": "ark" }
```

模型 Key 只放在后端环境变量里，前端只请求自己的接口。

Render 环境变量：

```
ARK_API_KEY=你的火山方舟 API Key
ARK_MODEL=火山方舟控制台里的 Endpoint ID
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
FALLBACK_ENABLED=true
COPY_COUNT_BASE=0
```

注意：`ARK_MODEL` 很多情况下不是模型展示名，而是方舟控制台创建推理接入点后的 Endpoint ID，常见形态类似 `ep-...`。

### 2）复制 / 发布计数（全局聚合）
```
GET  /api/copy-count   -> { "count": 1234 }      # 页面加载时展示
POST /api/track-copy   -> { "count": 1235 }      # 复制成功后 +1 并回传
```

## 计数清零（测试用）

- **加参数（推荐，微信内可用）**：访问 `你的网址?reset=1`，自动清零并提示。
- **控制台**：`localStorage.removeItem('fdu_copy_count')` 后刷新。
- 计数按设备/浏览器本地存储；接入 `/api/track-copy` 后改为后端全局计数。

## 文案风控（已内置）

- 第一人称学员视角，自然真诚、有仪式感，不写成广告、不过度宣传。
- 各方向只加入少量专业相关表达。
- 禁用：包毕业 / 轻松拿证 / 保录取 / 快速拿证 / 学历捷径 等；不承诺执业、落户、涨薪、转行结果。
- 正文 300–500 字；话题固定 7 个必带 + 3 个方向相关，共 10 个。
