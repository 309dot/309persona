// Phase 3/4 browser QA with ANSWER_PIPELINE=direct: streaming, sources, follow-ups, feedback, retry.
const { chromium } = require('playwright') // resolved via NODE_PATH, see README.md;
const fs = require('fs');
const path = require('path');

const WEB = 'http://127.0.0.1:4173';
const API = 'http://127.0.0.1:8000';
const LLM = 'http://127.0.0.1:11500';
const SHOTS = path.join(__dirname, 'shots', 'stream');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let screen = '';
const check = (name, ok, detail = '') => {
  results.push({ screen, name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${screen}] ${name}${detail ? ` — ${detail}` : ''}`);
};
const getJson = async (url) => (await fetch(url)).json();
const db = () => getJson(`${API}/__debug/db`);
const llm = () => getJson(`${LLM}/__calls`);
const setMode = (mode, delay = 2, metaDelay = 0) =>
  fetch(`${LLM}/__mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, delay, meta_delay: metaDelay }) });
const docs = (dump, col) => Object.entries(dump[col] || {}).map(([id, d]) => ({ id, ...d }));
const waitFor = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const FAKE_START = '페이히어에서는 디자인 시스템이 없어';
const FAKE_END = '수렴했어요.';

(async () => {
  await setMode('normal');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const apiCalls = [];
  const consoleErrors = [];
  page.on('request', (r) => {
    if (r.url().startsWith(API)) apiCalls.push({ method: r.method(), path: r.url().slice(API.length), body: r.postData() });
  });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const calls = (method, exact) => apiCalls.filter((c) => c.method === method && c.path === exact);
  const dock = page.locator('div.fixed.inset-x-0.bottom-0');
  const input = dock.locator('input');
  const answers = () => page.getByText(FAKE_START).count();
  // Only complete answers end with FAKE_END; FAKE_START shows up as soon as streaming starts.
  const completed = () => page.getByText(FAKE_END).count();
  const conversations = async () => docs(await db(), 'conversations').filter((c) => !c.is_blocked);

  // ---------------------------------------------------------------- A. 스트리밍 답변
  screen = 'A. 스트리밍 답변';
  await page.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
  await dock.getByRole('button', { name: /디자인 시스템 구축에서/ }).click();
  const lengths = [];
  await waitFor(async () => {
    const text = (await page.locator('main').innerText()).split('남은 질문')[0];
    const idx = text.indexOf(FAKE_START);
    if (idx !== -1) lengths.push(text.length - idx);
    return (await page.getByText(FAKE_END).count()) > 0;
  }, 15000);
  const partials = new Set(lengths).size;
  check('답변이 조각으로 나눠 표시됨(스트리밍)', partials >= 3, `서로 다른 길이 ${partials}개 관측`);
  await page.getByText('근거', { exact: true }).first().waitFor({ timeout: 5000 });
  for (const label of ['페이히어 디자인 시스템 (2022–2023)', "'하나 합' 금융 UX (2021–2022)", '이력서']) {
    check(`근거 칩: ${label}`, await page.getByRole('link', { name: label, exact: true }).isVisible());
  }
  const resumeHref = await page.getByRole('link', { name: '이력서', exact: true }).getAttribute('href');
  check('이력서 칩은 이력서 PDF로 연결', (resumeHref || '').endsWith('Product-resume.pdf'), resumeHref);
  for (const chip of ['디자인 시스템을 팀에 정착시킨 방법은?', '하나 합에서 맡은 역할은?']) {
    check(`후속 질문 칩: ${chip}`, await page.getByRole('button', { name: chip }).isVisible());
  }
  check('메타데이터 문구가 화면에 안 보임', (await page.getByText('<<<META>>>').count()) === 0 && (await page.getByText('"sources"').count()) === 0);
  let calls1 = await llm();
  check('LLM을 stream=true로 1회 호출', calls1.last_stream && calls1.count === 1, JSON.stringify(calls1));
  check('첫 질문 프롬프트: system + user', JSON.stringify(calls1.last_roles) === '["system","user"]', JSON.stringify(calls1.last_roles));
  check('카운터 1/5, 남은 질문 4/5', (await dock.getByText('1/5', { exact: true }).isVisible()) && (await page.getByText('남은 질문 4/5').isVisible()));
  let conv = (await conversations())[0] || {};
  check('DB: pipeline·model·지연·첫 토큰·토큰 수 기록', conv.pipeline === 'direct' && conv.model && conv.latency_ms >= 0 && conv.first_token_ms >= 0 && conv.prompt_tokens === 4200 && conv.completion_tokens === 320,
    JSON.stringify({ p: conv.pipeline, m: conv.model, l: conv.latency_ms, f: conv.first_token_ms, pt: conv.prompt_tokens, ct: conv.completion_tokens }));
  check('DB: 근거 id·후속 질문·주제 저장', JSON.stringify(conv.sources) === '["P2","P3","RESUME"]' && (conv.follow_ups || []).length === 2 && conv.category === 'design_system',
    JSON.stringify({ s: conv.sources, f: conv.follow_ups, c: conv.category }));
  check('DB: 답변에 메타데이터 없음', !(conv.answer || '').includes('META') && conv.answer.endsWith(FAKE_END));
  await page.screenshot({ path: path.join(SHOTS, 'A-stream-answer.png') });

  // ---------------------------------------------------------------- A1. 새로고침 복원
  screen = 'A1. 새로고침 복원';
  const sessionA = JSON.parse(calls('POST', '/api/chat/stream')[0].body).session_id;
  const visitorPosts = calls('POST', '/api/visitors').length;
  await page.reload({ waitUntil: 'networkidle' });
  check('답변·근거 칩·후속 질문 칩 복원', (await completed()) === 1 && (await page.getByRole('link', { name: '이력서', exact: true }).count()) === 1 && (await page.getByRole('button', { name: '하나 합에서 맡은 역할은?' }).count()) === 1);
  check('질문 수 복원(1/5)', await dock.getByText('1/5', { exact: true }).isVisible());

  // ---------------------------------------------------------------- A2. 메타데이터가 늦을 때
  screen = 'A2. 메타데이터 대기 중 입력';
  await setMode('normal', 0, 2);
  await input.fill('메타데이터가 늦게 오는 질문입니다');
  await input.press('Enter');
  await waitFor(async () => (await completed()) >= 2, 15000);
  await page.waitForTimeout(300);
  const chipsBefore = await page.getByRole('link', { name: '이력서', exact: true }).count();
  await input.fill('다음 질문 미리 입력');
  check('본문이 끝나면 근거가 오기 전에도 전송 가능', !(await dock.getByRole('button', { name: '전송' }).isDisabled()) && chipsBefore === 1, `근거 칩 수(첫 답변 것만) ${chipsBefore}`);
  await waitFor(async () => (await page.getByRole('link', { name: '이력서', exact: true }).count()) === 2, 5000);
  check('메타데이터가 도착하면 근거 칩 추가', (await page.getByRole('link', { name: '이력서', exact: true }).count()) === 2);
  const afterReload = JSON.parse(calls('POST', '/api/chat/stream').at(-1).body);
  check('새로고침 뒤에도 같은 세션 + 복원된 대화를 이력으로 전송', afterReload.session_id === sessionA && calls('POST', '/api/visitors').length === visitorPosts && afterReload.history.length === 1,
    `${afterReload.session_id.slice(0, 8)} vs ${sessionA.slice(0, 8)}, history ${afterReload.history.length}`);
  await input.fill('');
  await setMode('normal');

  // ---------------------------------------------------------------- B. 후속 질문
  screen = 'B. 후속 질문 칩';
  await page.getByRole('button', { name: '디자인 시스템을 팀에 정착시킨 방법은?' }).click();
  await waitFor(async () => (await completed()) >= 3, 15000);
  await waitFor(async () => (await page.getByRole('button', { name: '하나 합에서 맡은 역할은?' }).count()) === 1, 3000);
  const calls2 = await llm();
  check('칩 문장이 질문으로 전송됨', calls2.last_user.endsWith('디자인 시스템을 팀에 정착시킨 방법은?'), calls2.last_user);
  check('직전 대화가 이력으로 전달됨', JSON.stringify(calls2.last_roles) === '["system","user","assistant","user","assistant","user"]', JSON.stringify(calls2.last_roles));
  const streamBody = JSON.parse(calls('POST', '/api/chat/stream').at(-1).body);
  check('요청 history에 이전 질문·답변', streamBody.history.length === 2 && streamBody.history[0].question.startsWith('디자인 시스템 구축에서') && streamBody.history[0].answer.endsWith(FAKE_END));
  check('후속 질문 칩은 최신 답변 아래에만', (await page.getByRole('button', { name: '하나 합에서 맡은 역할은?' }).count()) === 1);
  const funnel = docs(await db(), 'funnel_events');
  check('follow_up_clicked 이벤트 기록', funnel.some((e) => e.event === 'follow_up_clicked'));

  // ---------------------------------------------------------------- C. 피드백
  screen = 'C. 답변 피드백';
  await page.getByRole('button', { name: '도움이 됐어요' }).first().click();
  await waitFor(async () => calls('POST', '/api/chat/feedback').length === 1);
  await waitFor(async () => ((await conversations())[0] || {}).feedback === 'up');
  conv = (await conversations())[0];
  check('DB 첫 답변 feedback=up', conv.feedback === 'up' && Boolean(conv.feedback_at), JSON.stringify({ f: conv.feedback }));
  check('누른 버튼 표시 + 감사 문구', (await page.getByRole('button', { name: '도움이 됐어요' }).first().getAttribute('aria-pressed')) === 'true' && (await page.getByText('의견 고마워요').first().isVisible()));
  check('한 번 누르면 다시 못 누름', await page.getByRole('button', { name: '아쉬워요' }).first().isDisabled());

  // ---------------------------------------------------------------- D. 실패 → 다시 시도
  screen = 'D. 실패와 다시 시도';
  await setMode('fail');
  await input.fill('LLM이 실패하는 질문입니다');
  await input.press('Enter');
  const failed = await waitFor(async () => (await page.getByText('지금은 답변을 가져오지 못했어요').count()) === 1, 15000);
  check('정직한 실패 문구 + 다시 시도 버튼', failed && (await page.getByRole('button', { name: '다시 시도' }).isVisible()));
  check('실패한 질문은 카운터에서 빠짐(3/5 유지)', await dock.getByText('3/5', { exact: true }).isVisible());
  check('가짜 페르소나 답변 없음', (await answers()) === 3);
  const errorDoc = docs(await db(), 'conversations').find((c) => c.question === 'LLM이 실패하는 질문입니다');
  check('DB에 실패 기록(error=llm_unavailable, 빈 답변)', errorDoc && errorDoc.error === 'llm_unavailable' && errorDoc.answer === '', JSON.stringify(errorDoc || {}));
  await page.screenshot({ path: path.join(SHOTS, 'D-failed.png') });
  await setMode('normal');
  await page.getByRole('button', { name: '다시 시도' }).click();
  await waitFor(async () => (await completed()) >= 4, 15000);
  check('다시 시도하면 같은 자리에 답변', (await answers()) === 4 && (await page.getByText('LLM이 실패하는 질문입니다').count()) === 1 && (await page.getByText('지금은 답변을 가져오지 못했어요').count()) === 0);
  check('재시도 성공 후 4/5', await dock.getByText('4/5', { exact: true }).isVisible());
  check('answer_retried 이벤트', docs(await db(), 'funnel_events').some((e) => e.event === 'answer_retried'));

  // ---------------------------------------------------------------- E. 느린 응답
  screen = 'E. 느린 응답';
  await setMode('slow', 2.5);
  await input.fill('느리게 오는 답변 질문입니다');
  await input.press('Enter');
  await page.waitForTimeout(800);
  check('첫 토큰 전 로딩 표시', await page.getByText('답변을 정리하고 있어요').isVisible());
  check('로딩 중 전송 버튼 비활성', await dock.getByRole('button', { name: '전송' }).isDisabled());
  await waitFor(async () => (await completed()) >= 5, 15000);
  check('느린 답변 도착 후 로딩 사라짐', (await answers()) === 5 && (await page.getByText('답변을 정리하고 있어요').count()) === 0);
  await setMode('normal');

  // ---------------------------------------------------------------- F. 한도
  screen = 'F. 질문 한도';
  await page.getByText('5개 질문 완료').waitFor({ timeout: 5000 }).catch(() => undefined);
  check('5번째 답변 뒤 완료 모달', await page.getByText('5개 질문 완료').isVisible());
  check('한도 도달 후 후속 질문 칩 숨김', (await page.getByRole('button', { name: '하나 합에서 맡은 역할은?' }).count()) === 0);
  check('five_questions_reached 1회', docs(await db(), 'funnel_events').filter((e) => e.event === 'five_questions_reached').length === 1);
  check('입력창 비활성', await input.isDisabled());
  await page.screenshot({ path: path.join(SHOTS, 'F-limit.png') });

  // ---------------------------------------------------------------- G. 구버전 백엔드 폴백
  screen = 'G. 스트리밍 없는 백엔드';
  const page2 = await context.newPage();
  const posts2 = [];
  page2.on('request', (r) => { if (r.url().startsWith(API) && r.method() === 'POST') posts2.push(r.url().slice(API.length)); });
  await page2.route('**/api/chat/stream', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Not Found"}' }));
  await page2.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
  const dock2 = page2.locator('div.fixed.inset-x-0.bottom-0');
  await dock2.locator('input').fill('스트리밍 없는 백엔드 질문입니다');
  await dock2.locator('input').press('Enter');
  await waitFor(async () => (await page2.getByText(FAKE_START).count()) >= 1, 15000);
  check('/api/chat/stream 404 → /api/chat로 답변', posts2.includes('/api/chat/stream') && posts2.includes('/api/chat') && (await page2.getByText(FAKE_START).count()) === 1, posts2.join(', '));
  await dock2.locator('input').fill('두 번째 질문은 바로 JSON으로');
  await dock2.locator('input').press('Enter');
  await waitFor(async () => (await page2.getByText(FAKE_START).count()) >= 2, 15000);
  check('한 번 실패하면 스트리밍 재시도 안 함', posts2.filter((p) => p === '/api/chat/stream').length === 1, posts2.join(', '));
  await page2.close();

  // ---------------------------------------------------------------- H. 개인정보 안내
  screen = 'H. 개인정보 안내';
  const page3 = await context.newPage();
  await page3.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
  await page3.getByRole('button', { name: '개인정보 안내' }).click();
  const notice = page3.getByRole('dialog', { name: '개인정보 안내' });
  check('안내 열림 + 저장 항목·삭제 요청 문구', (await notice.getByText('저장하는 정보').isVisible()) && (await notice.getByText(/hello@309designlab.com/).isVisible()));
  check('확인되지 않은 "EU 리전" 문구 없음', (await page3.getByText('EU 리전').count()) === 0);
  await page3.keyboard.press('Escape');
  check('ESC로 닫힘', (await page3.getByRole('dialog').count()) === 0);
  await page3.getByRole('button', { name: '개인정보 안내' }).click();
  await page3.mouse.click(10, 10);
  check('바깥 클릭으로 닫힘', (await page3.getByRole('dialog').count()) === 0);
  await page3.close();

  screen = '콘솔 오류';
  // net::ERR_* is the analytics script, which this sandbox can't reach.
  const unexpected = consoleErrors.filter((e) => !e.includes('status of 404') && !e.includes('net::ERR'));
  check('예상 밖 콘솔 오류 없음', unexpected.length === 0, unexpected.join(' | '));

  await browser.close();
  const failedChecks = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failedChecks.length}/${results.length} passed`);
  fs.mkdirSync(path.join(__dirname, '.logs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '.logs', 'results_stream.json'), JSON.stringify(results, null, 2));
  process.exit(failedChecks.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(2); });
