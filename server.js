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

const STAGES = {
  open: {
    name: "开学 · 新生",
    prompt: "用户身份是 2026 级新生，刚参加 FDU 开学典礼。重点写重新成为学生、见证毕业生拨穗、收到录取通知书、认识同学、开启新旅程。",
    titleSuffix: "开学典礼记录",
    tag: "#开学典礼"
  },
  grad: {
    name: "毕业 · 毕业生",
    prompt: "用户身份是 2026 届毕业生，刚参加 FDU 线下毕业典礼。重点写读完一程、拨穗正冠、学位授予、同学重逢、从学生成为校友。",
    titleSuffix: "毕业典礼记录",
    tag: "#毕业典礼"
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
  open: {
    gtp: [
      "我的FDU新生第一天真的有点热闹",
      "工作几年后我又回FDU认真学心理",
      "在FDU重新做学生这天真的很奇妙"
    ],
    cp: [
      "今天开始在FDU认真学咨询这件事",
      "我的FDU新生第一天真的有点心动",
      "终于要在FDU系统学咨询这件小事"
    ],
    iop: [
      "做管理的人又回FDU继续认真读书",
      "我的FDU新生第一天真的挺上头啊",
      "今天在FDU补管理心理学这块拼图"
    ],
    mha: [
      "医疗人又回FDU认真读书这件小事",
      "我的FDU新生第一天真的有点燃啊",
      "在FDU补上医疗管理这一课真的值"
    ]
  },
  grad: {
    gtp: [
      "今天我终于从FDU心理学顺利毕业啦",
      "读完FDU心理学这程真的好舍不得",
      "今天终于轮到我在FDU顺利毕业了"
    ],
    cp: [
      "今天我真的从FDU心理咨询毕业了",
      "读完FDU咨询这一整程真的很感慨",
      "今天在FDU把咨询这程认真收尾了"
    ],
    iop: [
      "做管理的人今天终于从FDU毕业了",
      "在FDU读完管理心理学这一整程啦",
      "今天把FDU这段读书路认真走完了"
    ],
    mha: [
      "医疗人今天终于从FDU顺利毕业了",
      "在FDU读完MHA这一程真的好感慨",
      "在FDU读完MHA这天真的很感慨"
    ]
  }
};

function chooseFallbackTitle(program, stage) {
  const titles = fallbackTitles[stage][program];
  return titles[Math.floor(Math.random() * titles.length)];
}

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
  const stage = input?.stage || "open";
  const mood = input?.mood || "ceremony";
  if (!PROGRAMS[program] || !STAGES[stage] || !MOODS[mood]) {
    const allowed = {
      program: Object.keys(PROGRAMS),
      stage: Object.keys(STAGES),
      mood: Object.keys(MOODS)
    };
    const err = new Error("Invalid program, stage, or mood");
    err.status = 400;
    err.details = allowed;
    throw err;
  }
  return { program, stage, mood };
}

function countChineseText(text) {
  return [...String(text || "").replace(/(^|\n)\s*-\s*(\n|$)/g, "").replace(/\s/g, "")].length;
}

