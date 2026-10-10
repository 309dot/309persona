// Phase 1 browser QA for /persona and /admin against the local stack.
const { chromium } = require('playwright') // resolved via NODE_PATH, see README.md;
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const WEB = 'http://127.0.0.1:4173';
const API = 'http://127.0.0.1:8000';
const QA_DIR = __dirname;
const ROOT = path.resolve(QA_DIR, '..', '..');
const LOGS = path.join(QA_DIR, '.logs');
const SHOTS = path.join(QA_DIR, 'shots');
fs.mkdirSync(LOGS, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let screen = '';
const check = (name, ok, detail = '') => {
  results.push({ screen, name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${screen}] ${name}${detail ? ` — ${detail}` : ''}`);
};
const getJson = async (url) => (await fetch(url)).json();
const db = () => getJson(`${API}/__debug/db`);
const llm = () => getJson('http://127.0.0.1:11500/__calls');
const docs = (dump, col) => Object.entries(dump[col] || {}).map(([id, d]) => ({ id, ...d }));
const waitFor = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
};
const FAKE_ANSWER = '페이히어에서는 디자인 시스템이 없어';

async function restartBackend() {
  try { execSync('pkill -f run_backend.py'); } catch {}
  await waitFor(async () => { try { await fetch(`${API}/health`); return false; } catch { return true; } }, 5000);
  const out = fs.openSync(path.join(LOGS, 'backend.log'), 'a');
  spawn(path.join(ROOT, 'backend', '.venv', 'bin', 'python'), ['run_backend.py'], {
    cwd: QA_DIR, detached: true, stdio: ['ignore', out, out],
  }).unref();
  return waitFor(async () => { try { return (await fetch(`${API}/health`)).ok; } catch { return false; } }, 20000);
}

(async () => {
  if (!(await restartBackend())) throw new Error('backend did not start');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const apiCalls = [];
  const assets = [];
  const consoleErrors = [];
  const httpErrors = [];
  page.on('response', (r) => { if (r.status() >= 400) httpErrors.push({ screen, status: r.status(), method: r.request().method(), url: r.url() }); });
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith(API)) apiCalls.push({ method: r.method(), path: url.slice(API.length), body: r.postData() });
    if (url.includes('/assets/') && url.endsWith('.js')) assets.push(url.split('/assets/')[1]);
  });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const calls = (method, prefix) => apiCalls.filter((c) => c.method === method && c.path.startsWith(prefix));
  const funnel = (dump, event) => docs(dump, 'funnel_events').filter((d) => d.event === event);
  const dock = page.locator('div.fixed.inset-x-0.bottom-0');
  const input = dock.locator('input');
  const answers = () => page.getByText(FAKE_ANSWER).count();

  // ---------------------------------------------------------------- 1. 첫 진입
  screen = '1. 첫 진입';
  await page.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
  await waitFor(async () => calls('POST', '/api/events/funnel').length >= 2);
  const visitId = await page.evaluate(() => sessionStorage.getItem('persona-visit-id'));
  let dump = await db();
  check('페이지 로드만으로는 세션을 만들지 않음', calls('POST', '/api/visitors').length === 0 && docs(dump, 'visitors').length === 0);
  check('방문 ID가 탭에 저장됨', /^[0-9a-f-]{36}$/.test(visitId || ''), visitId);
  const landing = funnel(dump, 'landing_view');
  check('landing_view가 DB에 기록됨(세션 생성 전)', landing.length === 1 && landing[0].session_id === visitId, JSON.stringify(landing[0] || {}));
  check('variant가 최상위 필드로 저장됨', landing[0] && landing[0].variant === 'on');
  check('chat_view도 기록됨', funnel(dump, 'chat_view').length === 1);
  check('카운터 0/5 표시', await dock.getByText('0/5', { exact: true }).isVisible());
  check('관리자 화면 코드(DashboardPage)는 아직 내려받지 않음', !assets.some((a) => a.startsWith('DashboardPage')), assets.join(', '));

  // ---------------------------------------------------------------- 2. 첫 질문
  screen = '2. 첫 질문';
  const q1 = '디자인 시스템 구축 경험 알려줘';
  await input.click();
  await waitFor(async () => funnel(await db(), 'chat_input_started').length === 1);
  await input.fill(q1);
  await input.press('Enter');
  await waitFor(async () => (await answers()) >= 1, 15000);
  dump = await db();
  const visitorPosts = calls('POST', '/api/visitors');
  const chatPosts = calls('POST', '/api/chat');
  check('첫 질문 때 세션 생성 → 질문 전송 순서', visitorPosts.length === 1 && chatPosts.length === 1 && apiCalls.indexOf(visitorPosts[0]) < apiCalls.indexOf(chatPosts[0]));
  check('질문 원문 그대로 전송("(맥락: …)" 없음)', JSON.parse(chatPosts[0].body).question === q1, chatPosts[0].body);
  const visitors = docs(dump, 'visitors');
  check('DB visitors 1건, 기본 이름', visitors.length === 1 && visitors[0].visitor_name === '채용 담당자' && visitors[0].visit_ref === 'persona-v2', JSON.stringify(visitors[0] || {}));
  const convs = docs(dump, 'conversations');
  check('DB conversations에 질문 원문·답변 저장', convs.length === 1 && convs[0].question === q1 && convs[0].answer.startsWith(FAKE_ANSWER) && convs[0].is_blocked === false);
  check('답변 화면 표시', (await answers()) === 1);
  check('카운터 1/5, 남은 질문 4/5', (await dock.getByText('1/5', { exact: true }).isVisible()) && (await page.getByText('남은 질문 4/5').isVisible()));
  const sessionId = visitors[0] && visitors[0].session_id;
  const firstAnswer = funnel(dump, 'first_answer_rendered')[0];
  check('first_answer_rendered에 방문 ID + 채팅 세션 ID', firstAnswer && firstAnswer.session_id === visitId && firstAnswer.properties.chatSessionId === sessionId, JSON.stringify(firstAnswer || {}));
  check('퍼널 이벤트에 방문자 이름 없음', docs(dump, 'funnel_events').every((d) => !('visitorName' in (d.properties || {}))));
  check('LLM 프롬프트에 기본 방문자 정보', ((await llm()).last_user || '').includes('방문자 정보: 채용 담당자'));
  check('질문 문장이 이름으로 바뀌지 않음(기본 이름 유지)', await dock.getByText('채용 담당...님').isVisible());
  await page.screenshot({ path: path.join(SHOTS, '1-first-answer.png'), fullPage: false });

  // ---------------------------------------------------------------- 3. 프로필 입력(넛지)
  screen = '3. 프로필 입력';
  await page.getByText('혹시 실례가 안 된다면').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: '입력하기' }).click();
  await page.locator('#visitor-name').fill('김리크루터');
  await page.locator('#visitor-affiliation').fill('309 Lab');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await waitFor(async () => (docs(await db(), 'visitors')[0] || {}).visitor_name === '김리크루터');
  dump = await db();
  const patch = calls('PATCH', `/api/visitors/${sessionId}`);
  check('PATCH /api/visitors/{세션} 호출', patch.length === 1, patch[0] && patch[0].body);
  const v1 = docs(dump, 'visitors')[0];
  check('DB 방문자 이름·소속 갱신', v1.visitor_name === '김리크루터' && v1.visitor_affiliation === '309 Lab' && Boolean(v1.updated_at), JSON.stringify(v1));
  check('화면에 이름 반영', await dock.getByText('김리크루터님').isVisible());
  const profileEvt = funnel(dump, 'profile_submitted')[0];
  check('profile_submitted 기록(이름 값은 없음)', profileEvt && profileEvt.properties.has_name === true && !('visitorName' in profileEvt.properties));

  // ---------------------------------------------------------------- 4. 2~5번째 질문
  screen = '4. 질문 2~5';
  await page.getByRole('button', { name: /최근 2년 안에/ }).click(); // suggestions sit under the greeting
  await waitFor(async () => (await answers()) >= 2, 15000);
  check('빠른 질문으로 2번째 답변', (await answers()) === 2);
  check('2번째 답변 프롬프트에 수정된 프로필 반영', ((await llm()).last_user || '').includes('방문자 정보: 김리크루터, 309 Lab'));
  for (const [i, q] of ['협업 갈등 조율 사례 알려줘', '우선순위 정하는 기준은?', '하나은행 프로젝트에서 한 일은?'].entries()) {
    await input.fill(q);
    await input.press('Enter');
    await waitFor(async () => (await answers()) >= 3 + i, 15000);
  }
  dump = await db();
  check('이후 질문이 직접 입력한 이름을 덮어쓰지 않음', await dock.getByText('김리크루터님').isVisible());
  check('완료 모달 이름 칸 = 직접 입력한 이름', (await page.getByPlaceholder('이름 또는 이니셜').inputValue()) === '김리크루터');
  check('답변 5개 표시', (await answers()) === 5);
  check('DB conversations 5건 모두 정상 답변', docs(dump, 'conversations').length === 5 && docs(dump, 'conversations').every((c) => !c.is_blocked));
  check('완료 모달 표시(5개 질문 완료)', await page.getByText('5개 질문 완료').isVisible());
  check('five_questions_reached 1회', funnel(dump, 'five_questions_reached').length === 1);
  const lastChat = calls('POST', '/api/chat').at(-1);
  check('세션 ID 하나로 5번 질문', calls('POST', '/api/chat').every((c) => JSON.parse(c.body).session_id === sessionId) && calls('POST', '/api/visitors').length === 1);
  await page.screenshot({ path: path.join(SHOTS, '2-completion-modal.png'), fullPage: false });

  // ---------------------------------------------------------------- 5. 완료 모달에서 프로필 수정
  screen = '5. 프로필 수정';
  await page.getByPlaceholder('회사 / 팀').fill('309 Lab 디자인팀');
  await page.getByRole('button', { name: '저장하고 닫기' }).click();
  await waitFor(async () => (docs(await db(), 'visitors')[0] || {}).visitor_affiliation === '309 Lab 디자인팀');
  check('수정값이 DB에 반영(이름은 그대로)', docs(await db(), 'visitors')[0].visitor_affiliation === '309 Lab 디자인팀' && docs(await db(), 'visitors')[0].visitor_name === '김리크루터', JSON.stringify(docs(await db(), 'visitors')[0]));
  check('PATCH 2회째 호출', calls('PATCH', `/api/visitors/${sessionId}`).length === 2);

  // ---------------------------------------------------------------- 6. 한도 도달 후
  screen = '6. 한도 도달 후';
  check('카운터 5/5', await dock.getByText('5/5', { exact: true }).isVisible());
  check('입력창 비활성 + 완료 안내 placeholder', (await input.isDisabled()) && (await input.getAttribute('placeholder')) === '질문 5회가 완료되었습니다');
  const sixth = await (await fetch(`${API}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, question: 'API로 보낸 6번째 질문' }),
  })).json();
  check('API로 6번째 질문 → 차단, remaining 0', sixth.blocked === true && sixth.remaining === 0 && sixth.limit === 5, JSON.stringify(sixth));

  // ---------------------------------------------------------------- 7. 새로고침
  screen = '7. 새로고침';
  const visitorsBefore = docs(await db(), 'visitors').length;
  await page.reload({ waitUntil: 'networkidle' });
  const visitIdAfter = await page.evaluate(() => sessionStorage.getItem('persona-visit-id'));
  check('같은 탭이면 방문 ID 유지', visitIdAfter === visitId);
  check('새로고침만으로 세션 생성 안 함', docs(await db(), 'visitors').length === visitorsBefore);
  check('대화와 질문 수 복원(5개 답변, 5/5)', (await answers()) === 5 && (await dock.getByText('5/5', { exact: true }).isVisible()));
  check('한도 도달 상태 유지(입력창 비활성)', await input.isDisabled());
  check('복원된 프로필 이름 표시', await dock.getByText('김리크루터님').isVisible());
  // 새 대화로 이어서 테스트: 탭 저장소를 비우고 다시 연다.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  check('저장소를 비우면 새 대화(0/5)', await dock.getByText('0/5', { exact: true }).isVisible());

  // ---------------------------------------------------------------- 8. 백엔드 장애·재시작
  screen = '8. 백엔드 장애·재시작';
  await input.fill('장애 전에 보내는 질문');
  await input.press('Enter');
  await waitFor(async () => (await answers()) >= 1, 15000);
  const sessionBefore = JSON.parse(calls('POST', '/api/chat').at(-1).body).session_id;
  try { execSync('pkill -f run_backend.py'); } catch {}
  await waitFor(async () => { try { await fetch(`${API}/health`); return false; } catch { return true; } }, 5000);
  await input.fill('백엔드가 꺼진 동안 질문');
  await input.press('Enter');
  const friendly = await waitFor(async () => (await page.getByText('답변을 가져오지 못했어요').count()) >= 1, 15000);
  check('백엔드 다운 시 친절한 오류 문구(원시 에러 노출 없음)', friendly);
  check('재시작 성공', await restartBackend());
  const chatCountBefore = calls('POST', '/api/chat').length;
  await input.fill('재시작 후 질문');
  await input.press('Enter');
  await waitFor(async () => (await answers()) >= 2, 15000);
  const afterRestart = calls('POST', '/api/chat').slice(chatCountBefore);
  check('유실된 세션 404 → 새 세션으로 1회 재시도 → 답변', afterRestart.length === 2 && JSON.parse(afterRestart[1].body).session_id !== sessionBefore && (await answers()) === 2,
    afterRestart.map((c) => JSON.parse(c.body).session_id.slice(0, 8)).join(' → '));

  // ---------------------------------------------------------------- 9. 관리자 화면
  screen = '9. 관리자 화면';
  await page.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
  check('/admin 진입 시 DashboardPage 코드 지연 로딩', assets.some((a) => a.startsWith('DashboardPage')));
  check('Firebase 미설정 안내 표시', await page.getByText('Firebase 환경 변수').isVisible());
  await page.screenshot({ path: path.join(SHOTS, '3-admin.png'), fullPage: false });

  // ---------------------------------------------------------------- 10. 레거시 경로
  screen = '10. 레거시 경로';
  for (const legacy of ['/chat', '/entry']) {
    await page.goto(`${WEB}${legacy}`, { waitUntil: 'networkidle' });
    check(`${legacy} → /persona 이동`, new URL(page.url()).pathname === '/persona');
  }

  screen = '콘솔·HTTP 오류';
  console.log('HTTP errors seen:', JSON.stringify(httpErrors));
  const expectedHttp = (e) => e.screen === '8. 백엔드 장애·재시작' && e.status === 404 && e.method === 'POST' && e.url === `${API}/api/chat/stream`;
  check('4xx/5xx는 세션 유실 재현(8번)의 /api/chat 404 1건뿐', httpErrors.length === 1 && expectedHttp(httpErrors[0]), JSON.stringify(httpErrors));
  const unexpected = consoleErrors.filter((e) => !e.includes('[Persona] 답변 실패') && !e.includes('Failed to fetch') && !e.includes('net::ERR') && !e.includes('status of 404'));
  check('그 밖의 콘솔 오류 없음', unexpected.length === 0, unexpected.join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  fs.writeFileSync(path.join(LOGS, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(2); });
