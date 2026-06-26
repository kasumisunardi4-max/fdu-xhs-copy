import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const ARK_API_KEY = process.env.ARK_API_KEY || process.env.DOUBAO_API_KEY || process.env.OPENAI_API_KEY;
const ARK_MODEL = process.env.ARK_MODEL || process.env.DOUBAO_MODEL || "Doubao-Seed-2.1-turbo";
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const FALLBACK_ENABLED = process.env.FALLBACK_ENABLED !== "false";

let copyCount = Number(process.env.COPY_COUNT_BASE || 0);

const PROGRAMS = {
  gtp: {
    name: "心理学硕士",
    tags: ["#心理学硕士", "#心理学", "#开学典礼"],
    angle: "系统学习心理学，关注研究方法、发展心理、人格、心理病理等基础。"
  },
  cp: {
    name: "心理咨询硕士",
    tags: ["#心理咨询硕士", "#心理咨询", "#开学典礼"],
    angle: "关注咨询关系、家庭系统、积极心理，把助人的专业框架建立起来。"
  },
  iop: {
    name: "管理心理学硕士",
    tags: ["#管理心理学硕士", "#组织管理心理学", "#开学典礼"],
    angle: "从组织心理、人才甄选、团队领导等角度理解管理与人的行为。"
  },
  mha: {
    name: "医疗健康管理硕士",
    tags: ["#医疗健康管理硕士", "#MHA医疗健康管理", "#开学典礼"],
    angle: "补充政策、财务、运营、项目管理与连续照护等医疗健康管理视角。"
  }
};

const MOODS = {
  ceremony: "仪式感强，像学员本人参加典礼后的正式记录。",
  newstage: "重新出发，强调工作多年后再次成为学生的新阶段。",
  classmates: "同学见面，突出线上同学线下初见、同频交流和合影。",
  lowkey: "低调真诚，表达安静记录、不过度张扬的个人感受。"
};

const FIXED_TAGS = [
  "#菲尔莱狄更斯大学开学季",
  "#菲尔莱狄更斯大学毕业季",
  "#布克在职研",
  "#布克硕博",
  "#在布克领航职业成长",
  "#美国菲尔莱狄更斯大学",
  "#FDU开学季"
];

const fallbackTitles = {
  gtp: "FDU心理学硕士｜上海开学典礼打卡",
  cp: "FDU心理咨询硕士｜开学典礼打卡",
  iop: "FDU管理心理学硕士｜开学典礼打卡",
  mha: "FDU医疗健康管理硕士｜开学打卡"
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function validateCopyRequest(input) {
  const program = input?.program;
  const mood = input?.mood;
  if (!PROGRAMS[program] || !MOODS[mood]) {
    const allowed = {
      program: Object.keys(PROGRAMS),
      mood: Object.keys(MOODS)
    };
    const err = new Error("Invalid program or mood");
    err.status = 400;
    err.details = allowed;
    throw err;
  }
  return { program, mood };
}

function countChineseText(text) {
  return [...String(text || "").replace(/\s/g, "")].length;
}

function fallbackCopy(program, mood) {
  const programInfo = PROGRAMS[program];
  const body = [
    `六月底的上海，我参加了 FDU 的线下典礼。签到入场、院长致辞、拨穗正冠和学位授予一个个推进，坐在台下看着学长学姐走上台，仪式感一下就变得很具体。`,
    `这次我读的是${programInfo.name}。${programInfo.angle} 今天站在现场，会更清楚地感觉到，重新学习不是一句口号，而是要认真给自己留出时间和秩序。`,
    `现场也有给新生的录取通知书授予、班委授予和合影环节。茶歇时和同学聊了几句，大家背景不同，但都在一边工作一边读书，那种同频感挺难得。`,
    mood === "lowkey"
      ? "不想写得太夸张，就安静记录一下：新的一程开始了。具体项目信息以学校官方为准，接下来就一步一步把课、作业和讨论认真完成。"
      : "今天算是给自己一个正式的开始。把这条开学记录存下来，也提醒之后的自己，既然已经走到这里，就慢慢、稳稳地把这一程读完。"
  ].join("\n\n");
  return {
    title: fallbackTitles[program],
    body,
    tags: [...FIXED_TAGS, ...programInfo.tags],
    count: countChineseText(body)
  };
}

function normalizeModelCopy(data, program) {
  const programInfo = PROGRAMS[program];
  const title = String(data?.title || fallbackTitles[program]).trim();
  const body = String(data?.body || "").trim();
  const tags = Array.isArray(data?.tags) ? data.tags.map(t => String(t).trim()).filter(Boolean) : [];
  const mergedTags = [...new Set([...FIXED_TAGS, ...tags, ...programInfo.tags])].slice(0, 10);

  if (!body) {
    throw new Error("Model returned empty body");
  }

  return {
    title,
    body,
    tags: mergedTags,
    count: countChineseText(body)
  };
}

async function generateWithArk(program, mood) {
  if (!ARK_API_KEY) {
    throw new Error("ARK_API_KEY is not configured");
  }

  const programInfo = PROGRAMS[program];
  const prompt = [
    "请为小红书生成一篇 FDU（菲尔莱狄更斯大学）线下典礼学员打卡文案。",
    "",
    `专业方向：${programInfo.name}`,
    `专业表达重点：${programInfo.angle}`,
    `打卡风格：${MOODS[mood]}`,
    "",
    "必须遵守：",
    "1. 第一人称学员视角，像本人参加上海线下典礼后的真实记录，不写招生广告。",
    "2. 正文 300-500 字，中文自然口语，真诚、有现场感。",
    "3. 可提及签到入场、院长致辞、拨穗正冠、学位授予、学术成就奖、薪火相传、毕业生合照、茶歇交流、录取通知书授予、班委授予、拍照合影、校友晚宴等现场环节。",
    "4. 不承诺包毕业、保录取、快速拿证、执业、落户、涨薪、转行结果。",
    "5. 结尾可提醒具体项目信息以学校官方为准。",
    "6. 返回 JSON，字段为 title、body、tags。tags 只返回 10 个话题。"
  ].join("\n");

  const response = await fetch(`${ARK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ARK_API_KEY}`
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      messages: [
        {
          role: "system",
          content: "你是小红书中文文案助手，只输出合法 JSON，不要输出 Markdown。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.9,
      max_tokens: 1200
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Ark request failed: ${response.status}`;
    throw new Error(message);
  }

  const text = payload.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Ark returned empty content");
  }
  return normalizeModelCopy(JSON.parse(text), program);
}

async function handleGenerateCopy(req, res) {
  try {
    const raw = await readBody(req);
    const { program, mood } = validateCopyRequest(JSON.parse(raw || "{}"));
    try {
      const copy = await generateWithArk(program, mood);
      sendJson(res, 200, copy);
    } catch (error) {
      if (!FALLBACK_ENABLED) throw error;
      console.warn("Using fallback copy:", error.message);
      sendJson(res, 200, fallbackCopy(program, mood));
    }
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || "Generate copy failed",
      details: error.details
    });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = resolve(__dirname, pathname.replace(/^\/+/, ""));
  if (!filePath.startsWith(resolve(__dirname))) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "POST" && req.url === "/api/generate-copy") {
    await handleGenerateCopy(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/copy-count") {
    sendJson(res, 200, { count: copyCount });
    return;
  }
  if (req.method === "POST" && req.url === "/api/track-copy") {
    copyCount += 1;
    sendJson(res, 200, { count: copyCount });
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res);
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`FDU XHS copy app listening on http://localhost:${PORT}`);
});
