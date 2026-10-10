// Claude fallback browser QA (QA_CLAUDE=1): the first model goes down, Claude answers, then both go down.
// Runs against either pipeline: ANSWER_PIPELINE=direct (streamed) or legacy (default), and with QA_GEMINI=1
// (Gemini first, set up like production) or without it (OPENAI_* first).
const { chromium } = require('playwright') // resolved via NODE_PATH, see README.md;
const fs = require('fs');
const path = require('path');

const WEB = 'http://127.0.0.1:4173';
const API = 'http://127.0.0.1:8000';
const LLM = 'http://127.0.0.1:11500';
const SHOTS = path.join(__dirname, 'shots', 'claude');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let screen = '';
const check = (name, ok, detail = '') => {
  results.push({ screen, name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${screen}] ${name}${detail ? ` — ${detail}` : ''}`);
};
const getJson = async (url) => (await fetch(url)).json();
const db = () => getJson(`${API}/__debug/db`);
const setMode = (body) =>
  fetch(`${LLM}/__mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const docs = (dump, col) => Object.entries(dump[col] || {}).map(([id, d]) => ({ id, ...d }));
const waitFor = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const CLAUDE = 'claude-haiku-5-5';
const FAILURE = '지금은 답변을 가져오지 못했어요';
// A run of plain words from the stored answer (legacy answers can start with markdown).
const snippet = (answer) =>
  (answer || '').split('\n').map((line) => line.replace(/[#*_>`|-]/g, ' ').replace(/\s+/g, ' ').trim()).find((line) => line.length >= 12)?.slice(0, 12) || '';

(async () => {
  await setMode({ mode: 'normal', claude_mode: 'normal' });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  const dock = page.locator('div.fixed.inset-x-0.bottom-0');
  const input = dock.locator('input');
  const conversation = async (question) => docs(await db(), 'conversations').find((c) => c.question === question);
  const answered = async (question) => {
    await waitFor(async () => ((await conversation(question)) || {}).answer, 20000);
    const doc = (await conversation(question)) || {};
    const words = snippet(doc.answer);
    await waitFor(async () => words && (await page.locator('main').innerText()).includes(words), 5000);
    await page.waitForTimeout(400); // metadata and chips settle
    return { doc, shown: Boolean(words) && (await page.locator('main').innerText()).includes(words) };
  };
  const ask = async (question) => {
    await input.fill(question);
    await input.press('Enter');
  };

  await page.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });

  // ---------------------------------------------------------------- A. 기본 모델 정상
  screen = 'A. 기본 모델 정상';
  const q1 = '디자인 시스템 경험 알려줘';
  await ask(q1);
  const a1 = await answered(q1);
  const pipeline = a1.doc.pipeline;
  console.log(`pipeline: ${pipeline}`);
  check('기본 모델이 답함(Claude 호출 없음)', a1.shown && a1.doc.model !== CLAUDE && (await getJson(`${LLM}/__claude_calls`)).count === 0,
    JSON.stringify({ model: a1.doc.model }));
  const gemini = (a1.doc.model || '').startsWith('gemini');
  if (gemini) {
    const g = await getJson(`${LLM}/__calls`);
    check('Gemini 요청: temperature 없음·reasoning_effort low·max_tokens ≥ 4096', !g.last_keys.includes('temperature') && g.last_reasoning_effort === 'low' && g.last_max_tokens >= 4096,
      JSON.stringify({ keys: g.last_keys, effort: g.last_reasoning_effort, max: g.last_max_tokens }));
    if (pipeline === 'direct') check('Gemini 스트림: stream_options 안 보냄', !g.last_keys.includes('stream_options'), g.last_keys.join(','));
  }

  // ---------------------------------------------------------------- B. 기본 모델 장애 → Claude
  screen = 'B. 기본 모델 장애 → Claude';
  await setMode({ mode: 'fail' });
  const q2 = '그 프로젝트에서 PM으로 맡은 일은?';
  await ask(q2);
  const a2 = await answered(q2);
  check('Claude 답변이 화면에 보임 + 실패 문구 없음', a2.shown && (await page.getByText(FAILURE).count()) === 0, snippet(a2.doc.answer));
  check('DB: model = claude-haiku-5-5, 오류 없음', a2.doc.model === CLAUDE && !a2.doc.error, JSON.stringify({ model: a2.doc.model, error: a2.doc.error }));
  check('카운터 2/5', await dock.getByText('2/5', { exact: true }).isVisible());
  if (gemini) {
    // OPENAI_API_KEY is set but OPENAI_BASE_URL is the local default: Gemini → Claude with no attempt in between.
    const log = fs.readFileSync(path.join(__dirname, '.logs', 'backend.log'), 'utf8');
    check('Gemini 장애 → 로컬 기본 주소는 건너뛰고 바로 Claude', !log.includes('qwen3:32b'), log.split('\n').filter((l) => l.includes('failed')).slice(-2).join(' | '));
  }
  const req = await getJson(`${LLM}/__claude_calls`);
  check('요청: API 키 헤더·anthropic-version·모델', req.api_key && req.version && req.model === CLAUDE, JSON.stringify({ k: req.api_key, v: req.version, m: req.model }));
  check('요청: temperature·top_p 없음(Haiku 5.5는 거부)', !req.keys.includes('temperature') && !req.keys.includes('top_p'), req.keys.join(','));
  check('요청: effort low, 생각 토큰 여유(max_tokens ≥ 4096)', req.output_config?.effort === 'low' && req.max_tokens >= 4096, JSON.stringify({ o: req.output_config, m: req.max_tokens }));
  check('요청: 시스템 프롬프트(지식베이스) 캐시 표시', Array.isArray(req.system) && req.system[0]?.cache_control?.type === 'ephemeral' && req.system[0].text.length > 2000,
    `${req.system?.[0]?.text?.length}자`);
  check('요청: 마지막 메시지는 질문(user)', req.roles.at(-1) === 'user', req.roles.join(','));
  if (pipeline === 'direct') {
    check('direct: 스트리밍 요청 + 직전 대화 포함', req.stream && JSON.stringify(req.roles) === '["user","assistant","user"]', JSON.stringify(req.roles));
    check('direct: Claude가 고른 근거 칩(코레일·NCT)', (await page.getByText('코레일 피복관리 시스템', { exact: true }).count()) === 1
      && (await page.getByText('SM Entertainment NCT 투어 웹사이트 (2024)', { exact: true }).count()) === 1);
    check('direct: DB 토큰 수(캐시 포함 입력 9040, 출력 180)', a2.doc.prompt_tokens === 9040 && a2.doc.completion_tokens === 180,
      JSON.stringify({ p: a2.doc.prompt_tokens, c: a2.doc.completion_tokens }));
    check('direct: 메타데이터 문구가 화면에 안 보임', (await page.getByText('<<<META>>>').count()) === 0);
  } else {
    check('legacy: 스트리밍 아닌 요청', !req.stream);
  }
  await page.screenshot({ path: path.join(SHOTS, `B-claude-answer-${pipeline}.png`) });

  // ---------------------------------------------------------------- C. 둘 다 장애 → 다시 시도
  screen = 'C. 둘 다 장애';
  await setMode({ claude_mode: 'fail' });
  const q3 = '협업 방식이 궁금해요';
  await ask(q3);
  const failed = await waitFor(async () => (await page.getByText(FAILURE).count()) === 1, 20000);
  check('실패 문구 + 다시 시도 버튼', failed && (await page.getByRole('button', { name: '다시 시도' }).isVisible()));
  check('실패한 질문은 세지 않음(2/5 유지)', await dock.getByText('2/5', { exact: true }).isVisible());
  const errorDoc = await conversation(q3);
  check('DB: error = llm_unavailable', errorDoc?.error === 'llm_unavailable', JSON.stringify(errorDoc?.error));
  await setMode({ claude_mode: 'normal' });
  await page.getByRole('button', { name: '다시 시도' }).click();
  await waitFor(async () => docs(await db(), 'conversations').filter((c) => c.question === q3 && c.answer).length === 1, 20000);
  const retried = docs(await db(), 'conversations').find((c) => c.question === q3 && c.answer) || {};
  await waitFor(async () => (await page.getByText(FAILURE).count()) === 0, 5000);
  check('Claude가 돌아오면 다시 시도로 답변', retried.model === CLAUDE && (await page.getByText(FAILURE).count()) === 0, JSON.stringify({ model: retried.model }));
  check('카운터 3/5', await dock.getByText('3/5', { exact: true }).isVisible());

  // ---------------------------------------------------------------- D. Claude 거절
  screen = 'D. Claude 거절';
  await setMode({ claude_mode: 'refusal' });
  const q4 = '어려웠던 결정이 있었나요?';
  await ask(q4);
  const refused = await waitFor(async () => (await page.getByText(FAILURE).count()) === 1, 20000);
  check('거절도 실패로 표시(빈 답변으로 끝나지 않음)', refused && (await page.getByRole('button', { name: '다시 시도' }).isVisible()));
  check('DB: error = llm_unavailable', (await conversation(q4))?.error === 'llm_unavailable');
  check('카운터 3/5 유지', await dock.getByText('3/5', { exact: true }).isVisible());

  // ---------------------------------------------------------------- E. 기본 모델 복구
  screen = 'E. 기본 모델 복구';
  await setMode({ mode: 'normal', claude_mode: 'normal' });
  const claudeBefore = (await getJson(`${LLM}/__claude_calls`)).count;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await waitFor(async () => docs(await db(), 'conversations').filter((c) => c.question === q4 && c.answer).length === 1, 20000);
  const recovered = docs(await db(), 'conversations').find((c) => c.question === q4 && c.answer) || {};
  check('다시 기본 모델이 답함(Claude에 머물지 않음)', recovered.model && recovered.model !== CLAUDE && (await getJson(`${LLM}/__claude_calls`)).count === claudeBefore,
    JSON.stringify({ model: recovered.model }));
  await waitFor(async () => (await dock.getByText('4/5', { exact: true }).count()) === 1, 5000);
  check('카운터 4/5', await dock.getByText('4/5', { exact: true }).isVisible());
  await page.screenshot({ path: path.join(SHOTS, `E-recovered-${pipeline}.png`) });

  screen = '콘솔 오류';
  // net::ERR_* is the analytics script, which this sandbox can't reach.
  const unexpected = consoleErrors.filter((e) => !e.includes('net::ERR'));
  check('예상 밖 콘솔 오류 없음', unexpected.length === 0, unexpected.join(' | '));

  await browser.close();
  const failedChecks = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failedChecks.length}/${results.length} passed`);
  fs.mkdirSync(path.join(__dirname, '.logs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '.logs', `results_claude_${pipeline}${gemini ? '_gemini' : ''}.json`), JSON.stringify(results, null, 2));
  process.exit(failedChecks.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(2); });
