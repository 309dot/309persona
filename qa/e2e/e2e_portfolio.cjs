// Portfolio viewer, visitor purpose and conversation summary QA (ANSWER_PIPELINE=direct, QA_NOTES=1):
// purpose chips → session and prompt, project cards and source chips → in-app viewer, summary and its print view.
const { chromium } = require('playwright') // resolved via NODE_PATH, see README.md;
const fs = require('fs');
const path = require('path');

const WEB = 'http://127.0.0.1:4173';
const API = 'http://127.0.0.1:8000';
const LLM = 'http://127.0.0.1:11500';
const SHOTS = path.join(__dirname, 'shots', 'portfolio');
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
const setMode = (body) =>
  fetch(`${LLM}/__mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const docs = (dump, col) => Object.entries(dump[col] || {}).map(([id, d]) => ({ id, ...d }));
const funnel = async (event) => docs(await db(), 'funnel_events').filter((e) => e.event === event);
const waitFor = async (fn, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const FAKE_END = '수렴했어요.';
const PORTFOLIO_PDF =
  'https://raw.githubusercontent.com/309dot/309persona/main/knowledge_base/309files/pdf/%ED%8F%AC%ED%8A%B8%ED%8F%B4%EB%A6%AC%EC%98%A4_%EC%84%B1%EB%B0%B1%EA%B3%A4.pdf';
const PM_QUESTION = 'PM으로서 기획부터 출시까지 이끈 프로젝트를 알려줘';
const P2_CHIP = '페이히어 디자인 시스템 (2022–2023)';
const P2_CARD = '페이히어 디자인 시스템 · 포트폴리오 7~11쪽 보기';
const focusedLabel = (page) =>
  page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim());

(async () => {
  await setMode({ mode: 'normal', chunk_delay: 0.01, meta_delay: 0, sources: null });
  const graph = await getJson(`${API}/api/knowledge/graph`);
  const noteId = graph.nodes.find((n) => n.kind === 'note' && n.label === 'QA 프로젝트 회고')?.id;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const apiCalls = [];
  const scripts = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith(API)) apiCalls.push({ method: r.method(), path: url.slice(API.length), body: r.postData() });
    if (url.endsWith('.js')) scripts.push(url.split('/').pop());
  });
  const posts = (p) => apiCalls.filter((c) => c.method === 'POST' && c.path === p);
  const dock = page.locator('div.fixed.inset-x-0.bottom-0');
  const input = dock.locator('input');
  const completed = () => page.getByText(FAKE_END).count();

  // ---------------------------------------------------------------- O. 방문 목적
  screen = 'O. 방문 목적';
  await page.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
  const purposes = page.getByRole('group', { name: '어떤 일로 오셨어요?' });
  const pressed = () => purposes.locator('[aria-pressed="true"]').allInnerTexts();
  const suggestions = page.getByLabel('추천 질문').getByRole('button');
  check('목적 4개, 처음엔 고른 것 없음', (await purposes.getByRole('button').count()) === 4 && (await pressed()).length === 0);
  check('기본 추천 질문 5개(PM 질문 포함)', (await suggestions.count()) === 5 && (await suggestions.allInnerTexts()).includes(PM_QUESTION));
  check('뷰어·요약 코드는 첫 화면에서 안 받음', !scripts.some((s) => /^(PortfolioViewer|ChatSummary)-/.test(s)), scripts.join(', '));
  await purposes.getByRole('button', { name: '채용 검토 중' }).click();
  check('채용 검토 중 선택 → 채용 질문', JSON.stringify(await pressed()) === '["채용 검토 중"]' && (await suggestions.count()) === 4 && (await suggestions.allInnerTexts()).includes('어떤 회사에서 어떤 역할을 맡아 왔나요?'));
  await purposes.getByRole('button', { name: '함께 일할 동료' }).click();
  check('다른 목적을 누르면 하나만 선택', JSON.stringify(await pressed()) === '["함께 일할 동료"]' && (await suggestions.allInnerTexts()).includes('PRD와 로드맵은 어떻게 쓰고 관리하나요?'));
  await purposes.getByRole('button', { name: '함께 일할 동료' }).click();
  check('같은 목적을 다시 누르면 해제 → 기본 질문', (await pressed()).length === 0 && (await suggestions.count()) === 5);
  await purposes.getByRole('button', { name: '채용 검토 중' }).click();
  check('질문 전에는 세션을 만들지 않음', posts('/api/visitors').length === 0);
  await waitFor(async () => (await funnel('purpose_selected')).length === 3, 5000);
  const picked = (await funnel('purpose_selected')).map((e) => e.properties.purpose);
  check('purpose_selected 기록(해제는 안 셈)', JSON.stringify(picked) === '["hiring","colleague","hiring"]', JSON.stringify(picked));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'O-purpose.png') });
  await suggestions.filter({ hasText: PM_QUESTION }).click();
  await waitFor(async () => (await completed()) === 1, 15000);
  await page.getByText('근거', { exact: true }).first().waitFor({ timeout: 5000 });
  const visitorBody = JSON.parse(posts('/api/visitors')[0]?.body || '{}');
  check('세션 생성 요청에 visitor_purpose=hiring', visitorBody.visitor_purpose === 'hiring', JSON.stringify(visitorBody));
  const visitors = docs(await db(), 'visitors');
  check('DB visitors에 목적 저장', visitors.length === 1 && visitors[0].visitor_purpose === 'hiring', JSON.stringify(visitors.map((v) => v.visitor_purpose)));
  const calls = await llm();
  check('LLM 질문에 방문 목적이 붙음', calls.last_user.includes('목적: 채용 검토') && calls.last_user.endsWith(PM_QUESTION), calls.last_user);
  check('대화가 시작되면 목적 선택은 사라짐', (await purposes.count()) === 0);

  // ---------------------------------------------------------------- P. 근거 칩과 프로젝트 카드
  screen = 'P. 근거 칩과 프로젝트 카드';
  check('쪽이 있는 근거(P2)는 뷰어를 여는 버튼', await page.getByRole('button', { name: P2_CHIP, exact: true }).isVisible());
  const hana = "'하나 합' 금융 UX (2021–2022)";
  check('쪽이 없는 근거(P3)는 링크 없이 표시', (await page.getByText(hana, { exact: true }).count()) === 1 && (await page.getByRole('link', { name: hana }).count()) === 0 && (await page.getByRole('button', { name: hana }).count()) === 0);
  const resumeHref = await page.locator('main').getByRole('link', { name: '이력서', exact: true }).getAttribute('href');
  check('이력서 근거는 이력서 PDF', (resumeHref || '').endsWith('Product-resume.pdf'), resumeHref);
  const cards = page.getByLabel('답변에 나온 프로젝트').getByRole('button');
  check('프로젝트 카드 1장(쪽이 있는 P2만)', (await cards.count()) === 1);
  const card = page.getByRole('button', { name: P2_CARD });
  const cardText = await card.innerText();
  check('카드 내용은 지식팩(제목·기간·요약)', cardText.includes('페이히어 디자인 시스템') && cardText.includes('2022–2023') && cardText.includes('컴포넌트/토큰 재정의'), cardText.replace(/\n/g, ' / '));
  const cardImage = card.locator('img');
  await waitFor(async () => (await cardImage.evaluate((img) => img.complete && img.naturalWidth)) > 0, 5000);
  const thumb = await cardImage.evaluate((img) => ({ src: img.getAttribute('src'), width: img.naturalWidth }));
  check('카드 이미지: 7쪽(800px)', thumb.src === '/portfolio/m07.webp' && thumb.width === 800, JSON.stringify(thumb));
  await card.screenshot({ path: path.join(SHOTS, 'P-card.png') });

  // ---------------------------------------------------------------- Q. 포트폴리오 뷰어
  screen = 'Q. 포트폴리오 뷰어';
  await card.click();
  const viewer = page.getByRole('dialog', { name: '포트폴리오 보기' });
  await viewer.waitFor();
  const shown = viewer.locator('img[data-page]');
  const pageNow = async () => Number(await shown.getAttribute('data-page'));
  const counter = viewer.getByText(/^\d+ \/ 27$/);
  const strip = viewer.getByLabel('쪽 목록').getByRole('button');
  const ranged = () => strip.evaluateAll((buttons) => buttons.filter((b) => b.className.includes('ring-accent/60')).map((b) => b.dataset.page));
  check('카드의 첫 쪽(7)에서 열림', (await pageNow()) === 7 && (await counter.innerText()) === '7 / 27');
  check('제목·쪽 범위·장 표시', (await viewer.getByText('페이히어 디자인 시스템 · 7~11쪽').isVisible()) && (await viewer.getByText('포트폴리오 · 디자인 시스템 · 페이히어').isVisible()));
  await waitFor(async () => (await shown.evaluate((img) => img.complete && img.naturalWidth)) > 0, 5000);
  check('쪽 이미지 2000px 로드', (await shown.getAttribute('src')) === '/portfolio/p07.webp' && (await shown.evaluate((img) => img.naturalWidth)) === 2000);
  check('열면 닫기 버튼에 포커스', (await focusedLabel(page)) === '닫기');
  check('쪽 목록 27개 + 현재 쪽 표시', (await strip.count()) === 27 && (await viewer.getByRole('button', { name: '7쪽', exact: true }).getAttribute('aria-current')) === 'page');
  check('답변이 가리킨 범위(8~11쪽) 강조', JSON.stringify(await ranged()) === '["8","9","10","11"]', JSON.stringify(await ranged()));
  await page.keyboard.press('ArrowRight');
  check('→ 키: 다음 쪽 + 넘김 효과', (await pageNow()) === 8 && (await counter.innerText()) === '8 / 27' && (await shown.getAttribute('class')).includes('page-in-next'));
  await page.keyboard.press('ArrowLeft');
  check('← 키: 이전 쪽 + 반대 방향 효과', (await pageNow()) === 7 && (await shown.getAttribute('class')).includes('page-in-prev'));
  const chapters = viewer.getByRole('navigation', { name: '장 목록' });
  // Page 23 arrives slowly, as on a phone network.
  await page.route('**/portfolio/p23.webp', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await chapters.getByRole('button', { name: 'AI 오디오북 · 신시아' }).click();
  check('장 이동: AI 오디오북 → 23쪽', (await pageNow()) === 23 && (await chapters.getByRole('button', { name: 'AI 오디오북 · 신시아' }).getAttribute('aria-current')) === 'true');
  const heading = viewer.locator('header');
  const headingText = async () => (await heading.innerText()).replace(/\s+/g, ' ');
  check('답변의 쪽을 벗어나면 제목은 지금 장', (await headingText()).startsWith('포트폴리오 AI 오디오북 · 신시아'), await headingText());
  const loadingWidth = await shown.evaluate((img) => img.naturalWidth);
  const reserved = await shown.boundingBox();
  check('불러오는 동안에도 쪽 자리를 잡아 둠(16:9)', loadingWidth === 0 && reserved.width > 1000 && Math.abs(reserved.width / reserved.height - 16 / 9) < 0.02, JSON.stringify({ loadingWidth, ...reserved }));
  await waitFor(async () => (await shown.evaluate((img) => img.complete && img.naturalWidth)) > 0, 5000);
  const box = await shown.boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  check('왼쪽으로 끌면 다음 쪽(24)', (await pageNow()) === 24);
  await viewer.getByRole('button', { name: '27쪽', exact: true }).click();
  check('마지막 쪽: 다음 버튼 비활성, 장 = 마무리', (await pageNow()) === 27 && (await viewer.getByRole('button', { name: '다음 쪽' }).isDisabled()) && (await headingText()).startsWith('포트폴리오 마무리'));
  await viewer.getByRole('button', { name: '이전 쪽' }).click();
  check('이전 쪽 버튼', (await pageNow()) === 26);
  await viewer.getByRole('button', { name: '9쪽', exact: true }).click();
  check('답변의 쪽으로 돌아오면 다시 답변 제목', (await headingText()).includes('페이히어 디자인 시스템 · 7~11쪽'));
  await viewer.getByRole('button', { name: '26쪽', exact: true }).click();
  const pdf = viewer.getByRole('link', { name: 'PDF 받기' });
  check('PDF 받기 = 포트폴리오 PDF 다운로드', (await pdf.getAttribute('href')) === PORTFOLIO_PDF && (await pdf.getAttribute('download')) !== null);
  await waitFor(async () => (await shown.evaluate((img) => img.complete && img.naturalWidth)) > 0, 5000);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'Q-viewer.png') });
  await page.keyboard.press('Escape');
  check('ESC로 닫힘', (await page.getByRole('dialog').count()) === 0);
  check('닫으면 카드로 포커스 복귀', (await focusedLabel(page)) === P2_CARD, await focusedLabel(page));
  await waitFor(async () => (await funnel('portfolio_closed')).length === 1, 5000);
  const seen = (await funnel('portfolio_closed'))[0]?.properties;
  check('portfolio_closed: 본 쪽 7개(7·8·23·24·27·26·9)', seen?.pages_seen === 7, JSON.stringify(seen));

  await page.getByRole('button', { name: P2_CHIP, exact: true }).click();
  await viewer.waitFor();
  check('근거 칩 → 그 쪽에서 열림', (await pageNow()) === 7 && (await viewer.getByText(`${P2_CHIP} · 7~11쪽`).isVisible()));
  await viewer.getByRole('button', { name: '닫기' }).click();
  check('닫기 버튼 → 칩으로 포커스 복귀', (await focusedLabel(page)) === P2_CHIP, await focusedLabel(page));

  await dock.getByRole('button', { name: '포트폴리오' }).click();
  await viewer.waitFor();
  check('입력창 위 포트폴리오 → 1쪽(제목 = 장), 범위 강조 없음', (await pageNow()) === 1 && (await headingText()).startsWith('포트폴리오 소개') && (await viewer.getByRole('button', { name: '이전 쪽' }).isDisabled()) && (await ranged()).length === 0);
  await page.keyboard.press('Escape');

  await dock.getByRole('button', { name: '309의 기록 지도 열기' }).click();
  const map = page.getByRole('dialog', { name: '309의 기록 지도' });
  await map.waitFor();
  const list = map.getByRole('navigation', { name: '기록 목록' });
  check('지도: 선택된 근거(P2)에 포트폴리오 버튼', (await map.locator('[data-selected="P2"]').count()) === 1 && (await map.getByRole('button', { name: '포트폴리오 7~11쪽 보기' }).isVisible()));
  await list.getByRole('button', { name: 'AI 프로덕트' }).click();
  check('지도: 쪽이 없는 주제는 버튼 없음', (await map.getByRole('button', { name: /^포트폴리오 .*보기$/ }).count()) === 0);
  await list.getByRole('button', { name: 'QA 프로젝트 회고' }).click();
  check('지도: 노트에 적힌 쪽(6~11)', await map.getByRole('button', { name: '포트폴리오 6~11쪽 보기' }).isVisible());
  await map.getByRole('button', { name: '포트폴리오 6~11쪽 보기' }).click();
  check('지도 → 뷰어(지도는 닫힘)', (await map.count()) === 0 && (await viewer.isVisible()) && (await pageNow()) === 6 && (await viewer.getByText('QA 프로젝트 회고 · 6~11쪽').isVisible()));
  await page.keyboard.press('Escape');
  check('뷰어를 닫으면 지도 버튼으로 포커스 복귀', (await focusedLabel(page)) === '309의 기록 지도 열기', await focusedLabel(page));
  await waitFor(async () => (await funnel('portfolio_opened')).length === 4, 5000);
  const opened = (await funnel('portfolio_opened')).map((e) => `${e.properties.from}:${e.properties.page}`);
  check('portfolio_opened 기록(카드·칩·입력창·지도)', JSON.stringify(opened) === '["project_card:7","source_chip:7","dock:1","map:6"]', JSON.stringify(opened));
  check('뷰어 코드는 처음 열 때 받음', scripts.some((s) => s.startsWith('PortfolioViewer-')));

  // ---------------------------------------------------------------- R. 대화 요약
  screen = 'R. 대화 요약';
  await setMode({ sources: [noteId, 'P4', 'P5', 'RESUME'] });
  await page.getByRole('button', { name: '하나 합에서 맡은 역할은?' }).click();
  await waitFor(async () => (await completed()) === 2, 15000);
  await waitFor(async () => (await page.getByLabel('답변에 나온 프로젝트').count()) === 2, 5000);
  const secondCards = await page.getByLabel('답변에 나온 프로젝트').last().getByRole('button').evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')));
  check('카드는 최대 2장, 쪽이 있는 노트도 카드', JSON.stringify(secondCards) === JSON.stringify(['QA 프로젝트 회고 · 포트폴리오 6~11쪽 보기', 'AI 오디오북 제작 솔루션 · 포트폴리오 24~26쪽 보기']), JSON.stringify(secondCards));
  await setMode({ sources: null });
  await dock.getByRole('button', { name: '대화 요약' }).click();
  const sheet = page.getByRole('dialog', { name: '오늘 나눈 이야기' });
  await sheet.waitFor();
  check('열면 닫기에 포커스', (await focusedLabel(page)) === '닫기');
  check('방문자 줄 = 고른 목적(입력한 이름 없음)', await sheet.getByText('채용 검토 중', { exact: true }).isVisible());
  const items = await sheet.locator('ol > li').allInnerTexts();
  check('질문 2개와 답변 그대로', items.length === 2 && items[0].startsWith(`Q1. ${PM_QUESTION}`) && items[1].startsWith('Q2. 하나 합에서 맡은 역할은?') && items.every((t) => t.includes(FAKE_END)), JSON.stringify(items.map((t) => t.slice(0, 30))));
  check('근거에 포트폴리오 쪽', items[0].includes(`근거: ${P2_CHIP} (포트폴리오 7~11쪽) · ${hana} · 이력서`), items[0]?.split('\n').at(-1));
  check('노트·프로젝트 근거 모두 쪽 표시', items[1].includes('근거: QA 프로젝트 회고 (포트폴리오 6~11쪽) · AI 오디오북 제작 솔루션 (2024) (포트폴리오 24~26쪽) · POS/재고관리 대시보드 (2022–2023) (포트폴리오 13~19쪽) · 이력서'), items[1]?.split('\n').at(-1));
  check('연락처와 AI 작성 안내', (await sheet.getByText('hello@309designlab.com · www.309designlab.com/persona').isVisible()) && (await sheet.getByText(/AI가 작성했어요/).isVisible()));
  check('요약 코드는 처음 열 때 받음', scripts.some((s) => s.startsWith('ChatSummary-')));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'R-summary.png') });

  await page.emulateMedia({ media: 'print' });
  const printView = {
    sheet: await sheet.locator('article').isVisible(),
    buttons: await sheet.getByRole('button', { name: 'PDF로 저장 · 인쇄' }).isVisible(),
    main: await page.locator('main').isVisible(),
    dock: await dock.isVisible(),
  };
  check('인쇄 화면엔 요약만(버튼·대화·입력창 숨김)', printView.sheet && !printView.buttons && !printView.main && !printView.dock, JSON.stringify(printView));
  await page.pdf({ path: path.join(SHOTS, 'R-summary.pdf') });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
  await sheet.getByRole('button', { name: 'PDF로 저장 · 인쇄' }).click();
  check('PDF로 저장 → 브라우저 인쇄 호출', (await page.evaluate(() => window.__printed)) === 1);
  await page.keyboard.press('Escape');
  check('ESC로 닫힘 + 요약 버튼으로 포커스 복귀', (await page.getByRole('dialog').count()) === 0 && (await focusedLabel(page)) === '대화 요약', await focusedLabel(page));
  await waitFor(async () => (await funnel('summary_printed')).length === 1, 5000);
  check('summary_opened(dock)·summary_printed 기록', JSON.stringify((await funnel('summary_opened')).map((e) => e.properties.from)) === '["dock"]' && (await funnel('summary_printed')).length === 1);

  // ---------------------------------------------------------------- R2. 새로고침 뒤
  screen = 'R2. 새로고침 뒤';
  await page.reload({ waitUntil: 'networkidle' });
  await dock.getByRole('button', { name: '대화 요약' }).click();
  await sheet.waitFor();
  check('목적과 대화가 유지된 요약', (await sheet.getByText('채용 검토 중', { exact: true }).isVisible()) && (await sheet.locator('ol > li').count()) === 2);
  await sheet.getByRole('button', { name: '닫기' }).click();
  check('카드와 칩도 복원', (await page.getByLabel('답변에 나온 프로젝트').count()) === 2 && (await page.getByRole('button', { name: P2_CHIP, exact: true }).count()) === 1);

  // ---------------------------------------------------------------- R3. 마지막 질문 뒤
  screen = 'R3. 마지막 질문 뒤 요약';
  for (const q of ['세 번째 질문입니다', '네 번째 질문입니다', '다섯 번째 질문입니다']) {
    const before = await completed();
    await input.fill(q);
    await input.press('Enter');
    await waitFor(async () => (await completed()) === before + 1, 15000);
  }
  await page.getByText('5개 질문 완료').waitFor({ timeout: 5000 }).catch(() => undefined);
  check('완료 모달에 요약 버튼', (await page.getByText('5개 질문 완료').isVisible()) && (await page.getByRole('button', { name: '대화 요약 저장' }).isVisible()));
  // Each question went out as soon as the previous answer's text ended, before its sources arrived.
  await page.waitForTimeout(500);
  const left = await page.getByText(/^남은 질문 \d\/5$/).allInnerTexts();
  check('겹쳐 보낸 질문도 남은 질문이 하나씩 줄어듦', JSON.stringify(left) === JSON.stringify(['남은 질문 4/5', '남은 질문 3/5', '남은 질문 2/5', '남은 질문 1/5', '남은 질문 0/5']), JSON.stringify(left));
  check('five_questions_reached 1회', (await funnel('five_questions_reached')).length === 1, String((await funnel('five_questions_reached')).length));
  await page.getByPlaceholder('이름 또는 이니셜').fill('김리크루터');
  await page.getByPlaceholder('회사 / 팀').fill('309 Lab');
  await page.getByRole('button', { name: '대화 요약 저장' }).click();
  await sheet.waitFor();
  check('모달에 쓴 이름·소속이 요약에 들어감', await sheet.getByText('김리크루터 · 309 Lab · 채용 검토 중', { exact: true }).isVisible());
  check('완료 모달은 닫히고 요약엔 5개', (await page.getByText('5개 질문 완료').count()) === 0 && (await sheet.locator('ol > li').count()) === 5);
  await waitFor(async () => docs(await db(), 'visitors')[0]?.visitor_name === '김리크루터', 5000);
  const visitor = docs(await db(), 'visitors')[0];
  check('그 프로필은 방문자 기록에도 저장(목적 유지)', visitor.visitor_name === '김리크루터' && visitor.visitor_affiliation === '309 Lab' && visitor.visitor_purpose === 'hiring', JSON.stringify({ n: visitor.visitor_name, a: visitor.visitor_affiliation, p: visitor.visitor_purpose }));
  check('summary_opened(completion) 기록', await waitFor(async () => (await funnel('summary_opened')).some((e) => e.properties.from === 'completion'), 5000));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, 'R3-summary-final.png') });
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- S. 지도 없는 백엔드
  screen = 'S. 지도 없는 백엔드';
  const page2 = await context.newPage();
  await page2.route('**/api/knowledge/graph', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Not Found"}' }));
  await page2.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
  const dock2 = page2.locator('div.fixed.inset-x-0.bottom-0');
  await dock2.locator('input').fill('지도 없는 백엔드 질문입니다');
  await dock2.locator('input').press('Enter');
  await waitFor(async () => (await page2.getByText(FAKE_END).count()) === 1, 15000);
  await page2.getByText('근거', { exact: true }).first().waitFor({ timeout: 5000 });
  check('프로젝트 근거는 포트폴리오 PDF 링크로', (await page2.getByRole('link', { name: P2_CHIP, exact: true }).getAttribute('href')) === PORTFOLIO_PDF);
  check('프로젝트 카드 없음', (await page2.getByLabel('답변에 나온 프로젝트').count()) === 0);
  await dock2.getByRole('button', { name: '포트폴리오' }).click();
  check('뷰어는 그대로 열림', await page2.getByRole('dialog', { name: '포트폴리오 보기' }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page2.close();

  // ---------------------------------------------------------------- T. 모바일
  screen = 'T. 모바일·움직임 줄이기';
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
  const page3 = await mobile.newPage();
  page3.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page3.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page3.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
  await page3.getByRole('group', { name: '어떤 일로 오셨어요?' }).getByRole('button', { name: '디자이너·후배' }).tap();
  await page3.getByLabel('추천 질문').getByRole('button', { name: '디자인 시스템 구축에서 실제로 성과를 낸 방식과 수치를 알려줘' }).tap();
  await waitFor(async () => (await page3.getByText(FAKE_END).count()) === 1, 15000);
  const card3 = page3.getByRole('button', { name: P2_CARD });
  await card3.waitFor({ timeout: 5000 });
  check('모바일: 카드 한 줄', (await card3.boundingBox()).width > 300);
  await card3.tap();
  const viewer3 = page3.getByRole('dialog', { name: '포트폴리오 보기' });
  await viewer3.waitFor();
  check('밀어서 넘기기 안내, 화살표 버튼 숨김', (await viewer3.getByText('좌우로 밀어서 넘기기').isVisible()) && !(await viewer3.getByRole('button', { name: '다음 쪽' }).isVisible()));
  // A real touch swipe: touch-action pan-y must leave horizontal moves to the page.
  const shown3 = viewer3.locator('img[data-page]');
  const box3 = await shown3.boundingBox();
  const cdp = await mobile.newCDPSession(page3);
  const y = Math.round(box3.y + box3.height / 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y }] });
  for (const x of [290, 250, 200, 150, 110]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitFor(async () => Number(await shown3.getAttribute('data-page')) === 8, 2000);
  check('손가락으로 밀면 다음 쪽', Number(await shown3.getAttribute('data-page')) === 8, await shown3.getAttribute('data-page'));
  const animation = await shown3.evaluate((img) => getComputedStyle(img).animationName);
  check('움직임 줄이기: 넘김 효과 꺼짐', animation === 'none', animation);
  await page3.screenshot({ path: path.join(SHOTS, 'T-mobile-viewer.png') });
  await mobile.close();

  screen = '콘솔 오류';
  const unexpected = consoleErrors.filter((e) => !e.includes('status of 404') && !e.includes('net::ERR'));
  check('예상 밖 콘솔 오류 없음', unexpected.length === 0, unexpected.join(' | '));

  await browser.close();
  const failedChecks = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failedChecks.length}/${results.length} passed`);
  fs.mkdirSync(path.join(__dirname, '.logs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '.logs', 'results_portfolio.json'), JSON.stringify(results, null, 2));
  process.exit(failedChecks.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(2); });
