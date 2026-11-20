import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Only the demo emulators and local Vite server are allowed. Never point this at production.
const base = 'http://127.0.0.1:5174';
const database = 'http://127.0.0.1:9000';
const report = { startedAt: new Date().toISOString(), students: 50, environment: 'local Firebase Auth/RTDB emulators + Chrome', checks: [], errors: [], blockedRequests: [] };
const output = new URL('../outputs/load-test/', import.meta.url);
await mkdir(output, { recursive: true });
let browser;
let teacher;
let room;
const students = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function readRoom() {
  const result = await fetch(`${database}/rooms/${room}.json?ns=demo-class-support-default-rtdb`, { headers: { Authorization: 'Bearer owner' } });
  assert.equal(result.status, 200);
  return result.json();
}
async function until(predicate, label, timeout = 60000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
async function check(name, task) {
  const start = performance.now();
  try {
    const details = await task();
    const result = { name, passed: true, durationMs: Math.round(performance.now() - start), ...details };
    report.checks.push(result); console.log(JSON.stringify(result));
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message });
    throw error;
  }
}
async function makePage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' && ['5174', '9099', '9000'].includes(url.port)) return route.continue();
    report.blockedRequests.push(url.origin); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  return page;
}
async function press(page, selector) {
  const button = page.locator(selector);
  await until(() => button.isEnabled(), `button enabled: ${selector}`);
  await button.evaluate(element => element.click());
}
async function countAnswers(understood, lost) {
  const data = await readRoom();
  const values = Object.values(data.responses || {});
  return values.length === 50 && values.filter(v => v === 'understood').length === understood && values.filter(v => v === 'lost').length === lost;
}
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  teacher = await makePage();
  await teacher.goto(base);
  await teacher.getByRole('button', { name: '授業ルームを作成', exact: true }).click();
  await teacher.waitForURL('**/teacher/*');
  room = new URL(teacher.url()).pathname.split('/').at(-1);
  report.room = room;
  await teacher.getByRole('heading', { name: '授業の状況', exact: true }).waitFor();

  await check('50 isolated students join concurrently', async () => {
    // Prepare isolated contexts first, then navigate all 50 concurrently.
    for (let i = 0; i < 50; i++) students.push(await makePage());
    const start = performance.now();
    await Promise.all(students.map(page => page.goto(`${base}/room/${room}`, { waitUntil: 'domcontentloaded', timeout: 120000 })));
    await until(async () => Object.keys((await readRoom()).participants || {}).length === 50, '50 participants', 120000);
    await until(async () => (await teacher.locator('.console-attendance > div').first().innerText()).includes('50'), 'teacher shows 50');
    return { concurrentJoinMs: Math.round(performance.now() - start), actualParticipants: 50 };
  });
  await check('50 simultaneous answers: 30 understood / 20 lost', async () => {
    await Promise.all(students.map((page, i) => press(page, i < 30 ? '.response-choice.understood' : '.response-choice.lost')));
    await until(() => countAnswers(30, 20), '30/20 answers');
    await until(async () => (await teacher.locator('.understanding-stack').getAttribute('aria-label')).includes('わかった 30人'), 'teacher graph 30');
    return { understood: 30, lost: 20 };
  });
  await check('10 students change answers without double counting', async () => {
    await Promise.all(students.slice(30, 40).map(page => press(page, '.response-choice.understood')));
    await until(() => countAnswers(40, 10), '40/10 answers');
    return { understood: 40, lost: 10, total: 50 };
  });
  await check('Break alert at 75%: absent at 37/50, present at 38/50, persists until acknowledged', async () => {
    await Promise.all(students.slice(0, 37).map(page => press(page, '.student-break')));
    await until(async () => Object.keys((await readRoom()).break_requests || {}).length === 37, '37 breaks');
    await delay(500);
    assert.equal(await teacher.locator('.urgent-break-dialog[open]').count(), 0);
    await press(students[37], '.student-break');
    await teacher.locator('.urgent-break-dialog[open]').waitFor({ timeout: 60000 });
    await teacher.screenshot({ path: fileURLToPath(new URL('teacher-break.png', output)) });
    await press(students[37], '.student-break');
    await until(async () => Object.keys((await readRoom()).break_requests || {}).length === 37, 'back to 37');
    assert.equal(await teacher.locator('.urgent-break-dialog[open]').count(), 1);
    await teacher.getByRole('button', { name: '確認しました · 通知を止める' }).click();
    assert.equal(await teacher.locator('.urgent-break-dialog[open]').count(), 0);
    return { threshold: '38/50', persistent: true };
  });
  await check('50 students send wow three rounds (150 acknowledged increments)', async () => {
    for (let round = 1; round <= 3; round++) {
      await Promise.all(students.map(page => press(page, '.student-wow')));
      await until(async () => (await readRoom()).reactions.wow === round * 50, `wow ${round * 50}`);
      assert.equal((await Promise.all(students.map(page => page.locator('.response-status').innerText()))).filter(s => s.includes('送信できません')).length, 0);
    }
    return { expected: 150, actual: (await readRoom()).reactions.wow };
  });
  await check('10 students disconnect, reconnect and change answers', async () => {
    const group = students.slice(0, 10);
    await Promise.all(group.map(page => page.context().setOffline(true)));
    await delay(1500);
    await Promise.all(group.map(page => page.context().setOffline(false)));
    await Promise.all(group.map(page => page.reload({ waitUntil: 'domcontentloaded' })));
    await Promise.all(group.map(page => press(page, '.response-choice.lost')));
    await until(() => countAnswers(30, 20), 'reconnected 30/20');
    assert.equal(Object.keys((await readRoom()).participants).length, 50);
    return { participants: 50, understood: 30, lost: 20 };
  });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blockedRequests, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(new URL('results.json', output), JSON.stringify(report, null, 2));
  await browser?.close();
  console.log(`Report: ${fileURLToPath(new URL('results.json', output))}`);
}
