// Deterministic screenshots for visual regression: node visual.cjs <out-dir>
const { chromium } = require('playwright') // resolved via NODE_PATH, see README.md;
const fs = require('fs');
const path = require('path');

const WEB = 'http://127.0.0.1:4173';
const OUT = path.resolve(process.argv[2] || 'shots/current');
fs.mkdirSync(OUT, { recursive: true });
const FIXED_TIME = new Date('2026-10-10T10:00:00+09:00');
const FAKE_ANSWER = '페이히어에서는 디자인 시스템이 없어';
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled', caret: 'hide' });
  console.log('saved', name);
}

(async () => {
  const browser = await chromium.launch();
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport, locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce', deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(FIXED_TIME);
    const dock = page.locator('div.fixed.inset-x-0.bottom-0');
    const input = dock.locator('input');
    const answers = () => page.getByText(FAKE_ANSWER).count();
    const waitAnswers = async (n) => {
      for (let i = 0; i < 100 && (await answers()) < n; i += 1) await page.waitForTimeout(150);
    };

    await page.goto(`${WEB}/persona`, { waitUntil: 'networkidle' });
    await input.waitFor();
    await shot(page, `${vpName}-1-persona-initial`);

    await page.getByRole('button', { name: /디자인 시스템 구축에서/ }).click();
    await waitAnswers(1);
    await page.getByText('혹시 실례가 안 된다면').waitFor();
    await shot(page, `${vpName}-2-persona-answer`);

    await page.getByRole('button', { name: '입력하기' }).click();
    await page.locator('#visitor-name').waitFor();
    await shot(page, `${vpName}-3-profile-modal`);
    await page.locator('form').getByRole('button', { name: '다음에 할게요' }).click();

    for (const [i, q] of ['협업 갈등 조율 사례 알려줘', '우선순위 정하는 기준은?', '하나은행 프로젝트에서 한 일은?', '마지막 질문입니다'].entries()) {
      await input.fill(q);
      await input.press('Enter');
      await waitAnswers(2 + i);
    }
    await page.getByText('5개 질문 완료').waitFor();
    await shot(page, `${vpName}-4-completion-modal`);

    await page.goto(`${WEB}/admin`, { waitUntil: 'networkidle' });
    await shot(page, `${vpName}-5-admin`);
    await context.close();
  }
  await browser.close();
})().catch((err) => { console.error(err); process.exit(1); });
