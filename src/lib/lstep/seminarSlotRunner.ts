import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import { Storage } from '@google-cloud/storage';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadLstepConfig } from './config';
import { downloadObjectToFile, uploadFileToGcs } from './gcs';
import {
  slotsFromTomorrow,
  upcomingSlots,
  type SeminarSlot,
} from './seminarSchedule';

const BASE = 'https://manager.linestep.net';
const TAG_LIST_URL = `${BASE}/line/tag`;
const APPLY_FORM_URL = `${BASE}/lvf/edit/1084212?group=216354`;
const DATE_TEMPLATE_URL = `${BASE}/line/template/edit_v3/268609107?editMessage=1`;
const REMINDER_TEMPLATE_URL = `${BASE}/line/template/edit/268822941?group=1020108`;
const FLEX_TEMPLATES = [
  { id: '268607623', label: '2日後07:08', count: 6 },
  { id: '268607783', label: '2日後20:58', count: 6 },
  { id: '268607893', label: '4日後06:58', count: 6 },
  { id: '268608033', label: '4日後23:00', count: 6 },
  { id: '268608572', label: '6日後20:03', count: 6, startsTomorrow: true },
  { id: '268608322', label: '7日後20:03', count: 4, startsTomorrow: true },
  { id: '268608656', label: '8日後20:03', count: 3, minimumLeadMinutes: 0 },
] as const;
const ONE_TAP_TAG_ID = 10242626;
const IMMUTABLE_ACTION_PREFIX = 'AUTO_セミナー申込_';
const FORM_COUNT = 14;
const DATE_TEMPLATE_COUNT = 6;
const REMINDER_COUNT = 8;
const DATE_LABEL_RE = /^\d{1,2}\/\d{1,2}\([日月火水木金土]\)\s*\d{1,2}:00~/;

interface DateTag {
  name: string;
  href: string;
  memberCount: number;
  summary: string;
}

interface SurfaceSnapshot {
  form: string[];
  flex: Record<string, FlexCardState[]>;
  dateTemplate: string[];
  reminder: string[];
}

interface FlexCardState {
  label: string;
  action: string;
  actionId: number;
  actionName: string;
  actionDescription: string;
  tagIds: number[];
}

export interface LstepAction {
  aid?: number;
  id?: number;
  name?: string;
  a_name?: string;
  description?: string;
  twice_type?: number | string;
  a_twice_type?: number | string;
  inputs?: Array<Record<string, unknown>>;
}

interface ImmutableAction {
  id: number;
  name: string;
  description: string;
  tagIds: number[];
}

interface FlexAssignment {
  actionId: number;
  actionDescription: string;
}

export interface RunOptions {
  now?: Date;
  apply?: boolean;
  /** 本番動作確認用。各表示面の末尾へ追加で保持する枠数。通常運用は0。 */
  extraSlots?: number;
}

export interface StepResult {
  step: string;
  status: 'ok' | 'skipped' | 'failed';
  detail: string;
}

export interface RunResult {
  ranAt: string;
  mode: 'apply' | 'dry-run';
  steps: StepResult[];
  issues: string[];
}

const wait = (page: Page, milliseconds = 1_500) => page.waitForTimeout(milliseconds);

interface OpenBrowserResult {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  statePath: string;
  storage: Storage;
  bucketName: string;
  objectName: string;
}

