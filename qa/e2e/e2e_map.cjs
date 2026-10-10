// Knowledge map and motion QA (ANSWER_PIPELINE=direct, QA_NOTES=1): the map on the landing,
// related records while thinking, streamed ink, cited records, asking from the map, fallbacks.
const { chromium } = require('playwright') // resolved via NODE_PATH, see README.md;
const fs = require('fs');
const path = require('path');

const WEB = 'http://127.0.0.1:4173';
const API = 'http://127.0.0.1:8000';
const LLM = 'http://127.0.0.1:11500';
const SHOTS = path.join(__dirname, 'shots', 'map');
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
const FAKE_END = '수렴했어요.';
// Something other than the background was drawn on the canvas.
const canvasInk = (locator) =>
  locator.evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 16) if (data[i] > 0) painted += 1;
    return painted;
  });

(async () => {
  await setMode({ mode: 'normal', chunk_delay: 0.01, meta_delay: 0 });
  const graph = await getJson(`${API}/api/knowledge/graph`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const graphRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('request', (r) => { if (r.url().endsWith('/api/knowledge/graph')) graphRequests.push(r.url()); });
  const dock = page.locator('div.fixed.inset-x-0.bottom-0');
  const input = dock.locator('input');
  const hero = page.getByRole('region', { name: '309의 기록 지도' });

  // ---------------------------------------------------------------- I. 첫 화면 지도
  screen = 'I. 첫 화면 지도';
  check('그래프 API: 노트가 노드로 들어오고 본문은 없음', graph.nodes.some((n) => n.id === 'N:리뷰-루프' && n.kind === 'note') && !JSON.stringify(graph).includes('매주 같은 화면'));
  check('그래프 API: 템플릿·주석은 빠짐', !graph.nodes.some((n) => n.label.includes('템플릿')) && !JSON.stringify(graph).includes('주석'));
  await page.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
  await hero.waitFor();
  const heroCanvas = hero.locator('canvas');
  await heroCanvas.waitFor({ timeout: 5000 });
  await page.waitForTimeout(1800);
  check('그래프를 한 번만 받음', graphRequests.length === 1, graphRequests.join(', '));
  check('지도 요약: 프로젝트 5 · 주제 · 노트 2', await hero.getByText(/프로젝트 5 · 주제 \d+ · 노트 2/).isVisible());
  check('캔버스에 지도가 그려짐', (await canvasInk(heroCanvas)) > 500);
  check('추천 질문은 인사말 아래(입력창 밖)', (await page.locator('main').getByRole('button', { name: /최근 2년 안에/ }).count()) === 1 && (await dock.getByRole('button', { name: /최근 2년 안에/ }).count()) === 0);
  check('입력창에 기록 지도 버튼', await dock.getByRole('button', { name: '309의 기록 지도 열기' }).isVisible());
  await page.screenshot({ path: path.join(SHOTS, 'I-landing.png') });

  // ---------------------------------------------------------------- J. 답변 중 모션
  screen = 'J. 답변 중 모션';
  await setMode({ mode: 'slow', delay: 2.5, chunk_delay: 0.06 });
  await input.fill('디자인 시스템 구축 경험 알려줘');
  await input.press('Enter');
  const related = page.getByText('기록을 살펴보는 중');
  await related.waitFor({ timeout: 3000 }).catch(() => undefined);
  const relatedText = (await related.count()) ? await related.innerText() : '';
  check('생각 중: 질문과 관련된 기록 이름', relatedText.includes('디자인 시스템 · 페이히어 디자인 시스템'), relatedText);
  check('생각 중: 아바타 링', (await page.locator('[data-presence="thinking"]').count()) === 1);
  check('생각 중: 입력창 빛 테두리', (await dock.locator('.ai-glow[data-busy]').count()) === 1);
  check('생각 중: 지도 버튼 활성', (await dock.locator('.map-icon.is-active').count()) === 1);
  check('추천 질문은 대화가 시작되면 사라짐', (await page.getByRole('button', { name: /최근 2년 안에/ }).count()) === 0);
  await page.screenshot({ path: path.join(SHOTS, 'J-thinking.png') });
  await page.locator('[data-streaming="true"]').waitFor({ timeout: 6000 }).catch(() => undefined);
  const streaming = page.locator('[data-streaming="true"]');
  check('쓰는 중: 새 글자 잉크 효과·커서', (await streaming.locator('.ink-in').count()) > 0 && (await streaming.locator('.stream-caret').count()) === 1);
  check('쓰는 중: 아바타 말하기 링', (await page.locator('[data-presence="speaking"]').count()) === 1);
  await page.screenshot({ path: path.join(SHOTS, 'J-streaming.png') });
  await waitFor(async () => (await page.getByText(FAKE_END).count()) === 1, 20000);
  await page.getByText('근거', { exact: true }).first().waitFor({ timeout: 5000 });
  check('끝나면 잉크·커서·링이 사라짐', (await page.locator('[data-streaming]').count()) === 0 && (await page.locator('.stream-caret').count()) === 0 && (await page.locator('[data-presence="speaking"], [data-presence="thinking"]').count()) === 0);
  check('끝나면 입력창 빛 테두리 꺼짐', (await dock.locator('.ai-glow').count()) === 0);
  await setMode({ mode: 'normal', chunk_delay: 0.01 });

  // ---------------------------------------------------------------- K. 지도 크게 보기
  screen = 'K. 지도 크게 보기';
  await dock.getByRole('button', { name: '309의 기록 지도 열기' }).click();
  const dialog = page.getByRole('dialog', { name: '309의 기록 지도' });
  await dialog.waitFor();
  await page.waitForTimeout(1200);
  const list = dialog.getByRole('navigation', { name: '기록 목록' });
  const cited = await list.locator('[data-state="cited"]').allInnerTexts();
  check('방금 답변의 근거가 표시됨', JSON.stringify(cited.sort()) === JSON.stringify(["'하나 합' 금융 UX", '이력서', '페이히어 디자인 시스템'].sort()), JSON.stringify(cited));
  check('처음 선택은 첫 번째 근거', (await dialog.locator('[data-selected="P2"]').count()) === 1 && (await dialog.getByText('방금 답변의 근거').count()) === 1);
  check('큰 지도 캔버스', (await canvasInk(dialog.locator('canvas'))) > 500);
  await list.getByRole('button', { name: '리뷰 루프' }).click();
  check('노트 선택: 노트가 정한 질문', await dialog.getByText('“QA 노트의 리뷰 루프는 어떻게 운영했나요?”').isVisible());
  await list.getByRole('button', { name: 'AI 프로덕트' }).click();
  check('주제 선택: 기본 질문', await dialog.getByText('“AI 프로덕트 관련 경험을 알려줘”').isVisible());
  check('남은 질문 표시', await dialog.getByRole('button', { name: '이 질문으로 물어보기 · 남은 질문 4' }).isVisible());
  await page.screenshot({ path: path.join(SHOTS, 'K-overlay.png') });
  await page.keyboard.press('Escape');
  check('ESC로 닫힘', (await page.getByRole('dialog').count()) === 0);
  check('닫으면 지도 버튼으로 포커스 복귀', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === '309의 기록 지도 열기'));

  // ---------------------------------------------------------------- L. 지도에서 질문
  screen = 'L. 지도에서 질문';
  await page.locator('main').evaluate((el) => el.scrollTo(0, 0));
  await hero.getByRole('button', { name: '지도 크게 보기' }).click();
  await dialog.waitFor();
  await dialog.getByRole('navigation', { name: '기록 목록' }).getByRole('button', { name: 'AI 프로덕트' }).click();
  await dialog.getByRole('button', { name: /이 질문으로 물어보기/ }).click();
  check('물어보면 지도가 닫힘', (await page.getByRole('dialog').count()) === 0);
  await waitFor(async () => (await page.getByText(FAKE_END).count()) === 2, 15000);
  check('지도의 질문으로 답변', (await page.getByText('AI 프로덕트 관련 경험을 알려줘', { exact: true }).count()) === 1 && (await page.getByText(FAKE_END).count()) === 2);
  const funnel = docs(await db(), 'funnel_events');
  const opened = funnel.filter((e) => e.event === 'map_opened').map((e) => e.properties.from);
  check('map_opened 기록(dock, hero)', JSON.stringify(opened) === '["dock","hero"]', JSON.stringify(opened));
  check('map_question_asked 기록', funnel.some((e) => e.event === 'map_question_asked' && e.properties.node === 'T:AI 프로덕트' && e.properties.kind === 'topic'));
  check('question_submitted source=map', funnel.some((e) => e.event === 'question_submitted' && e.properties.source === 'map'));
  check('카운터 2/5', await dock.getByText('2/5', { exact: true }).isVisible());

  // ---------------------------------------------------------------- M. 움직임 줄이기
  screen = 'M. 움직임 줄이기';
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page2 = await reduced.newPage();
  await page2.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
  const hero2 = page2.getByRole('region', { name: '309의 기록 지도' });
  await hero2.locator('canvas').waitFor({ timeout: 5000 });
  await page2.waitForTimeout(600);
  check('정지 화면으로 지도가 그려짐', (await canvasInk(hero2.locator('canvas'))) > 300);
  const animation = await page2.locator('h1, p.animate-rise').first().evaluate((el) => getComputedStyle(el).animationName);
  check('등장 애니메이션 꺼짐', animation === 'none', animation);
  await page2.screenshot({ path: path.join(SHOTS, 'M-reduced-mobile.png') });
  await reduced.close();

  // ---------------------------------------------------------------- N. 구버전 백엔드
  screen = 'N. 지도 없는 백엔드';
  const page3 = await context.newPage();
  await page3.route('**/api/knowledge/graph', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Not Found"}' }));
  await page3.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
  await page3.waitForTimeout(500);
  check('지도 영역과 버튼이 사라짐', (await page3.getByRole('region', { name: '309의 기록 지도' }).count()) === 0 && (await page3.getByRole('button', { name: '309의 기록 지도 열기' }).count()) === 0);
  const dock3 = page3.locator('div.fixed.inset-x-0.bottom-0');
  await dock3.locator('input').fill('지도 없는 백엔드 질문입니다');
  await dock3.locator('input').press('Enter');
  check('대화는 그대로 됨', await waitFor(async () => (await page3.getByText(FAKE_END).count()) === 1, 15000));
  await page3.close();

  screen = '콘솔 오류';
  const unexpected = consoleErrors.filter((e) => !e.includes('status of 404') && !e.includes('net::ERR'));
  check('예상 밖 콘솔 오류 없음', unexpected.length === 0, unexpected.join(' | '));

  await browser.close();
  const failedChecks = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failedChecks.length}/${results.length} passed`);
  fs.mkdirSync(path.join(__dirname, '.logs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '.logs', 'results_map.json'), JSON.stringify(results, null, 2));
  process.exit(failedChecks.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(2); });
