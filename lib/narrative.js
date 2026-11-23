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
  narrative: '旁白逻辑', sidekick: '侧写主体', cordis: '插件装配', patch: '插件补丁',
  preview: '预览页', screenshots: '截图清单', icon: '图标', docs: '文档',
  readme: '说明文档', license: '授权文件', gitignore: '忽略清单',
  tsconfig: '编译配置', eslint: '检查配置', vite: '构建配置', webpack: '构建配置',
  cli: '命令行入口', bin: '命令行入口', lib: '核心代码', src: '源码',
  dist: '构建产物', tests: '测试', e2e: '端到端测试', mock: '假数据',
  mocks: '假数据', story: '示例页', stories: '示例页', theme: '主题',
  themes: '主题', i18n: '多语言文案', locale: '多语言文案', locales: '多语言文案',
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
 *
 * Truncation is cleaned up too, because a borrowed clause is cut at an arbitrary
 * character: a row once read 「在读文件「客户端」，功能侧已确认完好（ 返回 200…」 —
 * the cut landed inside an opening bracket and left it hanging over empty space.
 * A half-open bracket and a trailing ellipsis are both dropped here rather than
 * left for the reader to interpret.
 */
export function clause(text, max) {
  const value = typeof text === 'string' ? text : '';
  let out = cut(value, max).replace(/[，。；、：:…\s]+$/g, '');
  // Drop the tail from an unmatched opening bracket: it introduced something that
  // did not fit, and printing the introducer alone says less than printing nothing.
  for (const [open, close] of [['（', '）'], ['(', ')'], ['「', '」'], ['《', '》']]) {
    const opened = out.lastIndexOf(open);
    if (opened !== -1 && out.indexOf(close, opened) === -1) out = out.slice(0, opened);
  }
  return out.replace(/[，。；、：:…\s]+$/g, '');
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

/**
 * What a read tool with no path is actually looking at.
 *
 * Page inspection, runtime queries, background-job reads: they take no file, so
 * the old fallback called every one of them 「在看相关代码」 — 159 identical rows
 * in one real session, and the reader could not tell them apart.
 */
const READ_TARGETS = {
  ego_js: '页面上的内容', ego_snapshot: '页面上的内容',
  ego_read_element: '页面上的内容', ego_page_info: '页面的状态',
  ego_tabs: '开了哪些页', ego_status: '浏览器状态', ego_doctor: '浏览器环境',
  ego_captcha: '人机验证的情况',
  cordis_inspect_query: '运行时状态', cordis_inspect_list: '有哪些检查项',
  job_output: '后台任务', job_list: '后台任务', list_agents: '小助手的进展',
  acp_status: '上下文占用', search_context: '压过的记录',
  cache_search: '查过的资料', skill: '操作说明', present: '交付物',
};

/** Turn a tool name into the thing it went to look at, in plain words. */
export function readObject(name) {
  const direct = READ_TARGETS[name];
  if (direct !== undefined) return direct;
  const label = humanTool(name);
  if (label === '做点事') return '手头的情况';
  // Labels are verb phrases (「看有哪些检查项」); the panel supplies its own verb.
  const bare = label.replace(/^(在|看|翻|读|查|搜|找|等|停|填|点|截|装|改|写|跑|敲)+/, '');
  if (bare === '' || /^[了有没在的]/.test(bare)) return '手头的情况';
  return bare;
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

/** What a file's FOLDER says about its role, when the name itself says nothing. */
const DIR_ROLES = {
  test: '测试', tests: '测试', spec: '测试', specs: '测试', __tests__: '测试',
  docs: '文档', doc: '文档', documentation: '文档',
  lib: '核心代码', src: '源码', source: '源码',
  scripts: '脚本', script: '脚本', tools: '工具脚本', bin: '命令行入口',
  locale: '多语言文案', locales: '多语言文案', i18n: '多语言文案',
  assets: '素材', public: '公开资源', static: '静态资源',
  styles: '样式', css: '样式', components: '组件', component: '组件',
  pages: '页面', views: '界面', api: '接口', routes: '路由',
  tmp: '临时脚本', temp: '临时脚本', scratch: '临时脚本', drafts: '草稿',
  config: '配置', configs: '配置', ci: '流水线配置',
};

/** What a file's EXTENSION says about its role when the name says nothing. */
const EXT_ROLES = {
  css: '样式', scss: '样式', less: '样式',
  md: '说明文档', mdx: '说明文档',
  json: '配置', yml: '配置', yaml: '配置', toml: '配置', ini: '配置',
  svg: '图', png: '图', jpg: '图', jpeg: '图', webp: '图', gif: '图',
  sh: '脚本', ps1: '脚本', bat: '脚本', cmd: '脚本',
  txt: '文本记录', html: '页面', htm: '页面',
};

/**
 * Turn a workspace path into the plain name a user can recognise.
 *
 * 「某个文件」 is the last resort, not the default: a row that says
 * 「改完了「某个文件」」 382 times told the reader nothing, not even whether the
 * same file was being edited twice. The stem, the stem's words and finally the
 * folder are each tried before giving up — between them they name almost every
 * real file without ever printing a path.
 */
function friendlyFile(value) {
  const base = baseName(value);
  if (base === '') return '';
  const stem = base.replace(/\.[A-Za-z0-9]+$/, '');
  if (stem === '') return base;
  const friendly = FRIENDLY_STEMS[stem.toLowerCase()];
  if (friendly !== undefined) return friendly;
  // Very short stems (zh, en …) read as noise on their own; name the kind first,
  // because "某个文件（zh）" at least tells the user which of them it was.
  if (stem.length <= 2) return `一个小文件（${stem}）`;
  // Compound stems carry their role in one of their words: narrative.test ->
  // 测试, cordis.patch -> 插件补丁. Last word wins ("types.d" is about types).
  const words = stem.toLowerCase().split(/[._\-]+/).filter((word) => word !== '');
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const hit = FRIENDLY_STEMS[words[index]];
    if (hit !== undefined) return hit;
  }
  const ext = (base.match(/\.([A-Za-z0-9]+)$/) ?? [])[1];
  if (ext !== undefined) {
    const byExt = EXT_ROLES[ext.toLowerCase()];
    if (byExt !== undefined) return byExt;
  }
  // The folder the file lives in is often the only thing that distinguishes it.
  // A leading dot is plumbing, not meaning: `.tmp/probe.mjs` is a temp script, and
  // reading it as an unknown Latin name made it 「某个文件」 for no reason.
  const folders = String(value).split(/[\\/]+/).filter((part) => part !== '');
  for (let index = folders.length - 2; index >= 0; index -= 1) {
    const folder = folders[index].toLowerCase().replace(/^\.+/, '');
    const role = DIR_ROLES[folder];
    if (role !== undefined) return role;
  }
  // Anything else still in Latin script is an internal name the user cannot act
  // on. Naming the kind is more useful than printing `useTabInfo` and hoping.
  if (/^[A-Za-z0-9_.\-]+$/.test(stem)) return '某个文件';
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

/**
 * The plugin a management call is about, as a plain name.
 *
 * A package name is legal on this panel — README forbids tool names and paths, not
 * the name of the thing the user asked for — but a directory path is not, so the
 * friendly name is tried first and the bare folder name is the fallback.
 */
function pluginTarget(args) {
  const raw = firstString(args, ['target', 'name', 'package', 'bundle', 'plugin']);
  if (raw === '') return '';
  const named = packageName(raw);
  if (named !== '') return named;
  const friendly = friendlyFile(raw);
  if (friendly !== '' && !PLACEHOLDERS.has(friendly)) return friendly;
  const base = baseName(raw).replace(/\.[A-Za-z0-9]+$/, '');
  return base === '' ? '' : cut(base, 18);
}

/**
 * A folder or package name as the user knows it.
 *
 * `dsh-sidekick-lens` must come back as `dsh-sidekick-lens`. Running it through
 * the friendly-name table translated the word "sidekick" into 「侧写主体」, so the
 * record of "I turned that plugin off" named something the user had never said.
 * Lowercase only: a temp folder like `dsh-9GYoN9` is machine noise, not a name.
 */
function packageName(value) {
  // Plugin ids carry a source prefix (`include:sidekick-lens`). The prefix is
  // plumbing; the reader asked about "sidekick-lens" and that is the name.
  const bare = typeof value === 'string' ? value.replace(/^[A-Za-z_-]+:(?=[^\\/])/, '') : value;
  const base = baseName(bare).replace(/\.[A-Za-z0-9]+$/, '');
  if (base === '' || base.length > 40) return '';
  if (!/^[a-z][a-z0-9._-]*$/.test(base)) return '';
  // Bare `src`, `lib`, `test`: a role, not a name — friendlyFile says it better.
  if (!/[-_.]/.test(base)) return '';
  return cut(base, 24);
}

/**
 * What a shell command is aimed at, as a plain name.
 *
 * A command line more often than not names the file it touches. Reading that out
 * is the difference between 「命令跑完了。」 1182 times and 「读完了「旁白逻辑」。」:
 * same observation, but only the second one tells the reader what happened.
 */
function commandTarget(command) {
  const cmd = typeof command === 'string' ? command : '';
  if (cmd === '') return '';
  // Files first, folders second. A command usually carries both (`cd <dir>; node
  // <script>`), and taking whichever came first literally named the working
  // directory — 「在读文件「侧写主体」」 for a test run inside that folder.
  const files = cmd.match(/[\w.@\-]+(?:[\\/][\w.@\-]+)*\.[A-Za-z0-9]{1,5}\b/g) ?? [];
  const paths = [
    ...(cmd.match(/(?:[A-Za-z]:[\\/]|\.{1,2}[\\/])[^\s'";|)]+/g) ?? []),
  ];
  for (const candidate of [...files, ...paths]) {
    // `@scope` folders and bare directories never make a readable object.
    if (/^[@.]/.test(candidate)) continue;
    const name = friendlyFile(candidate);
    // 「某个文件」 adds nothing to a row that had nothing to begin with.
    if (name !== '' && !PLACEHOLDERS.has(name)) return `「${name}」`;
  }
  return '';
}

/**
 * Which shell verbs are aimed at a named thing.
 *
 * Naming a target for the others was worse than saying nothing: git works on the
 * repo rather than a file, so 「版本整理好了「api.github.com」」 paired the verb with
 * the host it happened to talk to, and every `ls` claimed to be reading a file.
 */
const TARGETED_VERBS = new Set(['在跑脚本', '在读文件', '在写文件', '在检查代码', '在跑测试', '在文件里找', '在看目录']);

/**
 * Tools outside the shell/browser families, said as the thing they act on.
 *
 * A job list, a goal update and a delegation are all `run` or `other` tools with no
 * `command` and no `file_path`, so every one of them fell through to 「在敲命令」 or
 * 「做点事」 — the row said nothing while the agent was plainly doing something.
 * Shape: [kind, verb, object, why].
 */
const TOOL_ACTIONS = {
  job_list: ['read', '在看后台跑着', '哪些命令', '确认刚才那批还在不在'],
  job_output: ['read', '在收后台', '回来的结果', '看它跑完没有'],
  job_kill: ['run', '在停后台', '一条命令', '你说不用等了'],
  list_agents: ['read', '在看小助手', '各自做到哪了', '确认它们没有卡住'],
  create_goal: ['plan', '在定目标', '', '把这件事定成要一直做的'],
  update_goal: ['plan', '在改目标', '进度', '把进展同步进目标里'],
  ego_help: ['read', '在翻浏览器', '用法说明', '确认这一步该怎么走'],
};

/**
 * Browser actions, said as what they do to the page.
 *
 * These are `run` tools but they carry no shell command, so `commandKind('')`
 * answered 「在敲命令」 — 152 rows claiming to type commands while the agent was
 * clicking a button. The object is the page, because that is what changes.
 */
const EGO_ACTIONS = {
  ego_navigate: ['在打开', '页面'], ego_click: ['在点', '页面上的一处'],
  ego_fill: ['在填', '页面上的输入框'], ego_select: ['在选', '页面上的一个选项'],
  ego_check: ['在勾', '页面上的一个选项'], ego_key: ['在按', '页面上的一个键'],
  ego_hover: ['在悬停看', '页面上的一个位置'], ego_drag: ['在拖动', '页面上的一个元素'],
  ego_scroll: ['在翻', '页面'], ego_wait: ['在等', '页面加载'],
  ego_script: ['在跑', '页内脚本'], ego_cli: ['在跑', '页内脚本'],
  ego_cdp: ['在问', '浏览器内部状态'], ego_upload: ['在传', '一个文件上去'],
  ego_download: ['在下载', '一个文件'], ego_screenshot: ['在拍', '当前页面的样子'],
  ego_wait_for_human: ['在等你操作', ''], ego_wait_for_selector: ['在等页面上那块', ''],
  ego_wait_for_response: ['在等接口回话', ''], ego_wait_for_url: ['在等页面跳过去', ''],
  ego_dialog: ['在处理', '页面弹窗'], ego_login_import: ['在搬', '浏览器里的登录状态'],
  ego_auth_flush: ['在存', '登录状态'], ego_space_open: ['在开', '一个浏览器工作区'],
  ego_space_close: ['在关', '一个浏览器工作区'], ego_http: ['在请求', '一个接口'],
};

/**
 * The folder a version-control command is working in.
 *
 * Git operates on a repository, not a file, so it never had an object: 100 calls
 * all read 「在整理代码版本，把改动归拢一下」. The repository has a name the user
 * knows, and naming it is the difference between that and 「整理「dsh-sidekick-lens」
 * 的版本」.
 */
function repoTarget(command) {
  const cmd = typeof command === 'string' ? command : '';
  if (cmd === '') return '';
  const paths = cmd.match(/(?:[A-Za-z]:[\\/]|\.{1,2}[\\/])[^\s'";|)]+/g) ?? [];
  for (const candidate of paths) {
    const name = packageName(candidate);
    if (name !== '') return `「${name}」`;
  }
  return '';
}

/**
 * The address a network command is talking to.
 *
 * Only ever a host: it is the one thing a request is about that still fits on the
 * row, and 「接口试过了「本地服务」」 beats the bare verb.
 */
function urlTarget(command) {
  const cmd = typeof command === 'string' ? command : '';
  const url = cmd.match(/https?:\/\/([^\s'"`)\]]+)/i);
  if (url === null) return '';
  const host = url[1].split(/[/?#]/)[0];
  // Quoted like every other named object: 「在访问接口本地服务」 ran together into one
  // noun phrase and read like a place called 接口本地服务.
  if (/^(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?$/i.test(host)) return '「本地服务」';
  return `「${cut(host, 18)}」`;
}

/** Classify a shell command line into something a human would say. */
export function commandKind(command) {
  const cmd = typeof command === 'string' ? command.toLowerCase() : '';
  if (cmd === '') return { verb: '在敲命令', object: '', why: '跑一步操作', adjust: ADJUST.test };
  // Runner invocations only: a path or a variable that happens to contain the
  // word "test" is not a test run, and claiming it was is a lie about the work.
  if (/\b(vitest|jest|pytest|mocha|node\s+--test|go\s+test|cargo\s+test|npm\s+test|pnpm\s+test|yarn\s+test|dotnet\s+test)\b/.test(cmd) || /\b(node|deno|bun)(\.exe)?\s+\S*test/i.test(cmd)) {
    return { verb: '在跑测试', object: '', why: '确认改完没有碰坏别的', adjust: ADJUST.test };
  }
  // Syntax/type checks. The flags are matched outside the \b group: `-` is not a
  // word character, so `\b--check\b` can never match and `node --check lib\x.js`
  // fell through to 「在跑脚本」.
  if (/(?:^|\s)--(check|syntax|typecheck)\b/.test(cmd) || /\b(tsc|eslint|oxlint|lint|typecheck|vite\s+build|webpack|tsdown|rollup)\b/.test(cmd)) {
    return { verb: '在检查代码', object: '', why: '确认类型和语法都过得去', adjust: ADJUST.test };
  }
  if (/\b(npm i|npm install|pnpm i|pnpm install|yarn|pip install|uv sync|cargo build|go mod)\b/.test(cmd)) {
    return { verb: '在装依赖', object: '', why: '把要用的东西先备齐', adjust: ADJUST.test };
  }
  if (/\bgit\b/.test(cmd)) return { verb: '在整理代码版本', object: '', why: '把改动归拢一下', adjust: ADJUST.other };
  if (/\b(curl|wget|invoke-webrequest|invoke-restmethod)\b/.test(cmd)) {
    return { verb: '在访问接口', object: '', why: '确认外面那一步通不通', adjust: ADJUST.other };
  }
  // A script piped through a runtime is still that script's work, and saying so
  // is far more useful than 「在敲命令」.
  if (/\b(node|python|python3|deno|bun)\b[^|]*\.(m?js|cjs|ts|py|ps1)\b/.test(cmd)) {
    return { verb: '在跑脚本', object: '', why: '跑一遍看结果对不对', adjust: ADJUST.test };
  }
  // A multi-line script often reads one file and writes another. Guessing by
  // pattern order made 「[IO.File]::ReadAllText」 scripts claim they were writing;
  // whichever the command does FIRST is what it is doing.
  const readAt = cmd.search(/\[io\.file\]::readall|get-content|\bcat\b|\bhead\b|\btail\b/i);
  const writeAt = cmd.search(/\[io\.file\]::writeall|set-content|out-file|add-content/i);
  if (readAt !== -1 && (writeAt === -1 || readAt < writeAt)) {
    return { verb: '在读文件', object: '', why: '看清楚里面到底写了什么', adjust: ADJUST.read };
  }
  if (writeAt !== -1) {
    return { verb: '在写文件', object: '', why: '把改动落进文件', adjust: ADJUST.write };
  }
  if (/\b(select-string|findstr|ripgrep|rg)\b/i.test(cmd)) {
    return { verb: '在文件里找', object: '', why: '找到它写在哪儿', adjust: ADJUST.search };
  }
  if (/\b(get-childitem|pwd|ls|dir|get-item)\b/i.test(cmd)) {
    return { verb: '在看目录', object: '', why: '先弄清有哪些文件', adjust: ADJUST.read };
  }
  if (/\b(get-process|get-ciminstance|tasklist|get-service)\b/i.test(cmd)) {
    return { verb: '在看进程', object: '', why: '确认那个东西还在不在跑', adjust: ADJUST.other };
  }
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

  // Tools outside the shell and browser families act on something specific that the
  // generic branches below cannot see: they carry no `command` and no `file_path`, so
  // a job list became 「在敲命令」 and a delegation 「做点事」. Checked before the kind
  // branches because the table also decides the light.
  const known = TOOL_ACTIONS[name];
  if (known !== undefined) {
    return {
      kind: known[0], verb: known[1], object: known[2] ?? '',
      why: withReason(known[3] ?? DEFAULT_WHY),
      adjust: ADJUST[known[0]] ?? ADJUST.other,
      light: lightOf(known[0]),
    };
  }

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
    if (file === '') {
      return {
        kind, verb: '在看', object: readObject(name),
        why: withReason(WHY_READ), adjust: ADJUST.read, light: lightOf(kind),
      };
    }
    return {
      kind, verb: '在看', object: `「${file}」的代码`,
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
    // A browser tool drives the page and has no shell command behind it. Falling
    // through to commandKind('') said 「在敲命令」 for 152 clicks and screenshots.
    const ego = EGO_ACTIONS[name];
    if (ego !== undefined) {
      return {
        kind, verb: ego[0], object: ego[1],
        why: withReason('把页面这一步走完'), adjust: ADJUST.other, light: lightOf(kind),
      };
    }
    // The command's own target is what the reader needs: 「在读文件，看清楚里面
    // 到底写了什么。」 repeated 230 times says nothing about WHICH file. But only
    // for the verbs whose object really is a file — a git or `ls` command has a
    // repo or a folder, and naming a file there was simply wrong.
    const target = described.verb === '在访问接口'
      ? urlTarget(command)
      : described.verb === '在整理代码版本'
        ? repoTarget(command)
        : TARGETED_VERBS.has(described.verb) ? commandTarget(command) : '';
    return {
      kind, verb: described.verb,
      object: target === '' ? described.object : target,
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

  // Plugin management is not one action: listing what is installed, turning one
  // off and installing a bundle are three different things to the reader. The old
  // fallback said 「装或改插件」 with no object for all of them — 151 calls, and the
  // 已完成 row then read 「插件弄好了」 even for a read-only listing.
  if (name === 'plugin_manager') {
    const action = firstString(args, ['action']);
    const target = pluginTarget(args);
    const on = target === '' ? '' : `「${target}」`;
    if (/^list/i.test(action)) {
      // The object used to be 「插件」 on top of a verb that already ended in it, so
      // the sentence read 「核对完装了哪些插件插件」. The noun lives in the verb now:
      // 「在核对插件清单」 / 「核对完插件清单」.
      return {
        kind: 'read', verb: '在核对插件清单', object: '',
        why: withReason('先看清现在有什么'), adjust: ADJUST.read, light: lightOf('read'),
      };
    }
    if (/^(set|enable|disable)/i.test(action)) {
      return {
        kind: 'write', verb: '在开关插件', object: on === '' ? '其中一个' : on,
        why: withReason('按你要的把它打开或关掉'), adjust: ADJUST.write, light: lightOf('write'),
      };
    }
    if (/remove|uninstall/i.test(action)) {
      return {
        kind: 'write', verb: '在卸掉插件', object: on === '' ? '其中一个' : on,
        why: withReason('你说不要了就撤掉'), adjust: ADJUST.write, light: lightOf('write'),
      };
    }
    return {
      kind: 'write', verb: '在装插件', object: on === '' ? '一个新插件' : on,
      why: withReason('把它接进这套环境里'), adjust: ADJUST.write, light: lightOf('write'),
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
    在跑脚本: '脚本跑完了', 在读文件: '读完了', 在看目录: '目录看过了',
    在文件里找: '翻过了', 在看进程: '进程看过了', 在做点事: '办了件事',
    // 这个 harness 自己的动作，缺了就会掉进「办完了一件事」的兜底
    装或改插件: '插件弄好了', 压缩上下文: '上下文压过了',
    在装插件: '插件装好了', 在开关插件: '插件开关调好了',
    在卸掉插件: '插件卸掉了', 在核对插件清单: '插件清单核对完了',
    // 浏览器动作（EGO_ACTIONS）。它们各自是一个动词，掉进 byKind 就会全部说成
    // 「跑完了这一步」，读者分不出是点了一下还是截了张图。
    //
    // 过去式里不能再写一遍宾语： 已完成 行会把它拼在 object 后面，于是
    // 「页面打开了」+「页面」读成「页面打开了页面」。动词只说动作，宾语交给 object。
    在打开: '打开了', 在点: '点过了', 在填: '填好了', 在选: '选好了',
    在勾: '勾上了', 在按: '按过了', 在悬停看: '看过了', 在拖动: '拖好了',
    在翻: '翻过了', 在跑: '跑过了', 在问: '问过了', 在传: '传上去了',
    在下载: '下好了', 在拍: '拍好了', 在停: '停下了', 在处理: '处理好了',
    在搬: '搬过来了', 在存: '存好了', 在开: '开好了', 在关: '关掉了',
    在请求: '请求过了', 在等你操作: '停下来等你操作', 在等页面上那块: '等到了',
    在等接口回话: '等到回话了', 在等页面跳过去: '等到了',
    翻回压缩掉的内容: '翻回去了', 看上下文占用: '上下文占用看过了',
    翻压过的记录: '压过的记录翻过了', 整理交付物: '交付物摆出来了',
    看图片: '图看过了', 查天气: '天气查过了', 找视频: '视频找过了',
    测搜索通道: '搜索通道测过了', 看有哪些检查项: '检查项看过了',
    查运行时状态: '运行时状态查过了', 整理上下文: '上下文理过了',
    看页面结构: '页面结构看过了', 截图看效果: '截图看过了',
    立目标: '目标定好了', 改目标: '目标改好了', 看目标: '目标看过了',
    // 非 shell、非浏览器的那几条（TOOL_ACTIONS）。它们没有固定宾语可拼，动词里
    // 自带主语，否则「在收后台」会掉进首字表读成「看过了」。
    在看后台跑着: '后台的进度看过了', 在收后台: '后台结果收过来了',
    在停后台: '后台那条命令停掉了', 在看小助手: '小助手的进度看过了',
    在定目标: '目标定好了', 在改目标: '目标改好了',
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

/**
 * Map a raw tool failure into one plain sentence.
 *
 * Every branch has to name what went wrong for THIS step. A catch-all like
 * 「碰到个没预料的错」 is what the panel used to say for 84% of real failures:
 * the durable log carries the reason in `error.code` and, more often, only in
 * `message.content[].text`, and none of it reached the reader.
 */
export function humanError(raw) {
  const text = typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : String(raw);
  if (text === '') return '这一步没做成，它还没弄清原因，正在换个办法试';
  // The harness's own file-sandbox errors. They are the most common real
  // failure and each one needs a different action from the reader, so they
  // are matched before the generic text patterns below.
  if (/FS_NOT_OBSERVED|has not been read/i.test(text)) return '还没看过这个文件就动手改，得先看一眼再改';
  if (/FS_AMBIGUOUS_EDIT|matched \d+ times|more specific old_string/i.test(text)) return '要改的那段文字出现了不止一次，得说清改哪一处';
  if (/FS_.*OUTSIDE|outside the workspace|not inside/i.test(text)) return '那个文件不在能改的范围里，它改不了';
  if (/TOOL_OUTCOME_UNKNOWN|no result was durably recorded/i.test(text)) return '这一步的结果没记下来，不确定到底生效没有';
  if (/unknown job/i.test(text)) return '要等的那条命令已经找不到了';
  if (/rejected escalating|not approved|approval (was )?denied|未被批准|没有批准/i.test(text)) return '这一步没被批准，被拦下了';
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
  // Nothing above matched, but the text may still say something in plain
  // language. Quoting the part that is already readable beats a sentence that
  // could belong to any failure at all.
  const tail = errorTail(text);
  if (tail !== '') return `碰上没见过的错：${tail}`;
  return '碰上一个它没见过的错，正在换个办法试';
}

/**
 * The readable part of an error nobody anticipated.
 *
 * Harness errors arrive as `Error: <English sentence>` with codes mixed in.
 * Printing that verbatim would break 「无工具名、无长路径」, so only a run of
 * Chinese is taken: that is the part already written for a person, and it is
 * usually the whole message the user needs (「拒绝访问」/「文件已被占用」).
 */
function errorTail(text) {
  const body = text.replace(/^\s*(error|Error|ERR)\s*[:：]\s*/, '').replace(/[A-Za-z]:[\\/][^\s"'；;]*/g, ' ');
  const runs = body.match(/[\u4e00-\u9fa5][\u4e00-\u9fa5，、：；。？！“”‘’（）\-—…]{3,}/g) ?? [];
  if (runs.length === 0) return '';
  return cut(runs[0].replace(/[，、：；。？！\s]+$/, ''), 24);
}

/**
 * Everything a failed tool result says about why.
 *
 * `error` is frequently just `{ name, code }`; the sentence a person can act on
 * sits in `message.content[].text` (e.g. `Error: cannot modify "...": file has
 * not been read`). Reading only the code is what made every such failure come
 * out as the same catch-all sentence.
 */
export function failureReason(data) {
  const parts = [];
  const push = (value) => {
    if (typeof value !== 'string') return;
    const text = value.trim();
    if (text !== '') parts.push(text);
  };
  const error = data?.error ?? null;
  if (error !== null && typeof error === 'object') {
    push(error.reason?.message);
    push(error.reason);
    push(error.code);
    push(error.name);
    push(error.message);
  } else {
    push(error);
  }
  push(textOfContent(data?.message?.content));
  return parts.join(' ');
}

/**
 * The one sentence shown for a failed step.
 *
 * Names the step when it has a name of its own, and otherwise says only what
 * went wrong: a command or a queue write has no object, and the old template
 * then printed 「 那步没过去：…」 with an empty subject in front.
 */
function failureText(done) {
  const object = typeof done?.object === 'string' ? done.object.trim() : '';
  const result = typeof done?.result === 'string' ? done.result.trim() : '';
  if (result === '') {
    return object === '' ? '这一步没做成' : `${object}那一步没做成`;
  }
  return object === '' ? result : `${object}那一步没做成：${result}`;
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
  const scrubbed = scrub(text.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`]/g, ' '));
  const first = scrubbed.split(/[。！？\n!?]/)[0] ?? '';
  const raw = first.trim();
  // Checked before any neutral noun is substituted: "OK." becomes 「某个名字」 after
  // substitution, which would then pass a Chinese test it never earned.
  if (raw === '' || !/[\u4e00-\u9fff]/.test(raw)) return '';
  const trimmed = desensitize(raw);
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
 *
 * Two strengths, because the two readers are not the same. The panel is Chinese
 * and reads `strict`, which drops remaining ASCII outright — an English thought
 * shown to a Chinese reader is noise. The explain door reads `loose`, which keeps
 * English prose and only swaps the tokens that look like machines, so a genuinely
 * English thought is still something the model can explain.
 */
function desensitize(text, mode = 'strict') {
  const strict = mode === 'strict';
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
  if (strict) {
    // Letters still standing are jargon by definition in a Chinese panel:
    // debug fragments (after1), log words (true), stray acronyms. Dropped rather
    // than translated, because a neutral noun for a word we cannot interpret is
    // just noise with good manners.
    //
    // A digit is kept only when it stands on its own: 「改了 3 处」 is information,
    // and deleting it left 「改动文件数正好是个」. A digit glued to letters is part
    // of the jargon — 「after1」 must lose the 1 with the word, not leave 「1」 behind.
    out = out.replace(/\b[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*\b/g, ' ');
    out = out.replace(/[.:;,!?…"'()\[\]{}<>|~^*+=#@&%$\\/-]+/g, ' ');
  }
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

/**
 * The tail of the thinking buffer, ready to be read by someone else.
 *
 * Loose by default because the explain door is the usual reader and English
 * prose is not a problem for it. The panel passes 'strict' when it quotes a
 * thought in a detail block, since the panel itself is Chinese-only.
 */
export function thinkingDigest(state, mode = 'loose') {
  const raw = typeof state.thinking === 'string' ? state.thinking : '';
  if (raw === '') return '';
  const cleaned = desensitize(scrub(raw), mode);
  if (cleaned === '') return '';
  return cut(cleaned, THINKING_SHOWN);
}

/**
 * What an English thought is *about*, said in Chinese.
 *
 * This exists because of a measured fact: replaying a real 13031-event session,
 * 「在想下一步做什么」 won 3601 frames (28%) — and every sampled miss had an
 * English thinking buffer ("The user wants me to build a DSH sidebar-right
 * plugin…"). `thinkingClause` requires Chinese, so the panel fell all the way
 * through to its template while a perfectly good plan sat in the buffer one line
 * above. The fix is not to translate prose (worse than the template) but to read
 * the one thing a plan almost always names: an action and an object.
 *
 * Returns an empty string when the thought names neither, because
 * 「在想办法」 is not worth printing either.
 */
const EN_VERBS = [
  [/\b(read|look at|look through|inspect|open|view|check|verify|review|scan|survey|examine)\b/i, '看'],
  [/\b(search|grep|find|locate|look for)\b/i, '找'],
  [/\b(edit|write|patch|update|change|fix|refactor|rename|implement|create|build|add|rewrite|replace)\b/i, '改'],
  [/\b(run|execute|lint|compile|typecheck|try|reproduce)\b/i, '跑'],
  // 「装」 and 「发」 are different to a reader: installing a plugin into this
  // environment is not publishing a release. They used to share one row, so
  // every 「install the bundle」 thought read 「在发插件」.
  [/\b(install|setup|set up|add the plugin|enable)\b/i, '装'],
  [/\b(publish|push|deploy|upload|release|ship)\b/i, '发'],
  [/\b(plan|decide|consider|think|figure|work out|compare|weigh|choose)\b/i, '掂量'],
];
const EN_NOUNS = [
  [/\b(tests?|testing|test suite|specs?)\b/i, '测试'],
  [/\b(config|configuration|settings?|env)\b/i, '配置'],
  [/\b(docs?|documentation|readme|readmes)\b/i, '文档'],
  [/\b(plugins?|package|bundle)\b/i, '插件'],
  [/\b(code|source|implementation|function|module)\b/i, '代码'],
  [/\b(ui|layout|panel|sidebar|css|style)\b/i, '界面'],
  [/\b(errors?|failures?|bugs?|crash)\b/i, '报错'],
  [/\b(release|version|publish|npm|registry)\b/i, '发布'],
  [/\b(files?|path|directory|folder)\b/i, '文件'],
];

/**
 * Nouns that say which CATEGORY of thing is being handled, and nothing more.
 *
 * Measured on a real session: of 3668 frames where an English thought named an
 * action, 2899 landed on one of these — 「在看界面」 373 times, 「接着看界面」 625.
 * The thought almost always named the actual file one line away (「grep for
 * \`sidebarRight\`」, 「read ui-plugin.md」), and the panel dropped it for the
 * category word.
 */
const EN_GENERIC_NOUNS = new Set(['测试', '配置', '文档', '插件', '代码', '界面', '报错', '发布', '文件']);

// Only tokens with a real file extension count. A bare identifier would render
// through friendlyFile as 「某个文件」, which is worse than the category word.
const EN_FILE = /\b([\w@.-]+\.(?:md|mdx|js|mjs|cjs|jsx|ts|tsx|json|yml|yaml|toml|css|scss|less|html|htm|ps1|sh|py|txt|svg))\b/gi;

/** The last recognisable file an English thought names, in plain words. */
function fileNamedIn(tail) {
  const hits = [...tail.matchAll(EN_FILE)];
  for (let index = hits.length - 1; index >= 0; index -= 1) {
    const name = friendlyFile(hits[index][1]);
    if (name === '' || name === '某个文件' || name.startsWith('一个小文件')) continue;
    return name;
  }
  return '';
}

/**
 * Did this reading name only a category (「看界面」, 「改文件」) rather than a thing?
 *
 * It matters at the point of use, not here: a category reading is worth printing
 * when it is the only signal, and worth dropping when an observed step already
 * named the actual object.
 */
function categoryAction(action) {
  if (typeof action !== 'string' || action === '') return false;
  for (const noun of EN_GENERIC_NOUNS) {
    if (action.length > noun.length && action.endsWith(noun)) return true;
  }
  return false;
}

/** Does this step name something a reader could recognise? */
function namesSomething(step) {
  if (step === null || step === undefined) return false;
  const object = typeof step.object === 'string' ? step.object.trim() : '';
  if (object === '') return false;
  return !PLACEHOLDERS.has(object.replace(/[「」『』]/g, ''));
}

export function englishAction(state) {
  const raw = typeof state.thinking === 'string' ? state.thinking : '';
  if (raw === '') return '';
  // Only the tail matters: the end of a thought is the decision, the opening is
  // usually a restatement of the request.
  const tail = raw.slice(-600);
  // Judged by composition, not by "contains any Chinese". A replay of a real
  // session showed the buffer holding one leftover Chinese character from an
  // earlier step while the tail was entirely English — an any-Chinese veto threw
  // away 1000+ readable frames and fell through to the template.
  const letters = (tail.match(/[A-Za-z]/g) ?? []).length;
  const han = (tail.match(/[\u4e00-\u9fff]/g) ?? []).length;
  if (letters === 0) return '';
  if (letters < han) return ''; // mostly Chinese prose: thinkingClause reads that
  // Earliest mention wins, not first table row: "Now run the tests to check
  // nothing broke" is a run, and a table-order lookup answered 看 because 看
  // happened to be listed above 跑.
  const firstMatch = (table) => {
    let best = null;
    for (const [pattern, phrase] of table) {
      const found = tail.match(pattern);
      if (found === null) continue;
      const at = found.index ?? 0;
      if (best === null || at < best.at) best = { at, phrase };
    }
    return best === null ? '' : best.phrase;
  };
  const verb = firstMatch(EN_VERBS);
  const noun = firstMatch(EN_NOUNS);
  if (verb === '' && noun === '') return '';
  // Returned without a leading 在 on purpose: the two callers chain it differently
  // (「在看文件」 vs 「接着看文件」), and a shared prefix would produce 「接着在看文件」.
  if (verb === '' && noun !== '') return `盯${noun}`;
  if (noun === '') {
    // The thought named an action but no object. 「在看东西」 is the panel saying it
    // heard a verb and then giving up on the useful half of the sentence — it ran
    // 323 times in one session. The step that just finished knows the object, so
    // borrow it rather than printing a filler noun.
    const last = state.lastDone;
    const recent = last !== null && typeof last.object === 'string' ? last.object.trim() : '';
    if (recent !== '' && !PLACEHOLDERS.has(recent.replace(/[「」『』]/g, ''))) {
      return `${verb}${objectRef(recent)}`;
    }
    return verb;
  }
  // A category noun is the same shrug one level up: 「在看界面」 tells the reader
  // which drawer to look in, not what is being handled. When the thought names a
  // real file, that name wins. When it does not, borrow the object of the step that
  // just finished — that one was observed, and it is more than a category.
  if (EN_GENERIC_NOUNS.has(noun)) {
    const named = fileNamedIn(tail);
    if (named !== '') return `${verb}${quoted(named)}`;
    const last = state.lastDone;
    const recent = last !== null && typeof last.object === 'string' ? last.object.trim() : '';
    if (recent !== '' && !PLACEHOLDERS.has(recent.replace(/[「」『』]/g, ''))) {
      return `${verb}${objectRef(recent)}`;
    }
  }
  return `${verb}${noun}`;
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
  // 「已确认」「看过了」 report finished work in the same way 「已完成」 does, and they
  // were slipping through: a 正在做 row once read 「在读文件「客户端」，功能侧已确认完好
  // （ 返回 200，三行、灯、位置、…」 — a summary of what had already been checked,
  // presented as the reason for the step about to happen.
  if (/已确认|确认无误|已看过|看过了|读完了|读过了|已读完|查过了|检查过|已修好|已测过|验过了|已核对/.test(text)) return false
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

/**
 * How many entries the battle log keeps.
 *
 * The three rows answer 「此刻」 and the ledger answers 「这一件事」. Neither can
 * answer 「二十分钟前它为什么拐到这条路上」 — that requires a record, not a
 * fold. Two hundred is roughly one long turn's worth of decisions at one entry
 * per event that matters, which is the span a person actually scrolls back
 * through. Older than that and it is an archive, not a situational picture.
 */
const MAX_TIMELINE = 200;

/**
 * How many finished requests the overview keeps.
 *
 * This is the axis the panel was missing. One request is a step; forty of them
 * are the operation. Sixty is enough for a long session to be legible from the
 * top without turning the panel into an archive — and each entry is four short
 * fields, so the memory cost is nothing next to the event log already held.
 */
const MAX_HISTORY = 60;

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
    // The step that last wrote the checklist; -1 when the session never wrote one.
    todosAt: -1,
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
    // 进度必须以「用户提的那件事」为单位，不能以工具调用为单位。
    // 真实会话里 43 条用户消息配了 2244 次工具调用：按调用数报「第 49 / 50 步」，
    // 读者学不到任何关于「我要的东西做到哪了」的信息。所以记下最近一次真正的
    // 请求，以及自那次请求以来发生了什么 —— 那才是进度。
    request: null,
    requestCount: 0,
    // 已经结束的那些请求。这是「总览」的主轴：没有它，43 件事只剩最后一件活着，
    // 面板只能给你一串无主的孤句。
    history: [],
    historyDropped: 0,
    since: { write: 0, read: 0, run: 0, failed: 0, files: [] },
    // 改完之后有没有跑过一次并跑过。这是「能不能信」的唯一客观依据。
    lastRun: null,
    lastWriteAt: 0,
    // 大模型自己写的「做完了什么 / 接下来做什么 / 清单」——三行唯一诚实的来源。
    prose: null,
    // 战报：每个值得一提的瞬间按时间排一行。三行是「此刻」，账本是「这件事」，
    // 这里才是「刚才发生了什么」——没有它，用户错过一步就得等下一次。
    timeline: [],
    // 时间线只保留尾巴，滚动查看时够用；越界时从头丢。
    timelineDropped: 0,
    // 指挥官发出、还没确认它读到的提醒。`agent.steer` 只保证落进信箱，
    // 「它到底看没看」是另一件事，得等它自己的日志里出现这句话。
    pendingSteers: [],
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

/**
 * Append one line to the battle log.
 *
 * Only the moments a person would scroll back for go in: the user speaking, a
 * step landing, a failure, a decision the agent announced out loud. Per-token
 * activity stays out — the heartbeat already answers 「还在动吗」, and a log that
 * mixed both would be a debug trace, not a situation report.
 *
 * Repeats collapse in place for the same reason they do in `recent`: five
 * identical reads in a row are one fact (#it kept looking at the same place#),
 * not five.
 */
function noteTimeline(state, entry) {
  const line = {
    at: toTime(entry.at, state.updatedAt || Date.now()),
    kind: typeof entry.kind === 'string' ? entry.kind : 'note',
    text: typeof entry.text === 'string' ? entry.text : '',
    // Which request this happened under, so the log can be read per request.
    request: state.requestCount,
    source: entry.source === 'reported' || entry.source === 'inferred' ? entry.source : 'observed',
    step: state.stepsDone,
  };
  if (line.text === '') return;
  const list = Array.isArray(state.timeline) ? state.timeline : [];
  const last = list[list.length - 1];
  if (last !== undefined && last.kind === line.kind && sameBeat(last.text, line.text)) {
    // Same fact again: keep one entry, but move its stamp to the latest
    // occurrence — 「在读配置」 repeated for four minutes is still true now.
    // Counting it is what keeps the log readable: a real session committed the
    // same tarball six times in a row and the panel printed six identical lines,
    // so the twelve visible entries were three facts and nine repetitions.
    state.timeline = [...list.slice(0, -1), {
      ...last,
      at: line.at,
      step: line.step,
      count: (last.count ?? 1) + 1,
    }];
    return;
  }
  const next = [...list, line];
  if (next.length > MAX_TIMELINE) {
    const excess = next.length - MAX_TIMELINE;
    state.timelineDropped = (state.timelineDropped ?? 0) + excess;
    state.timeline = next.slice(excess);
    return;
  }
  state.timeline = next;
}

/**
 * Two log lines that describe the same beat.
 *
 * Exact equality is not enough: 「版本整理好了「dsh-sidekick-lens」」 and
 * 「版本整理好了「dsh-sidebar-narrator」」 are the same action with a different
 * object, and a session that commits twice in a row reads as two facts. What
 * matters is the action; the object only tells you which instance.
 *
 * The names in 「」 are stripped before comparing for that reason, but the
 * surrounding verb must still match — 「改完了「a」」 and 「读完了「a」」 are
 * genuinely two different things and must both stay.
 */
function sameBeat(a, b) {
  const bare = (text) => String(text ?? '').replace(/「[^」]*」/g, '「」').replace(/\s+/g, '');
  return bare(a) === bare(b);
}

/**
 * Placeholders that desensitize() substitutes for names it refuses to print.
 *
 * They are not files. Showing one beside a real name produced 「动了 2 个文件（旁白
 * 逻辑、某个文件）」 — a count that includes a word standing in for a count. They are
 * dropped from the *names*, never from the count: an unnamed file still changed.
 */
const PLACEHOLDERS = new Set(['某个文件', '某个名字', '某个动作', '某个路径', '某个地方']);

function noteFile(state, name) {
  if (state.files.includes(name)) return;
  state.files = [...state.files, name].slice(-40);
}

/**
 * Start a new unit of progress: one thing the user asked for.
 *
 * The panel used to count tool calls. In the session that prompted this change
 * there were 43 human messages and 2244 tool calls, so it reported 「第 49 / 50
 * 步」 — a number that says nothing at all about whether the thing the user asked
 * for is done. Requests are the unit; calls are how a request gets served.
 *
 * A request is done when work happens after it and nothing is running any more,
 * or when the user has moved on to asking for something else.
 */
/**
 * The user's own words, cleaned just enough to quote. Real requests arrive
 * wrapped in 【】 tags and pasted context; quoting that raw reads like a stack
 * trace was pasted into the progress line.
 */
function requestText(text) {
  const flat = String(text ?? '')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat === '' ? String(text ?? '').trim() : flat;
}

function recordRequest(state, text, at) {
  const now = toTime(at, Date.now());
  const previous = state.request;
  if (previous !== null && !previous.done) {
    // The user spoke again without saying the last one was finished. If work had
    // already happened on it, that is as finished as it is going to get.
    const worked = previous.writes > 0 || previous.runs > 0 || state.stepsDone > previous.step;
    previous.done = worked;
    previous.closedBy = worked ? 'superseded' : 'dropped';
    previous.closedAt = now;
  }
  // 收起来，不是扔掉。
  //
  // 这是「总览」坏掉的根因：以前用户一开口，上一件事就被整个丢掉，只留一个
  // closedBy 标记。于是 43 件事只剩最后一件活着，战况里全是无主的孤句——
  // 每一行都对，连起来不成故事。
  if (previous !== null) {
    const merged = [...(state.history ?? []), snapRequest(previous, now)];
    if (merged.length > MAX_HISTORY) {
      const excess = merged.length - MAX_HISTORY;
      state.historyDropped = (state.historyDropped ?? 0) + excess;
      state.history = merged.slice(excess);
    } else {
      state.history = merged;
    }
  }
  state.requestCount += 1;
  state.request = {
    n: state.requestCount,
    text: cut(requestText(text), 60),
    at: now,
    step: state.stepsDone,
    // Per-request scoreboard: what got changed, what got verified, what broke.
    writes: 0,
    reads: 0,
    runs: 0,
    failed: 0,
    files: [],
    ranAfterWrite: false,
    done: false,
    closedBy: '',
    closedAt: 0,
    lastSaid: '',
    steps: 0,
    beats: [],
    // 这件事自己的最后一次运行。判「验没验过」只能用它的，不能用全局的。
    lastRun: null,
  };
  state.since = { write: 0, read: 0, run: 0, failed: 0, files: [] };
  // A new request means the last one's words are no longer the story.
  state.prose = null;
  return state.request;
}

/**
 * Freeze a request for the history.
 *
 * Copied field by field rather than spread: the live request keeps mutating as
 * the turn goes on, and a history entry that silently shares arrays with it
 * would rewrite the past.
 */
function snapRequest(request, now) {
  return {
    n: request.n,
    text: request.text,
    at: request.at,
    step: request.step,
    writes: request.writes,
    reads: request.reads,
    runs: request.runs,
    failed: request.failed,
    files: Array.isArray(request.files) ? request.files.slice() : [],
    done: request.done === true,
    closedBy: request.closedBy,
    closedAt: request.closedAt || now,
    lastSaid: request.lastSaid ?? '',
    steps: request.steps ?? 0,
    beats: Array.isArray(request.beats) ? request.beats.slice() : [],
    // 这件事自己的那次运行，必须一起冻结：判「验没验过」靠的就是它。
    lastRun: request.lastRun !== undefined && request.lastRun !== null ? { ...request.lastRun } : null,
  };
}

/**
 * What the agent says about itself, folded for the panel.
 *
 * The panel has been composing its three lines from tool calls alone, which is
 * why they read as filler: a tool call says 「改了「客户端」」 but never says what
 * the reader asked — what is done, what is left, what the plan is. The agent
 * writes all three in its own prose, and that prose is the only place they exist.
 * In one real session 53% of requests contained an explicit done-statement, 72%
 * a next-step statement, and 40% an enumerated checklist of three or more items.
 *
 * So: keep the latest of each, scoped to the current request, and let the rows
 * quote it. It is the agent's own claim, hence reported, not observed.
 */
const PROSE_DONE = /已(?:经)?(?:做完|修好|通过|改好|完成|落地|合入|修掉|推上)|\d+\s*\/\s*\d+\s*(?:通过|全绿)|全部通过|都通过了|验证通过/;
const PROSE_PLAN = /^(?:接下来|下一步|然后|之后|再|计划|打算|准备|需要|要)/;
// 「还剩两个问题」是状态，不是下一步；它也不该冒充「做完了什么」。
const PROSE_STATUS = /^(?:还剩|还差|剩下|问题|已知)/;
const PROSE_ITEM = /^\s{0,3}(?:\d+[.)、]|[-*+•])\s+(.{6,90})$/;

/** One forward-looking sentence, said as the next move rather than as a heading. */
function planLine(text) {
  let body = String(text ?? '')
    .replace(/[：；。，、\s]+$/, '')
    .replace(/^(?:接下来|下一步|然后|之后|再)\s*(?:我)?\s*(?:会|要|将)?\s*/, '')
    .trim();
  if (body === '') return '';
  // A colon at the end means the sentence was a heading for a list, not the move.
  if (body.includes('：')) body = body.slice(0, body.indexOf('：')).trim();
  if (body === '') return '';
  if (body.length > 52) {
    const stop = Math.max(
      body.lastIndexOf('，', 52),
      body.lastIndexOf('、', 52),
      body.lastIndexOf('；', 52),
    );
    body = stop >= 12 ? body.slice(0, stop) : body.slice(0, 52);
  }
  return `接下来${body}。`;
}

function noteProse(state, text, at) {
  const body = String(text ?? '');
  if (body.trim() === '') return;

  const previous = state.prose ?? { done: '', plan: '', items: [], at: 0, step: -1 };
  const next = { ...previous, items: previous.items, at, step: state.stepsDone };

  const items = [];
  for (const line of body.split('\n')) {
    const hit = PROSE_ITEM.exec(line);
    if (hit === null) continue;
    const clean = hit[1].replace(/[*`]/g, '').replace(/[。；]+$/, '').trim();
    if (clean.length < 6 || clean.length > 70) continue;
    if (!/[\u4e00-\u9fa5]/.test(clean)) continue;
    items.push(clean);
  }
  // A checklist of one is just a sentence with a bullet; only a real list
  // replaces the previous one.
  if (items.length >= 2) next.items = items.slice(-8);

  for (const raw of body.split(/[。！？\n]/)) {
    const line = raw.replace(/^[\s>#*\-+|]+/, '').replace(/[*`]/g, '').trim();
    if (line.length < 8 || line.length > 160) continue;
    if (!/[\u4e00-\u9fa5]/.test(line)) continue;
    // 「已修好」 wins over 「接下来」: a sentence that reports a result is a
    // result even when it also mentions what comes next.
    // 「还剩两个问题：…」 is the state of the work, which is what 已完成 is for —
    // it used to be dropped outright, leaving the row to say 「翻过了某文件」.
    if (PROSE_DONE.test(line) || PROSE_STATUS.test(line)) next.done = line;
    else if (PROSE_PLAN.test(line)) next.plan = line;
  }

  state.prose = next;

  // 它自己宣布的结论和打算也进战报。这是它的话，所以标 reported —— 战报里
  // 「谁说的」比「说了什么」更容易被读者误判，来源必须一路带下去。
  // 只有这次真的换了内容才记一行：同一条回复会被多次折进来。
  if (next.done !== previous.done && next.done !== '') {
    noteTimeline(state, { at, kind: 'say', text: cut(next.done, 90), source: 'reported' });
  }
  if (next.plan !== previous.plan && next.plan !== '') {
    noteTimeline(state, { at, kind: 'plan', text: cut(planLine(next.plan), 90), source: 'reported' });
  }
  // 这一段的「结局语」：它在这件事里最后自己说的话。收尾时用它，读者才知道
  // 这件事是怎么结束的，而不是只看到一串动作断掉。
  if (state.request !== null && next.done !== '' && next.done !== previous.done) {
    state.request.lastSaid = cut(next.done, 70);
  }
}

/**
 * Is the agent's own account still about the thing the user asked for? Words
 * from three hundred steps ago describe a different job.
 */
function proseFresh(state) {
  const prose = state.prose;
  if (prose === null || prose === undefined) return null;
  const request = state.request;
  if (request !== null && prose.step < request.step - 1) return null;
  if (state.stepsDone - prose.step > 120) return null;
  return prose;
}

/** Fold one finished tool call into the current request's scoreboard. */
function noteInRequest(state, done, at) {
  const request = state.request;
  if (request === null) return;
  const kind = done.kind ?? 'other';
  // 一件事里到底发生过什么。总览要能回答「这件事办得顺不顺」，那只有靠它
  // 自己的足迹，不能靠句子猜。
  if (!Array.isArray(request.beats)) request.beats = [];
  request.steps = (request.steps ?? 0) + 1;
  if (kind === 'write') {
    request.writes += 1;
    state.since.write += 1;
    const name = typeof done.object === 'string' ? done.object.replace(/[「」『』]/g, '') : '';
    if (name !== '' && !request.files.includes(name)) request.files = [...request.files, name].slice(-12);
    if (name !== '' && !state.since.files.includes(name)) state.since.files = [...state.since.files, name].slice(-12);
    state.lastWriteAt = at;
  } else if (kind === 'read') {
    request.reads += 1;
    state.since.read += 1;
  } else if (kind === 'run') {
    request.runs += 1;
    state.since.run += 1;
    // 改完之后跑过没有 —— 这是「能不能信」的唯一客观依据。
    state.lastRun = {
      at,
      failed: done.failed === true,
      verb: done.verb ?? '',
      verbLive: done.verbLive ?? '',
      object: done.object ?? '',
      checkedAfterWrite: state.lastWriteAt > 0 && at >= state.lastWriteAt,
    };
    // 这件事自己的最后一次运行。`state.lastRun` 是全局的，会被下一件事覆盖 ——
    // 拿它去判历史请求，就会把「测试过了」读成「改完没跑过验证」。
    request.lastRun = { ...state.lastRun };
    if (state.lastRun.checkedAfterWrite) request.ranAfterWrite = true;
  } else if (kind === 'other') {
    state.since.run += 1;
  }
  if (done.failed === true) {
    request.failed += 1;
    state.since.failed += 1;
    // 失败是这一段的转折点，值得单独记一笔 —— 总览里「哪件事碰过钉子」只能这么知道。
    //
    // 但失败的也可能是「跑验证」：那种失败同时是「这件事验过了、只是没过」。
    // 只记成一次普通出错，这一章就读成「改了东西、然后出了错」，读者看不出
    // 它验过没有。
    const verifiedRun = kind === 'run' && request.lastRun?.checkedAfterWrite === true;
    request.beats = [...request.beats, verifiedRun
      ? { at, kind: 'run', text: '跑了一遍，没过' }
      : { at, kind: 'fail', text: cut(done.result || '这一步没过', 60) }].slice(-12);
    return;
  }
  if (kind === 'write') {
    const name = typeof done.object === 'string' ? done.object : '';
    request.beats = [...request.beats, {
      at, kind: 'write', text: name === '' ? '动手改了东西' : `改了${objectRef(name)}`,
    }].slice(-12);
    return;
  }
  if (kind === 'run' && state.lastRun?.checkedAfterWrite) {
    // 只有「改完之后跑的那次」才是验证。改之前跑的，说明不了这次改动。
    request.beats = [...request.beats, {
      at, kind: 'run', text: state.lastRun.failed ? '跑了一遍，没过' : '跑了一遍，全过了',
    }].slice(-12);
  }
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
      noteTimeline(state, { at, kind: 'turn', text: `第 ${Math.max(1, state.turn)} 轮开工。` });
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
      const reason = failureReason(data);
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
          // The verb as it was spoken (「在打开」) — pastTense already ran above, and
          // the between-steps sentence needs the original to ask only once.
          verbLive: current.verb ?? '',
          object: current.object ?? '',
          why: current.why ?? '',
          kind: current.kind,
          failed,
          result: failed ? humanError(reason) : '',
          adjust: current.adjust ?? ADJUST.other,
          at,
          name: current.name,
          // 这一步属于哪件事。三行要挂在同一件事上才不会「没头没尾」，
          // 而「已完成」可能属于上一件（新请求刚开口、还没动手时）。
          request: state.requestCount,
        };
        state.lastDone = done;
        // 这一笔记进「用户提的那件事」的账上：改了几个文件、跑过没有、有没有报错。
        noteInRequest(state, done, at);
        // Only a tool that edits a file counts as touching one. A plugin switch or
        // a queue write is classified as write for the yellow light, but it does
        // not change a file: counting it listed 「dsh-url-peek、样式、配置」 under
        // 「改了 19 个文件」 — a number the ledger then cannot back up.
        if (current.kind === 'write' && WRITE_TOOLS.has(current.name)) {
          if (typeof current.object === 'string' && current.object !== '') {
            noteFile(state, current.object.replace(/[「」]/g, ''));
          }
        }
        pushRecent(state, { ...done, text: sentence(verb, done.object, '') });
        // 战报里记的是「这一步到底做成了什么」，所以用和「已完成」行同一句措辞：
        // 两处说的必须是同一件事，用户才不会看到两份互相矛盾的记录。
        //
        // 失败的那一步不能过 `sentence()` —— 它拿到的是过去式的动词，拼出来
        // 是「跑完测试了。」，把一次失败说成了成功。失败有它自己的说法。
        noteTimeline(state, {
          at,
          kind: failed ? 'fail' : 'step',
          text: failed ? failureText(done) : sentence(verb, done.object, done.why ?? ''),
        });
        if (failed) {
          // The subject is the step itself, not its object: a command or a
          // queue write has no file to name, and the old template then read
          // 「 那步没过去：…」 with an empty slot in front.
          state.error = {
            text: failureText(done),
            raw: scrub(reason),
            at,
            step: done.object.trim() === '' ? '' : done.object.trim(),
            name: typeof current.name === 'string' ? current.name : '',
          };
        } else if (state.error !== null) state.error = null;
      }
      break;
    }
    case 'assistant/message': {
      const text = textOfContent(data.message?.content);
      // Fenced blocks are dropped before anything else: a summary of the work is
      // prose, and a reply that ends on a directory tree would otherwise hand the
      // panel 「├── lib/ │ ├── narrative.js 45.9K」 as its last sentence. Inline code
      // keeps its text — deleting `panelScrollX` leaves 「关于报告的三项：、 （…」 with
      // the subjects missing, which is worse than the identifier was.
      const prose = text.replace(/```[\s\S]*?```/g, '\n').replace(/`([^`\n]*)`/g, '$1');
      // Keep the line breaks. `plainText` strips markdown with `^`-anchored rules, and
      // those only work while a heading still begins a line: scrubbing here first
      // collapsed the reply to one line, after which 「## 这次修掉的真问题 …」 matched
      // 「heading runs to end of line」 and took the whole reply with it.
      const short = prose.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (short !== '') {
        // Keep the tail, not the head: a reply opens with 「汇报一下这一段的实质进展：」
        // and closes with what it actually concluded. Cutting from the front left the
        // panel quoting a lead-in and a markdown heading instead of the result.
        // The cut lands wherever it lands, so the tail is moved forward to the first
        // sentence boundary: 「…l- 前缀，主题 token 也只用 --dsw-alias-」 opened mid-word.
        const tail = short.length > 480 ? short.slice(-479) : short;
        state.lastAssistant = short.length > 480
          ? tail.replace(/^[^。！？!?\n]*[。！？!?][ \t]*/, '').trim() || tail
          : tail;
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
      // The agent's own account of the work is the only place 「做完了什么 /
      // 还差什么」 is ever stated. Tool calls say what was touched, never what it
      // meant.
      noteProse(state, textOfContent(data.message?.content), at);
      noteBeat(state, at);
      break;
    }
    case 'user/message': {
      const source = data.source ?? {};
      if (source.kind === 'user' && source.form !== 'notice') {
        const raw = textOfContent(data.message?.content ?? data.content);
        const text = scrub(raw);
        // 先认回执：这条是不是我们自己发出去的那句提醒？如果是，它就不是
        // 「用户又提了一件事」，而是「它终于读到提醒了」——两件事不能混。
        const isSteer = matchSteer(state, raw, at);
        if (text !== '') {
          state.steers = [...state.steers, cut(text, 80)].slice(-4);
          if (!isSteer) {
            // 这才是进度的单位。用户在会话里提了 43 件事，那 43 件就是 43 步；
            // 中间的 2244 次工具调用是手段，不是进度。
            recordRequest(state, text, at);
            // 战报第一行永远是「指挥官说了什么」——它定义了后面所有事的意义。
            noteTimeline(state, {
              at,
              kind: 'you',
              text: cut(text, 90),
            });
          } else {
            // 提醒被读到，本身就是一条战报：指挥官要确认自己的话进了耳朵。
            noteTimeline(state, {
              at,
              kind: 'steer',
              text: `它读到了你的提醒：${cut(text, 80)}`,
              source: 'observed',
            });
          }
        }
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
      // Which step wrote this list. A list written at step 29 and still quoted at
      // step 2200 is not a plan, it is a fossil — the panel spent a whole session
      // promising 「下一件是搭建插件」 while doing something else entirely.
      state.todosAt = state.stepsDone;
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
        // 「已经做完 49 步」数的是工具调用，读者要的是「我提的那件事到哪了」。
        const stopped = buildRequest(state, at);
        const kept = state.files.length === 0 ? '还没改到文件' : `改过的 ${state.files.length} 个文件都留着`;
        state.cancelNote = {
          text: stopped === null
            ? `这一轮被叫停了。${kept}。`
            : `这一轮被叫停了。你提的第 ${stopped.n} 件：${stopped.what}，${stopped.open === '' ? '没有还差的了' : `还差${stopped.open}`}，${kept}。`,
          at,
        };
      }
      state.turnStartedAt = 0;
      noteBeat(state, at);
      // 战报的收尾：这一轮怎么结束的（跑完 / 被叫停），用户回头看时靠它分段。
      noteTimeline(state, {
        at,
        kind: 'turn',
        text: data.reason?.kind === 'aborted' || data.reason?.kind === 'cancelled'
          ? '这一轮被叫停了。'
          : `这一轮跑完了，用了 ${clockText(duration)}。`,
        source: data.reason?.kind === 'aborted' || data.reason?.kind === 'cancelled' ? 'reported' : 'observed',
      });
      break;
    }
    default:
      return state;
  }
  state.updatedAt = at;
  return state;
}

/** Pending work from the last todo list, if any — and only while the list still
 * describes this stretch of work. See TODOS_FRESH_STEPS. */
function pendingTodo(state) {
  if (!todosAreFresh(state)) return null;
  const todo = state.todos.find((item) => item.status !== 'completed' && item.status !== 'cancelled');
  return todo === undefined ? null : todo;
}

/** A guessed next step derived from the last thing that actually happened. */
/**
 * The 下一步 row.
 *
 * Takes the story rather than the raw state on purpose: the panel must not hold
 * two readings of the same moment. Whatever the summary already worked out — the
 * queue, the thing in hand — the row quotes from there instead of re-deriving it
 * and drifting out of sync.
 */
function guessNext(state, story, options = {}) {
  // `plain` drops the lead-in that names the step in hand. Callers use it when that
  // name would repeat the 正在做 row verbatim — dropping it keeps the queue item
  // (so the row still agrees with the ledger) instead of replacing the whole answer
  // with a generic sentence, which is how the two rows ended up contradicting each
  // other.
  const plain = options.plain === true;
  const todo = pendingTodo(state);
  // A failed step has no 「收尾」 to lead from: quoting it as finished work would
  // promise the reader something that never happened. A live retry is different —
  // then a step really is in hand.
  const failedNow = state.error !== null && !(state.running && state.current !== null);
  if (todo !== null) {
    // The queue is the honest answer, and it must not drift from the summary's
    // 「下一件是…」. What changes moment to moment is the step in hand, so lead with
    // that: a row that only ever names one todo looks frozen for an hour while
    // plenty is happening, even though nothing it says is wrong.
    const pending = story?.pending ?? [];
    const left = pending.length > 1 ? `还剩 ${pending.length} 件，` : '';
    const target = quoted(cut(todo.text, 24));
    // Between steps there is no live call, so lead with what just finished: the
    // queue item alone is identical for however long that item stays next, and the
    // row then reads as frozen even though the work is moving.
    const basis = story?.basis ?? null;
    const justDone = basis !== null && basis.kind !== undefined && typeof basis.verb === 'string' ? basis : state.lastDone;
    let lead = '';
    if (!plain) {
      if (state.running && state.current !== null) {
        const hand = objectRef(state.current.object ?? '');
        lead = hand === '' ? '手上这步收尾后，' : `${hand}这步收尾后，`;
      } else if (justDone !== null && justDone.failed !== true) {
        const label = typeof justDone.object === 'string' ? justDone.object.trim() : '';
        lead = label === '' ? '' : `${objectRef(label)}这步收尾后，`;
      }
    }
    const inHand = `${lead}${lead === '' ? '下一件是' : '接着做'}${target}`;
    return { text: `${left}${inHand}。`, source: 'observed', why: '清单上排着的下一件', saw: '清单里还有没打勾的条目', result: '', adjust: '清单不对就直接说“先做另一件”。' };
  }

  // A sentence the agent actually said about what comes next beats any template.
  // This is the one place a guess earns its keep: it is quoting, not inventing.
  // Anything reporting finished work is rejected by looksForward.
  const said = state.running ? intentOf(state.intent) : '';
  if (said !== '' && looksForward(said)) {
    return { text: `${said}。`, source: 'reported', why: '它在自己说要做什么', saw: '刚说过一句打算', result: '', adjust: '方向不对就直接说，它在下一步会看到。' };
  }  // Thinking outranks every template below and loses only to a spoken plan: it
  // is what the agent is weighing up, not a promise. Checked BEFORE the
  // no-observation bail-out on purpose — "nothing happened yet, but it says it
  // is about to do X" is exactly the case this is for. Marked 仅据汇报 because
  // no tool call has confirmed it.
  const thought = state.running ? thinkingClause(state) : '';
  if (thought !== '') {
    return { text: `${thought}。`, source: 'reported', why: '它在脑子里权衡这件事', saw: '读到它当前的思考', result: '', adjust: '想法偏了就直接说，它在下一步会看到。' };
  }
  // Same rescue as 正在做: an English thought still names an action and an object,
  // so the next step can be read out of it instead of falling to a template.
  //
  // Except when the thought only named a category (「接着看界面」, 501 times in one
  // session). The step actually in hand usually names the real object, and an
  // observed name beats a category-level guess — so a category reading steps
  // aside for the templates below instead of replacing them.
  const inFlight = state.running && state.current !== null ? state.current : null;
  const english = state.running ? englishAction(state) : '';
  const englishWins = english !== ''
    && !(categoryAction(english) && (namesSomething(inFlight) || namesSomething(state.lastDone)));
  if (englishWins) {
    return { text: `接着${english}。`, source: 'reported', why: '它在心里过下一步', saw: '读到它当前的思考', result: '', adjust: '想法偏了就直接说，它在下一步会看到。' };
  }

  // While a step is in flight, the honest next step follows what that step is
  // FOR, not whatever finished before it. `basis` comes off the story so the
  // summary and the rows cannot disagree about which step is in hand.
  const basis = story?.basis ?? (state.running && state.current !== null ? state.current : state.lastDone);
  if (basis === null) {
    return { text: '等你发话，或者它自己开下一件。', source: 'inferred', why: '还没有可观察的步骤', saw: '暂时没看到工具调用', result: '', adjust: '想让它先做哪件，直接说一句。' };
  }

  const kind = basis.kind;
  const object = typeof basis.object === 'string' ? basis.object.trim() : '';
  // Name the object when there is one. 「照着看到的东西动手改」 is true of every
  // read step ever taken; 「接着改「登录页」那边」 can only be this moment.
  const on = objectRef(object);
  // When there is no object to name, the verb is still observed, and it is the only
  // thing that separates 「read a directory」 from 「pushed a version」. Without it
  // every object-less step of a kind shared one sentence: 「把结果对一遍，再决定接着
  // 改哪里。」 showed up 228 times in a single session — a shrug with a template in it.
  const liveVerb = typeof basis.verbLive === 'string' && basis.verbLive !== ''
    ? basis.verbLive
    : (typeof basis.verb === 'string' ? basis.verb : '');
  const verbNext = NEXT_AFTER_VERB[liveVerb] !== undefined && (object === '' || VERB_NEXT_WINS.has(liveVerb))
    ? afterVerb(liveVerb, object)
    : '';
  // A failed step is not a serviceable basis for 「跑完再看结果」: there is no
  // result to read. The honest next step is to get past the failure first, and
  // the reason is already on the row above.
  if (failedNow || basis.failed === true) {
    return {
      text: object === '' ? '先把没过去这一步补上，再往下走。' : `先把${on}这步没过去的地方补上。`,
      source: 'inferred',
      why: '上一步没走通，得先处理它',
      saw: '看到一步报了错',
      result: '',
      adjust: '换个思路可以直接说，它下一步就改。',
    };
  }
  if (verbNext !== '') {
    return {
      text: verbNext,
      source: 'inferred',
      why: '这一步做完了，下一步看它产出什么',
      saw: `刚做完一步：${pastTense(liveVerb, kind)}`,
      result: '',
      adjust: '想让它先做别的，直接说一句。',
    };
  }
  if (kind === 'read') {
    return { text: object === '' ? '照着看到的东西动手改。' : `把${on}里看出来的问题改掉。`, source: 'inferred', why: '看清楚之后的常规下一步', saw: object === '' ? '刚才在翻代码' : `刚看完${on}`, result: '', adjust: '如果只是让你确认一下，可以说“看完就行，先别改”。' };
  }
  if (kind === 'write') {
    return { text: object === '' ? '跑一遍测试，确认没碰坏别的。' : `跑一遍测试，确认${on}没碰坏别的。`, source: 'inferred', why: '改完文件通常会自检', saw: object === '' ? '刚动过文件' : `刚动过${on}`, result: '', adjust: '不想让它跑测试，可以说“跳过测试”。' };
  }
  if (kind === 'run') {
    // A successful run records no result text, so this branch used to say the same
    // thing for all of them: 「把结果对一遍，再决定接着改哪里。」 ran 4001 times in one
    // session — a quarter of everything the panel ever showed. Name what was run
    // when the object is known, so the row is about this step and not about running.
    const result = typeof basis.result === 'string' ? basis.result.trim() : '';
    if (result !== '') {
      return { text: `看这一轮跑出来的结果（${cut(result, 16)}），再决定接着改哪里。`, source: 'inferred', why: '跑完总要看结果', saw: object === '' ? '刚才在跑东西' : `刚才在跑${on}`, result: '', adjust: '结果不对可以直说哪里不对。' };
    }
    return {
      text: object === '' ? '把结果对一遍，再决定接着改哪里。' : `看${on}跑出来是什么样，再决定接着改哪里。`,
      source: 'inferred',
      why: '跑完总要看结果',
      saw: object === '' ? '刚才在跑东西' : `刚才在跑${on}`,
      result: '',
      adjust: '结果不对可以直说哪里不对。',
    };
  }
  if (kind === 'plan') {
    return { text: '按清单顺序往下做。', source: 'inferred', why: '清单刚理过', saw: '刚整理过待办', result: '', adjust: '顺序不对直接说“先做另一件”。' };
  }
  if (kind === 'ask') {
    return { text: '等你回话，再接着做。', source: 'inferred', why: '它把决定权交给你了', saw: '刚问过你一句', result: '', adjust: '不想回答就说“你定”，它会自己选一个。' };
  }
  return { text: object === '' ? '接着做清单里的下一件。' : `接着往下做${on}。`, source: 'inferred', why: '一步做完自然往下走', saw: object === '' ? '刚完成一步' : `刚完成${on}`, result: '', adjust: '换方向就直接说。' };
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

/**
 * Objects that describe a role on the screen, not a thing with a name.
 *
 * 「刚点过了「页面上的一处」」 and 「「页面」这步收尾后」 both read as if the panel had
 * identified a particular element and then declined to say which — worse than
 * naming nothing, because the quotes promise a name. These stay unquoted, so the
 * sentence says what happened without pretending to point at something.
 */
const GENERIC_OBJECTS = new Set([
  '页面', '页面上的一处', '页面上的输入框', '页面上的一个选项', '页面上的一个键',
  '页面上的一个位置', '页面上的一个元素', '页面弹窗', '一个文件上去', '一个文件',
  '一个接口', '一个浏览器工作区', '登录状态', '浏览器内部状态', '页内脚本',
  '页面加载', '当前页面的样子', '等你操作',
]);

/**
 * Reference an object the way a person would: quoted when it has a name to lose,
 * bare when it is just a role on the screen.
 */
function objectRef(label) {
  const bare = quoted(label);
  if (bare === '') return '';
  return GENERIC_OBJECTS.has(bare.replace(/[「」『』]/g, '')) ? bare.replace(/[「」『』]/g, '') : bare;
}

/**
 * Quote a label for display without nesting quote marks.
 *
 * Objects arrive already decorated by earlier steps (「某个文件」的代码), so blindly
 * wrapping them produced 「某个文件」的代码」 — an unbalanced quote the reader has to
 * parse. Strip every bracket pair, then wrap once.
 */
function quoted(label) {
  const bare = String(label).replace(/[「」『』]/g, '').trim();
  return bare === '' ? '' : `「${bare}」`;
}

/** "45 秒" / "2 分钟" / "1 小时" — how long a gap has lasted. */
function waitedFor(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 60_000) return `${Math.max(1, Math.round(value / 1000))} 秒`;
  if (value < 3_600_000) return `${Math.round(value / 60_000)} 分钟`;
  return `${Math.round(value / 3_600_000)} 小时`;
}

/**
 * The 正在做 sentence while nothing is in flight.
 *
 * It must not re-tell the row above. 已完成 already says 「翻过了「客户端」。」, so
 * 「刚翻过「客户端」，在判断要不要接着改」 repeats the action AND the object and adds
 * nothing but a stock tail — in one real session 41% of 正在做 frames carried one of
 * five such tails, and 534 of them were straight re-tenses of the row above.
 *
 * What the row above cannot tell the reader is *how long* nothing has happened, and
 * that is the whole difference between 「still working」 and 「wedged」. So this
 * sentence is about the gap, not about the step.
 */
function betweenText(state, at) {
  const last = state.lastDone;
  if (last === null) return '';
  // How long the gap has lasted. This must be measured against the clock the caller
  // passed in, not against the last recorded event: a session that stops producing
  // events is exactly the case where the reader needs the wait to keep growing.
  const quiet = typeof last.at === 'number' && last.at > 0 && typeof at === 'number'
    ? Math.max(0, at - last.at)
    : -1;
  // Past a minute of silence the wait is itself the news; below that it would be
  // noise on every single frame.
  const waited = quiet >= 60_000 ? waitedFor(quiet) : '';
  const stall = waited === '' ? '' : `，已经 ${waited}没有新动作`;
  const object = typeof last.object === 'string' ? last.object.trim() : '';
  // A generic role (「页面上的一处」「当前页面的样子」) is not something that can
  // finish: it is where the action landed, not a task with a name. Making it the
  // subject produced 「页面上的一处这步收尾了」, which reads like a bad translation.
  const named = object !== '' && !GENERIC_OBJECTS.has(object.replace(/[「」『』]/g, ''));
  if (named) return `${objectRef(object)}这步收尾了${stall}，还没开下一步`;
  if (last.kind === 'run') return `上一轮跑完了${stall}，还没开下一步`;
  return state.stepsDone > 0 ? `第 ${Math.max(1, state.stepsDone)} 步收尾了${stall}，还没开下一步` : '';
}

/**
 * What to say next when the step had no object but its verb still says something.
 *
 * A shell step carries no file path, so `object` is empty and the kind templates
 * collapse: every object-less run step of a session said the same 「把结果对一遍，再
 * 决定接着改哪里。」 (228 times in one real session). But the verb is observed — 看目录,
 * 跑测试, 整理代码版本 are three different things to do next, and reading a directory
 * has no 「结果」 to look at in the first place.
 */
const NEXT_AFTER_VERB = {
  在敲命令: '看这一轮命令跑出什么了，再决定接着改哪里。',
  在跑脚本: '看脚本跑出什么，再决定接着改哪里。',
  在跑测试: '看测试过没过，再决定接着改哪里。',
  在检查代码: '看检查有没有报出问题，再决定接着改哪里。',
  在整理代码版本: '看改动都收进版本没有。',
  在看目录: '看目录里有什么，再决定翻哪个。',
  在读文件: '把读出来的内容看一遍，再决定接着改哪里。',
  在文件里找: '看找到的几处，再决定改哪个。',
  在看进程: '看这些进程里有没有它在等的那个。',
  在写文件: '看写进去的内容对不对。',
  在装依赖: '看依赖装上没有。',
  在访问接口: '看接口回了什么。',
  压缩上下文: '接着往下做，刚把长对话压短过。',
  整理交付物: '等你验收这几样交付物。',
  // 只读的核对类。没有宾语可拼，但它刚看完的东西本身就是下一步的依据 ——
  // 旧模板对这一切都说「照着看到的东西动手改」，而核对清单根本不该去改什么。
  在核对插件清单: '插件清单看清楚了，再决定动哪一个。',
  在看后台跑着: '看后台还跑着哪几条命令。',
  在收后台: '看后台交回来的结果。',
  // 等待类：宾语是一块页面或一条回话，等到了才有下一步可谈。
  在等页面上那块: '等页面上那块出来，再接着走。',
  在等接口回话: '等接口回话，再接着走。',
  在等页面跳过去: '等页面跳过去，再接着看。',
  在等页面: '等页面走完这一步，再接着看。',
  // 页面类动作留下的不是「结果」而是一个新页面状态。
  在拍: '看截图里页面长什么样。',
  在点: '看页面有没有照预期地变。',
  在填: '看填进去的内容对不对。',
  在按: '看按下去之后页面怎么变。',
  在勾: '看勾上之后有没有生效。',
  在选: '看选中的那个对不对。',
  // 其余页面类动作走完之后的下一步：页面变成什么样，才是可观察的东西。
  在打开: '看页面打开成什么样，再接着走。',
  在翻: '看翻过去的页面是什么样。',
  在等: '看页面加载出来什么样。',
  在等页面: '看页面走完这一步之后是什么样。',
  在悬停看: '看悬停之后页面有没有反应。',
  在拖动: '看拖完之后页面变成什么样。',
  在开: '看开出来的工作区能不能用。',
  在关: '看关掉之后的状态对不对。',
  在搬: '看登录状态搬过来没有。',
  在存: '看登录状态存下来没有。',
  在请求: '看这个接口回了什么。',
  在问: '看浏览器回了什么。',
  在下载: '看文件下全了没有。',
  在传: '看文件传上去没有。',
  在处理: '看弹窗处理完之后页面什么样。',
  在跑: '看这段脚本跑出什么。',
  在停: '等你操作完，它接着走。',
  // 搜/找/上网查：宾语本身就是下一步要看的东西。
  在代码里翻: '看这几处翻出来的地方，再决定改哪个。',
  在找: '看找到哪几个文件，再决定动哪个。',
  在上网查: '看查回来的资料够不够。',
  派了个小助手去: '等小助手回来，再看它办得怎么样。',
};

/**
 * What comes next while a step is still in flight, for the verbs whose kind lies.
 *
 * `在读文件` is classified as run because it is a shell command, but there is no
 * 「结果」 to wait for — the reading itself is the point. The kind template said
 * 「等这一步的结果出来再定」 for 499 such frames in one session. These are phrased
 * in the future because the step has not finished yet.
 */
const IN_FLIGHT_AFTER_VERB = {
  在读文件: '读完这几处，再决定改哪里。',
  在看: '把这些看完，再决定改哪里。',
  在文件里找: '找到具体的几处，再决定改哪个。',
  在看目录: '看完目录结构，再决定翻哪个文件。',
  在看进程: '看进程里有没有它在等的那个。',
  在检查代码: '等检查结果出来，再决定改哪里。',
  在敲命令: '等这一轮命令跑完，再决定接着改哪里。',
  在跑脚本: '等脚本跑完，再决定接着改哪里。',
  在跑测试: '等测试跑完，看过了没。',
  在装依赖: '等依赖装完，再接着往下走。',
  // 页面类动作没有「结果」可等，等的是页面变成什么样。
  在打开: '等页面打开，再接着看。',
  在翻: '等页面翻过去，再接着看。',
  在等: '等页面加载出来，再接着看。',
  在等页面: '等页面走完这一步，再接着看。',
  在点: '等页面这一步走完，看有没有照预期地变。',
  在填: '等这一栏填完，再接着走。',
  在按: '等这一步做完，看页面怎么变。',
  在选: '等这个选完，再接着走。',
  在勾: '等勾上，再接着走。',
  在搬: '等登录状态搬过来，再接着走。',
  在存: '等登录状态存下来，再接着走。',
  在开: '等工作区开出来，再接着走。',
  在关: '等工作区关掉，再接着走。',
  在请求: '等这个接口回话，再接着走。',
  在问: '等浏览器回话，再接着走。',
  在拍: '等截图拍出来，再看页面什么样。',
  在下载: '等文件下完，再接着走。',
  在传: '等文件传上去，再接着走。',
  在停: '停下来等你操作，你做完它接着走。',
  在处理: '等弹窗处理完，再接着走。',
  在跑: '等这段脚本跑完，再接着走。',
  在整理代码版本: '等版本整理完，再看改动收进去没有。',
  // 搜/找/上网查这类读步骤，宾语是一段写法或一个词，等的是搜出来的那几处。
  在代码里翻: '看这几处翻出来的地方，再决定改哪个。',
  在找: '看找到哪几个文件，再决定动哪个。',
  在上网查: '看查回来的资料够不够。',
  派了个小助手去: '等小助手回来，再看它办得怎么样。',
};

/**
 * The same next-step lines, but naming the thing the step was about.
 *
 * 「把读出来的内容看一遍」 and 「读完这几处」 both talk about an unnamed pile. The panel
 * already knows which file it was — 935 frames of one real session said the generic
 * version while `lastDone.object` held 「客户端」. Naming it is the whole difference
 * between a status line and a shrug.
 */
const NAMED_AFTER_VERB = {
  // 读完之后再说「读完它」等于把上一行念一遍 —— 头部动词一模一样，只有时态不同。
  // 读完的下一步本来就不是再读一遍，而是拿看到的东西动手或者换个地方看。
  //
  // 但也别说「把里面的问题改掉」：刚翻完一个文件不等于翻出了问题，那是替读者
  // 断言一件没观察到的事。说「挑一处动手改」只承诺动作，不承诺结论。
  在读文件: (name) => (name.startsWith('「') ? `在${name}里挑一处动手改。` : '挑一处动手改。'),
  在看: (name) => (name.startsWith('「') ? `在${name}里挑一处动手改。` : '挑一处动手改。'),
  在文件里找: (name) => `挑${name}里找到的一处动手改。`,
  在看目录: (name) => `从${name}里挑一个接着看。`,
  在写文件: (name) => `看写进${name}的内容对不对。`,
  在检查代码: (name) => `看${name}的检查有没有报出问题，再决定接着改哪里。`,
  在跑脚本: (name) => `看${name}跑出什么，再决定接着改哪里。`,
  在跑测试: (name) => `看${name}的测试过没过，再决定接着改哪里。`,
  在敲命令: (name) => `看这一轮命令跑出什么了，再决定接着改哪里。`,
  在访问接口: (name) => `看${name}回了什么。`,
  在代码里翻: (name) => `看${name}翻出来的那几处，再决定改哪个。`,
  在找: (name) => `看${name}是哪几个文件，再决定动哪个。`,
  在上网查: (name) => `看${name}查回来的资料够不够。`,
  派了个小助手去: (name) => `等${name}办完，再看结果。`,
  // 写完之后的下一步与「改完先自己核对一遍」是同一件事，只是说出了核对的是哪个文件。
  在改: (name) => `改完${name}，先自己核对一遍，再决定下一步。`,
  在写: (name) => `写完${name}，先自己核对一遍，再决定下一步。`,
  在开关插件: (name) => `动完${name}，先自己核对一遍，再决定下一步。`,
  在装插件: (name) => `装完${name}，先自己核对一遍，再决定下一步。`,
  在卸掉插件: (name) => `卸掉${name}之后，先自己核对一遍，再决定下一步。`,
};

/** '「名字」' when the step pointed at something real, else ''. */
function usableName(object) {
  const bare = String(object ?? '').replace(/[「」『』]/g, '').trim();
  if (bare === '' || PLACEHOLDERS.has(bare)) return '';
  return objectRef(bare);
}

/**
 * The next step for a verb, naming its object when that object is real.
 *
 * Falls back to the plain table entry, then to '' when the verb is unknown.
 */
function afterVerb(verb, object) {
  const name = usableName(object);
  if (name !== '') {
    const named = NAMED_AFTER_VERB[verb];
    if (named !== undefined) return named(name);
  }
  return NEXT_AFTER_VERB[verb] ?? '';
}

/**
 * The same, for a step that has not finished yet.
 *
 * The wording is future-tense, so it uses its own table; but the object is just as
 * worth naming — 「读完这几处」 says nothing when the panel knows it is 「客户端」.
 */
function inFlightVerb(verb, object) {
  const name = usableName(object);
  if (name !== '') {
    const named = NAMED_AFTER_VERB[verb];
    if (named !== undefined) return named(name);
  }
  return IN_FLIGHT_AFTER_VERB[verb] ?? NEXT_AFTER_VERB[verb] ?? '';
}

/**
 * The verbs whose object adds nothing to the next step.
 *
 * A page role (「页面上的一处」) names where the click landed, not what comes next;
 * a checklist is the whole point of the step. For these the verb-level sentence is
 * strictly better than the kind template, so it wins even when an object exists.
 */
const VERB_NEXT_WINS = new Set([
  '在核对插件清单', '在看后台跑着', '在收后台', '在访问接口',
  '在等页面上那块', '在等接口回话', '在等页面跳过去', '在等页面',
  '在拍', '在点', '在填', '在按', '在勾', '在选',
  '在看目录', '在看进程', '压缩上下文', '整理交付物',
  // A syntax check produces a verdict, not 「跑出来的结果」: the kind template made
  // 「看「主入口」跑出来是什么样」 out of `node --check`, which never ran anything.
  '在检查代码',
]);

/**
 * Tie the three rows back to the thing the user actually asked for.
 *
 * This is the whole answer to 「没头没尾」. Each row used to be a subjectless
 * sentence — 「改完了「旁白逻辑」」「这里可能卡住了」「接下来把那条条目改正」.
 * All three are true and all three are unreadable, because the reader cannot
 * tell: which of my requests is this? did it belong to that one? where is it
 * going? A row that cannot answer those is a fragment, no matter how accurate.
 *
 * So every row now carries its anchor:
 *   done  — named outright:  第 3 件「做部队编制」：改完了「旁白逻辑」，测试全过。
 *   doing — pinned back:     还是这件，在看「说明文档」的代码。
 *   next  — read as the rest of the same paragraph.
 *
 * The done row only gets the current request's name when the step really is
 * that request's: a step from a previous request is labelled 「上一件」 instead.
 * Naming it after the new request would be a cheerful lie about what just
 * happened.
 */
function anchorRows(state, rows, built) {
  // 永远返回新数组：调用方会清空原数组再填回来，返回同一个引用会把三行一起清掉。
  const source = Array.isArray(rows) ? rows : [];
  const request = state.request;
  if (request === null) return source.slice();
  const number = typeof request.n === 'number' && request.n > 0 ? request.n : state.requestCount;
  const ask = typeof request.text === 'string' ? cut(request.text, 22) : '';
  const full = ask === '' ? '' : `第 ${number} 件「${ask}」`;
  return source.map((row) => {
    if (row.key === 'done') {
      const owner = state.lastDone !== null && state.lastDone !== undefined ? state.lastDone.request : undefined;
      if (typeof owner === 'number' && owner !== number) {
        return { ...row, text: `上一件收尾时，${row.text}` };
      }
      // 用逗号不用冒号：这一行的正文里常常已经有一个冒号了（「…没做成：原因」），
      // 再接一个就成了三个冒号串在一起的句子。
      return full === '' ? row : { ...row, text: `${full}，${row.text}` };
    }
    if (row.key === 'doing') {
      // 空档与空闲不该被说成「还在同一件事里」——那两行本来就在讲没有活。
      if (full === '' || /^(现在没在动|等它动起来)/.test(row.text)) return row;
      return { ...row, text: `还是这件，${row.text}` };
    }
    if (row.key === 'next') {
      // 「下一步」缺的是尾巴：它说要去干什么，却不说这件还差什么才算完。
      // 先补齐口，这一步才有落点，读者才知道走完它意味着什么。
      // 缺口来自 `buildRequest` 算好的那份 —— 原始 request 上没有这个字段。
      const gap = built !== null && built !== undefined && typeof built.open === 'string' ? built.open : '';
      if (gap === '' || row.text.includes(gap) || /^这件还差/.test(row.text)) return row;
      return { ...row, text: `这件还差${gap}；${row.text}` };
    }
    return row;
  });
}

/** The 已完成 row. */
function doneRow(state) {
  const done = state.lastDone;
  if (done === null) return null;
  const toolText = done.failed
    ? `${failureText(done)}。`
    : sentence(done.verb, done.object, '');
  // 工具只说「翻了类型定义」，只有它自己会说「API 调研已经完成」。后者才是读者问的
  // 那件事，所以有它就用它，并把工具那句留在展开详情里当证据。
  const prose = proseFresh(state);
  const said = prose === null || done.failed ? '' : prose.done.replace(/[。；：，]+$/, '');
  if (said !== '') {
    return {
      text: `${cut(said, 96)}。`,
      source: 'reported',
      details: {
        why: done.why === '' ? '它自己排的顺序' : done.why,
        saw: toolText,
        result: RESULT_BY_KIND[done.kind] ?? RESULT_BY_KIND.other,
        adjust: done.adjust ?? ADJUST.other,
      },
    };
  }
  return {
    text: toolText,
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
function doingRow(state, at) {
  // A failure must surface here whenever nothing is actively running, even if the
  // turn itself is still marked running (the agent often retries after an error).
  //
  // This row says what is happening NOW, and the reason lives in 已完成 and in the
  // red light note. Repeating the reason here made the two rows identical, and the
  // dedup in buildView then threw away the only informative one.
  if (state.error !== null && state.current === null) {
    const step = typeof state.error.step === 'string' ? state.error.step.trim() : '';
    // 「这里」没有指代对象 —— 读者不知道「这里」是哪一步。有名字就点名，
    // 没名字才退回一句不带主语的说法（那种情况确实说不出是哪一步）。
    const where = step === '' ? '' : `${objectRef(step)}这一步`;
    return {
      text: state.running
        ? `${where}卡住了，它正在换个办法接着试。`
        : `${where}卡住了，停在这一步等你发话。`,
      source: 'observed',
      details: {
        why: '它报了一个错，正在兜底',
        saw: step === '' ? '看到一步没走通' : `看到${quoted(step)}那一步没走通`,
        result: state.error.text,
        adjust: '可以直接说“换个办法”，或者按“先停一下”让它停下。',
      },
    };
  }
  // A live tool call only describes "正在做" while the turn is actually running.
  // After a turn/end a straggler call can survive a replay; showing it then
  // produces "在访问接口" next to a green 完成 light.
  const current = state.running ? state.current : null;
  if (current !== null) {
    // A call that has been in flight for a long time is the one moment the reader
    // most needs a number: 「在看「图标」」 does not distinguish a 2-second read from
    // one that has been hanging for 18 minutes. Same minute threshold as the gap
    // sentence, so short calls keep the line clean.
    const quiet = typeof current.startedAt === 'number' && current.startedAt > 0 && typeof at === 'number'
      ? Math.max(0, at - current.startedAt)
      : -1;
    const waited = quiet >= 60_000 ? waitedFor(quiet) : '';
    const text = sentence(current.verb, current.object ?? '', current.why ?? '');
    return {
      text: waited === '' ? text : `${text.replace(/。$/, '')}，已经 ${waited}了。`,
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
          saw: cut(thinkingDigest(state, 'strict'), 160),
          result: '还没出结果',
          adjust: '想法不对就直接说，它在下一步会看到。',
        },
      };
    }
    // The buffered thought is English, so `thinkingClause` rejected it. Read the
    // action and object out of it anyway: 「在改测试」 is a real reading; the
    // template below is the panel admitting it cannot see anything.
    const action = englishAction(state);
    if (action !== '') {
      // `thinkingDigest('strict')` drops every ASCII run, so an English thought
      // comes back empty and the expanded block showed 「看到了什么」 with nothing
      // under it — a promise the row itself did not keep. Say where the reading
      // came from instead of printing an English paragraph on a Chinese panel.
      const digest = cut(thinkingDigest(state, 'strict'), 160);
      return {
        text: `在${action}。`,
        source: 'reported',
        details: {
          why: '它还没开始动手，正在心里过一遍',
          saw: digest === '' ? '它用英文在心里过了一遍，原话没上屏' : digest,
          result: '还没出结果',
          adjust: '想法不对就直接说，它在下一步会看到。',
        },
      };
    }
    // Nothing to read: either the step boundary just cleared the buffer, or this
    // agent has not produced any reasoning yet. Say where the work actually is —
    // what just finished — instead of a sentence that could belong to any moment.
    const last = state.lastDone;
    const between = betweenText(state, at);
    if (between !== '') {
      return {
        text: `${between}。`,
        source: 'observed',
        details: {
          why: '上一步已经结束，它在挑下一步',
          saw: last.object === '' ? `第 ${Math.max(1, state.stepsDone)} 步刚做完` : `刚做完 ${last.object}`,
          result: '还没出结果',
          adjust: '想让它先做别的，直接说一句，它下一步就照办。',
        },
      };
    }
    return {
      text: '在想下一步做什么。',
      source: 'inferred',
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
 *
 * Mentioning the same object does not count: 「刚看过的代码，在挑下一处该看的地方」
 * and 「把代码里看出来的问题改掉」 both name the login page, and they are exactly
 * the two different things the reader needs. So the quote contents come out before
 * any overlap is measured — only a shared *action* makes two lines redundant.
 */
export function repeats(a, b) {
  const x = bareText(a);
  const y = bareText(b);
  if (x === '' || y === '') return false;
  if (x === y) return true;
  const sx = skeleton(a);
  const sy = skeleton(b);
  if (Math.min(sx.length, sy.length) < 6) return false;
  for (let i = 0; i + 6 <= sx.length; i += 1) {
    if (sy.includes(sx.slice(i, i + 6))) return true;
  }
  return false;
}

/** The line with its object names taken out, leaving only the action. */
function skeleton(text) {
  return bareText(String(text ?? '').replace(/「[^」]*」/g, ''));
}

/** Every name a line quotes, so two lines can be asked whether they name the same thing. */
function namesIn(text) {
  return [...String(text ?? '').matchAll(/「([^」]*)」/g)].map((found) => found[1]);
}

/**
 * The bare action, stripped of tense and connective wrappers.
 *
 * 「在看。」 and 「接着看。」 are the same act written twice; 「在改。」 and 「接着改。」
 * likewise. `repeats` cannot see this: it needs six shared characters, and these
 * skeletons are two to three. A real session showed what that cost — 「在看「客户端」。」
 * above 「接着看「客户端」。」 for 211 frames, 63.9% of all frames carrying two rows
 * that quote the same object.
 *
 * Only the head counts: everything from the first quote or comma on is commentary
 * (「，看清楚里面到底写了什么」 / 「，在找下一处要动的地方」), and two rows that differ
 * only there still describe one act.
 */
const LEAD_VERB = new Map([
  ['读文件', '看'], ['看文件', '看'], ['读', '看'], ['翻', '看'], ['翻阅', '看'],
]);
function leadAction(text) {
  const head = String(text ?? '').split(/[「，。；：、]/)[0];
  const bare = head
    .replace(/^(正在|在|接着|又|先|再|刚|把)/, '')
    .replace(/(了|着|过)$/, '');
  return LEAD_VERB.get(bare) ?? bare;
}

/**
 * True when the next row adds nothing to the doing row: same action, same names.
 *
 * Deliberately narrow. 「刚改完「旁白逻辑」，在找下一处要动的地方。」 and 「跑一遍测试，
 * 确认「旁白逻辑」没碰坏别的。」 quote one file but describe two different moves —
 * that pair is exactly what the reader needs, and it must survive.
 */
function restates(doing, next) {
  const lead = leadAction(doing);
  if (lead === '') return false;
  if (leadAction(next) !== lead) return false;
  const a = namesIn(doing).sort().join('\u0000');
  const b = namesIn(next).sort().join('\u0000');
  return a === b;
}

/**
 * A tail that carries no object at all — 「再决定改哪里」 and its cousins.
 *
 * Stripping the repeated half out of 「读完「客户端」，再决定改哪里。」 would leave
 * 「再决定改哪里。」: the object lived in the half that got cut. That is worse than the
 * repeat (1149 of 4459 frames), so those get a fresh next step instead of a trim.
 */
const PURE_TRANSITION = /^(再|先|然后|接着|之后|等)?(决定|看|等|确认)[^「」。]{0,8}$/;

/**
 * One forward line per kind, with no object in it.
 *
 * Used only when both rows would otherwise carry the same name: the row above already
 * says which file this was, so repeating the name here buys nothing and costs the
 * reader a re-read. What is left to say is the fork — carry on, or stop and act.
 */
const FORWARD_BY_KIND = {
  read: '看完就够判断了：够就动手改，不够就接着看。',
  write: '改完先自己核对一遍。',
  run: '看这一步出来的结果，再决定接着改哪里。',
  plan: '按定下来的顺序往下走。',
  ask: '等你回话再接着做。',
  other: '接着往下走。',
};

/**
 * The same fork, chosen by what the step actually was rather than by its family.
 *
 * `classify` files `node -e "…readFileSync…"` under run — it is a shell command — but
 * nothing was executed, so 「看这一步出来的结果」 describes an event that cannot happen.
 * The reader is owed the read fork instead.
 */
const READ_LIKE_VERBS = new Set([
  '在读文件', '在写文件', '在看目录', '在文件里找', '在检查代码', '在看进程', '在看',
  '在代码里翻', '在找', '在看后台跑着', '在收后台', '在核对插件清单',
]);
function forwardFor(last) {
  if (last === null) return FORWARD_BY_KIND.other;
  const live = typeof last.verbLive === 'string' ? last.verbLive : '';
  if (READ_LIKE_VERBS.has(live)) return FORWARD_BY_KIND.read;
  const kind = typeof last.kind === 'string' ? last.kind : 'other';
  return FORWARD_BY_KIND[kind] ?? FORWARD_BY_KIND.other;
}

/** A next step that still helps when the obvious guess would just repeat. */
function nextWhenRepeating(state) {
  // Between steps there is no step in flight, so the old default (`'run'`) made this
  // row promise 「等这一步的结果出来再定」 while nothing was running and the result was
  // already in hand — 640 of 837 fallbacks in one real session. When the finished
  // step's verb is known it names a real next move; otherwise the kind decides.
  if (state.current === null) {
    const last = state.lastDone;
    const live = last !== null && typeof last.verbLive === 'string' ? last.verbLive : '';
    const after = afterVerb(live, last === null ? '' : last.object);
    if (after !== '') {
      return {
        text: after,
        source: 'inferred',
        why: '上一步做完了，下一步看它产出什么', saw: '刚做完一步',
        adjust: '想让它先做别的，直接说一句。',
      };
    }
    const doneKind = last === null ? 'run' : last.kind;
    if (doneKind === 'write') {
      return {
        text: '改完先自己核对一遍，再决定下一步。',
        source: 'inferred',
        why: '改动刚落地，还没验证', saw: '刚改完东西',
        adjust: '不想让它自检，可以说“改完直接告诉我”。',
      };
    }
    if (doneKind === 'run') {
      return {
        text: '这一步跑完了，先看结果有没有问题。',
        source: 'inferred',
        why: '跑完总要看结果', saw: '刚跑完一步',
        adjust: '结果不对可以直说哪里不对。',
      };
    }
    if (doneKind === 'read') {
      // 读完之后那个岔口是真实的：看够了就动手，没看够接着看。旧的兜底在这里
      // 印「这一步做完了，它会接着往下走。」—— 真会话 1163 帧，等于什么都没说。
      const readName = usableName(last === null ? '' : last.object);
      return {
        text: readName === '' ? '看完这处，够了就动手改，不够就接着看。' : `看完${readName}，够了就动手，不够就接着看下一个。`,
        source: 'inferred',
        why: '读完才有下一步的判断依据', saw: '刚看完一处',
        adjust: '想直接动手，说一句就行。',
      };
    }
    return {
      text: '这一步做完了，它会接着往下走。',
      source: 'inferred',
      why: '顺序由它自己排', saw: '刚做完一步',
      adjust: '想让它先做别的，直接说一句。',
    };
  }
  const kind = state.current.kind;
  // 手上这步的动词比它的类别更具体：`在读文件` 没有「结果」可等，而 kind 只有 run
  // 一档，于是真会话里 499 帧「在读文件」都被说成「等结果」。write 同理 —— 手上正在
  // 改「旁白逻辑」时，「改完先自己核对一遍」比「改的是哪个」少一半信息。
  const inFlightNext = inFlightVerb(state.current.verb, state.current.object);
  if (inFlightNext !== '' && (kind === 'run' || kind === 'write' || kind === 'read')) {
    return {
      text: inFlightNext,
      source: 'inferred',
      why: '这一步做完才知道往哪走', saw: '手上有一步正在做',
      adjust: '想换个方向，直接说一句，它下一步就照办。',
    };
  }
  if (kind === 'run') {
    return {
      text: '等这一步的结果出来再定：过了就收尾，没过就接着改。',
      source: 'inferred',
      why: '要等结果才知道往哪走', saw: '手上有一步正在跑',
      adjust: '想换个方向，直接说一句，它下一步就照办。',
    };
  }
  if (kind === 'write') {
    return {
      text: '改完先自己核对一遍，再决定下一步。',
      source: 'inferred',
      why: '改动刚落地，还没验证', saw: '手上正在改东西',
      adjust: '不想让它自检，可以说“改完直接告诉我”。',
    };
  }
  return {
    text: '这一步做完，它会接着往下走。',
    source: 'inferred',
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
  //
  // But between steps there IS no call in hand, and that is where most frames sit:
  // the panel rendered between tool/result and the next tool/call had no basis and
  // printed 「想办法」 for 4397 of 4460 frames — a shrug repeated all session. The
  // last finished step is a truthful answer there, because the agent is working on
  // what that step produced.
  const basis = state.current ?? (state.running ? state.lastDone : (state.lastDone ?? state.current));
  const phase = state.error !== null
    ? '卡住了'
    : !state.running
      ? '已经收尾'
      : basis === null
        ? '刚开头'
        : (PHASE_BY_KIND[basis.kind] ?? PHASE_BY_KIND.other);

  const total = state.todos.length;
  const finished = state.todos.filter((todo) => todo.status === 'completed').length;
  return {
    phase,
    items: items.slice(0, 4),
    steps: state.stepsDone,
    files,
    touched: Array.isArray(state.files) ? state.files.filter((name) => !PLACEHOLDERS.has(name)).slice(-4) : [],
    failed: state.failedCount ?? 0,
    todos: total === 0 ? null : { done: finished, total },
  };
}

/**
 * How many steps a checklist stays believable for.
 *
 * Not a timeout — a checklist is a plan for a stretch of work, and it is normal to
 * spend several steps inside one item. But a list written at step 29 and still
 * quoted at step 2200 is not describing the work any more; every 「下一件是…」 is a
 * promise about a moment that ended long ago. Past this, the panel says the list
 * has gone stale instead of repeating it as if it were current.
 */
const TODOS_FRESH_STEPS = 40;

/**
 * How far along the thing the user actually asked for is.
 *
 * This is the answer to 「进度」, and it is measured in requests, not in tool
 * calls. A session that took 2244 calls to serve 43 requests has a progress of
 * 43, not of 2244 — and the useful question about any one of them is not 「跑了
 * 多少次」 but 「改了什么、验证过没有、还差什么」.
 *
 * A change is only trustworthy once something ran after it. That is why the
 * status looks at order (did a run happen after the last write?), not at counts.
 * @param {ReturnType<typeof createLensState>} state
 * @param {number} [at]
 */
export function buildRequest(state, at = Date.now()) {
  const request = state.request;
  if (request === null) return null;
  return readRequest(request, toTime(at, Date.now()), state.lastRun);
}

/**
 * One request, read the same way whether it is the live one or a closed one.
 *
 * The panel keeps a list of finished requests now (that list is the overview), so
 * the judgement must not fork: whatever 「这件事做完了没有、验证过没有、还差什么」
 * means for the live request has to mean exactly the same for the twenty behind
 * it. One function, two callers.
 */
function readRequest(request, now, lastRun) {
  const files = Array.isArray(request.files) ? request.files : [];
  const changed = files.length > 0 || request.writes > 0;
  const ran = request.runs > 0;
  // 用这件事自己的那次运行判断「验没验过」。全局的 `lastRun` 会被下一件事覆盖，
  // 拿它判历史请求，就会把「测试跑过了」读成「改完还没跑过验证」。
  // 传进来的 `lastRun` 只在请求自己没记过时兜底（冷启动、老状态）。
  const mine = request.lastRun !== undefined && request.lastRun !== null ? request.lastRun : lastRun;
  // 只有「改完之后跑过」才算验证过：先跑后改，跑的那次没碰过改动。
  const verified = ran && mine !== null && mine !== undefined
    && mine.checkedAfterWrite === true && mine.failed !== true;
  // 跑挂了，或者改完之后又跑挂了 —— 这两种才是「没过」。
  const failedRun = mine !== null && mine !== undefined
    && mine.checkedAfterWrite === true && mine.failed === true;
  const broken = failedRun || (request.failed > 0 && !verified);

  const status = request.done
    // 做完也分三种，而且第三种最要紧：跑过但没过。把它和「没跑过」并成一档
    // 是含蓄的失败报告——「做完了但改完没再跑过验证」听起来像忘了验，
    // 实际上是验了、挂了。
    ? (broken && !verified ? 'done-blocked' : verified ? 'done' : changed ? 'done-unverified' : 'done-nothing')
    : !changed
      ? 'looking'
      // 只有「改完之后的成功运行」才算验证。改之前跑过、或者跑挂了，读者看到的
      // 都是同一件事：这次改动还没有证据说它是对的。分成两个状态只是多一套说法。
      : verified
        ? 'verified'
        : broken
          ? 'blocked'
          : 'changed-unverified';

  const named = files.slice(-3);
  const what = changed
    ? named.length === 0
      ? `改了 ${request.writes} 处`
      : `改了 ${Math.max(files.length, 1)} 个文件（${named.join('、')}）`
    : '还没动过文件';

  const verdict = status === 'done'
    ? '这件事做完了，跑过验证都通过。'
    : status === 'done-blocked'
      ? '这件事收了尾，但最后一次验证没过。'
      : status === 'done-unverified'
        ? '这件事做完了，但改完没再跑过验证。'
        : status === 'done-nothing'
          ? '这件事结束了，没有改到文件。'
          : status === 'blocked'
            ? '卡住了，最后一次跑没通过。'
            : status === 'looking'
              ? '还在看，没动手。'
              : status === 'verified'
                ? '已经改完并跑过验证，都通过。'
                : '已经改完，还没跑过验证。';

  return {
    n: request.n,
    text: request.text,
    at: request.at,
    elapsedMs: Math.max(0, now - request.at),
    status,
    files: named,
    changed,
    writes: request.writes,
    runs: request.runs,
    failed: request.failed,
    ran,
    verified,
    // 差什么：没跑过就要跑，跑挂了就要修，没改就是还在找，验证过了就没什么差的了。
    open: status === 'done' || status === 'done-nothing' || status === 'verified'
      ? ''
      : status === 'blocked' || status === 'done-blocked'
        ? '把没过的验证修好'
        : !changed
          ? '先找到要改的地方'
          : '跑一遍验证',
    what,
    verdict,
    // 这一件事是怎么结束的。故事需要结尾，一串动作不需要。
    closedBy: typeof request.closedBy === 'string' ? request.closedBy : '',
    closedAt: typeof request.closedAt === 'number' ? request.closedAt : 0,
    done: request.done === true,
    // 它在这一件事里说过的最后一句话，是这一段的「结局语」。
    lastSaid: typeof request.lastSaid === 'string' ? request.lastSaid : '',
    steps: typeof request.steps === 'number' ? request.steps : 0,
    // 这件事里发生过的关键瞬间（开场、动手、出错、收尾），按发生顺序。
    beats: Array.isArray(request.beats) ? request.beats : [],
  };
}

/** Whether the checklist still describes what is going on. */
export function todosAreFresh(state) {
  const at = typeof state.todosAt === 'number' ? state.todosAt : -1;
  if (at < 0) return (Array.isArray(state.todos) ? state.todos : []).length === 0;
  return state.stepsDone - at <= TODOS_FRESH_STEPS;
}

/** The unfinished checklist items, in the order they were written down. */
export function pendingTodos(state) {
  const list = Array.isArray(state.todos) ? state.todos : [];
  const open = list.filter((item) => item.status !== 'completed' && item.status !== 'cancelled');
  // A stale list still says what was planned, but it must not be quoted as the next
  // step. The caller turns this into 「清单是很早以前写的」 rather than a promise.
  if (!todosAreFresh(state)) return [];
  return open
    .map((item) => item.text)
    .filter((text) => typeof text === 'string' && text !== '');
}

/**
 * The squad list under one commander.
 *
 * A delegated subagent is not a tool call — it is a whole session with its own
 * turn, steps, files and failures. Treating it as the single line 「派了个小助手去」
 * meant the panel showed one soldier and called it an overview.
 *
 * Each child is described with the same vocabulary its own panel uses (the same
 * `doing` sentence, the same five lights), so the tree reads as an extension of
 * the panel rather than a second set of terms the user has to learn.
 *
 * Depth stops at one level. A grandchild is counted, not expanded: this column
 * is 176–284px wide, and a recursive tree there is a mess, not an overview.
 *
 * @param {readonly string[]} childIds
 * @param {(id: string) => {state: any, view: any, children?: string[]} | null} lookup
 * @param {{now?: number}} [options]
 */
export function buildTree(childIds, lookup, options = {}) {
  const ids = Array.isArray(childIds) ? childIds : []
  if (ids.length === 0) return []
  const at = toTime(options.now, Date.now())
  const out = [];
  for (const childId of ids) {
    if (typeof childId !== 'string' || childId === '') continue;
    let child = null;
    try {
      child = lookup(childId);
    } catch {
      child = null;
    }
    if (child === null || child === undefined) continue;
    const state = child.state;
    if (state === null || state === undefined) continue;
    const request = buildRequest(state, at);
    // 「它在干什么」直接用它自己那一行，措辞完全一致 —— 用户认得的说法只有一套。
    const rows = Array.isArray(child.view?.rows) ? child.view.rows : [];
    const doing = rows.find((row) => row?.key === 'doing');
    out.push({
      sessionId: childId,
      running: state.running === true,
      status: child.view?.status ?? (state.running === true ? 'working' : 'done'),
      light: typeof child.view?.light === 'string' ? child.view.light : 'green',
      // 剥掉句尾标点：它是列表里的一格，不是一整句。
      doing: typeof doing?.text === 'string' ? doing.text.replace(/[。！？]$/, '') : '',
      // 这支队伍被派去干什么。子会话的第一个请求就是它的任务说明 —— 指挥官
      // 看不出「哪一队在干嘛」时，认兵靠的是任务，不是会话号。
      mission: request === null ? '' : request.text,
      files: Array.isArray(state.files) ? state.files.slice(-3) : [],
      steps: typeof state.stepsDone === 'number' ? state.stepsDone : 0,
      failed: (state.failedCount ?? 0) > 0,
      // 它这一队交了什么差。没有请求（刚开张）就老实留空。
      landed: request === null ? '' : request.what,
      verdict: request === null ? '' : request.verdict,
      elapsedMs: state.turnStartedAt > 0 ? Math.max(0, at - state.turnStartedAt) : 0,
      // 小队自己也有小队时，如实计数，不在这一层展开。
      grandchildren: Array.isArray(child.children) ? child.children.length : 0,
    });
  }
  return out;
}

/**
 * Mark a pending steer as read when the agent actually picks it up.
 *
 * `agent.steer` only promises the message reached the inbox; whether the agent
 * ever read it is a separate fact that shows up as a `user/message` in its own
 * log. Comparing the text is the only handle we have — the inbox does not echo
 * our `sidekick-` id back — so the match requires the steer's own template text
 * to appear, not merely the user's words.
 *
 * Returns true when a receipt changed, so the caller knows to republish.
 *
 * @param {ReturnType<typeof createLensState>} state
 * @param {string} text the user/message body as recorded
 * @param {number} at
 */
export function matchSteer(state, text, at) {
  const pending = Array.isArray(state.pendingSteers) ? state.pendingSteers : [];
  if (pending.length === 0) return false;
  const body = String(text ?? '');
  if (body === '') return false;
  let changed = false;
  const next = pending.map((receipt) => {
    if (receipt.state !== 'pending') return receipt;
    // 我们的模板前缀 + 提醒原文，缺一不可；只对原文相等会把用户自己说的话也算进来。
    const ours = receipt.full !== '' ? body.includes(receipt.full) : body.includes(receipt.text);
    if (!ours) return receipt;
    changed = true;
    return { ...receipt, state: 'read', readAt: toTime(at, Date.now()) };
  });
  if (changed) state.pendingSteers = next;
  return changed;
}

/**
 * What happened to each nudge the commander sent.
 *
 * Three honest readings, no fourth:
 *   pending — sent, not seen yet
 *   read    — the agent's own log now carries this message
 *   stale   — sent long ago and still nothing; the panel must admit it does not
 *             know rather than keep implying delivery equals adoption
 *
 * @param {ReturnType<typeof createLensState>} state
 * @param {number} [now]
 */
export function buildReceipts(state, now) {
  const list = Array.isArray(state.pendingSteers) ? state.pendingSteers : [];
  const at = toTime(now, Date.now());
  // How long a nudge can sit unseen before the panel stops waiting politely.
  // A steer is read at the next step boundary, and a long tool call can take
  // minutes — but past this, 「还没读到」 stops being informative.
  const STALE_MS = 10 * 60_000;
  return list.map((receipt) => {
    const seen = receipt.state === 'read';
    const waited = Math.max(0, (seen ? receipt.readAt : at) - receipt.sentAt);
    return {
      text: receipt.text,
      state: seen ? 'read' : waited >= STALE_MS ? 'stale' : 'pending',
      sentAt: receipt.sentAt,
      readAt: seen ? receipt.readAt : 0,
      waitedMs: waited,
    };
  });
}

/**
 * The operation, read as a story instead of a feed.
 *
 * This is the answer to 「从头发生到当下」. A flat list of beats is not a story:
 * every line is an orphan, and the reader has to reconstruct which request it
 * belonged to and whether that request ever ended. So the unit here is the
 * *request*, and each one is a chapter with a beginning (what was asked), a
 * middle (what actually happened, condensed), and an end (how it closed).
 *
 * Three things make a chapter legible:
 *   - the ask, quoted, always first — without it the beats mean nothing;
 *   - the outcome, stated as a verdict rather than a count;
 *   - the closure reason, because 「用户换话题了」 and 「做完了」 are different
 *     ends and only the second one is a success.
 *
 * @param {ReturnType<typeof createLensState>} state
 * @param {{now?: number, limit?: number}} [options]
 */
export function buildChronicle(state, options = {}) {
  const now = toTime(options.now, Date.now());
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 30;
  const done = Array.isArray(state.history) ? state.history : [];
  const chapters = [];
  const dropped = state.historyDropped ?? 0;
  for (const request of done) {
    chapters.push(chapterOf(request, now, state.lastRun));
  }
  // 正在进行的那一件事也必须是一章 —— 否则「当下」在总览里不存在。
  if (state.request !== null) {
    chapters.push({ ...chapterOf(state.request, now, state.lastRun), live: true });
  }
  const kept = chapters.slice(-limit);
  // 「一共有几件」和「这里能看到几件」是两件事。
  //
  // requestCount 来自日志里真正数到的请求数（可能 43），但回放窗口很短，
  // 历史里只攒得出 1 章。把 43 写在标题上、下面只列 1 条，是拿一个数字
  // 撑门面。所以两个数都留着：total 说明整场有多大，missing 说明这一段
  // 看不到多少 —— 面板必须自己承认它只看见了一段。
  const known = state.requestCount;
  const missing = Math.max(0, known - chapters.length);
  return {
    chapters: kept,
    total: known,
    shown: kept.length,
    // 从来没被记录下来的那些 + 被上限挤掉的那些。
    dropped: dropped + Math.max(0, chapters.length - kept.length) + missing,
    // 这一格是「我看到的」和「一共有的」差多少，客户端据此说人话。
    unseen: missing,
    // 一句话的总账：几件、几件成了、几件没验、几件卡着。
    tally: tallyOf(chapters),
  };
}

/** One chapter: ask → what happened → how it ended. */
function chapterOf(request, now, lastRun) {
  const read = readRequest(request, now, lastRun);
  const beats = Array.isArray(read.beats) ? read.beats : [];
  return {
    n: read.n,
    ask: read.text,
    at: read.at,
    // 这件事持续了多久、走了几步 —— 读者判断「大不大」就靠这两个数。
    tookMs: Math.max(0, (read.closedAt || now) - read.at),
    steps: read.steps,
    // 发生过什么，压成两句：动手的地方 + 最好的验证结果。细节不要在这一层。
    happened: condense(beats),
    files: read.files,
    // 结局：一句话结论 + 它是怎么结束的。
    outcome: read.verdict,
    ending: endingOf(read),
    // 它自己最后说的那句，作为这一章的收尾语。
    lastSaid: read.lastSaid,
    status: read.status,
    live: false,
  };
}

/**
 * What this chapter did, in at most two clauses.
 *
 * The chapter already has a verdict below it; repeating 「改了 X、跑了 Y」 in
 * full would make every chapter four lines long and the overview unreadable.
 * Two beats is enough to say 「顺」 or 「不顺」.
 */
function condense(beats) {
  const list = Array.isArray(beats) ? beats : [];
  if (list.length === 0) return [];
  const out = [];
  const push = (entry) => {
    if (entry === undefined) return;
    // 同一件事不重复说：两次「改了同一个东西」压成一次。
    if (out.some((item) => item.text === entry.text)) return;
    out.push({ at: entry.at, kind: entry.kind, text: entry.text });
  };
  // 先保失败（它是转折点），再保第一次动手，再保验证结果。其余不留。
  const fail = list.find((entry) => entry.kind === 'fail');
  const write = list.find((entry) => entry.kind === 'write');
  const run = list.find((entry) => entry.kind === 'run');
  push(fail);
  push(write);
  push(run);
  return out.slice(0, 3);
}

/**
 * Why a chapter ended the way it did — and whether that ending was a success.
 *
 * 「做完了」 needs no explanation. Everything else does, and the distinction has
 * to be drawn from the request's own result rather than from who moved on:
 *
 *   superseded + verified   → the user moved on, but this one was already done.
 *                             Saying 「你换下一件事了，这件就先停在这」 here would
 *                             turn a success into an abandoned task — the panel
 *                             flattering itself with a complaint.
 *   superseded + incomplete → the user moved on before it finished. That is the
 *                             honest reading and the reader should see it.
 */
function endingOf(request) {
  if (request.done !== true) return '';
  // 已经做完、而且验证通过了：这是完整收尾，不需要额外解释。
  if (request.status === 'done' || request.status === 'done-nothing' || request.status === 'verified') return '';
  if (request.closedBy === 'superseded') return '你换下一件事了，这件没走完就停在这';
  if (request.closedBy === 'dropped') return '你换下一件事了，这件还没动过手';
  return '';
}

/** The one-line tally over every chapter: a commander's first question. */
function tallyOf(chapters) {
  const list = Array.isArray(chapters) ? chapters : [];
  const result = { finished: 0, unverified: 0, blocked: 0, open: 0, total: list.length };
  for (const chapter of list) {
    if (chapter.status === 'done' || chapter.status === 'done-nothing' || chapter.status === 'verified') result.finished += 1;
    // 「跑挂了」和「卡住了」是同一件事：这次改动没有证据说它是对的。
    else if (chapter.status === 'blocked' || chapter.status === 'done-blocked') result.blocked += 1;
    else if (chapter.status === 'done-unverified' || chapter.status === 'changed-unverified') result.unverified += 1;
    else result.open += 1;
  }
  return result;
}

/**
 * The battle log, shaped for the panel.
 *
 * Newest last, because it is read as a log (the eye lands on the bottom where
 * the live moment is), but each line carries a wall-clock stamp so a person
 * can say 「二十分钟前那次失败」 and mean something exact.
 *
 * @param {ReturnType<typeof createLensState>} state
 * @param {{now?: number, limit?: number}} [options]
 */
export function buildTimeline(state, options = {}) {
  const list = Array.isArray(state.timeline) ? state.timeline : [];
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : MAX_TIMELINE;
  const kept = list.slice(-limit);
  const at = toTime(options.now, Date.now());
  return kept.map((line) => ({
    at: line.at,
    // How long ago, computed here so the client never has to trust its own clock
    // against the Host's. The client re-derives it for the live tail.
    ageMs: Math.max(0, at - line.at),
    kind: line.kind,
    text: line.text,
    source: line.source,
    request: line.request,
    step: line.step,
    // 同一个动作连着做了几次。一次是「做了什么」，五次是「它一直在做这个」——
    // 那两条信息完全不同，而后者才是有用的那一条。
    count: typeof line.count === 'number' ? line.count : 1,
  }));
}

/**
 * The checklist, with each item's state worked out from what actually happened.
 *
 * A plan nobody reconciles against reality is just a wish. The agent writes
 * 「接下来这些」 once and the panel used to print it verbatim forever — including
 * the items it had already finished. Here each line gets one of four readings:
 *
 *   done    — the agent marked it completed in a todo write
 *   active  — it is the first unfinished item and the agent is working right now
 *   dropped — a later plan replaced it (it is not in the current list any more)
 *   open    — still planned, not started
 *
 * Nothing here is inferred from the text of the work; only from the todo list
 * the agent itself wrote. Guessing progress from prose is how a progress panel
 * starts lying.
 */
export function buildChecklist(state) {
  const todos = Array.isArray(state.todos) ? state.todos : [];
  const fresh = todosAreFresh(state);
  const live = state.running === true;
  const items = [];
  let sawOpen = false;
  for (const todo of todos) {
    let status;
    if (todo.status === 'completed') status = 'done';
    else if (todo.status === 'cancelled') status = 'dropped';
    else if (!sawOpen && live) {
      status = 'active';
      sawOpen = true;
    } else {
      status = 'open';
      sawOpen = true;
    }
    items.push({ text: todo.text, status });
  }
  return {
    // A stale list still describes an intention, but calling its first unstarted
    // item 「正在做」 would be a claim about the present moment that nothing backs.
    fresh,
    items: fresh ? items : items.map((item) => ({ ...item, status: item.status === 'done' ? 'done' : 'open' })),
    done: items.filter((item) => item.status === 'done').length,
    total: items.length,
  };
}

/**
 * The one story the whole panel reads from.
 *
 * Before this existed the panel had two parallel readings of the same moment:
 * `buildSummary` answered "how far along is the thing I asked for", while
 * `doneRow`/`doingRow`/`guessNext` answered "what was the last step". They drifted
 * apart — a user watching both could read 「到目前为止：动了 1 个文件」 next to
 * 「正在做：在想下一步做什么」, which is the panel contradicting itself.
 *
 * So: fold the story ONCE here — what landed, what is in flight, what is next,
 * what is still missing — and let the summary line and the three rows each be a
 * projection of that one object. Same facts, three zoom levels.
 */
export function buildStory(state, options = {}) {
  const progress = buildProgress(state);
  const tally = state.tally ?? {};
  const touched = progress.touched.filter((name) => name !== '');
  const pending = pendingTodos(state);

  // 1) 结果：做成了什么。数字给范围，名字给可扫读的落点 —— 两个都要。
  const landed = [];
  if (progress.files > 0) {
    // Only name them when the names account for the whole count. Printing one
    // name beside 「2 个文件」 reads as a bug: the reader counts the names, gets a
    // different number, and stops trusting both.
    //
    // When the count is larger than what fits, say which ones were touched LAST
    // instead of falling silent: 「动了 15 个文件」 alone is a number nobody can picture,
    // and in a long session it was 97% of all summary frames. "最近动的是…" keeps the
    // count honest (15 is still 15) while giving the reader something to recognise.
    if (touched.length > 0 && touched.length === progress.files && touched.length <= 3) {
      landed.push(`动了 ${progress.files} 个文件（${touched.join('、')}）`);
    } else if (touched.length > 0) {
      const recent = touched.slice(-2).map((name) => `「${name}」`).join('、');
      landed.push(`动了 ${progress.files} 个文件，最近动的是${recent}`);
    } else {
      landed.push(`动了 ${progress.files} 个文件`);
    }
  } else if ((tally.write ?? 0) > 0) {
    landed.push(`改过 ${tally.write} 处`);
  }

  // 2) 还差什么：清单上没打勾的条目。
  const gap = [];
  if (pending.length > 0) {
    const count = progress.todos !== null ? `清单 ${progress.todos.done} / ${progress.todos.total}，` : '';
    gap.push(
      pending.length === 1
        ? `${count}还差「${cut(pending[0], 24)}」这一件`
        : `${count}还剩 ${pending.length} 件，下一件是「${cut(pending[0], 24)}」`,
    );
  } else if (state.todos.length > 0 && !todosAreFresh(state)) {
    // The list is still on the books but no longer describes this stretch of work.
    // Saying so beats silently dropping the gap: the reader asked for those items.
    gap.push(`清单是 ${Math.max(1, state.stepsDone - state.todosAt)} 步以前写的，早对不上了`);
  } else if (progress.todos !== null) {
    gap.push(`清单 ${progress.todos.done} / ${progress.todos.total} 全打勾了`);
  }

  // 3) 没有可点名的产出，也没有清单时：说它把时间花在哪、还差什么。
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

  const hasWork = progress.steps > 0 || progress.items.length > 0 || progress.todos !== null;
  const current = state.running ? state.current : null;
  return {
    progress,
    landed,
    gap,
    pending,
    touched,
    hasWork,
    phase: progress.phase,
    // What the rows need: the queue, the thing in hand, and whether anything has
    // happened at all. Kept on the story so no row has to re-derive them.
    current,
    basis: current !== null ? current : state.lastDone,
    nextTodo: pending.length > 0 ? pending[0] : '',
  };
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
  const story = buildStory(state, options);
  const template = typeof options.emptyState === 'string' ? options.emptyState : '';
  if (!story.hasWork) {
    return template !== '' ? template : '还没出成品：这一轮刚开始。';
  }

  // 有请求账本时，先说「你提的第 N 件事」做到哪一步 —— 那才是进度。
  // 「动了 15 个文件」说的是它有多忙；「第 12 件：改了 3 个文件，已经跑过验证，
  // 都通过」说的是你要的那件事怎么样了。
  const request = buildRequest(state, state.updatedAt);
  if (request !== null && state.requestCount > 0) {
    const head = request.text === '' ? `你提的第 ${request.n} 件事` : `你提的第 ${request.n} 件（${cut(request.text, 26)}）`;
    const prose = proseFresh(state);

    // 它自己说的话，比任何从工具调用推出来的账都更接近「进度」：工具只知道
    // 改了哪个文件，只有它自己会说「修好了、还剩什么、接下来做什么」。
    if (prose !== null && (prose.done !== '' || prose.plan !== '')) {
      const said = prose.done !== '' ? cut(prose.done.replace(/[。；：，]+$/, ''), 52) : request.what;
      const left = request.open === '' ? '' : `，还差${request.open}`;
      // 用 planLine 而不是原文：原文常以冒号结尾，那是在引出下面的清单，直接贴进总结
      // 就成了「接下来重新加载并检查：。」—— 一个停在不该停的地方的句子。
      const plan = prose.plan === '' ? '' : planLine(prose.plan).replace(/。$/, '');
      const willDo = plan === '' ? '' : `；${plan}`;
      return cut(`${head}：${said}${left}${willDo}。`, 150);
    }

    const body = `${head}：${request.what}，${request.verdict.replace(/。$/, '')}`;
    const gap = request.open === '' ? [] : [`还差${request.open}`];
    if (request.open === '' && story.gap.length > 0) gap.push(story.gap[0]);
    const fail = story.progress.failed > 0 ? [`中间碰了 ${story.progress.failed} 次错`] : [];
    const tail = [...gap, ...fail].join('，');
    return cut(`${body}${tail === '' ? '。' : `，${tail}。`}`, 140);
  }

  const body = [...story.landed, ...story.gap].join('，');
  const head = template !== '' ? template : `到目前为止：${body}`;
  const base = template !== '' ? head.replace('{duration}', '').replace('{files}', String(story.progress.files)) : head;
  const tail = [];
  if (story.progress.failed > 0) tail.push(`中间碰了 ${story.progress.failed} 次错`);
  const text = tail.length === 0 ? base : `${base}，${tail.join('，')}`;
  return cut(`${text}。`, 120);
}

/** What the panel shows at the top: machine-readable view of the same ledger. */
export function buildView(state, now, options = {}) {
  const at = toTime(now, Date.now());
  // One story, read by every row. Built first so 已完成 / 正在做 / 下一步 all quote
  // the same ledger instead of each re-deriving the moment from raw state.
  const story = buildStory(state, options);
  const current = doingRow(state, at);
  let done = doneRow(state);
  let next = guessNext(state, story);

  // 「下一步」最该引用的是它自己写下来的计划，而不是我们按动词查表推的。
  // 工具调用只会说「读完了某文件」，只有它自己会写「接下来要补边界测试」。
  // 这是它的话，所以标「仅据汇报」，不是「已观察到」。
  const prose = proseFresh(state);
  if (prose !== null && prose.plan !== '') {
    const plan = planLine(prose.plan);
    if (plan !== '') {
      next = {
        ...next,
        text: plan,
        source: 'reported',
        why: '这是它自己写下来的计划，不是工具调用推出来的',
        saw: '读到它自己写的下一步',
        result: '',
        adjust: '计划不对就直接说，它下一步会改。',
      };
    }
  }

  // 「正在做」和「下一步」说同一句话是最吵的噪音。丢掉重复的引子，而不是整行
  // 换掉：整行换掉会让「下一步」不再重复清单上的那一件，于是它和下面的账本
  // 各说各话（真实会话里出现过：行说「等结果」，账本说「下一件是补边界测试」）。
  //
  // `repeats` 只认得字面重复；「在看「客户端」。」上面顶着「接着看「客户端」。」它看不见
  // —— 那是同一件事的两个时态。这类「下一步」不叫下一步，它只是把上面那行又念了
  // 一遍，所以整行该让位（真实会话里这种帧占 63.9%，光「在看」这一族就 211 帧）。
  if (state.running && current !== null && restates(current.text, next.text)) {
    const alt = nextWhenRepeating(state);
    next = { text: alt.text, source: alt.source ?? 'inferred', why: alt.why, saw: alt.saw, result: '', adjust: alt.adjust };
  } else if (state.running && current !== null && repeats(current.text, next.text)) {
    const trimmed = guessNext(state, story, { plain: true });
    if (repeats(current.text, trimmed.text)) {
      const alt = nextWhenRepeating(state);
      next = { text: alt.text, source: alt.source ?? 'inferred', why: alt.why, saw: alt.saw, result: '', adjust: alt.adjust };
    } else {
      next = trimmed;
    }
  }
  // 「已完成」和「下一步」也会撞车：上一行说「改完了「旁白逻辑」。」，下一行又写
  // 「改完「旁白逻辑」，先自己核对一遍」。同一件事换个时态再说一遍，读者要先读完
  // 那半个复述句才发现后半句才是新的（真实会话 798 帧，17.9%）。
  //
  // 整行删掉是不对的：后半句（先自己核对一遍）才是真正的新信息。把被复述的那半句
  // 摘掉，只留计划本身；摘完只剩几个字时才整行退到兜底，因为残句比复述更糟。
  if (done !== null && namesIn(done.text).length > 0 && restates(done.text, next.text)) {
    const rest = next.text.replace(/^[^，；。]{0,40}[，；]/, '').trim();
    const bare = rest.replace(/[。！？]$/, '');
    // 摘完只剩一句纯过渡（「再决定改哪里」），那摘掉的前半句才是唯一带对象的半句：
    // 强行摘会得到一行没有主语的残句，比重复更糟 —— 这种时候整行换一个下一步。
    if (bare.length >= 6 && !PURE_TRANSITION.test(bare) && bare !== next.text.replace(/[。！？]$/, '')) {
      // 「再决定改哪里」已经自带连接词，再加「接下来」会读成「接下来再决定」。
      const glued = /^(再|先|然后|接着|之后|等)/.test(bare) ? bare : `接下来${bare}`;
      next = { ...next, text: `${glued}。` };
    } else {
      // 退到兜底时不能再借同一个对象名（nextWhenRepeating 会再念一遍「读完「客户端」」），
      // 上一行已经说了是哪个文件，这里只补「看完之后怎么判断」那一层。
      const last = state.lastDone;
      const object = last !== null && typeof last.object === 'string' ? last.object : '';
      next = {
        ...next,
        text: forwardFor(last),
        source: 'inferred',
        why: '上一行已经点过是哪个文件了，这一步不重复它',
        saw: object.trim() === ''
          ? `第 ${Math.max(1, state.stepsDone)} 步做完`
          : `第 ${Math.max(1, state.stepsDone)} 步做完，动的是${objectRef(object)}`,
        result: '',
        adjust: '想让它先做别的，直接说一句。',
      };
    }
  }
  // 同样，别让「已完成」和「正在做」描述同一件事（重试同一个动作时会发生）。
  // 早先这里整行换成「上一步做完了。」—— 那句话对读者等于没说，而且失败态下两行
  // 文本都源自同一句报错，必然命中，于是唯一带信息的那行被主动删掉了。
  //
  // 换成「第 N 步做过一遍」也不够：它告诉读者序号，还是没说是哪件事。重复本身
  // 就是有效信息，把它说清楚即可 —— 同一件事又做了一遍，而这件事叫什么仍然写在
  // 原来那句里。
  if (done !== null && current !== null && repeats(done.text, current.text)) {
    const again = done.text.replace(/\s/g, '');
    const what = again.startsWith('第') ? '' : bareText(again).replace(/[。！？]$/, '');
    done = {
      ...done,
      text: what === '' ? again : `同一件事又做了一遍：${what}。`,
    };
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

  // 四态：working / waiting / done / failed。参照 assistant-ui 的 AgentStatus ——
  // 它把「等你回话」单列一态，因为在跑和在等人是两件事：前者你可以走开，后者
  // 你不看它就永远停在那儿。灯色仍是原来五盏（不引入第六种颜色），只有状态词变。
  const status = state.error !== null
    ? 'failed'
    : !state.running
      ? 'done'
      : state.current !== null && state.current.kind === 'ask'
        ? 'waiting'
        : 'working';

  // 进度用「用户提的事」计，不用工具调用计。真实会话里 43 条用户消息配了 2244 次
  // 工具调用，按调用数报「第 49 / 50 步」，读者读到的是一个跟自己的诉求无关的数字。
  //
  // 分母不再预支一格：还有活没干完不代表「还有第 44 件事」，那是同一件事的剩余部分。
  const request = buildRequest(state, at);
  const total = Math.max(1, state.requestCount);
  const position = { index: request === null ? 1 : Math.max(1, total), total, unit: 'request' };

  const pulse = buildPulse(state, at);
  const beatAge = state.beats.length === 0 ? -1 : Math.max(0, at - state.beats[state.beats.length - 1]);
  // Hand the raw beat times to the client too, so the strip can keep decaying
  // between frames instead of freezing at whatever the last event produced.
  const beats = state.beats.filter((beat) => beat > at - PULSE_WINDOW_MS).map((beat) => Math.round(at - beat));

  const rows = [];
  if (done !== null) {
    rows.push({ key: 'done', label: '已完成', text: done.text, source: done.source, details: done.details });
  }
  // 手上没活时，「正在做」要么是量出来的（「这步收尾了，已经 4 分钟没有新动作」）、
  // 要么是「这一轮结束了」，两个都是事实；只有退到「在想下一步做什么」那一下是在猜。
  const between = current === null && state.running ? betweenText(state, at) : '';
  const doingText = current === null ? (state.running ? between || '在想下一步做什么。' : '现在没在动。') : current.text;
  rows.push({
    key: 'doing',
    label: '正在做',
    text: doingText,
    source: current !== null ? current.source : between === '' && state.running ? 'inferred' : 'observed',
    details: current === null
      ? { why: '这一轮已经结束', saw: '没有正在进行的工具调用', result: '', adjust: '想接着做就直接说一句。' }
      : current.details,
  });
  rows.push({ key: 'next', label: '下一步', text: next.text, source: next.source, details: { why: next.why, saw: next.saw, result: next.result, adjust: next.adjust } });

  // 三行必须都读得出「这是哪件事」。没有这一层，每句都是无主的孤句。
  const anchored = anchorRows(state, rows, request);
  rows.length = 0;
  rows.push(...anchored);

  const idle = state.running
    ? null
    : {
      text: buildIdleText(state, options),
      at,
    };

  return {
    sessionId: state.sessionId,
    running: state.running,
    status,
    light,
    lightNote: cut(lightNote, 60),
    position,
    request,
    // 它自己写下的清单。不是我们替它列的，也不给它编状态 —— 读者要的是
    // 「它打算做哪几件事」，这一句原话就是答案。状态只来自 todos 自己的
    // completed 标记与「此刻正在跑」这两件事实，不从正文里猜。
    //
    // 两个来源，真清单优先：`todo/write` 是它用工具落下的待办，带状态、
    // 可对位；正文里顺着话说出来的那几句只是措辞，没有状态。以前只有后者，
    // 于是面板宁可显示一段散文，也不显示它自己维护的那张真正的清单。
    checklist: (() => {
      const todos = buildChecklist(state);
      if (todos.items.length > 0) return todos.items.map((item) => item.text);
      const prose = proseFresh(state);
      return prose === null ? [] : prose.items;
    })(),
    checklistState: buildChecklist(state),
    // 战报：从用户开口到刚刚这一步，每一行都带时间和来源。
    timeline: buildTimeline(state, { now: at }),
    timelineDropped: state.timelineDropped ?? 0,
    // 总览：把「一件事」当单位，从头写到当下。战况是它的证据层，这一层是故事。
    chronicle: buildChronicle(state, { now: at }),
    // 提醒的回执。「发出去了」不等于「它看到了」，这两件事必须分开说。
    receipts: buildReceipts(state, at),
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
 *
 * It also arrives as markdown, because that is how the agent writes. Pasting
 * 「## 这次修掉的真问题 **1. 英文调试文本漏进面板**」 into a one-line panel is not a
 * summary, it is the raw draft with its scaffolding still on. Headings, emphasis,
 * bullets, links and images are stripped here, and a line that stops mid-thought
 * (on a colon or an ellipsis, or inside a cut) is brought back to the last
 * complete sentence it contains.
 */
export function readableLine(raw) {
  if (typeof raw !== 'string') return '';
  const text = plainText(raw);
  if (text === '') return '';
  // Needs actual Chinese: a panel written in plain Chinese must not suddenly quote
  // an English sentence at the user.
  if (/[\u4e00-\u9fff]/.test(text) === false) return '';
  return text;
}

/**
 * Markdown out, one plain sentence in.
 *
 * The last sentence of a reply is usually the conclusion, but the last *line* is
 * often a lead-in (「下面说明这次改了什么、为什么这样改：」) or a heading
 * (「## 这次修掉的真问题」). A panel line that stops mid-thought reads as a rendering
 * bug, so only sentences that actually end are eligible — and when the reply
 * contains none, it is better to say nothing than to print the debris.
 */
function plainText(raw) {
  // Markdown has to go before `scrub`, which collapses newlines: after that the
  // `^`-anchored rules below can no longer tell a heading from a sentence.
  // Emphasis is removed first for the same reason: a bold pseudo-heading
  // (「**1. 英文调试文本漏进面板**」) only starts with 「1.」 once its asterisks are gone,
  // and the numbered-list rule below can then take the marker off like any other item.
  const lines = String(raw)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`~|]+/g, ' ')
    .replace(/^\s{0,3}#{1,6}[ \t]*.*$/gm, ' ')
    .replace(/(?:^|\s)#{1,6}(?=\s)/g, ' ')
    .replace(/^\s{0,3}([-*_])\s*\1\s*\1[ \t]*$/gm, ' ')
    .replace(/^\s{0,3}[-*+][ \t]+/gm, ' ')
    .replace(/^\s{0,3}\d+[.)][ \t]+/gm, ' ')
    .replace(/^\s{0,3}>[ \t]?/gm, ' ')
    .split('\n')
    // A line with no terminal punctuation is a heading or a list title, not a
    // conclusion. Joining it back onto the next line is what produced
    // 「英文调试文本漏进面板三行话现在都说人话了。」 — two unrelated statements fused.
    .filter((line) => /[。！？!?]/.test(line) || line.trim().length > 30)
    // Scrubbed one line at a time, and never joined back together: `scrub` collapses
    // newlines, so two lines welded into one paragraph fuse into a single "sentence"
    // that swallowed the actual conclusion (「…tarball: ✅ 全部验完。」 lost 全部验完).
    .map((line) => scrub(line).trim())
    .filter((line) => line !== '');
  const sentences = [];
  for (const line of lines) {
    for (const found of line.match(/[^。！？!?]+[。！？!?]/g) ?? []) {
      const sentence = found.trim()
        // `scrub` collapses newlines, so a list marker that WAS at the start of a line
        // is now mid-paragraph and survives the `^`-anchored rules above. Strip it here.
        .replace(/^(?:\d+[.)]|[-–—*+])\s*/, '');
      // The tail of a reply often quotes the panel back at it (「」「照着看到的东西动手改。」
      // came from a reply about this very row). A sentence that opens on a closing quote
      // or a bare list marker is a fragment of the previous one, not a conclusion.
      if (/^[」』）)\]】>]/.test(sentence)) continue;
      // A short closing sentence (「搞定。」) is a perfectly good conclusion, so the bar
      // is only that it carries Chinese and is more than a stray punctuation mark.
      if (/[\u4e00-\u9fff]/.test(sentence) === false || sentence.length < 2) continue;
      sentences.push(sentence);
    }
  }
  // A truncated conclusion reads as a bug: 「空闲。上一轮用了…最后一句：1. 文件结构分层理由：
  // 语言层零依赖、纯函数，所以「三行话对不对」可以在没有会…」 leaves the reader guessing what
  // was actually concluded. Prefer the last sentence that fits whole; only cut when
  // every candidate in the reply is too long. Sentences that only announce what comes
  // next (「下面按交付物顺序说。」) are skipped for the same reason: they conclude nothing.
  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    if (LEAD_IN.test(sentences[i]) === false && sentences[i].length <= 60) return sentences[i];
  }
  // Nothing fits whole. Trimming at the last clause boundary still says something
  // true (「…布局数字全绿」), whereas cutting mid-word prints 「…全部正常折行…」
  // with the ellipsis as the last thing the reader sees. If even a clause is not
  // available, print nothing: 「最后一句」 is optional, a broken one is not.
  if (sentences.length === 0) return '';
  const long = sentences[sentences.length - 1].replace(/[。！？!?]$/, '');
  const head = long.slice(0, 60);
  const stop = Math.max(head.lastIndexOf('，'), head.lastIndexOf('、'), head.lastIndexOf('；'));
  if (stop < 8) return '';
  return `${head.slice(0, stop).trim()}。`;
}

/** Sentences that promise a list rather than state a result. */
const LEAD_IN = /^(下面|以下|如下|接下来我(会|要|把)|先说|先列)/;

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

  // 全局：不只看眼前这一步。指挥官问「这一场演习怎么样」时，答案在编年史里，
  // 不在「当前动作」里 —— 给的是「一件事一章」，不是一串无主的动作。
  const chronicle = buildChronicle(state, { now: at, limit: 12 });
  if (chronicle.chapters.length > 0) {
    const tally = chronicle.tally;
    observed.push(`整场：一共 ${chronicle.total} 件，这里看到 ${chronicle.shown} 件；`
      + `办完 ${tally.finished} 件、没过验证 ${tally.blocked} 件、还开着 ${tally.open} 件。`);
    observed.push('每一件事（从早到晚）：');
    for (const chapter of chronicle.chapters) {
      const marks = []
      if (chapter.live) marks.push('正在办')
      if (chapter.status === 'blocked' || chapter.status === 'done-blocked') marks.push('验证没过')
      else if (chapter.status === 'done-unverified' || chapter.status === 'changed-unverified') marks.push('改了没验')
      else if (chapter.status === 'done' || chapter.status === 'verified' || chapter.status === 'done-nothing') marks.push('办完')
      const happened = chapter.happened.map((beat) => beat.text).join('、');
      observed.push(`- 第 ${chapter.n} 件「${chapter.ask}」：${happened === '' ? '还没动手' : happened}。`
        + `${chapter.outcome}${marks.length > 0 ? `（${marks.join('，')}）` : ''}`
        + `${chapter.ending === '' ? '' : ` ${chapter.ending}。`}`);
    }
    if (chronicle.unseen > 0) {
      observed.push(`（注意：这一场一共 ${chronicle.total} 件，但只看得到第 ${chronicle.chapters[0].n} 件之后的。）`);
    }
  }
  const receipts = buildReceipts(state, at);
  for (const receipt of receipts) {
    observed.push(receipt.state === 'read'
      ? `你发的提醒「${receipt.text}」它已经读到了。`
      : receipt.state === 'stale'
        ? `你发的提醒「${receipt.text}」发了很久还没读到。`
        : `你发的提醒「${receipt.text}」已送达，还没确认它读到。`);
  }

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
  // 派出去的队由宿主折成纯文本递进来（它拿得到 agent 表，纯函数层拿不到）。
  if (typeof options.squads === 'string' && options.squads !== '') {
    lines.push('', '【派出去的队】（宿主读到的子会话状态）', options.squads);
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
