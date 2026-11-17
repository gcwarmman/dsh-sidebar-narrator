/**
 * dsh-sidekick-lens — the plain-language layer.
 *
 * Everything in this file is pure: no timers, no I/O, no Cordis context. It turns
 * observed session events into the three short lines the panel shows
 * (已完成 / 正在做 / 下一步), plus one status light and one position indicator.
 *
 * Provenance rule that drives the whole product:
 *   - observed  (已观察到): derived from real tool calls / tool results we saw in
 *     the session log. The panel is allowed to state these as fact.
 *   - reported  (仅据汇报): derived only from the agent's own words. The panel
 *     must mark these, because the agent can be wrong or optimistic.
 */

/** Light semantics required by the product spec. */
export const LIGHT_MEANING = {
  blue: '在读或搜',
  yellow: '在写或改',
  cyan: '在跑或测',
  green: '完成',
  red: '出错或卡住',
};

/** Tools that read or search — blue light. */
const READ_TOOLS = new Set([
  'read', 'read_file', 'read_files', 'ops_read_files', 'ops_inspect_local_file',
  'grep', 'ops_grep', 'glob', 'ops_glob', 'ls', 'list_dir',
  'web_search', 'search', 'web_fetch', 'fetch', 'domain_search',
  'platform_search', 'multi_search', 'advanced_search', 'research', 'cache_search',
  'github_search', 'lsp', 'read_image', 'acp_status', 'search_context',
  'cache_lookup', 'cordis_inspect_list', 'cordis_inspect_query', 'skill',
  'job_output', 'free_search_test', 'video_search', 'weather', 'ego_snapshot',
  'ego_page_info', 'ego_read_element', 'ego_tabs',
]);

/** Tools that write or edit — yellow light. */
const WRITE_TOOLS = new Set([
  'write', 'write_file', 'edit', 'edit_file', 'apply_patch', 'multi_edit',
  'ops_write', 'ops_edit', 'notebook_edit',
]);

/** Tools that run something, test something or spin up work — cyan light. */
const RUN_TOOLS = new Set([
  'bash', 'shell', 'exec', 'run', 'ops_bash', 'run_code', 'pwsh', 'terminal',
  'subagent', 'subagent_fork', 'workflow', 'job_kill', 'job_list',
  'task', 'dispatch',
]);

/** Tools that update the plan instead of touching the workspace. */
const PLAN_TOOLS = new Set(['todo_write', 'update_plan', 'plan_write']);

/** ego_* browser tools that drive the page rather than read it. */
const EGO_RUN = new Set([
  'ego_navigate', 'ego_click', 'ego_fill', 'ego_select', 'ego_check',
  'ego_key', 'ego_hover', 'ego_drag', 'ego_scroll', 'ego_wait', 'ego_script',
  'ego_cli', 'ego_cdp', 'ego_upload', 'ego_download', 'ego_screenshot',
  'ego_wait_for_human', 'ego_wait_for_selector', 'ego_wait_for_response',
  'ego_wait_for_url', 'ego_dialog', 'ego_login_import', 'ego_auth_flush',
  'ego_space_open', 'ego_space_close',
]);

/** Human names for the tool vocabulary we see in the session log. */
export const TOOL_LABELS = {
  ops_bash: '敲命令', bash: '敲命令', shell: '敲命令', pwsh: '敲命令',
  exec: '敲命令', run: '敲命令', terminal: '敲命令',
  write: '写文件', write_file: '写文件', edit: '改文件', edit_file: '改文件',
  apply_patch: '改文件', multi_edit: '改文件', notebook_edit: '改文件',
  read_file: '翻文件', read_files: '翻文件', ops_read_files: '翻文件',
  ops_inspect_local_file: '细看文件',
  grep: '搜代码', ops_grep: '搜代码', glob: '找文件', ops_glob: '找文件',
  ls: '看目录', list_dir: '看目录',
  web_search: '上网搜', search: '上网搜', web_fetch: '打开网页',
  fetch: '打开网页', domain_search: '查专业库', platform_search: '翻站内',
  multi_search: '多路搜', advanced_search: '带条件搜', research: '查一圈资料',
  cache_search: '翻查过的资料',
  todo_write: '更新清单', update_plan: '调整计划',
  subagent: '派小助手', subagent_fork: '派小助手', workflow: '派一批小助手',
  job_output: '看后台', job_kill: '停后台', job_list: '看后台列表',
  skill: '翻操作说明', ask_user_question: '问你一句', run_code: '跑代码',
  update_goal: '改目标', create_goal: '立目标',
  // 这个 harness 自己常用的几条，缺了就会掉进“办完了一件事”的兜底
  compress: '压缩上下文', decompress: '翻回压缩掉的内容',
  acp_status: '看上下文占用', search_context: '翻压过的记录',
  present: '整理交付物', read_image: '看图片', read: '翻文件',
  weather: '查天气', video_search: '找视频', free_search_test: '测搜索通道',
  plugin_manager: '装或改插件', cordis_inspect_list: '看有哪些检查项',
  cordis_inspect_query: '查运行时状态', billion_context: '整理上下文',
  ego_snapshot: '看页面结构', ego_page_info: '看页面信息',
  ego_read_element: '读页面上的一块', ego_tabs: '看开了哪些页',
  ego_navigate: '打开网页', ego_screenshot: '截图看效果',
  ego_click: '点点看', ego_fill: '填个字段', ego_js: '在页面里查东西',
  ego_wait_for_selector: '等页面出来', ego_wait_for_response: '等接口回话',
  ego_captcha: '看有没有人机验证', ego_wait_for_human: '停下来等你操作',
  ego_status: '看浏览器状态', ego_doctor: '检查浏览器环境',
  ego_script: '跑一段页内脚本', ego_http: '直接请求接口',
  ego_download: '下载文件', ego_upload: '上传文件',
};

/** File stems that deserve a plain name instead of a token. */
const FRIENDLY_STEMS = {
  login: '登录页', signin: '登录页', signup: '注册页', auth: '登录逻辑',
  register: '注册逻辑', user: '用户相关', users: '用户相关', account: '账号相关',
  config: '配置', configs: '配置', settings: '设置', env: '环境配置',
  test: '测试', tests: '测试', spec: '测试', fixture: '测试数据',
  index: '主入口', main: '入口', app: '应用主体', server: '服务端',
  client: '客户端', api: '接口', routes: '路由', router: '路由',
  db: '数据库层', database: '数据库层', schema: '数据结构', model: '数据模型',
  models: '数据模型', view: '界面', views: '界面', page: '页面', pages: '页面',
  style: '样式', styles: '样式', css: '样式', layout: '页面骨架',
  readme: '说明文档', package: '依赖清单', lock: '依赖锁文件',
  dockerfile: '打包配置', makefile: '构建脚本', build: '构建脚本',
  utils: '工具函数', util: '工具函数', helper: '工具函数', helpers: '工具函数',
  error: '报错处理', errors: '报错处理', log: '日志', logger: '日志',
  prompt: '提示词', prompts: '提示词', agent: '代理逻辑', tool: '工具定义',
  tools: '工具定义', type: '类型定义', types: '类型定义',
};

const WHY_READ = '想确认里面到底怎么写的';
const WHY_WRITE = '把刚定下来的改动落进文件';
const WHY_TEST = '确认改完没有碰坏别的';

/** What the user could say to steer this step differently. */
const ADJUST = {
  read: '如果你想让它少翻一点，直接说“先看配置就行”。',
  search: '嫌它搜得太散，可以说“只看这几个文件”。',
  write: '不想动这个文件，直接说“这个先别改”。',
  test: '测试卡太久，可以说“先跳过测试，回头补”。',
  ask: '想让它自己拿主意，直接说“你定，别问我”。',
  plan: '清单不对，直接说“清单里第二件事先做”。',
  other: '方向不对就直接说一句，下一个步骤它就会照办。',
};

const DEFAULT_WHY = '按它自己排的顺序往下做';