async function openBrowser(): Promise<OpenBrowserResult> {
  const config = loadLstepConfig();
  const storage = new Storage();
  const dir = await mkdtemp(join(tmpdir(), 'lstep-seminar-'));
  const statePath = join(dir, 'storage-state.json');
  const downloaded = await downloadObjectToFile(storage, config.gcsBucket, config.storageStateObject, statePath);
  const channel = process.env.LSTEP_BROWSER_CHANNEL;
  const browser = await chromium.launch({
    headless: process.env.LSTEP_HEADLESS !== 'false',
    ...(channel ? { channel } : {}),
  });
  const context = await browser.newContext({
    ...(downloaded ? { storageState: statePath } : {}),
    viewport: { width: 1600, height: 1400 },
  });
  const page = await context.newPage();

  try {
    await page.goto(TAG_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await wait(page, 1_500);
    if (/login/i.test(page.url())) {
      const username = process.env.LSTEP_USERNAME;
      const password = process.env.LSTEP_PASSWORD;
      if (!username || !password) throw new Error('Lステップのログインセッションが切れており、再ログイン用認証情報がありません');

      const usernameInput = page.locator('input[type="email"]:visible,input[type="text"]:visible').first();
      const passwordInput = page.locator('input[type="password"]:visible').first();
      if (!await usernameInput.count() || !await passwordInput.count()) throw new Error('Lステップのログイン入力欄が見つかりません');
      await usernameInput.fill(username);
      await passwordInput.fill(password);
      const submit = page.locator('button[type="submit"]:visible,input[type="submit"]:visible').first();
      if (!await submit.count()) throw new Error('Lステップのログインボタンが見つかりません');
      const recaptcha = page.frameLocator('iframe[title="reCAPTCHA"]').getByRole('checkbox', { name: '私はロボットではありません' });
      if (await recaptcha.count()) {
        await recaptcha.click();
        await page.waitForFunction(() => {
          const button = document.querySelector('button[type="submit"],input[type="submit"]') as HTMLButtonElement | HTMLInputElement | null;
          return button !== null && !button.disabled;
        }, undefined, { timeout: 30_000 }).catch(() => undefined);
      }
      await submit.waitFor({ state: 'attached', timeout: 30_000 });
      if (!await submit.isEnabled()) throw new Error('reCAPTCHAの確認が必要なため、Lステップへ自動再ログインできませんでした');
      await submit.click();
      await page.waitForURL((url) => !url.pathname.includes('/account/login'), { timeout: 60_000 });
      await wait(page, 2_000);
    }

    if (/login/i.test(page.url())) throw new Error('Lステップへの再ログインに失敗しました');
    return {
      browser,
      context,
      page,
      statePath,
      storage,
      bucketName: config.gcsBucket,
      objectName: config.storageStateObject,
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function hasAuthenticatedSession(page: Page): Promise<boolean> {
  const response = await page.request.get(TAG_LIST_URL, { maxRedirects: 0 }).catch(() => null);
  if (!response || response.status() !== 200) return false;
  return !/login/i.test(response.headers().location ?? '');
}

async function goto(page: Page, url: string, delay = 2_500): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await wait(page, delay);
  if (/login/i.test(page.url())) throw new Error('Lステップのログインセッションが切れています');
}

async function openTagGroup(page: Page): Promise<void> {
  await goto(page, TAG_LIST_URL);
  await page.getByText(/回答フォーム\s*用日程/).first().click();
  await wait(page, 2_500);
}

async function readDateTags(page: Page): Promise<DateTag[]> {
  await openTagGroup(page);
  return page.locator('a[href*="/line/tag/setting/"]').evaluateAll((links) => links.map((link) => {
    const summary = (link.closest('tr') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? '';
    const memberCount = Number(summary.match(/\s(\d+)人\s\d{4}\//)?.[1] ?? 0);
    return {
      name: (link.textContent ?? '').replace('open_in_new', '').trim(),
      href: link.getAttribute('href') ?? '',
      memberCount,
      summary,
    };
  }).filter((tag) => /^\d+月\d+日(?:13|21)(?:時)?$/.test(tag.name)));
}

function tagForSlot(tags: DateTag[], slot: SeminarSlot): DateTag | undefined {
  return tags.find((tag) => tag.name === slot.tagName)
    ?? tags.find((tag) => tag.name === slot.tagName.replace(/時$/, ''));
}

function assertTagSummary(slot: SeminarSlot, tag: DateTag): string[] {
  const issues: string[] = [];
  if (!tag.summary.includes(slot.applicationValue.replace(' ', ''))) issues.push(`${tag.name}: 友だち情報が ${slot.applicationValue} ではありません`);
  if (!tag.summary.includes(slot.reminderName)) issues.push(`${tag.name}: リマインダが ${slot.reminderName} ではありません`);
  const jpDate = `${slot.year}年${slot.month}月${slot.day}日22:00`;
  if (!tag.summary.includes(jpDate)) issues.push(`${tag.name}: ゴール日時が ${jpDate} ではありません`);
  if (tag.summary.includes('条件ON')) issues.push(`${tag.name}: タグ側アクションに条件ONがあります`);
  return issues;
}

async function visibleExact(page: Page, text: string): Promise<Locator> {
  const candidates = page.getByText(text, { exact: true });
  for (let index = (await candidates.count()) - 1; index >= 0; index -= 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  throw new Error(`表示中の「${text}」が見つかりません`);
}

async function inputMatching(root: Locator, pattern: RegExp): Promise<Locator> {
  const inputs = root.locator('input');
  for (let index = 0; index < await inputs.count(); index += 1) {
    const input = inputs.nth(index);
    if (pattern.test(await input.inputValue().catch(() => ''))) return input;
  }
  throw new Error(`入力欄 ${pattern} が見つかりません`);
}

async function chooseTag(dialog: Locator, page: Page, currentName: string, nextName: string): Promise<void> {
  if (currentName === nextName) return;
  await dialog.getByText(currentName, { exact: true }).first().click();
  const search = dialog.getByPlaceholder('タグ名を入力').last();
  await search.fill(nextName);
  await wait(page, 900);
  await (await visibleExact(page, nextName)).click();
  await wait(page, 500);
  if (!(await dialog.innerText()).includes(nextName)) throw new Error(`タグ ${nextName} を選択できませんでした`);
}

async function createTag(page: Page, slot: SeminarSlot, tags: DateTag[]): Promise<DateTag> {
  const sortKey = (tag: DateTag): number => {
    const match = tag.name.match(/^(\d+)月(\d+)日/);
    return match ? Number(match[1]) * 100 + Number(match[2]) : 0;
  };
  const source = tags
    .filter((tag) => tag.name.endsWith(`${slot.hour}時`) || tag.name.endsWith(`${slot.hour}`))
    .sort((a, b) => sortKey(b) - sortKey(a))[0];
  if (!source) throw new Error(`${slot.hour}時タグのコピー元がありません`);

  await openTagGroup(page);
  const row = page.locator('tr').filter({ has: page.locator(`a[href="${source.href}"]`) }).first();
  await row.getByText('more_vert', { exact: true }).click();
  await page.locator('button:visible').filter({ hasText: 'コピーを作成' }).last().click();
  const copyDialog = page.locator('[role="dialog"],.modal').filter({ hasText: 'コピー' }).last();
  const nameInput = await inputMatching(copyDialog, /./);
  await nameInput.fill(slot.tagName);
  await copyDialog.getByRole('button', { name: 'コピー', exact: true }).click();
  await wait(page, 2_500);

  const refreshed = await readDateTags(page);
  const created = tagForSlot(refreshed, slot);
  if (!created) throw new Error(`${slot.tagName} のコピー作成を確認できませんでした`);
  return configureTag(page, slot, created);
}

async function configureTag(page: Page, slot: SeminarSlot, tag: DateTag): Promise<DateTag> {
  await goto(page, `${BASE}${tag.href}`);
  await page.getByText('アクション設定', { exact: false }).first().click();
  await wait(page, 1_500);
  const dialog = page.locator('[role="dialog"],.modal').last();
  const friendInput = await inputMatching(dialog, /^\d{1,2}\/\d{1,2}\(.\)\s*\d{1,2}:00~$/);
  await friendInput.fill(slot.applicationValue.replace(') ', ')'));
  const dateInput = page.getByPlaceholder('日付選択').last();
  const previousDate = await dateInput.inputValue();
  const previousMonth = Number(previousDate.match(/^\d{4}\/(\d{2})\//)?.[1] ?? 0);
  await dateInput.click();
  await wait(page, 400);
  const dayPattern = new RegExp(`^${slot.day}$`);
  const dateCell = previousMonth === slot.month
    ? page.locator('.dp__cell_inner.dp__pointer:not(.dp__cell_offset)').filter({ hasText: dayPattern }).last()
    : page.locator('.dp__cell_inner.dp__pointer.dp__cell_offset').filter({ hasText: dayPattern }).last();
  await dateCell.click();
  const expectedDate = `${slot.year}/${String(slot.month).padStart(2, '0')}/${String(slot.day).padStart(2, '0')}`;
  if (await dateInput.inputValue() !== expectedDate) throw new Error(`${slot.tagName}: ゴール日付を${expectedDate}へ変更できませんでした`);
  await page.locator('input[type="time"]:visible').last().fill(slot.reminderGoal.time);
  await page.getByText('この条件で決定する', { exact: false }).first().click();
  await wait(page, 1_000);
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await wait(page, 2_500);
  const refreshed = await readDateTags(page);
  const verified = tagForSlot(refreshed, slot);
  if (!verified) throw new Error(`${slot.tagName} の保存後検証に失敗しました`);
  const issues = assertTagSummary(slot, verified);
  if (issues.length) throw new Error(issues.join(' / '));
  return verified;
}

async function openFormChoices(page: Page): Promise<Locator> {
  await goto(page, APPLY_FORM_URL, 3_500);
  const radio = page.locator('#radio_3');
  if (!await radio.count()) throw new Error('セミナー申込日時のラジオボタン #radio_3 が見つかりません');
  await radio.locator('.lvitem-edit-bar').click();
  await wait(page, 2_500);
  return radio.locator('[data-testid^="choice_"]:visible');
}

async function readFormState(page: Page): Promise<Array<{ label: string; action: string }>> {
  const panels = await openFormChoices(page);
  const choices = await panels.evaluateAll((elements) => elements.map((element) => ({
    label: (element.querySelector('input[data-testid="labelInput"]') as HTMLInputElement | null)?.value ?? '',
    action: (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
  })));
  return choices.filter((choice) => DATE_LABEL_RE.test(choice.label));
}

async function configureFormPanel(page: Page, panel: Locator, slot: SeminarSlot, tag: DateTag): Promise<void> {
  await panel.locator('input[data-testid="labelInput"]').fill(slot.choiceLabel);
  await wait(page, 800);
  const actionText = await panel.innerText();
  const currentTag = actionText.match(/タグ\[([^\]]+)\]を追加/)?.[1];
  if (!currentTag) throw new Error(`${slot.choiceLabel}: フォームのコピー元タグを取得できません (${actionText.replace(/\s+/g, ' ').slice(0, 300)})`);
  await panel.getByText('アクション設定', { exact: true }).click();
  await wait(page, 1_200);
  const dialog = page.locator('[role="dialog"],.modal').last();
  await chooseTag(dialog, page, currentTag, tag.name);
  const friendInput = await inputMatching(dialog, /^\d{1,2}\/\d{1,2}\(.\)\s*\d{1,2}:00~$/);
  await friendInput.fill(slot.applicationValue);
  await dialog.getByText('この条件で決定する', { exact: false }).click();
  await wait(page, 800);
}

async function formPanelLabels(page: Page): Promise<string[]> {
  return page.locator('#radio_3 [data-testid^="choice_"]:visible input[data-testid="labelInput"]')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

async function waitForFormPanelCount(page: Page, expected: number, operation: string): Promise<void> {
  try {
    await page.waitForFunction((count) => [...document.querySelectorAll('#radio_3 [data-testid^="choice_"]')]
      .filter((element) => (element as HTMLElement).getClientRects().length > 0).length === count, expected, { timeout: 8_000 });
  } catch {
    const labels = await formPanelLabels(page).catch(() => []);
    const dialogs = await page.locator('[role="dialog"]:visible,.modal:visible').evaluateAll((elements) => elements
      .map((element) => (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 300)));
    throw new Error(`フォーム${operation}失敗: 期待${expected}件・実際${labels.length}件 [${labels.join(' / ')}] ダイアログ=[${dialogs.join(' | ') || 'なし'}] URL=${page.url()}`);
  }
}

async function copyLastFormPanel(page: Page): Promise<void> {
  const panels = page.locator('#radio_3 [data-testid^="choice_"]:visible');
  const before = await panels.count();
  if (!before) throw new Error(`フォーム複製失敗: コピー元がありません URL=${page.url()}`);
  const sourceLabel = await panels.last().locator('input[data-testid="labelInput"]').inputValue().catch(() => '不明');
  await panels.last().locator('.lvitem-copy').click({ force: true });
  await waitForFormPanelCount(page, before + 1, `複製（コピー元=${sourceLabel}）`);
}

async function removeLastFormPanel(page: Page): Promise<void> {
  const panels = page.locator('#radio_3 [data-testid^="choice_"]:visible');
  const before = await panels.count();
  if (!before) throw new Error(`フォーム削除失敗: 削除対象がありません URL=${page.url()}`);
  const target = panels.last();
  const targetLabel = await target.locator('input[data-testid="labelInput"]').inputValue().catch(() => '不明');
  await target.locator('.lvitem-remove').click({ force: true });
  await wait(page, 400);

  const dialog = page.locator('[role="dialog"]:visible,.modal:visible').last();
  if (await dialog.isVisible().catch(() => false)) {
    const confirm = dialog.getByRole('button', { name: /^(削除|削除する|はい|OK)$/ }).last();
    if (!await confirm.isVisible().catch(() => false) || !await confirm.isEnabled().catch(() => false)) {
      const dialogText = (await dialog.innerText()).replace(/\s+/g, ' ').trim().slice(0, 500);
      throw new Error(`フォーム削除確認失敗: 対象=${targetLabel} 確認ボタンが見つかりません ダイアログ=[${dialogText}] URL=${page.url()}`);
    }
    await confirm.click();
  }
  await waitForFormPanelCount(page, before - 1, `削除（対象=${targetLabel}）`);
}

function formVerificationError(actual: string[], expected: string[], url: string): Error {
  const missing = expected.filter((label) => !actual.includes(label));
  const extra = actual.filter((label) => !expected.includes(label));
  const sameItems = missing.length === 0 && extra.length === 0 && actual.length === expected.length;
  return new Error([
    `フォーム保存後検証失敗: 期待${expected.length}件・実際${actual.length}件`,
    `期待=[${expected.join(' / ')}]`,
    `実際=[${actual.join(' / ')}]`,
    `不足=[${missing.join(' / ') || 'なし'}]`,
    `余分=[${extra.join(' / ') || 'なし'}]`,
    `並び順不一致=${sameItems ? 'あり' : '判定対象外'}`,
    `URL=${url}`,
  ].join(' '));
}

async function updateForm(page: Page, desired: SeminarSlot[], tags: DateTag[], apply: boolean): Promise<string> {
  const current = await readFormState(page);
  const currentLabels = current.map((choice) => choice.label);
  const desiredLabels = desired.map((slot) => slot.choiceLabel);
  if (JSON.stringify(currentLabels) === JSON.stringify(desiredLabels)) return '変更なし';
  if (!apply) return `${currentLabels.join(' / ')} -> ${desiredLabels.join(' / ')}`;

  // Lステップの「コピー」は複製先が末尾になるとは限らず、差分更新だけでは
  // 古い日時が末尾へ回ることがある。件数を合わせた後、全パネルを上から
  // 正しい日時へ再設定して、順序・タグ・友だち情報を同時に保証する。
  let panelCount = (await formPanelLabels(page)).length;
  while (panelCount > desired.length) {
    await removeLastFormPanel(page);
    panelCount -= 1;
  }
  while (panelCount < desired.length) {
    await copyLastFormPanel(page);
    panelCount += 1;
  }

  for (let index = 0; index < desired.length; index += 1) {
    const slot = desired[index];
    const tag = tagForSlot(tags, slot);
    if (!tag) throw new Error(`${slot.tagName} がないためフォーム${index + 1}件目を設定できません URL=${page.url()}`);
    const panels = page.locator('#radio_3 [data-testid^="choice_"]:visible');
    await configureFormPanel(page, panels.nth(index), slot, tag);
  }
  await page.locator('#lvbuildsave').click();
  await wait(page, 3_000);
  const verified = await readFormState(page);
  const labels = verified.map((choice) => choice.label);
  if (JSON.stringify(labels) !== JSON.stringify(desiredLabels)) throw formVerificationError(labels, desiredLabels, page.url());
  for (let index = 0; index < desired.length; index += 1) {
    const tag = tagForSlot(tags, desired[index]);
    const action = verified[index]?.action ?? '';
    if (!tag || !action.includes(`タグ[${tag.name}]`) || !action.includes(desired[index].applicationValue)) {
      throw new Error(`${desired[index].choiceLabel}: フォームのアクション検証に失敗しました`);
    }
  }
  return `${currentLabels.length}件を${desiredLabels.length}件へ更新・検証済み`;
}

function flexLabel(slot: SeminarSlot, current: Array<{ label: string }>, index: number): string {
  const source = current.find((card) => card.label.startsWith(slot.choiceLabel))
    ?? current[Math.min(index, Math.max(0, current.length - 1))];
  const suffix = source?.label.match(/\(残り\d+名\)$/)?.[0]
    ?? current.at(-1)?.label.match(/\(残り\d+名\)$/)?.[0]
    ?? '(残り20名)';
  return `${slot.choiceLabel}${suffix}`;
}

type FlexResource = {
  name: string;
  group: number;
  alt_text?: string;
  sender_id?: number | null;
  do_override_sender?: number;
  answer_type?: number;
  twice_do_reply?: number;
  twice_action_id?: number;
  editor_json: { panels: Array<{ blocks?: Array<Record<string, unknown>> }> } | string;
};

async function parseFlexResponse(response: Awaited<ReturnType<Page['request']['get']>>, context: string): Promise<FlexResource> {
  const body = await response.text();
  try {
    return JSON.parse(body) as FlexResource;
  } catch {
    throw new Error(`${context}: JSONではない応答 (${response.status()} ${response.url()} ${body.slice(0, 120)})`);
  }
}

async function flexApiHeaders(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies(BASE);
  const xsrf = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN');
  if (!xsrf) throw new Error('Flex保存用のXSRFトークンが見つかりません');
  return {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-XSRF-TOKEN': decodeURIComponent(xsrf.value),
  };
}

async function apiGet(
  page: Page,
  url: string,
  context: string,
): Promise<Awaited<ReturnType<Page['request']['get']>>> {
  let lastError: unknown;
  let attempts = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    attempts = attempt;
    try {
      const response = await page.request.get(url, {
        headers: await flexApiHeaders(page),
        timeout: 30_000,
      });
      if (response.ok()) return response;
      lastError = new Error(`${context}に失敗しました (${response.status()})`);
      if (response.status() < 500) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await wait(page, attempt * 1_000);
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${context}に${attempts}回失敗しました: ${detail}`);
}

export function tagIdFromHref(href: string): number {
  return Number(href.match(/\/line\/tag\/setting\/(\d+)/)?.[1] ?? 0);
}

function tagId(tag: DateTag): number {
  const id = tagIdFromHref(tag.href);
  if (!id) throw new Error(`${tag.name}: タグIDをURLから取得できません (${tag.href})`);
  return id;
}

function immutableActionName(slot: SeminarSlot): string {
  return `${IMMUTABLE_ACTION_PREFIX}${slot.year}-${String(slot.month).padStart(2, '0')}-${String(slot.day).padStart(2, '0')}_${slot.hour}00`;
}

function actionIdOf(action: LstepAction): number {
  return Number(action.aid ?? action.id ?? 0);
}

function actionNameOf(action: LstepAction): string {
  return String(action.name ?? action.a_name ?? '');
}

function actionTagIds(action: LstepAction): number[] {
  return (action.inputs ?? [])
    .filter((input) => Number(input.type) === 13)
    .flatMap((input) => Array.isArray(input.tag_ids) ? input.tag_ids : [])
    .map(Number)
    .filter(Boolean);
}

function assertFullSeminarAction(action: LstepAction, context: string): void {
  const inputTypes = new Set((action.inputs ?? []).map((input) => Number(input.type)));
  const required = [
    { type: 5, label: 'シナリオ停止' },
    { type: 12, label: 'テンプレ送信' },
    { type: 1, label: 'テキスト送信' },
    { type: 13, label: 'タグ追加' },
  ];
  const missing = required.filter(({ type }) => !inputTypes.has(type)).map(({ label }) => label);
  if (missing.length) {
    throw new Error(`${context}: 申込アクションの全4動作を確認できません（不足: ${missing.join('・')}）`);
  }
}

async function readAction(page: Page, actionId: number): Promise<LstepAction> {
  const response = await apiGet(page, `${BASE}/api/actions/${actionId}`, `アクション${actionId}の取得`);
  return response.json() as Promise<LstepAction>;
}

async function findActionByName(page: Page, name: string): Promise<LstepAction | undefined> {
  for (let pageNumber = 1; pageNumber <= 50; pageNumber += 1) {
    const response = await apiGet(page, `${BASE}/api/actions?page=${pageNumber}`, `アクション一覧${pageNumber}ページ目の取得`);
    const body = await response.json() as { data?: LstepAction[]; last_page?: number };
    const rows = body.data ?? [];
    const found = rows.find((action) => actionNameOf(action) === name);
    if (found) {
      const detail = await readAction(page, actionIdOf(found));
      return {
        ...detail,
        name: actionNameOf(detail) || actionNameOf(found),
        description: detail.description ?? found.description,
      };
    }
    if (!rows.length || (body.last_page !== undefined && pageNumber >= body.last_page)) return undefined;
  }
  throw new Error(`アクション「${name}」を50ページ以内に確認できませんでした`);
}

export function cloneInputsForDateTag(
  source: LstepAction,
  knownDateTagIds: Set<number>,
  nextDateTagId: number,
): Array<Record<string, unknown>> {
  const inputs = structuredClone(source.inputs ?? []);
  let replacementCount = 0;
  for (const input of inputs) {
    if (Number(input.type) !== 13 || !Array.isArray(input.tag_ids)) continue;
    input.tag_ids = input.tag_ids.map((value) => {
      const id = Number(value);
      if (!knownDateTagIds.has(id)) return value;
      replacementCount += 1;
      return nextDateTagId;
    });
  }
  if (replacementCount !== 1) {
    throw new Error(`コピー元アクション${actionIdOf(source)}の日付タグが${replacementCount}件です（期待1件）`);
  }
  return inputs;
}

function appendMultipart(
  target: Record<string, string>,
  path: string,
  value: unknown,
): void {
  if (value === undefined) return;
  if (value === null) {
    target[path] = '';
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendMultipart(target, `${path}[${index}]`, item));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      appendMultipart(target, `${path}[${key}]`, item);
    });
    return;
  }
  target[path] = String(value);
}

function canonicalActionInputs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalActionInputs);
  if (!value || typeof value !== 'object') return value;
  const ignored = new Set(['id', 'aid', 'action_id', 'created_at', 'updated_at']);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !ignored.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => {
      const normalized = canonicalActionInputs(item);
      if (key === 'tag_ids' && Array.isArray(normalized)) {
        return [key, [...normalized].sort((left, right) => Number(left) - Number(right))];
      }
      return [key, normalized];
    }));
}

async function createImmutableAction(
  page: Page,
  slot: SeminarSlot,
  dateTag: DateTag,
  sourceActionId: number,
  allDateTags: DateTag[],
): Promise<ImmutableAction> {
  const source = await readAction(page, sourceActionId);
  assertFullSeminarAction(source, `コピー元アクション${sourceActionId}`);
  const nextDateTagId = tagId(dateTag);
  const inputs = cloneInputsForDateTag(source, new Set(allDateTags.map(tagId)), nextDateTagId);
  const name = immutableActionName(slot);
  const multipart: Record<string, string> = {
    aid: '0',
    a_name: name,
    a_twice_type: String(source.twice_type ?? source.a_twice_type ?? 1),
    is_template: '1',
    withDescription: '1',
  };
  inputs.forEach((input, index) => appendMultipart(multipart, `inputs[${index}]`, input));

  const response = await page.request.post(`${BASE}/api/action/register`, {
    headers: await flexApiHeaders(page),
    multipart,
  });
  if (!response.ok()) throw new Error(`${dateTag.name}: 新規アクション作成に失敗しました (${response.status()} ${await response.text()})`);
  const createdSummary = await response.json() as LstepAction;
  const createdId = actionIdOf(createdSummary);
  if (!createdId) throw new Error(`${dateTag.name}: 新規アクションIDを取得できませんでした`);
  const created = await readAction(page, createdId);
  assertFullSeminarAction(created, `新規アクション${createdId}`);
  const createdTagIds = actionTagIds(created);
  const otherDateTags = createdTagIds.filter((id) => id !== nextDateTagId && allDateTags.some((tag) => tagId(tag) === id));
  if (!createdTagIds.includes(nextDateTagId) || !createdTagIds.includes(ONE_TAP_TAG_ID) || otherDateTags.length) {
    throw new Error(`${dateTag.name}: 新規アクション${createdId}のタグ検証に失敗しました`);
  }
  if (JSON.stringify(canonicalActionInputs(created.inputs)) !== JSON.stringify(canonicalActionInputs(inputs))) {
    throw new Error(`${dateTag.name}: 新規アクション${createdId}の全動作コピー検証に失敗しました`);
  }
  return {
    id: createdId,
    name,
    description: String(created.description ?? createdSummary.description ?? ''),
    tagIds: createdTagIds,
  };
}

async function immutableActionForSlot(
  page: Page,
  slot: SeminarSlot,
  dateTag: DateTag,
  sourceActionId: number,
  allDateTags: DateTag[],
  registry: Map<number, ImmutableAction>,
): Promise<ImmutableAction> {
  const dateTagId = tagId(dateTag);
  const cached = registry.get(dateTagId);
  if (cached) return cached;
  const name = immutableActionName(slot);
  const existing = await findActionByName(page, name);
  if (existing) {
    assertFullSeminarAction(existing, `既存アクション「${name}」`);
    const existingIds = actionTagIds(existing);
    const otherDateTags = existingIds.filter((id) => id !== dateTagId && allDateTags.some((tag) => tagId(tag) === id));
    if (!existingIds.includes(dateTagId) || !existingIds.includes(ONE_TAP_TAG_ID) || otherDateTags.length) {
      throw new Error(`${name}: 既存の不変アクション設定が一致しません`);
    }
    const action = {
      id: actionIdOf(existing),
      name,
      description: String(existing.description ?? ''),
      tagIds: existingIds,
    };
    registry.set(dateTagId, action);
    return action;
  }
  const created = await createImmutableAction(page, slot, dateTag, sourceActionId, allDateTags);
  registry.set(dateTagId, created);
  return created;
}

function textFromDoc(value: unknown): string {
  const texts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record.text === 'string') texts.push(record.text);
    if (Array.isArray(record.content)) record.content.forEach(walk);
  };
  walk(value);
  return texts.join('');
}

function replaceDocText(value: unknown, next: string): void {
  let replaced = false;
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object' || replaced) return;
    const record = node as Record<string, unknown>;
    if (typeof record.text === 'string') {
      record.text = next;
      replaced = true;
      return;
    }
    if (Array.isArray(record.content)) record.content.forEach(walk);
  };
  walk(value);
  if (!replaced) throw new Error('Flexメッセージの日程テキストを置換できません');
}

type FlexBlockAction = {
  data?: {
    act?: {
      aid?: unknown;
      description?: unknown;
    };
  };
  description?: unknown;
};

function flexBlockAction(block: Record<string, unknown>): FlexBlockAction | undefined {
  return block.action as FlexBlockAction | undefined;
}

function setFlexAction(block: Record<string, unknown>, assignment: FlexAssignment): void {
  const action = flexBlockAction(block);
  const act = action?.data?.act;
  if (!action || !act) throw new Error('Flexメッセージの日程ボタンにアクションがありません');
  act.aid = assignment.actionId;
  act.description = assignment.actionDescription;
  action.description = assignment.actionDescription;
}

async function patchFlexButtons(
  page: Page,
  id: string,
  labels: string[],
  assignments: FlexAssignment[],
): Promise<void> {
  if (labels.length !== assignments.length) throw new Error(`Flex ${id} のラベル数とアクション数が一致しません`);
  const endpoint = `${BASE}/api/template/lflexes/${id}`;
  const headers = await flexApiHeaders(page);
  const response = await apiGet(page, endpoint, `Flex ${id} の取得`);
  const resource = await parseFlexResponse(response, `Flex ${id} 取得`);
  const editor: Exclude<FlexResource['editor_json'], string> = typeof resource.editor_json === 'string' ? JSON.parse(resource.editor_json) : resource.editor_json;
  const blocks = editor.panels.flatMap((panel) => panel.blocks ?? []);
  const dateBlocks = blocks.filter((block) => DATE_LABEL_RE.test(textFromDoc(block.text)));
  if (dateBlocks.length !== labels.length) throw new Error(`Flex ${id} の日程ブロックが${dateBlocks.length}件（期待${labels.length}件）`);
  dateBlocks.forEach((block, index) => {
    replaceDocText(block.text, labels[index]);
    setFlexAction(block, assignments[index]);
  });
  const saved = await page.request.post(endpoint, {
    headers,
    data: {
      _method: 'patch',
      name: resource.name,
      group: resource.group,
      alt_text: resource.alt_text,
      sender_id: resource.sender_id ?? 0,
      do_override_sender: resource.do_override_sender ?? 0,
      answer_type: resource.answer_type ?? 2,
      twice_do_reply: resource.twice_do_reply ?? 0,
      twice_action_id: resource.twice_action_id ?? 0,
      editor_json: JSON.stringify(editor),
    },
  });
  if (!saved.ok()) throw new Error(`Flex ${id} の保存に失敗しました (${saved.status()} ${await saved.text()})`);
  const verify = await apiGet(page, endpoint, `Flex ${id} の保存後取得`);
  const verifiedResource = await parseFlexResponse(verify, `Flex ${id} 保存後取得`);
  const verifiedEditor: Exclude<FlexResource['editor_json'], string> = typeof verifiedResource.editor_json === 'string' ? JSON.parse(verifiedResource.editor_json) : verifiedResource.editor_json;
  const verifiedBlocks = verifiedEditor.panels.flatMap((panel) => panel.blocks ?? []).filter((block) => DATE_LABEL_RE.test(textFromDoc(block.text)));
  const verifiedLabels = verifiedBlocks.map((block) => textFromDoc(block.text));
  const verifiedActionIds = verifiedBlocks.map((block) => Number(flexBlockAction(block)?.data?.act?.aid ?? 0));
  if (JSON.stringify(verifiedLabels) !== JSON.stringify(labels)) throw new Error(`Flex ${id} のAPI保存後検証に失敗しました`);
  if (JSON.stringify(verifiedActionIds) !== JSON.stringify(assignments.map((assignment) => assignment.actionId))) {
    throw new Error(`Flex ${id} の新規アクション紐付け検証に失敗しました`);
  }
}

async function flexCards(page: Page): Promise<Locator> {
  const dateEditor = page.locator('[contenteditable="true"]').filter({ hasText: DATE_LABEL_RE });
  return page.locator('.list_item_component').filter({ has: dateEditor });
}

async function readFlexState(page: Page, id: string): Promise<FlexCardState[]> {
  await goto(page, `${BASE}/line/template/edit_v3/${id}?editMessage=1`, 3_000);
  const cards = await (await flexCards(page)).evaluateAll((elements) => elements.map((element) => ({
    label: (element.querySelector('[contenteditable="true"]')?.textContent ?? '').trim(),
    action: (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
  }))).then((values) => values.filter((card) => DATE_LABEL_RE.test(card.label)));

  const response = await apiGet(page, `${BASE}/api/template/lflexes/${id}`, `Flex ${id} のアクション取得`);
  const resource = await parseFlexResponse(response, `Flex ${id} アクション取得`);
  const editor: Exclude<FlexResource['editor_json'], string> = typeof resource.editor_json === 'string' ? JSON.parse(resource.editor_json) : resource.editor_json;
  const dateBlocks = editor.panels.flatMap((panel) => panel.blocks ?? []).filter((block) => DATE_LABEL_RE.test(textFromDoc(block.text)));
  if (dateBlocks.length !== cards.length) throw new Error(`Flex ${id} の表示とアクション件数が一致しません (${cards.length}/${dateBlocks.length})`);

  const actions = await Promise.all(dateBlocks.map(async (block) => {
    const actionId = Number(flexBlockAction(block)?.data?.act?.aid ?? 0);
    if (!actionId) return { actionId: 0, actionName: '', actionDescription: '', tagIds: [] };
    const action = await readAction(page, actionId);
    return {
      actionId,
      actionName: actionNameOf(action),
      actionDescription: String(action.description ?? flexBlockAction(block)?.data?.act?.description ?? ''),
      tagIds: actionTagIds(action),
    };
  }));

  return cards.map((card, index) => ({ ...card, ...actions[index] }));
}

async function clickBlockToolbar(page: Page, card: Locator, action: '複製' | '削除'): Promise<void> {
  await card.click();
  await wait(page, 400);
  const toolbar = page.locator('.block_toolbar_component:visible').last();
  await toolbar.getByText(action, { exact: true }).click();
  await wait(page, 700);
  if (action === '削除') {
    const confirm = page.getByRole('button', { name: /削除|OK|はい/, exact: true }).last();
    if (await confirm.isVisible().catch(() => false) && await confirm.isEnabled().catch(() => false)) {
      await confirm.click();
      await wait(page, 500);
    }
  }
}

function choiceLabelFromFlexLabel(label: string): string {
  return label.replace(/\(残り\d+名\)$/, '');
}

export function flexRotationPlan(currentLabels: string[], desiredLabels: string[]): { removeFromTop: number; appendToBottom: number } {
  let overlap = Math.min(currentLabels.length, desiredLabels.length);
  while (overlap > 0) {
    const currentSuffix = currentLabels.slice(currentLabels.length - overlap);
    const desiredPrefix = desiredLabels.slice(0, overlap);
    if (JSON.stringify(currentSuffix) === JSON.stringify(desiredPrefix)) break;
    overlap -= 1;
  }
  // Flexの新規ブロック作成は既存ブロックの複製を使うため、全削除はしない。
  if (overlap === 0 && currentLabels.length && desiredLabels.length) overlap = 1;
  return {
    removeFromTop: currentLabels.length - overlap,
    appendToBottom: desiredLabels.length - overlap,
  };
}

async function reconcileFlexBlocks(page: Page, current: FlexCardState[], desired: SeminarSlot[]): Promise<boolean> {
  const plan = flexRotationPlan(
    current.map((card) => choiceLabelFromFlexLabel(card.label)),
    desired.map((slot) => slot.choiceLabel),
  );
  let changed = false;

  for (let index = 0; index < plan.removeFromTop; index += 1) {
    const cards = await flexCards(page);
    if (!await cards.count()) throw new Error('削除対象の先頭日程ボタンが見つかりません');
    await clickBlockToolbar(page, cards.first(), '削除');
    changed = true;
  }

  for (let index = 0; index < plan.appendToBottom; index += 1) {
    const cards = await flexCards(page);
    const count = await cards.count();
    if (!count) throw new Error('新規日程ボタンのコピー元がありません');
    // 最終の日程ボタンを複製し、「それ以降の日程はこちら」の直前へ追加する。
    // 複製直後はコピー元のアクションIDだが、保存後に必ず新規の不変アクションへ差し替える。
    await clickBlockToolbar(page, cards.last(), '複製');
    changed = true;
  }

  const finalCount = await (await flexCards(page)).count();
  if (finalCount !== desired.length) throw new Error(`日程ボタンの増減後が${finalCount}件（期待${desired.length}件）`);
  return changed;
}

async function updateFlex(
  page: Page,
  id: string,
  desired: SeminarSlot[],
  tags: DateTag[],
  apply: boolean,
  immutableActions: Map<number, ImmutableAction>,
): Promise<string> {
  const current = await readFlexState(page, id);
  for (const card of current) {
    if (!card.actionName.startsWith(IMMUTABLE_ACTION_PREFIX) || !card.actionId) continue;
    const dateTag = tags.find((tag) => card.tagIds.includes(tagId(tag)));
    if (!dateTag) continue;
    immutableActions.set(tagId(dateTag), {
      id: card.actionId,
      name: card.actionName,
      description: card.actionDescription,
      tagIds: card.tagIds,
    });
  }
  // 「残りN名」はテンプレートごとに意図した並びがあるため、日時だけを差し替えて保持する。
  const labels = desired.map((slot, index) => flexLabel(slot, current, index));
  const correct = current.length === desired.length && current.every((card, index) => {
    const tag = tagForSlot(tags, desired[index]);
    return card.label === labels[index]
      && !!tag
      && card.actionName === immutableActionName(desired[index])
      && card.tagIds.includes(tagId(tag))
      && card.tagIds.includes(ONE_TAP_TAG_ID);
  });
  if (correct) return '変更なし';
  if (!apply) return `${current.map((card) => card.label).join(' / ')} -> ${labels.join(' / ')}`;

  const structureChanged = await reconcileFlexBlocks(page, current, desired);
  if (structureChanged) {
    await page.getByText('メッセージを保存', { exact: false }).last().click();
    await wait(page, 2_500);
  }

  const sourceActionId = current.find((card) => card.actionId)?.actionId ?? 0;
  if (!sourceActionId) throw new Error(`テンプレート${id}: 新規アクションのコピー元がありません`);
  const assignments: FlexAssignment[] = [];
  for (let index = 0; index < desired.length; index += 1) {
    const nextTag = tagForSlot(tags, desired[index]);
    if (!nextTag) throw new Error(`テンプレート${id} ${index + 1}枚目: ${desired[index].tagName}が見つかりません`);
    const action = await immutableActionForSlot(
      page,
      desired[index],
      nextTag,
      sourceActionId,
      tags,
      immutableActions,
    );
    assignments.push({ actionId: action.id, actionDescription: action.description });
  }
  await patchFlexButtons(page, id, labels, assignments);
  const verified = await readFlexState(page, id);
  if (verified.length !== desired.length || !verified.every((card, index) => {
    const tag = tagForSlot(tags, desired[index]);
    return card.label === labels[index]
      && !!tag
      && card.actionId === assignments[index].actionId
      && card.actionName === immutableActionName(desired[index])
      && card.tagIds.includes(tagId(tag))
      && card.tagIds.includes(ONE_TAP_TAG_ID);
  })) throw new Error(`テンプレート${id}: 保存後検証に失敗しました`);
  return `${desired.length}枠を更新・新規アクションID検証済み`;
}

async function readDateTemplate(page: Page): Promise<string[]> {
  await goto(page, DATE_TEMPLATE_URL, 3_000);
  const values = await page.locator('[contenteditable="true"]').evaluateAll((elements) => elements.map((element) => (element.textContent ?? '').trim()));
  return values.filter((value) => DATE_LABEL_RE.test(value));
}

async function updateDateTemplate(
  page: Page,
  desired: SeminarSlot[],
  tags: DateTag[],
  apply: boolean,
  immutableActions: Map<number, ImmutableAction>,
): Promise<string> {
  return updateFlex(page, '268609107', desired, tags, apply, immutableActions);
}

function compactReminderLabel(slot: SeminarSlot): string {
  return `・${slot.month}/${slot.day}(${slot.weekday})${slot.hour}:00~`;
}

const REMINDER_DATE_LINE = '[ \\t]*・\\d{1,2}\\/\\d{1,2}\\([日月火水木金土]\\)[ \\t]*\\d{1,2}:00~[ \\t]*';
const REMINDER_DATE_BLOCK = new RegExp(`${REMINDER_DATE_LINE}(?:(?:\\r?\\n)+${REMINDER_DATE_LINE})*`, 'm');
const REMINDER_DATE_ONLY = /^・\d{1,2}\/\d{1,2}\([日月火水木金土]\)[ \t]*\d{1,2}:00~$/;

export function replaceReminderDateBlock(source: string, nextDates: string[]): string {
  const match = REMINDER_DATE_BLOCK.exec(source);
  if (!match || match.index === undefined) throw new Error('最終リマインドの日程ブロックを安全に置換できません');
  const separator = match[0].match(/~((?:\r?\n)+)[ \t]*・/)?.[1] ?? (match[0].includes('\r\n') ? '\r\n' : '\n');
  return `${source.slice(0, match.index)}${nextDates.join(separator)}${source.slice(match.index + match[0].length)}`;
}

async function reminderEditorText(editor: Locator): Promise<string> {
  return editor.evaluate((element) => (
    (element as HTMLTextAreaElement).value
    || (element as HTMLElement).innerText
    || element.textContent
    || ''
  ));
}

async function reminderEditor(page: Page): Promise<Locator> {
  await goto(page, REMINDER_TEMPLATE_URL, 3_000);
  const editors = page.locator('textarea,[contenteditable="true"]');
  for (let index = 0; index < await editors.count(); index += 1) {
    const editor = editors.nth(index);
    const value = await reminderEditorText(editor);
    if (/・\d{1,2}\/\d{1,2}\([日月火水木金土]\)/.test(value)) return editor;
  }
  throw new Error('最終リマインドの日程本文が見つかりません');
}

async function readReminderDates(page: Page): Promise<string[]> {
  const editor = await reminderEditor(page);
  const value = await reminderEditorText(editor);
  return value.match(/・\d{1,2}\/\d{1,2}\([日月火水木金土]\)\s*\d{1,2}:00~/g) ?? [];
}

async function updateReminder(page: Page, desired: SeminarSlot[], apply: boolean): Promise<string> {
  const editor = await reminderEditor(page);
  const currentText = await reminderEditorText(editor);
  const nextDates = desired.map(compactReminderLabel);
  const currentDates = currentText.match(/・\d{1,2}\/\d{1,2}\([日月火水木金土]\)[ \t]*\d{1,2}:00~/g) ?? [];
  if (JSON.stringify(currentDates) === JSON.stringify(nextDates)) return '変更なし';
  if (!apply) return `${currentDates.join(' / ')} -> ${nextDates.join(' / ')}`;
  const expectedText = replaceReminderDateBlock(currentText, nextDates);
  const dateParagraphs = editor.locator('p').filter({ hasText: REMINDER_DATE_ONLY });
  if (await dateParagraphs.count() !== nextDates.length) {
    throw new Error(`最終リマインドの日程行数が一致しません (現在${await dateParagraphs.count()}件 / 期待${nextDates.length}件)`);
  }
  for (let index = 0; index < nextDates.length; index += 1) {
    const paragraph = dateParagraphs.nth(index);
    await paragraph.evaluate((element) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.keyboard.insertText(nextDates[index]);
  }
  if (await reminderEditorText(editor) !== expectedText) throw new Error('日程以外の本文または改行が変化したため保存を中断しました');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await wait(page, 3_000);
  const verified = await readReminderDates(page);
  if (JSON.stringify(verified) !== JSON.stringify(nextDates)) throw new Error('最終リマインドの保存後検証に失敗しました');
  const persistedText = await reminderEditorText(await reminderEditor(page));
  if (persistedText !== expectedText) throw new Error('最終リマインドの本文または改行が保存後に変化しました');
  return `${nextDates.length}枠を更新・検証済み`;
}

async function snapshot(page: Page): Promise<SurfaceSnapshot> {
  const form = (await readFormState(page)).map((choice) => choice.label);
  const flex: SurfaceSnapshot['flex'] = {};
  for (const template of FLEX_TEMPLATES) flex[template.id] = await readFlexState(page, template.id);
  return {
    form,
    flex,
    dateTemplate: await readDateTemplate(page),
    reminder: await readReminderDates(page),
  };
}

export async function inspect(options: RunOptions = {}): Promise<RunResult> {
  return runSeminarSchedule({ ...options, apply: false });
}

export async function runSeminarSchedule(options: RunOptions = {}): Promise<RunResult> {
  const now = options.now ?? new Date();
  const apply = options.apply ?? false;
  const extraSlots = options.extraSlots ?? 0;
  const steps: StepResult[] = [];
  const issues: string[] = [];
  const {
    browser,
    context,
    page,
    statePath,
    storage,
    bucketName,
    objectName,
  } = await openBrowser();
  let activeStep = 'Lステップログイン・日程タグ';
  try {
    let tags = await readDateTags(page);
    steps.push({ step: 'Lステップログイン・日程タグ', status: 'ok', detail: `${tags.length}件を取得` });
    const desiredForm = upcomingSlots(now, FORM_COUNT + extraSlots);
    for (const slot of desiredForm) {
      let tag = tagForSlot(tags, slot);
      if (!tag) {
        if (!apply) {
          steps.push({ step: `タグ ${slot.tagName}`, status: 'ok', detail: '要作成' });
          continue;
        }
        tag = await createTag(page, slot, tags);
        tags = [...tags, tag];
        steps.push({ step: `タグ ${slot.tagName}`, status: 'ok', detail: '作成・アクション検証済み' });
      }
      let tagIssues = assertTagSummary(slot, tag);
      if (tagIssues.length && apply) {
        tag = await configureTag(page, slot, tag);
        tags = tags.map((current) => current.href === tag?.href ? tag : current);
        tagIssues = assertTagSummary(slot, tag);
        steps.push({ step: `タグ ${slot.tagName}`, status: 'ok', detail: '既存設定を修正・検証済み' });
      }
      issues.push(...tagIssues);
    }
    if (issues.length) throw new Error(`タグ設定に異常があります: ${issues.join(' / ')}`);

    activeStep = 'セミナー申込フォーム';
    steps.push({ step: activeStep, status: 'ok', detail: await updateForm(page, desiredForm, tags, apply) });
    const immutableActions = new Map<number, ImmutableAction>();
    for (const template of FLEX_TEMPLATES) {
      activeStep = `ワンタップ ${template.label}`;
      const desiredFlex = 'startsTomorrow' in template
        ? slotsFromTomorrow(now, template.count + extraSlots)
        : upcomingSlots(
          now,
          template.count + extraSlots,
          'minimumLeadMinutes' in template
            ? { minimumLeadMinutes: template.minimumLeadMinutes }
            : undefined,
        );
      steps.push({
        step: activeStep,
        status: 'ok',
        detail: await updateFlex(page, template.id, desiredFlex, tags, apply, immutableActions),
      });
    }
    activeStep = 'セミナー日程選択テンプレート';
    steps.push({
      step: activeStep,
      status: 'ok',
      detail: await updateDateTemplate(
        page,
        upcomingSlots(now, DATE_TEMPLATE_COUNT + extraSlots),
        tags,
        apply,
        immutableActions,
      ),
    });
    activeStep = '最終リマインド';
    steps.push({ step: activeStep, status: 'ok', detail: await updateReminder(page, upcomingSlots(now, REMINDER_COUNT + extraSlots), apply) });

    if (apply) {
      activeStep = '全画面再読込検証';
      const after = await snapshot(page);
      steps.push({
        step: '全画面再読込検証',
        status: 'ok',
        detail: `フォーム${after.form.length}件・ワンタップ${Object.values(after.flex).reduce((sum, cards) => sum + cards.length, 0)}件・日程選択${after.dateTemplate.length}件・最終リマインド本文の日程${after.reminder.length}枠`,
      });
    }
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    const message = `${activeStep}: ${cause}`;
    steps.push({ step: '処理中断', status: 'failed', detail: message });
    issues.push(message);
  } finally {
    if (await hasAuthenticatedSession(page)) {
      await context.storageState({ path: statePath });
      await uploadFileToGcs(storage, bucketName, statePath, objectName, 'application/json');
    }
    await browser.close();
  }
  return { ranAt: now.toISOString(), mode: apply ? 'apply' : 'dry-run', steps, issues };
}

export function formatResult(result: RunResult): string {
  const lines = [`[${result.mode}] ${result.ranAt}`];
  for (const step of result.steps) {
    const mark = step.status === 'ok' ? 'OK' : step.status === 'skipped' ? 'SKIP' : 'FAIL';
    lines.push(`[${mark}] ${step.step}: ${step.detail}`);
  }
  if (result.issues.length) lines.push(...result.issues.map((issue) => `!! ${issue}`));
  return lines.join('\n');
}