function cleanTitle(title, program, stage) {
  const fallback = chooseFallbackTitle(program, stage);
  const cleaned = String(title || "")
    .replace(/[#｜|]/g, "")
    .replace(/上海线下|上海/g, "")
    .replace(/打卡/g, "")
    .replace(/\s+/g, "")
    .trim();
  const len = [...cleaned].length;
  const stiff = /(2026|26级|2026级|2026届|典礼记录|新生开学典礼|毕业典礼记录|硕士毕业典礼|硕士开学典礼)/.test(cleaned);
  return !stiff && len >= 16 && len <= 20 ? cleaned : fallback;
}

function cleanStudentCopy(text) {
  return String(text || "")
    .replace(/上海线下的/g, "")
    .replace(/上海线下/g, "")
    .replace(/上海的线下/g, "")
    .replace(/上海/g, "")
    .replace(/打卡/g, "记录")
    .replace(/具体(申请|项目|课程|学校)?信息[^。！？!?\\n]*(以|请以)[^。！？!?\\n]*(学校|官方)[^。！？!?\\n]*[。！？!?]?/g, "")
    .replace(/(大家|同学们)?(还是)?(以|请以)FDU学校官方发布的为准[^。！？!?\\n]*[。！？!?]?/g, "")
    .replace(/(具体)?(申请|项目)?信息(还是)?以学校官方为准[^。！？!?\\n]*[。！？!?]?/g, "")
    .replace(/以学校官方为准[^。！？!?\\n]*[。！？!?]?/g, "")
    .replace(/。[ \t]+/g, "。")
    .replace(/\s+([，。！？；：])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function formatBody(text) {
  const cleaned = cleanStudentCopy(text);
  let paragraphs = cleaned
    .split(/\n\s*-\s*\n|\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1) {
    const sentences = cleaned
      .split(/(?<=[。！？!?])/)
      .map(part => part.trim())
      .filter(Boolean);
    paragraphs = [];
    let current = "";
    for (const sentence of sentences) {
      if (current && [...current + sentence].length > 115) {
        paragraphs.push(current);
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current) paragraphs.push(current);
  }

  return paragraphs.slice(0, 5).join("\n-\n");
}

function normalizeTag(tag) {
  const text = String(tag || "").replace(/^#+/, "").replace(/\s+/g, "").trim();
  return text ? `#${text}` : "";
}

function normalizeTags(tags, program, stage) {
  const programInfo = PROGRAMS[program];
  const stageInfo = STAGES[stage];
  return [...new Set([
    ...FIXED_TAGS,
    ...tags,
    ...programInfo.tags.filter(tag => !tag.includes("典礼")),
    stageInfo.tag
  ].map(normalizeTag).filter(Boolean))].slice(0, 10);
}

function fallbackCopy(program, stage, mood = "ceremony") {
  const programInfo = PROGRAMS[program];
  const stageInfo = STAGES[stage];
  const isGrad = stage === "grad";
  const body = [
    isGrad
      ? "六月底，我参加了 FDU 的毕业典礼。签到入场、院长致辞、拨穗正冠和学位授予一个个推进，轮到自己上台的那一刻，才真正意识到这一程读完了。"
      : "六月底，我参加了 FDU 的典礼。签到入场、院长致辞、拨穗正冠和学位授予一个个推进，坐在台下看着学长学姐走上台，仪式感一下就变得很具体。",
    isGrad
      ? `这一路我读的是${programInfo.name}。${programInfo.angle} 回头看，很多原来零散的经验和想法，确实被这一程慢慢整理成了更清楚的框架。`
      : `这次我读的是${programInfo.name}。${programInfo.angle} 今天站在现场，会更清楚地感觉到，重新学习不是一句口号，而是要认真给自己留出时间和秩序。`,
    isGrad
      ? "茶歇时和同学聊起这一路，大家都是一边工作一边把课读完的人，从线上同窗到线下合影，那种一起走到毕业的感觉很难得。"
      : "现场也有给新生的录取通知书授予、班委授予和合影环节。茶歇时和同学聊了几句，大家背景不同，但都在一边工作一边读书，那种同频感挺难得。",
    mood === "lowkey"
      ? `不想写得太夸张，就安静记录一下：${isGrad ? "一程收尾，认真毕业" : "新的一程开始了"}。这一天对我来说挺重要，先好好存下来。`
      : isGrad
        ? "今天算是给自己一个正式的交代。把这条毕业记录存下来，也提醒之后的自己，既然已经走过这一程，就带着这份底气继续往前。"
        : "今天算是给自己一个正式的开始。把这条开学记录存下来，也提醒之后的自己，既然已经走到这里，就慢慢、稳稳地把这一程读完。"
  ].join("\n-\n");
  return {
    title: chooseFallbackTitle(program, stage),
    body: formatBody(body),
    tags: normalizeTags([], program, stage),
    count: countChineseText(body),
    source: "fallback"
  };
}

function normalizeModelCopy(data, program, stage) {
  const programInfo = PROGRAMS[program];
  const stageInfo = STAGES[stage];
  const title = cleanTitle(data?.title, program, stage);
  const body = formatBody(data?.body);
  const tags = Array.isArray(data?.tags) ? data.tags.map(t => String(t).trim()).filter(Boolean) : [];
  const mergedTags = normalizeTags(tags, program, stage);

  if (!body) {
    throw new Error("Model returned empty body");
  }

  return {
    title,
    body,
    tags: mergedTags,
    count: countChineseText(body),
    source: "ark"
  };
}

async function generateWithArk(program, stage, mood) {
  if (!ARK_API_KEY) {
    throw new Error("ARK_API_KEY is not configured");
  }

  const programInfo = PROGRAMS[program];
  const stageInfo = STAGES[stage];
  const prompt = [
    "请为小红书生成一篇 FDU（菲尔莱狄更斯大学）典礼学员个人记录文案。",
    "",
    `专业方向：${programInfo.name}`,
    `专业表达重点：${programInfo.angle}`,
    `典礼身份：${stageInfo.name}`,
    `身份写作重点：${stageInfo.prompt}`,
    `分享风格：${MOODS[mood]}`,
    "",
    "必须遵守：",
    "1. 第一人称学员视角，像本人参加典礼后的真实记录，不写招生广告。",
    "2. 标题必须 16-20 个字符，不能超过 20 个字符；要像学生自己发的小红书标题，口语、真实、有一点情绪，不要像后台系统拼出来的标题。",
    "2.1 标题不要写成“年份 + FDU + 专业 + 新生/毕业 + 典礼记录”的硬拼结构，不要出现“2026级”“2026届”“26级”“打卡”。",
    "3. 正文 300-500 字，中文自然口语，真诚、有现场感；每个文段之间必须用单独一行 - 分隔。",
    "4. 禁止出现“打卡”“上海线下”“具体申请信息”“具体项目信息”“以学校官方为准”“官方发布为准”等不像学生口吻的表达。",
    "5. 可提及签到入场、院长致辞、拨穗正冠、学位授予、学术成就奖、薪火相传、毕业生合照、茶歇交流、录取通知书授予、班委授予、拍照合影、校友晚宴等现场环节。",
    "6. 不承诺包毕业、保录取、快速拿证、执业、落户、涨薪、转行结果。",
    "7. tags 只返回 10 个话题，每个话题都必须以 # 开头。",
    "8. 返回 JSON，字段为 title、body、tags。"
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
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  return normalizeModelCopy(JSON.parse(cleaned), program, stage);
}

async function handleGenerateCopy(req, res) {
  try {
    const raw = await readBody(req);
    const { program, stage, mood } = validateCopyRequest(JSON.parse(raw || "{}"));
    try {
      const copy = await generateWithArk(program, stage, mood);
      sendJson(res, 200, copy);
    } catch (error) {
      if (!FALLBACK_ENABLED) throw error;
      console.warn("Using fallback copy:", error.message);
      sendJson(res, 200, fallbackCopy(program, stage, mood));
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