/** Cap a string, adding an ellipsis only when it was actually cut. */
export function cut(text, max) {
  const value = typeof text === 'string' ? text : '';
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * A clause borrowed from the agent's own words, safe to drop mid-sentence.
 * Trailing punctuation is dropped: 「在跑测试，确认…：」 reads like a truncation bug.
 */
export function clause(text, max) {
  const value = typeof text === 'string' ? text : '';
  return cut(value, max).replace(/[，。；、：:\s]+$/g, '');
}

/**
 * Remove machine noise before any text can reach the panel: absolute paths,
 * deep relative paths, hex ids and code-looking identifiers.
 * @param {unknown} raw
 * @returns {string}
 */
export function scrub(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return '';
  let text = raw;
  text = text.replace(/[A-Za-z]:[\\/][^\s，。；、）)]+/g, '某个文件');
  text = text.replace(/\\\\[^\s，。；、）)]+/g, '某个路径');
  text = text.replace(/(?:^|[\s(（"'])\/[\w.@-]+(?:\/[\w.@-]+)+/g, ' 某个路径');
  text = text.replace(/\b[0-9a-f]{8,}\b/gi, '一串编号');
  // 工具协议残留（</mcp、<tool_call>、```）不是给人看的东西。
  text = text.replace(/<\/?[A-Za-z][\w:.-]*[^>]*>/g, ' ');
  // …including the ones whose closing '>' never arrived, e.g. 「在跑测试，</mcp 现在…」.
  text = text.replace(/<\/?[A-Za-z][\w:.-]*(?=[\s，。；、：？！）)]|$)/g, ' ');
  text = text.replace(/```/g, ' ');
  text = text.replace(/\s+/g, ' ');
  // 流式文本是逐块切出来的，常在汉字之间留空格（「加载 我 重新 生成 预览」）。
  // 中文本来不加空格，顺手收掉，不然读起来一顿一顿的。
  text = text.replace(/(?<=[\u4e00-\u9fff])[ ]+(?=[\u4e00-\u9fff])/g, '');
  text = text.replace(/(?<=[，。；、：？！）])[ ]+(?=[\u4e00-\u9fff])/g, '');
  text = text.replace(/[ ]+(?=[，。；、：？！）])/g, '');
  text = text.replace(/(?<=[（])[ ]+/g, '');
  return cut(text.trim(), 200);
}

/** Turn one tool name into a short human verb phrase. */
export function humanTool(name) {
  if (typeof name !== 'string' || name === '') return '做点事';
  const direct = TOOL_LABELS[name];
  if (direct !== undefined) return direct;
  if (name.startsWith('mcp__')) {
    const tail = name.split('__').pop() ?? '';
    const spoken = tail.replace(/[_-]+/g, ' ').trim();
    return spoken === '' ? '用外部工具办点事' : `用「${spoken}」办点事`;
  }
  return '做点事';
}

/** Classify a tool call into the four light-bearing families. */
export function classify(name) {
  if (typeof name !== 'string') return 'other';
  if (READ_TOOLS.has(name)) return 'read';
  if (WRITE_TOOLS.has(name)) return 'write';
  if (RUN_TOOLS.has(name)) return 'run';
  if (PLAN_TOOLS.has(name)) return 'plan';
  if (name === 'ask_user_question') return 'ask';
  if (/^(job|schedule)_/.test(name)) return 'run';
  // Families we cannot enumerate by hand. Getting these wrong is what makes the
  // panel fall back to 「办完了一件事」 every other step, so classify by prefix.
  if (/^ego_/.test(name)) return EGO_RUN.has(name) ? 'run' : 'read';
  if (/^cordis_inspect/.test(name)) return 'read';
  if (/^(mcp__|plugin_|cordis_)/.test(name)) return 'other';
  return 'other';
}

/** Light for a family. */
export function lightOf(kind) {
  if (kind === 'read') return 'blue';
  if (kind === 'write') return 'yellow';
  if (kind === 'run' || kind === 'ask') return 'cyan';
  return 'blue';
}

function baseName(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}

function friendlyFile(value) {
  const base = baseName(value);
  if (base === '') return '';
  const stem = base.replace(/\.[A-Za-z0-9]+$/, '');
  if (stem === '') return base;
  const friendly = FRIENDLY_STEMS[stem.toLowerCase()];
  if (friendly !== undefined) return friendly;
  // Very short stems (zh, en, i18n …) read as noise on their own; name the kind.
  if (stem.length <= 2) return `一个小文件（${stem}）`;
  return stem.length > 18 ? cut(stem, 18) : stem;
}

function parseArgs(raw) {
  if (typeof raw === 'object' && raw !== null) return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function firstString(args, keys) {
  if (args === null) return '';
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

const PATH_KEYS = ['path', 'file_path', 'filePath', 'file', 'filename', 'target_file', 'targets'];
const QUERY_KEYS = ['query', 'q', 'pattern', 'search', 'url', 'term'];
const CMD_KEYS = ['command', 'cmd', 'script', 'code'];

/** Classify a shell command line into something a human would say. */
export function commandKind(command) {
  const cmd = typeof command === 'string' ? command.toLowerCase() : '';
  if (cmd === '') return { verb: '在敲命令', object: '', why: '跑一步操作', adjust: ADJUST.test };
  if (/\b(vitest|jest|pytest|mocha|node --test|go test|cargo test|npm test|pnpm test|dotnet test)\b/.test(cmd) || /\btest\b/.test(cmd)) {
    return { verb: '在跑测试', object: '', why: '确认改完没有碰坏别的', adjust: ADJUST.test };
  }
  if (/\b(tsc|eslint|oxlint|lint|typecheck|build|vite build|webpack|tsdown|rollup)\b/.test(cmd)) {
    return { verb: '在检查代码', object: '', why: '确认类型和语法都过得去', adjust: ADJUST.test };
  }
  if (/\b(npm i|npm install|pnpm i|pnpm install|yarn|pip install|uv sync|cargo build|go mod)\b/.test(cmd)) {
    return { verb: '在装依赖', object: '', why: '把要用的东西先备齐', adjust: ADJUST.test };
  }
  if (/\bgit\b/.test(cmd)) return { verb: '在整理代码版本', object: '', why: '把改动归拢一下', adjust: ADJUST.other };
  if (/\b(curl|wget|http|invoke-webrequest)\b/.test(cmd)) return { verb: '在访问接口', object: '', why: '确认外面那一步通不通', adjust: ADJUST.other };
  return { verb: '在敲命令', object: '', why: '跑一步操作', adjust: ADJUST.test };
}

/**
 * Describe one tool call as a sentence fragment: verb + object + why.
 * @param {string} name tool name from the session log
 * @param {unknown} rawArgs the raw arguments string or object
 * @param {string} intent a short clause taken from the agent's own words
 */
export function describeCall(name, rawArgs, intent) {
  const kind = classify(name);
  const args = parseArgs(rawArgs);
  // Only a forward-looking clause ("先看看登录页") can explain why we are doing
  // this call. A finished-work report ("安装成功，没有警告") must not be spliced in.
  const reason = looksForward(intent) ? clause(intent, 26) : '';
  const withReason = (why) => (reason === '' ? why : reason);

  if (kind === 'read') {
    if (name === 'grep' || name === 'ops_grep' || name === 'search') {
      const pattern = firstString(args, QUERY_KEYS);
      return {
        kind, verb: '在代码里翻', object: pattern === '' ? '相关写法' : `「${cut(pattern, 16)}」`,
        why: withReason('找到它写在哪儿'), adjust: ADJUST.search, light: lightOf(kind),
      };
    }
    if (name === 'glob' || name === 'ops_glob') {
      const pattern = firstString(args, QUERY_KEYS);
      return {
        kind, verb: '在找', object: pattern === '' ? '相关文件' : `「${cut(pattern, 16)}」这类文件`,
        why: withReason('确认要动哪几个'), adjust: ADJUST.search, light: lightOf(kind),
      };
    }
    if (name === 'web_search' || name === 'web_fetch' || name === 'research' || name === 'multi_search' || name === 'advanced_search' || name === 'domain_search' || name === 'platform_search' || name === 'cache_search') {
      const query = firstString(args, QUERY_KEYS);
      return {
        kind, verb: '在上网查', object: query === '' ? '外面的资料' : `「${cut(query, 18)}」`,
        why: withReason('补一块它不知道的事实'), adjust: ADJUST.search, light: lightOf(kind),
      };
    }
    const file = friendlyFile(firstString(args, PATH_KEYS));
    return {
      kind, verb: '在看', object: file === '' ? '相关代码' : `「${file}」的代码`,
      why: withReason(WHY_READ), adjust: ADJUST.read, light: lightOf(kind),
    };
  }

  if (kind === 'write') {
    const file = friendlyFile(firstString(args, PATH_KEYS));
    const verb = name === 'write' || name === 'write_file' ? '在写' : '在改';
    return {
      kind, verb, object: file === '' ? '手头这个文件' : `「${file}」`,
      why: withReason(WHY_WRITE), adjust: ADJUST.write, light: lightOf(kind),
    };
  }

  if (kind === 'run') {
    const command = firstString(args, CMD_KEYS);
    const described = commandKind(command);
    if (name === 'subagent' || name === 'subagent_fork') {
      const label = firstString(args, ['description', 'label', 'title']);
      return {
        kind, verb: '派了个小助手去', object: label === '' ? '办一件事' : cut(label, 18),
        why: withReason('这件事不用它自己盯着'), adjust: ADJUST.other, light: lightOf(kind),
      };
    }
    return {
      kind, verb: described.verb,
      object: described.object,
      why: withReason(described.why),
      adjust: described.adjust,
      light: lightOf(kind),
    };
  }

  if (kind === 'ask') {
    return {
      kind, verb: '在等你回话', object: '',
      why: withReason('这一步它自己拿不准'), adjust: ADJUST.ask, light: lightOf(kind),
    };
  }

  if (kind === 'plan') {
    return {
      kind, verb: '在理清单', object: '',
      why: withReason('把接下来几件事排个序'), adjust: ADJUST.plan, light: lightOf(kind),
    };
  }

  return {
    kind, verb: humanTool(name), object: '',
    why: withReason(DEFAULT_WHY), adjust: ADJUST.other, light: lightOf(kind),
  };
}

/** Compose the one-line sentence shown in the panel. */
export function sentence(verb, object, why) {
  const parts = [verb ?? '', object ?? ''].filter((part) => part !== '').join('');
  const head = parts === '' ? '在做手头这件事' : parts;
  const tail = typeof why === 'string' && why !== '' ? why : '';
  return cut(tail === '' ? `${head}。` : `${head}，${tail}。`, 60);
}

/** Past-tense form for the 已完成 row. */
export function pastTense(verb, kind) {
  const map = {
    在看: '看完了', 在改: '改完了', 在写: '写好了', 在跑测试: '跑完测试了',
    在检查代码: '检查过了', 在装依赖: '依赖装好了', 在敲命令: '命令跑完了',
    在整理代码版本: '版本整理好了', 在找: '找过了', 在代码里翻: '翻过了',
    在上网查: '查过了', 在等你回话: '问过你了', 在理清单: '清单理好了',
    派了个小助手去: '小助手派出去了', 在访问接口: '接口试过了',
    做点事: '办完了一件事', 做点事情: '办完了一件事',
    // 这个 harness 自己的动作，缺了就会掉进「办完了一件事」的兜底
    装或改插件: '插件弄好了', 压缩上下文: '上下文压过了',
    翻回压缩掉的内容: '翻回去了', 看上下文占用: '上下文占用看过了',
    翻压过的记录: '压过的记录翻过了', 整理交付物: '交付物摆出来了',
    看图片: '图看过了', 查天气: '天气查过了', 找视频: '视频找过了',
    测搜索通道: '搜索通道测过了', 看有哪些检查项: '检查项看过了',
    查运行时状态: '运行时状态查过了', 整理上下文: '上下文理过了',
    看页面结构: '页面结构看过了', 截图看效果: '截图看过了',
    立目标: '目标定好了', 改目标: '目标改好了', 看目标: '目标看过了',
  };
  const known = map[verb];
  if (known !== undefined) return known;

  // A verb we never wrote down. Chinese verbs in this panel all start with the
  // action — sometimes behind a leading 「在」 — so the first character is enough
  // to say what happened. Far better than a generic 「办完了一件事」, and it never
  // echoes the raw token.
  const bare = verb.startsWith('在') ? verb.slice(1) : verb;
  const PFX = [
    ['看', '看过了'], ['翻', '翻过了'], ['查', '查过了'], ['搜', '搜过了'],
    ['找', '找过了'], ['读', '读过了'], ['问', '问过了'], ['改', '改好了'],
    ['写', '写好了'], ['装', '弄好了'], ['跑', '跑完了'], ['敲', '敲完了'],
    ['压', '压完了'], ['整理', '整理好了'], ['调整', '调整好了'],
    ['下载', '下好了'], ['上传', '传好了'], ['停', '停好了'],
    ['等', '等到了'], ['填', '填好了'], ['点', '点过了'], ['截', '截好了'],
    ['派', '派出去了'], ['测', '测过了'], ['访问', '访问过了'],
  ];
  for (const [head, past] of PFX) {
    if (bare.startsWith(head)) return past;
  }

  // Never echo an unmapped verb into a sentence — it reads like machine output.
  // Fall back to what KIND of work it was, which is always true and still useful.
  const byKind = {
    read: '看完了', write: '改好了', run: '跑完了这一步',
    plan: '理清了清单', ask: '问过你了', other: '办完了一件事',
  };
  return byKind[kind] ?? '办完了一件事';
}

/** Map a raw tool failure into one plain sentence. */
export function humanError(raw) {
  const text = typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : String(raw);
  if (text === '') return '碰到个没预料的错，正在想办法绕过去';
  if (/EPERM|EACCES|permission denied|被占用/i.test(text)) return '有个文件被别的程序占着，改不动';
  if (/FS_EDIT_NOT_FOUND|old_string was not found|no match|not found in file/i.test(text)) return '要改的那段文字没对上，得重新找一遍';
  if (/ENOENT|no such file/i.test(text)) return '找不到那个文件了';
  if (/ERR_PNPM|npm ERR|pnpm/i.test(text)) return '装依赖那一步没走通';
  if (/ETIMEDOUT|timed out|timeout/i.test(text)) return '等太久没反应，超时了';
  if (/ECONNREFUSED|ECONNRESET|socket hang up|ENOTFOUND/i.test(text)) return '连接断了，对面没接上';
  if (/JSON|unexpected token/i.test(text)) return '返回的数据格式不对，读不出来';
  if (/rate.?limit|\b429\b|quota/i.test(text)) return '请求太频繁，被限流了';
  if (/context|token.{0,6}limit|too long/i.test(text)) return '对话太长，塞不下了';
  if (/syntax|unexpected|parse error/i.test(text)) return '代码写错了一处，语法没过';
  if (/cancel|abort|aborted|interrupted/i.test(text)) return '这一轮被叫停了';
  return '碰到个没预料的错，正在想办法绕过去';
}

/** Human duration for the idle line. */
export function humanElapsed(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '刚起步';
  if (value < 60_000) return '不到一分钟';
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  return `${hours} 个多小时`;
}

/** "2 分 10 秒" — used by the idle line. */
export function clockText(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '不到 1 秒';
  const totalSeconds = Math.round(value / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes} 分` : `${minutes} 分 ${seconds} 秒`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
}

/** Pull one short intent clause out of an assistant message. */
export function intentOf(text) {
  if (typeof text !== 'string' || text.trim() === '') return '';
  const cleaned = scrub(text.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`]/g, ' '));
  const first = cleaned.split(/[。！？\n!?]/)[0] ?? '';
  const trimmed = first.trim();
  if (trimmed === '') return '';
  return clause(trimmed, 26);
}

/** How much raw thinking to keep around before trimming the tail. */
const THINKING_KEEP = 1200;
/** How much of it to hand the explain door, and to quote on the panel. */
const THINKING_SHOWN = 400;
const THINKING_QUOTED = 46;

/**
 * Fold a chunk of reasoning text into the rolling buffer.
 *
 * Trims from the front, not the back: the last thing it thought is the thing it
 * is about to do, which is the only part worth quoting or showing.
 */
export function noteThinking(state, text) {
  if (typeof text !== 'string' || text === '') return state;
  const merged = `${state.thinking ?? ''}${text}`;
  state.thinking = merged.length <= THINKING_KEEP ? merged : merged.slice(-THINKING_KEEP);
  return state;
}

/**
 * Replace the machine-shaped tokens a thought is full of before it can be shown.
 *
 * Reasoning quotes tool names and relative paths far more often than the final
 * answer does. Deleting them leaves sentences like 「得调用 ，然后看看 里的跳转」,
 * so they are swapped for the same neutral nouns the rest of the panel uses.
 */
function desensitize(text) {
  let out = text;
  // Whole paths first, before any narrower rule can eat one segment of them and
  // leave a half-translated "某个文件/某个文件" behind. The last segment may carry
  // an extension, so both shapes are allowed inside the chain.
  out = out.replace(/[\w.@-]+(?:\/[\w.@-]+)+\/?/g, '某个文件');
  // snake_case identifiers are tool names here (read_file, ops_grep).
  out = out.replace(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g, '某个动作');
  // file names carrying a code extension
  out = out.replace(/\b[\w.-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|yml|yaml|py|md|css|html|sh|ps1|txt)\b/gi, '某个文件');
  // ALL-CAPS words are file names and acronyms (README, API, TODO); a panel that
  // shows them reads as a terminal.
  out = out.replace(/\b[A-Z]{2,}\b/g, '某个名字');
  // kebab-case identifiers (sidekick-lens, dsh-sidebar-narrator)
  out = out.replace(/\b[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+\b/g, '某个名字');
  // A replacement leaves the space that separated it from the prose, which reads
  // as a typo in Chinese. Chinese-to-Chinese spaces are always wrong here, and a
  // space before punctuation is too.
  out = out.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '');
  out = out.replace(/\s+([，。；、：？！）])/g, '$1');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * The most useful sentence out of a block of thinking.
 *
 * Reasoning is the least finished prose in the whole session: first person,
 * self-correcting, half English, littered with tool names. A human sentence has
 * to pass three filters — no machine noise, a forward-looking verb, and enough
 * length to be a thought rather than a fragment.
 *
 * Searched back to front on purpose. The end of thinking is the decision; the
 * opening is usually a restatement of the user's request.
 */
export function thinkingClause(state) {
  const raw = typeof state.thinking === 'string' ? state.thinking : '';
  if (raw === '') return '';
  const cleaned = desensitize(scrub(raw.replace(/```[\s\S]*?```/g, ' ')));
  if (cleaned === '') return '';
  const pieces = cleaned
    .split(/[。！？!?\n]/)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '');
  for (let i = pieces.length - 1; i >= 0; i -= 1) {
    const piece = pieces[i];
    // Needs a readable amount of substance, a 打算 rather than a report, and
    // ideally some Chinese, since a stray English fragment reads as noise here.
    if (piece.length < 8) continue;
    if (!looksForward(piece)) continue;
    if (!/[\u4e00-\u9fff]/.test(piece)) continue;
    // 「然后看看某个文件里的跳转」 quoted after 在想 reads wrong; the connective
    // only makes sense inside the longer paragraph it came from.
    const trimmed = piece.replace(/^(然后|接着|所以|但是|不过|另外|还有|现在|那|就|先|最后)[，,]?\s*/, '');
    return clause(trimmed, THINKING_QUOTED);
  }
  return '';
}

/** The tail of the thinking buffer, ready to be handed to the explain door. */
export function thinkingDigest(state) {
  const raw = typeof state.thinking === 'string' ? state.thinking : '';
  if (raw === '') return '';
  const cleaned = desensitize(scrub(raw));
  if (cleaned === '') return '';
  return cut(cleaned, THINKING_SHOWN);
}

/**
 * Is this clause a plan ("I am about to …") rather than a report ("I did …")?
 * Only plans are safe to use as the reason for the *current* step: pasting a
 * finished-work sentence there produces nonsense like
 * "在访问接口，安装成功，没有警告。"
 *
 * Note the completion markers are deliberately narrow. Words like 失败 or 错误
 * appear inside perfectly good plans ("确认登录失败后跳到哪里"), so they are not
 * treated as evidence that the sentence is about finished work.
 */
export function looksForward(text) {
  if (typeof text !== 'string' || text === '') return false
  if (/成功|已完成|完成|做好了|改好了|装好了|跑通了|通过了|搞定了|已经|没有警告|已生效|已改|已装/.test(text)) return false
  return /要|打算|先|接下来|然后|准备|需要|应该|看看|看一下|确认|检查|找|改|补|加|删|整理|跑|装|查|翻|读/.test(text)
}

/** Extract readable text from a message's content blocks. */
export function textOfContent(content) {
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      text += block.text;
    }
  }
  return text;
}

/**
 * Extract the thinking blocks from a message's content.
 *
 * Kept separate from {@link textOfContent} on purpose: reasoning is not the
 * agent's answer, and mixing it in would make 它自己最后说 quote what it thought
 * rather than what it said out loud.
 */
export function reasoningOfContent(content) {
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'reasoning' && typeof block.text === 'string') {
      text += block.text;
    }
  }
  return text;
}

const MAX_STEPS = 8;

// The heartbeat strip: how many slots, and over what span of real time.
// Twenty-four slots over three seconds reads as "alive or not at a glance"
// without being a second-by-second chart nobody needs.
export const PULSE_SLOTS = 24;
export const PULSE_WINDOW_MS = 3000;

/** Fresh per-session lens state. */
export function createLensState(sessionId) {
  return {
    sessionId: typeof sessionId === 'string' ? sessionId : '',
    running: false,
    startedAt: 0,
    turnStartedAt: 0,
    turn: 0,
    step: 0,
    stepsDone: 0,
    current: null,
    currentCallId: '',
    lastDone: null,
    recent: [],
    todos: [],
    files: [],
    intent: '',
    lastAssistant: '',
    error: null,
    lastTurn: null,
    steers: [],
    cancelNote: null,
    updatedAt: 0,
    beats: [],
    streamChars: 0,
    // 思维链。面板和摘要都要用它回答「它到底在想什么」：只靠工具名的话，
    // 「在翻文件」这种话是猜出来的，而它自己的思路是读到的。
    // 只保留尾巴 —— 思考的结尾才是它当下的打算，开头那段「用户想要…」没用。
    thinking: '',
    thinkingAt: 0,
    // 累计账本：面板要回答「这一轮做了哪些」，只靠最近 8 步不够。
    tally: { read: 0, write: 0, run: 0, plan: 0, ask: 0, other: 0 },
    failedCount: 0,
    seenFiles: [],
  };
}

/**
 * Record that something actually happened at `at`.
 *
 * This is the only thing that makes the heartbeat move. It is called from the
 * event folding below, never from a timer, so a still strip means the agent
 * really is still — not that a poll was skipped.
 */
function noteBeat(state, at) {
  const beats = state.beats.length >= 96 ? state.beats.slice(-95) : state.beats.slice();
  beats.push(at);
  state.beats = beats;
}

/**
 * Sample the last few seconds into fixed slots.
 *
 * Returns `{ bars, live }` where `bars` is `PULSE_SLOTS` values in 0..1.
 * A running agent with no beats inside the window returns all zeros — that is
 * the honest reading ("nothing has moved in three seconds"), so the panel can
 * show a flat line instead of pretending to be busy.
 */
export function buildPulse(state, now) {
  const at = toTime(now, Date.now());
  const bars = new Array(PULSE_SLOTS).fill(0);
  const from = at - PULSE_WINDOW_MS;
  for (const beat of state.beats) {
    if (!(beat > from) || beat > at) continue;
    const index = Math.min(PULSE_SLOTS - 1, Math.floor(((beat - from) / PULSE_WINDOW_MS) * PULSE_SLOTS));
    bars[index] += 1;
  }
  // Normalise so one burst doesn't flatten everything else, then taper the
  // oldest slot to zero so the strip always ends in a clean edge.
  const peak = Math.max(1, ...bars);
  const shaped = bars.map((count, index) => {
    if (count === 0) return 0;
    const height = 0.32 + 0.68 * Math.min(1, count / peak);
    return Math.round(height * 1000) / 1000 + 0 * index;
  });
  return { bars: shaped, live: shaped.some((value) => value > 0) };
}

function toTime(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function pushRecent(state, entry) {
  // 同一个动作连着做两遍时（重试、循环读同一个地方），最近步骤里会留下两条一模一样
  // 的句子。给模型看的时候那是纯噪音，所以就地合并成一条。
  const last = state.recent[state.recent.length - 1];
  if (last !== undefined && last.text === entry.text) {
    state.recent = [...state.recent.slice(0, -1), entry].slice(-MAX_STEPS);
    return;
  }
  state.recent = [...state.recent, entry].slice(-MAX_STEPS);
}

function noteFile(state, name) {
  if (state.files.includes(name)) return;
  state.files = [...state.files, name].slice(-40);
}

/** Track one live token frame so the intent clause is fresh while streaming. */
export function applyStream(state, frame, now) {
  const at = toTime(now, Date.now());
  const chunk = frame?.chunk;
  if (chunk === null || typeof chunk !== 'object') return state;
  if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
    const merged = (state.intent ? `${state.intent} ` : '') + chunk.text;
    const clause = intentOf(merged);
    if (clause !== '' && looksForward(clause)) state.intent = clause;
    state.streamChars = (state.streamChars ?? 0) + chunk.text.length;
    noteBeat(state, at);
  }
  if (chunk.type === 'reasoning-delta') {
    // Thinking is work too: it keeps the heartbeat alive so "quiet" means
    // stopped, not "quietly considering". It is also the only place the panel
    // can learn what the agent is actually weighing up.
    if (typeof chunk.text === 'string' && chunk.text !== '') {
      noteThinking(state, chunk.text);
      state.thinkingAt = at;
    }
    noteBeat(state, at);
  }
  if (chunk.type === 'tool-call-delta' && typeof chunk.name === 'string' && state.current === null) {
    // A tool call is being announced but the durable event has not landed yet.
    state.current = { ...describeCall(chunk.name, chunk.arguments, state.intent), name: chunk.name, startedAt: at, callId: '' };
    noteBeat(state, at);
  }
  state.updatedAt = at;
  return state;
}

/** Mark running / idle from the agent status event. */
export function applyAgentStatus(state, status, now) {
  const at = toTime(now, Date.now());
  if (status === 'running') {
    state.running = true;
    if (state.startedAt === 0) state.startedAt = at;
    if (state.turnStartedAt === 0) state.turnStartedAt = at;
    if (state.error !== null) state.error = null;
  } else if (status === 'idle') {
    state.running = false;
    state.current = null;
    state.currentCallId = '';
    if (state.lastTurn === null && state.turnStartedAt > 0) {
      state.lastTurn = {
        durationMs: Math.max(0, at - state.turnStartedAt),
        filesChanged: state.files.length,
        lastLine: readableLine(state.lastAssistant),
      };
    }
  }
  state.updatedAt = at;
  return state;
}

/** A hard failure from the agent loop — red light with a plain sentence. */
export function applyAgentError(state, error, now) {
  const at = toTime(now, Date.now());
  const raw = typeof error === 'string' ? error : error?.message ?? String(error ?? '');
  state.error = { text: humanError(raw), raw: scrub(raw), at };
  state.updatedAt = at;
  return state;
}

/**
 * Fold one durable session event into the lens state.
 * @param {ReturnType<typeof createLensState>} state
 * @param {{type?: string, data?: any, time?: number}} event
 * @param {number} now
 */
export function applySessionEvent(state, event, now) {
  const at = toTime(event?.time, toTime(now, Date.now()));
  const type = typeof event?.type === 'string' ? event.type : '';
  const data = event?.data ?? {};

  switch (type) {
    case 'turn/start': {
      state.running = true;
      state.turn = typeof data.turn === 'number' ? data.turn : state.turn;
      state.turnStartedAt = at;
      state.lastTurn = null;
      state.cancelNote = null;
      state.steers = [];
      if (state.startedAt === 0) state.startedAt = at;
      noteBeat(state, at);
      break;
    }
    case 'step/start': {
      if (typeof data.step === 'number') state.step = data.step;
      state.intent = '';
      // Thinking belongs to the step that produced it. The durable order is
      // step/start -> assistant/message (carrying the reasoning) -> tool/call,
      // so clearing here empties the previous step without erasing this one.
      state.thinking = '';
      noteBeat(state, at);
      break;
    }
    case 'tool/call': {
      const described = describeCall(data.name, data.arguments, state.intent);
      state.current = {
        ...described,
        name: typeof data.name === 'string' ? data.name : '',
        callId: typeof data.callId === 'string' ? data.callId : '',
        startedAt: at,
      };
      state.currentCallId = state.current.callId;
      noteBeat(state, at);
      break;
    }
    case 'tool/result': {
      noteBeat(state, at);
      const failed = data.error !== undefined && data.error !== null || data.message?.isError === true;
      const reason = data.error?.reason ?? data.error?.code ?? '';
      const current = state.current;
      state.current = null;
      state.currentCallId = '';
      if (current !== null) {
        state.stepsDone += 1;
        const kind = current.kind ?? 'other';
        const tally = { ...state.tally };
        tally[kind] = (tally[kind] ?? 0) + 1;
        state.tally = tally;
        if (failed) state.failedCount += 1;
        const verb = pastTense(current.verb, current.kind);
        const done = {
          verb,
          object: current.object ?? '',
          why: current.why ?? '',
          kind: current.kind,
          failed,
          result: failed ? humanError(reason) : '',
          adjust: current.adjust ?? ADJUST.other,
          at,
          name: current.name,
        };
        state.lastDone = done;
        if (current.kind === 'write' && typeof current.object === 'string' && current.object !== '') {
          noteFile(state, current.object.replace(/[「」]/g, ''));
        }
        pushRecent(state, { ...done, text: sentence(verb, done.object, '') });
        if (failed) state.error = { text: `${done.object} 那步没过去：${done.result}`, raw: scrub(reason), at };
        else if (state.error !== null) state.error = null;
      }
      break;
    }
    case 'assistant/message': {
      const text = textOfContent(data.message?.content);
      const short = scrub(text);
      if (short !== '') {
        state.lastAssistant = cut(short, 120);
        // A finished turn's summary is history, not the reason for the next call.
        const clause = intentOf(short);
        if (clause !== '' && looksForward(clause)) state.intent = clause;
      }
      // The durable record carries the whole thinking block, so a cold replay
      // (after a reload) can still answer 「它在想什么」, not just live streaming.
      const thinking = reasoningOfContent(data.message?.content);
      if (thinking !== '') {
        noteThinking(state, ` ${thinking}`);
        state.thinkingAt = at;
      }
      noteBeat(state, at);
      break;
    }
    case 'user/message': {
      const source = data.source ?? {};
      if (source.kind === 'user' && source.form !== 'notice') {
        const text = scrub(textOfContent(data.message?.content ?? data.content));
        if (text !== '') state.steers = [...state.steers, cut(text, 80)].slice(-4);
      }
      break;
    }
    case 'todo/write': {
      const todos = Array.isArray(data.todos) ? data.todos : [];
      state.todos = todos
        .filter((todo) => todo !== null && typeof todo === 'object')
        .map((todo) => ({
          status: typeof todo.status === 'string' ? todo.status : 'pending',
          text: cut(scrub(typeof todo.text === 'string' ? todo.text : typeof todo.content === 'string' ? todo.content : ''), 40),
        }))
        .filter((todo) => todo.text !== '');
      break;
    }
    case 'turn/end': {
      state.running = false;
      state.current = null;
      state.currentCallId = '';
      const duration = state.turnStartedAt > 0 ? Math.max(0, at - state.turnStartedAt) : 0;
      state.lastTurn = {
        durationMs: duration,
        filesChanged: state.files.length,
        lastLine: readableLine(state.lastAssistant),
        reason: typeof data.reason?.kind === 'string' ? data.reason.kind : '',
      };
      if (data.reason?.kind === 'aborted' || data.reason?.kind === 'cancelled') {
        state.cancelNote = {
          text: `这一轮被叫停了。${state.lastDone === null ? '没有已经做完的步骤' : `已经做完 ${state.stepsDone} 步`}，改了 ${state.files.length} 个文件，都留着。`,
          at,
        };
      }
      state.turnStartedAt = 0;
      noteBeat(state, at);
      break;
    }
    default:
      return state;
  }
  state.updatedAt = at;
  return state;
}

/** Pending work from the last todo list, if any. */
function pendingTodo(state) {
  const todo = state.todos.find((item) => item.status !== 'completed' && item.status !== 'cancelled');
  return todo === undefined ? null : todo;
}

/** A guessed next step derived from the last thing that actually happened. */
function guessNext(state) {
  const todo = pendingTodo(state);
  if (todo !== null) {
    return { text: todo.text, source: 'observed', why: '清单上排着的下一件', saw: '清单里还有没打勾的条目', result: '', adjust: '清单不对就直接说“先做另一件”。' };
  }

  // A sentence the agent actually said about what comes next beats any template.
  // This is the one place a guess earns its keep: it is quoting, not inventing.
  // Anything reporting finished work is rejected by looksForward.
  const said = state.running ? intentOf(state.intent) : '';
  if (said !== '' && looksForward(said)) {
    return { text: `${said}。`, source: 'reported', why: '它在自己说要做什么', saw: '刚说过一句打算', result: '', adjust: '方向不对就直接说，它在下一步会看到。' };
  }
  // Thinking outranks every template below and loses only to a spoken plan: it
  // is what the agent is weighing up, not a promise. Checked BEFORE the
  // no-observation bail-out on purpose — "nothing happened yet, but it says it
  // is about to do X" is exactly the case this is for. Marked 仅据汇报 because
  // no tool call has confirmed it.
  const thought = state.running ? thinkingClause(state) : '';
  if (thought !== '') {
    return { text: `${thought}。`, source: 'reported', why: '它在脑子里权衡这件事', saw: '读到它当前的思考', result: '', adjust: '想法偏了就直接说，它在下一步会看到。' };
  }

  // While a step is in flight, the honest next step follows what that step is
  // FOR, not whatever finished before it.
  const basis = state.running && state.current !== null ? state.current : state.lastDone;
  if (basis === null) {
    return { text: '等你发话，或者它自己开下一件。', source: 'observed', why: '还没有可观察的步骤', saw: '暂时没看到工具调用', result: '', adjust: '想让它先做哪件，直接说一句。' };
  }

  const kind = basis.kind;
  const object = typeof basis.object === 'string' ? basis.object : '';
  if (kind === 'read') {
    return { text: '照着看到的东西动手改。', source: 'observed', why: '看清楚之后的常规下一步', saw: '刚才在翻代码', result: '', adjust: '如果只是让你确认一下，可以说“看完就行，先别改”。' };
  }
  if (kind === 'write') {
    return { text: '跑一遍测试，确认没碰坏别的。', source: 'observed', why: '改完文件通常会自检', saw: object === '' ? '刚动过文件' : `刚动过 ${object}`, result: '', adjust: '不想让它跑测试，可以说“跳过测试”。' };
  }
  if (kind === 'run') {
    return { text: '把结果对一遍，再决定接着改哪里。', source: 'observed', why: '跑完总要看结果', saw: '刚才在跑东西', result: '', adjust: '结果不对可以直说哪里不对。' };
  }
  if (kind === 'plan') {
    return { text: '按清单顺序往下做。', source: 'observed', why: '清单刚理过', saw: '刚整理过待办', result: '', adjust: '顺序不对直接说“先做另一件”。' };
  }
  if (kind === 'ask') {
    return { text: '等你回话，再接着做。', source: 'observed', why: '它把决定权交给你了', saw: '刚问过你一句', result: '', adjust: '不想回答就说“你定”，它会自己选一个。' };
  }
  return { text: '接着做清单里的下一件。', source: 'observed', why: '一步做完自然往下走', saw: '刚完成一步', result: '', adjust: '换方向就直接说。' };
}

/** 每一步做完，「结果」那一格该怎么说 —— 按这一步干了什么分开说。 */
const RESULT_BY_KIND = {
  read: '看完了，要的内容都在',
  write: '改好了，没出岔子',
  run: '跑通了，没有报错',
  plan: '理清楚了',
  ask: '问完拿到答复了',
  other: '办完了，没出岔子',
};

/** The 已完成 row. */
function doneRow(state) {
  const done = state.lastDone;
  if (done === null) return null;
  const text = done.failed
    ? `${done.object} 那一步没过去：${done.result}。`
    : sentence(done.verb, done.object, '');
  return {
    text,
    source: 'observed',
    details: {
      why: done.why === '' ? '它自己排的顺序' : done.why,
      saw: done.object.trim() === ''
        ? `第 ${Math.max(1, state.stepsDone)} 步做完`
        : `第 ${Math.max(1, state.stepsDone)} 步做完，动的是 ${done.object.trim()}`,
      result: done.failed ? `失败：${done.result}` : (RESULT_BY_KIND[done.kind] ?? RESULT_BY_KIND.other),
      adjust: done.adjust ?? ADJUST.other,
    },
  };
}

/** The 正在做 row. */
function doingRow(state) {
  // A failure must surface here whenever nothing is actively running, even if the
  // turn itself is still marked running (the agent often retries after an error).
  if (state.error !== null && state.current === null) {
    return {
      text: `这里可能卡住了：${state.error.text}。`,
      source: 'observed',
      details: {
        why: '它报了一个错，正在兜底',
        saw: state.error.raw === '' ? '看到了一个报错' : `看到报错：${state.error.raw}`,
        result: '这一步没有正常结束',
        adjust: '可以直接说“换个办法”，或者按“先停一下”让它停下。',
      },
    };
  }
  // A live tool call only describes "正在做" while the turn is actually running.
  // After a turn/end a straggler call can survive a replay; showing it then
  // produces "在访问接口" next to a green 完成 light.
  const current = state.running ? state.current : null;
  if (current !== null) {
    const text = sentence(current.verb, current.object ?? '', current.why ?? '');
    return {
      text,
      source: 'observed',
      details: {
        why: current.why === '' ? '它自己的判断' : current.why,
        saw: `正在用「${humanTool(current.name)}」这一类动作${current.object ? `，对象是 ${current.object}` : ''}`,
        result: '还没出结果',
        adjust: current.adjust ?? ADJUST.other,
      },
    };
  }
  if (state.running) {
    // Between two tool calls the only real signal is what it is thinking. Before
    // the thinking buffer existed this row could only ever say 「在想下一步做什么」,
    // which is the panel admitting it cannot see anything.
    const thought = thinkingClause(state);
    if (state.intent !== '') {
      return {
        text: `在琢磨：${state.intent}。`,
        source: 'reported',
        details: {
          why: '正在组织下一步动作',
          saw: '它自己说了这句话',
          result: '还没出结果',
          adjust: '想催就直接说，它在下一步会看到。',
        },
      };
    }
    if (thought !== '') {
      return {
        text: `在想着${thought}。`,
        source: 'reported',
        details: {
          why: '它还没开始动手，正在心里过一遍',
          saw: cut(thinkingDigest(state), 160),
          result: '还没出结果',
          adjust: '想法不对就直接说，它在下一步会看到。',
        },
      };
    }
    return {
      text: '在想下一步做什么。',
      source: 'observed',
      details: {
        why: '正在组织下一步动作',
        saw: '暂时没有新的工具调用',
        result: '还没出结果',
        adjust: '想催就直接说，它在下一步会看到。',
      },
    };
  }
  return null;
}

/** Strip the punctuation that makes two near-identical lines look different. */
function bareText(text) {
  return String(text ?? '').replace(/[\s，。；、：！？（）「」『』【】]/g, '');
}

/**
 * True when two panel lines say the same thing. 正在做 and 下一步 sitting on the
 * same sentence is the loudest kind of noise this panel can make.
 */
export function repeats(a, b) {
  const x = bareText(a);
  const y = bareText(b);
  if (x === '' || y === '') return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 6) return false;
  for (let i = 0; i + 6 <= x.length; i += 1) {
    if (y.includes(x.slice(i, i + 6))) return true;
  }
  return false;
}

/** A next step that still helps when the obvious guess would just repeat. */
function nextWhenRepeating(state) {
  const kind = state.current === null ? 'run' : state.current.kind;
  if (kind === 'run') {
    return {
      text: '等这一步的结果出来再定：过了就收尾，没过就接着改。',
      why: '要等结果才知道往哪走', saw: '手上有一步正在跑',
      adjust: '想换个方向，直接说一句，它下一步就照办。',
    };
  }
  if (kind === 'write') {
    return {
      text: '改完先自己核对一遍，再决定下一步。',
      why: '改动刚落地，还没验证', saw: '手上正在改东西',
      adjust: '不想让它自检，可以说“改完直接告诉我”。',
    };
  }
  return {
    text: '这一步做完，它会接着往下走。',
    why: '顺序由它自己排', saw: '手上有一步正在做',
    adjust: '想让它先做别的，直接说一句。',
  };
}

/** The whole panel payload — the only thing that crosses the wire. */
const PHASE_BY_KIND = {
  read: '摸清现状',
  write: '动手实现',
  run: '验证结果',
  plan: '定计划',
  ask: '等你回话',
  other: '推进中',
};

/**
 * The ledger: what this stretch of work actually produced, by kind.
 *
 * The three rows answer "what was the last step"; this answers "how far along is
 * the thing I asked for". They are different questions and the panel must not
 * pretend otherwise — a customer who asked for a feature wants to know that
 * three files changed and the tests ran twice, not that step 47 read a file.
 */
export function buildProgress(state) {
  const tally = state.tally ?? {};
  const files = Array.isArray(state.files) ? state.files.length : 0;
  const items = [];
  const writes = tally.write ?? 0;
  if (files > 0) items.push({ key: 'write', text: `改了 ${files} 个文件` });
  else if (writes > 0) items.push({ key: 'write', text: `改过 ${writes} 处` });
  if ((tally.read ?? 0) > 0) items.push({ key: 'read', text: `看过 ${tally.read} 处代码` });
  if ((tally.run ?? 0) > 0) items.push({ key: 'run', text: `跑过 ${tally.run} 次命令` });
  if ((tally.plan ?? 0) > 0) items.push({ key: 'plan', text: `理过 ${tally.plan} 次清单` });
  if ((tally.ask ?? 0) > 0) items.push({ key: 'ask', text: `问过你 ${tally.ask} 次` });

  // While it runs, the phase must come from the call it is holding right now.
  // Falling back to the last finished step would say 「验证结果」 while the row
  // above says 「在想下一步做什么」 — two readings of the same moment.
  const basis = state.running ? state.current : (state.current ?? state.lastDone);
  const phase = state.error !== null
    ? '卡住了'
    : !state.running
      ? '已经收尾'
      : basis === null
        ? '想办法'
        : (PHASE_BY_KIND[basis.kind] ?? PHASE_BY_KIND.other);

  const total = state.todos.length;
  const finished = state.todos.filter((todo) => todo.status === 'completed').length;
  return {
    phase,
    items: items.slice(0, 4),
    steps: state.stepsDone,
    files,
    touched: Array.isArray(state.files) ? state.files.slice(-4) : [],
    failed: state.failedCount ?? 0,
    todos: total === 0 ? null : { done: finished, total },
  };
}

/** The unfinished checklist items, in the order they were written down. */
export function pendingTodos(state) {
  const list = Array.isArray(state.todos) ? state.todos : [];
  return list
    .filter((item) => item.status !== 'completed' && item.status !== 'cancelled')
    .map((item) => item.text)
    .filter((text) => typeof text === 'string' && text !== '');
}

/**
 * One plain sentence: what came out of the work, and what is still missing.
 *
 * The shape is deliberate and comes from how people actually read a long task:
 *
 *   result first   what landed, named rather than counted
 *   then the gap   what is still on the list, and which item comes next
 *
 * What it deliberately does NOT lead with is 「看过 29 处代码、跑过 25 次命令」.
 * Those numbers only prove the agent was busy; they answer "how much did it
 * move", not "am I any closer to what I asked for". They stay in
 * `progress.items` for the expanded detail, where a curious user can find them,
 * but the one-line summary is reserved for outcome and remaining work.
 */
export function buildSummary(state, options = {}) {
  const progress = buildProgress(state);
  const template = typeof options.emptyState === 'string' ? options.emptyState : '';
  const hasWork = progress.steps > 0 || progress.items.length > 0 || progress.todos !== null;
  if (!hasWork) {
    return template !== '' ? template : '还没出成品：这一轮刚开始。';
  }

  const tally = state.tally ?? {};
  const touched = progress.touched.filter((name) => name !== '');

  // 1) 结果：做成了什么。数字给范围，名字给可扫读的落点 —— 两个都要。
  const landed = [];
  if (progress.files > 0) {
    landed.push(
      touched.length > 0 && touched.length <= 3
        ? `动了 ${progress.files} 个文件（${touched.join('、')}）`
        : `动了 ${progress.files} 个文件`,
    );
  } else if ((tally.write ?? 0) > 0) {
    landed.push(`改过 ${tally.write} 处`);
  }

  // 2) 还差什么：清单上没打勾的条目。先给可执行的那一件，再补完成度。
  const pending = pendingTodos(state);
  const gap = [];
  if (pending.length > 0) {
    const count = progress.todos !== null ? `清单 ${progress.todos.done} / ${progress.todos.total}，` : '';
    gap.push(
      pending.length === 1
        ? `${count}还差「${cut(pending[0], 24)}」这一件`
        : `${count}还剩 ${pending.length} 件，下一件是「${cut(pending[0], 24)}」`,
    );
  } else if (progress.todos !== null) {
    gap.push(`清单 ${progress.todos.done} / ${progress.todos.total} 全打勾了`);
  }

  // 3) 没有可点名的产出，也没有清单时：说它把时间花在哪、还差什么，
  //    而不是报一串「看过 N 处、跑过 N 次」的忙碌指标。
  if (landed.length === 0 && gap.length === 0) {
    if ((tally.read ?? 0) > 0) {
      landed.push(`还没动手，先看了 ${tally.read} 处代码把情况弄清楚`);
    } else {
      const doing = state.running ? state.current : (state.current ?? state.lastDone);
      if (doing === null) {
        landed.push(progress.steps > 0 ? `走了 ${progress.steps} 步` : '还没动手，先把清单理出来了');
      } else if (doing.kind === 'run') {
        landed.push('在跑东西验证，还没出结果');
      } else if (doing.kind === 'plan') {
        landed.push('在理清单，还没动手改');
      } else if (doing.kind === 'ask') {
        landed.push('在等你回话');
      } else {
        landed.push(progress.steps > 0 ? `走完 ${progress.steps} 步，还没落成文件` : '还没动手');
      }
    }
  }

  const body = [...landed, ...gap].join('，');
  const head = template !== '' ? template : `到目前为止：${body}`;
  const base = template !== '' ? head.replace('{duration}', '').replace('{files}', String(progress.files)) : head;
  const tail = [];
  if (progress.failed > 0) tail.push(`中间碰了 ${progress.failed} 次错`);
  const text = tail.length === 0 ? base : `${base}，${tail.join('，')}`;
  return cut(`${text}。`, 120);
}

/** What the panel shows at the top: machine-readable view of the same ledger. */
export function buildView(state, now, options = {}) {
  const at = toTime(now, Date.now());
  const current = doingRow(state);
  let done = doneRow(state);
  let next = guessNext(state);

  // 「正在做」和「下一步」说同一句话是最吵的噪音 —— 换一句真正有用的。
  if (state.running && current !== null && repeats(current.text, next.text)) {
    const alt = nextWhenRepeating(state);
    next = { text: alt.text, source: 'observed', why: alt.why, saw: alt.saw, result: '', adjust: alt.adjust };
  }
  // 同样，别让「已完成」和「正在做」描述同一件事（重试同一个动作时会发生）。
  if (done !== null && current !== null && repeats(done.text, current.text)) {
    done = { ...done, text: '上一步做完了。' };
  }

  let light;
  let lightNote;
  if (state.error !== null) {
    light = 'red';
    lightNote = state.error.text;
  } else if (!state.running) {
    light = 'green';
    lightNote = '这一轮结束了';
  } else if (state.current !== null && state.running) {
    light = state.current.light ?? lightOf(state.current.kind);
    lightNote = sentence(state.current.verb, state.current.object ?? '', '');
  } else if (current !== null) {
    light = 'blue';
    lightNote = current.text;
  } else {
    light = 'blue';
    lightNote = '正在想';
  }

  const pending = state.todos.filter((item) => item.status !== 'completed' && item.status !== 'cancelled').length;
  const finished = state.stepsDone;
  const position = {
    index: Math.max(1, finished + (state.running ? 1 : 0)),
    total: Math.max(2, finished + 1 + pending),
  };

  const pulse = buildPulse(state, at);
  const beatAge = state.beats.length === 0 ? -1 : Math.max(0, at - state.beats[state.beats.length - 1]);
  // Hand the raw beat times to the client too, so the strip can keep decaying
  // between frames instead of freezing at whatever the last event produced.
  const beats = state.beats.filter((beat) => beat > at - PULSE_WINDOW_MS).map((beat) => Math.round(at - beat));

  const rows = [];
  if (done !== null) {
    rows.push({ key: 'done', label: '已完成', text: done.text, source: done.source, details: done.details });
  }
  rows.push({
    key: 'doing',
    label: '正在做',
    text: current === null
      ? (state.running ? '在想下一步做什么。' : '现在没在动。')
      : current.text,
    source: current === null ? 'observed' : current.source,
    details: current === null
      ? { why: '这一轮已经结束', saw: '没有正在进行的工具调用', result: '', adjust: '想接着做就直接说一句。' }
      : current.details,
  });
  rows.push({ key: 'next', label: '下一步', text: next.text, source: next.source, details: { why: next.why, saw: next.saw, result: next.result, adjust: next.adjust } });

  const idle = state.running
    ? null
    : {
      text: buildIdleText(state, options),
      at,
    };

  return {
    sessionId: state.sessionId,
    running: state.running,
    light,
    lightNote: cut(lightNote, 60),
    position,
    progress: buildProgress(state),
    summary: buildSummary(state, options),
    rows: rows.slice(-3),
    idle,
    error: state.error === null ? null : { text: state.error.text },
    cancelNote: state.cancelNote,
    files: state.files.slice(-6),
    stepsDone: state.stepsDone,
    updatedAt: at,
    elapsedMs: state.turnStartedAt > 0 ? Math.max(0, at - state.turnStartedAt) : 0,
    pulse,
    beatAge,
    beats: beats.map((age) => age),
  };
}

/** Non-empty idle text: last round duration, files, and the last line. */
export function buildIdleText(state, options = {}) {
  const template = typeof options.emptyState === 'string' ? options.emptyState : '';
  const last = state.lastTurn;
  if (last === null) {
    if (template !== '') return template;
    // Cold start (or a replayed session with no turn boundary in the tail): report
    // what we actually observed rather than claiming it never did anything.
    if (state.stepsDone > 0) {
      const files = state.files.length;
      return cut(`空闲。能看到的这段里，它已经走了 ${state.stepsDone} 步${files === 0 ? '' : `，动过 ${files} 个文件`}。`, 160);
    }
    return '空闲。还没干过活，说一句它就开工。';
  }
  const base = `空闲。上一轮用了 ${clockText(last.durationMs)}，改了 ${last.filesChanged} 个文件。`;
  const tail = last.lastLine === '' ? '' : `最后一句：${cut(last.lastLine, 60)}`;
  const text = template !== '' ? template.replace('{duration}', clockText(last.durationMs)).replace('{files}', String(last.filesChanged)) : base;
  return cut(tail === '' || template !== '' ? text : `${text}${tail}`, 160);
}

/**
 * Whether a line is worth showing as 最后一句 summary.
 * The agent sometimes ends a turn in English or in raw machine phrasing; pasting
 * that into an otherwise Chinese panel breaks the whole point of the panel.
 */
export function readableLine(raw) {
  if (typeof raw !== 'string') return '';
  const text = scrub(raw);
  if (text === '') return '';
  // Needs actual Chinese: a panel written in plain Chinese must not suddenly quote
  // an English sentence at the user.
  if (/[\u4e00-\u9fff]/.test(text) === false) return '';
  return text;
}

/**
 * How long since anything actually happened, or -1 when nothing ever has.
 *
 * The explain door needs this: 「它是不是卡住了」 is the most common question a
 * person asks, and it is only answerable from the gap since the last real event
 * — not from the fact that a turn is still nominally open.
 */
export function quietMs(state, now) {
  const at = toTime(now, Date.now());
  if (!Array.isArray(state.beats) || state.beats.length === 0) return -1;
  const last = state.beats[state.beats.length - 1];
  return Math.max(0, at - last);
}

/** "刚刚" / "48 秒前" / "3 分钟前" — how stale the last real action is. */
function quietText(ms) {
  if (ms < 0) return '还没看到动作';
  if (ms < 5000) return '刚刚';
  if (ms < 60_000) return `${Math.round(ms / 1000)} 秒前`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} 分钟前`;
  return `${Math.round(ms / 3_600_000)} 小时前`;
}

/**
 * Compact digest handed to the explain assistant.
 *
 * Split into 已观察到 / 仅据汇报 ON PURPOSE. The panel's whole promise is that a
 * claim is labelled by where it came from; if the digest arrives as one
 * undifferentiated paragraph the assistant cannot keep that promise and will
 * happily present the agent's own optimism as an observed fact.
 */
export function buildDigest(state, options = {}) {
  const progress = buildProgress(state);
  const at = toTime(options.now, Date.now());
  const observed = [];
  const reported = [];

  observed.push(`状态：${state.running ? '正在跑' : '空闲'}（${progress.phase}）`);
  // 先说产出，再说缺口 —— 用户问「到哪一步了」要的就是这两句。
  // buildSummary already opens with 到目前为止： unless a custom template replaced
  // it, so prefixing again produced 「到目前为止：到目前为止：动了 2 个文件」.
  const summary = buildSummary(state, options);
  observed.push(/^到目前为止：/.test(summary) ? summary : `到目前为止：${summary}`);
  const stillPending = pendingTodos(state);
  if (stillPending.length > 0) observed.push(`还没做完：${stillPending.slice(0, 5).join('；')}`);
  if (state.running) observed.push(`最近一次动作：${quietText(quietMs(state, at))}`);
  if (state.current !== null) {
    observed.push(`当前动作：${sentence(state.current.verb, state.current.object ?? '', state.current.why ?? '')}`);
  }
  // The panel always shows a 下一步 row, so the digest carries the same guess —
  // marked as a guess, since it is inferred from what just happened rather than
  // observed. Without the label the narrator would retell it as fact. When the
  // guess is a quote of what the agent said it would do, it belongs in the
  // reported section instead: the agent's own words are not tool evidence.
  const next = guessNext(state);
  if (next.source === 'reported') reported.push(`它自己说下一步要：${next.text}`);
  else observed.push(`它下一步大概会：${next.text}（推测）`);
  observed.push(`已完成步骤数：${state.stepsDone}`);
  if (progress.todos !== null) observed.push(`清单进度：${progress.todos.done} / ${progress.todos.total}`);
  for (const item of state.recent.slice(-6)) observed.push(`- ${item.text}`);
  if (state.files.length > 0) observed.push(`动过的文件：${state.files.slice(-6).join('、')}`);
  if (state.error !== null) observed.push(`出的错：${state.error.text}`);
  if (state.steers.length > 0) observed.push(`你最近给的提醒：${state.steers.slice(-2).join(' / ')}`);

  if (state.lastAssistant !== '') reported.push(`它自己最后说：${cut(state.lastAssistant, 100)}`);
  // Thinking belongs here, not in 已观察到: it is what the agent is telling
  // itself, with nothing in the tool record to back it. Without this line the
  // narrator could only ever describe 在翻文件 and had to guess the reason.
  const thinking = thinkingDigest(state);
  if (thinking !== '') reported.push(`它心里正在盘算：${thinking}`);

  const lines = ['【已观察到】（真的读到了工具调用和结果）', ...observed];
  if (reported.length > 0) {
    lines.push('', '【仅据汇报】（只有它自己的说法，没有工具证据）', ...reported);
  }
  if (typeof options.extra === 'string' && options.extra !== '') {
    lines.push('', '【用户刚补的话】', options.extra);
  }
  return lines.join('\n');
}

/**
 * System prompt for the read-only explain door.
 *
 * Kept here as a pure function rather than inline in the route handler so the
 * wording is testable — the prompt IS the product of this door.
 *
 * The `{{DIGEST}}` placeholder is filled last on purpose: the digest is the only
 * thing the model is allowed to treat as fact, so it goes in a delimited block at
 * the very end where nothing after it can blur the boundary.
 */
export function explainPrompt(digest) {
  return [
    '你是一个坐在用户旁边的“侧边旁白”。你的唯一工作，是用大白话给用户解说主 Agent 此时此刻在干嘛。用户可能完全不懂代码，你要让他觉得安心、听得懂。',
    '',
    '请严格遵循以下要求：',
    '1. 只说 1 到 2 句话，口语化，像朋友在旁边提示。绝对不要用任何 Markdown 格式、列表、或者标题。',
    '2. 把机器动作翻译成“生活化动作 + 业务对象 + 目的”。',
    '   - 错误示范：“正在调用 read_file 查看 src/auth/login.tsx，并读取第 40 行参数。”（太机器）',
    '   - 错误示范：“它在翻文件，然后在改配置。”（太模糊）',
    '   - 正确示范：“在看登录页的代码，确认输错密码时往哪跳。看完应该就会去改配置了。”',
    '3. 屏蔽底层技术细节（如代码函数名、命令行参数、绝对路径），但允许保留业务相关的名字（如“登录页”、“测试”、“配置文件”）。',
    '4. 只依据下方【当前进展】里的事实来说。如果信息太少看不出来，就说“这会儿它还在默默干活，暂时看不出具体在忙啥”，绝对不要瞎猜编造。',
    '5. 不要用“根据记录”、“综上”、“目前正在执行”这种公文腔，也不要说“我会帮你转告”，你只是个旁白。',
    '',
    '【当前进展】（这是你唯一能看到的信息）：',
    '<digest>',
    digest,
    '</digest>',
  ].join('\n');
}
