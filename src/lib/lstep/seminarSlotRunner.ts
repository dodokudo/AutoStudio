import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { Storage } from '@google-cloud/storage';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadLstepConfig } from './config';
import { downloadObjectToFile } from './gcs';
import {
  choiceLabelWithCapacity,
  upcomingSlots,
  type SeminarSlot,
} from './seminarSchedule';

const BASE = 'https://manager.linestep.net';
const TAG_LIST_URL = `${BASE}/line/tag`;
const APPLY_FORM_URL = `${BASE}/lvf/edit/1084212?group=216354`;
const DATE_TEMPLATE_URL = `${BASE}/line/template/edit_v3/268609107?editMessage=1`;
const REMINDER_TEMPLATE_URL = `${BASE}/line/template/edit/268822941?group=1020108`;
const FLEX_TEMPLATES = [
  { id: '268607623', label: '2日後07:08' },
  { id: '268607783', label: '2日後20:58' },
  { id: '268607893', label: '4日後06:58' },
  { id: '268608033', label: '4日後23:00' },
] as const;
const FORM_COUNT = 10;
const FLEX_COUNT = 4;
const DATE_TEMPLATE_COUNT = 4;
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
  flex: Record<string, Array<{ label: string; action: string }>>;
  dateTemplate: string[];
  reminder: string[];
}

export interface RunOptions {
  now?: Date;
  apply?: boolean;
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

async function openBrowser(): Promise<{ browser: Browser; page: Page }> {
  const config = loadLstepConfig();
  const dir = await mkdtemp(join(tmpdir(), 'lstep-seminar-'));
  const statePath = join(dir, 'storage-state.json');
  const downloaded = await downloadObjectToFile(new Storage(), config.gcsBucket, config.storageStateObject, statePath);
  if (!downloaded) throw new Error('保存済みLステップセッションをGCSから取得できませんでした');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: statePath, viewport: { width: 1600, height: 1400 } });
  return { browser, page: await context.newPage() };
}

async function goto(page: Page, url: string, delay = 2_500): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await wait(page, delay);
  if (/login/i.test(page.url())) throw new Error('Lステップのログインセッションが切れています');
}

async function openTagGroup(page: Page): Promise<void> {
  await goto(page, TAG_LIST_URL);
  await page.locator('text=/回答フォーム\s*用日程/').first().click();
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
  const source = tags
    .filter((tag) => tag.name.endsWith(`${slot.hour}時`) || tag.name.endsWith(`${slot.hour}`))
    .sort((a, b) => b.name.localeCompare(a.name, 'ja'))[0];
  if (!source) throw new Error(`${slot.hour}時タグのコピー元がありません`);

  await openTagGroup(page);
  const row = page.locator('tr').filter({ has: page.locator(`a[href="${source.href}"]`) }).first();
  await row.getByText('more_vert', { exact: true }).click();
  await (await visibleExact(page, 'コピーを作成')).click();
  const copyDialog = page.locator('[role="dialog"],.modal').filter({ hasText: 'コピー' }).last();
  const nameInput = await inputMatching(copyDialog, /./);
  await nameInput.fill(slot.tagName);
  await copyDialog.getByRole('button', { name: 'コピー', exact: true }).click();
  await wait(page, 2_500);

  let refreshed = await readDateTags(page);
  const created = tagForSlot(refreshed, slot);
  if (!created) throw new Error(`${slot.tagName} のコピー作成を確認できませんでした`);
  await goto(page, `${BASE}${created.href}`);
  await page.getByText('アクション設定', { exact: false }).first().click();
  await wait(page, 1_500);
  const dialog = page.locator('[role="dialog"],.modal').last();
  const friendInput = await inputMatching(dialog, /^\d{1,2}\/\d{1,2}\(.\)\s*\d{1,2}:00~$/);
  await friendInput.fill(slot.applicationValue.replace(') ', ')'));
  await dialog.getByPlaceholder('日付選択').fill(`${slot.year}/${String(slot.month).padStart(2, '0')}/${String(slot.day).padStart(2, '0')}`);
  const timeInput = await inputMatching(dialog, /^\d{2}:\d{2}$/);
  await timeInput.fill('22:00');
  await dialog.getByText('この条件で決定する', { exact: false }).click();
  await wait(page, 1_000);
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await wait(page, 2_500);
  refreshed = await readDateTags(page);
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

async function updateForm(page: Page, desired: SeminarSlot[], tags: DateTag[], apply: boolean): Promise<string> {
  const current = await readFormState(page);
  const currentLabels = current.map((choice) => choice.label);
  const desiredLabels = desired.map((slot) => slot.choiceLabel);
  if (JSON.stringify(currentLabels) === JSON.stringify(desiredLabels)) return '変更なし';
  if (!apply) return `${currentLabels.join(' / ')} -> ${desiredLabels.join(' / ')}`;

  const radio = page.locator('#radio_3');
  let panels = radio.locator('[data-testid^="choice_"]:visible');
  const missing = desired.filter((slot) => !currentLabels.includes(slot.choiceLabel));
  for (const slot of missing) {
    const last = panels.last();
    // 操作ボタンはhover時のみ表示されるため force でクリックする
    await last.locator('.lvitem-copy').click({ force: true });
    await wait(page, 1_500);
    panels = radio.locator('[data-testid^="choice_"]:visible');
    const target = panels.last();
    const tag = tagForSlot(tags, slot);
    if (!tag) throw new Error(`${slot.tagName} がないためフォームへ追加できません`);
    await configureFormPanel(page, target, slot, tag);
  }
  panels = radio.locator('[data-testid^="choice_"]:visible');
  for (let index = (await panels.count()) - 1; index >= 0; index -= 1) {
    const panel = panels.nth(index);
    const label = await panel.locator('input[data-testid="labelInput"]').inputValue();
    if (DATE_LABEL_RE.test(label) && !desiredLabels.includes(label)) {
      await panel.locator('.lvitem-remove').click({ force: true });
      await wait(page, 500);
      const confirm = page.getByRole('button', { name: /削除|OK|はい/, exact: true });
      if (await confirm.last().isVisible().catch(() => false) && await confirm.last().isEnabled().catch(() => false)) await confirm.last().click();
    }
  }
  await page.locator('#lvbuildsave').click();
  await wait(page, 3_000);
  const verified = await readFormState(page);
  const labels = verified.map((choice) => choice.label);
  if (JSON.stringify(labels) !== JSON.stringify(desiredLabels)) throw new Error(`フォーム検証失敗: ${labels.join(' / ')}`);
  for (let index = 0; index < desired.length; index += 1) {
    const tag = tagForSlot(tags, desired[index]);
    const action = verified[index]?.action ?? '';
    if (!tag || !action.includes(`タグ[${tag.name}]`) || !action.includes(desired[index].applicationValue)) {
      throw new Error(`${desired[index].choiceLabel}: フォームのアクション検証に失敗しました`);
    }
  }
  return `${currentLabels.length}件を${desiredLabels.length}件へ更新・検証済み`;
}

function capacityLabel(slot: SeminarSlot, tags: DateTag[]): string {
  return choiceLabelWithCapacity(slot, tagForSlot(tags, slot)?.memberCount ?? 0);
}

type FlexResource = {
  name: string;
  group: number;
  alt_text?: string;
  editor_json: { panels: Array<{ blocks?: Array<Record<string, unknown>> }> } | string;
};

async function parseFlexResponse(response: Awaited<ReturnType<Page['request']['get']>>, context: string): Promise<FlexResource> {
  const body = await response.text();
  try {
    return JSON.parse(body) as FlexResource;
  } catch {
    throw new Error(`${context}: JSONではない応答 (${response.status()} ${body.slice(0, 120)})`);
  }
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

async function patchFlexLabels(page: Page, id: string, labels: string[]): Promise<void> {
  const endpoint = `${BASE}/api/template/lflexes/${id}`;
  const response = await page.request.get(endpoint);
  if (!response.ok()) throw new Error(`Flex ${id} の取得に失敗しました (${response.status()})`);
  const resource = await parseFlexResponse(response, `Flex ${id} 取得`);
  const editor: Exclude<FlexResource['editor_json'], string> = typeof resource.editor_json === 'string' ? JSON.parse(resource.editor_json) : resource.editor_json;
  const blocks = editor.panels.flatMap((panel) => panel.blocks ?? []);
  const dateBlocks = blocks.filter((block) => DATE_LABEL_RE.test(textFromDoc(block.text)));
  if (dateBlocks.length !== labels.length) throw new Error(`Flex ${id} の日程ブロックが${dateBlocks.length}件（期待${labels.length}件）`);
  dateBlocks.forEach((block, index) => replaceDocText(block.text, labels[index]));
  const saved = await page.request.post(endpoint, {
    data: {
      _method: 'patch',
      name: resource.name,
      group: resource.group,
      alt_text: resource.alt_text,
      editor_json: JSON.stringify(editor),
    },
  });
  if (!saved.ok()) throw new Error(`Flex ${id} の保存に失敗しました (${saved.status()} ${await saved.text()})`);
  const verify = await page.request.get(endpoint);
  const verifiedResource = await parseFlexResponse(verify, `Flex ${id} 保存後取得`);
  const verifiedEditor: Exclude<FlexResource['editor_json'], string> = typeof verifiedResource.editor_json === 'string' ? JSON.parse(verifiedResource.editor_json) : verifiedResource.editor_json;
  const verifiedLabels = verifiedEditor.panels.flatMap((panel) => panel.blocks ?? []).map((block) => textFromDoc(block.text)).filter((text) => DATE_LABEL_RE.test(text));
  if (JSON.stringify(verifiedLabels) !== JSON.stringify(labels)) throw new Error(`Flex ${id} のAPI保存後検証に失敗しました`);
}

async function flexCards(page: Page): Promise<Locator> {
  const dateEditor = page.locator('[contenteditable="true"]').filter({ hasText: DATE_LABEL_RE });
  return page.locator('.list_item_component').filter({ has: dateEditor });
}

async function readFlexState(page: Page, id: string): Promise<Array<{ label: string; action: string }>> {
  await goto(page, `${BASE}/line/template/edit_v3/${id}?editMessage=1`, 3_000);
  const cards = await (await flexCards(page)).evaluateAll((elements) => elements.map((element) => ({
    label: (element.querySelector('[contenteditable="true"]')?.textContent ?? '').trim(),
    action: (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
  })));
  return cards.filter((card) => DATE_LABEL_RE.test(card.label));
}

async function updateFlex(page: Page, id: string, desired: SeminarSlot[], tags: DateTag[], apply: boolean): Promise<string> {
  const current = await readFlexState(page, id);
  const labels = desired.map((slot) => capacityLabel(slot, tags));
  const correct = current.length === desired.length && current.every((card, index) => {
    const tag = tagForSlot(tags, desired[index]);
    return card.label === labels[index] && !!tag && card.action.includes(`タグ[${tag.name}]`);
  });
  if (correct) return '変更なし';
  if (!apply) return `${current.map((card) => card.label).join(' / ')} -> ${labels.join(' / ')}`;
  if (current.length !== desired.length) throw new Error(`テンプレート${id}: 日程ボタンが${current.length}件（期待${desired.length}件）`);

  const cards = await flexCards(page);
  let actionChanged = false;
  for (let index = 0; index < desired.length; index += 1) {
    const card = cards.filter({ has: page.locator('[contenteditable="true"]') }).nth(index);
    const currentAction = (await card.innerText()).replace(/\s+/g, ' ');
    const currentTag = currentAction.match(/タグ\[([^\]]+)\]\s*\[【2026\.7】セミナー申/)?.[1];
    const nextTag = tagForSlot(tags, desired[index]);
    if (!currentTag || !nextTag) throw new Error(`テンプレート${id} ${index + 1}枚目: 日付タグを特定できません (${currentAction.slice(0, 420)})`);
    if (currentTag !== nextTag.name) {
      await card.getByText('アクション設定', { exact: true }).click();
      await wait(page, 700);
      const outer = page.locator('[role="dialog"],.modal').filter({ hasText: '選択肢アクションに有効期限' }).last();
      await outer.getByRole('button', { name: /アクション設定/ }).click();
      await wait(page, 1_200);
      const inner = page.locator('[role="dialog"],.modal').last();
      await chooseTag(inner, page, currentTag, nextTag.name);
      await inner.getByText('この条件で決定する', { exact: false }).click();
      await wait(page, 700);
      await outer.getByRole('button', { name: '保存する', exact: true }).click();
      await wait(page, 700);
      actionChanged = true;
    }
  }
  if (actionChanged) {
    await page.getByText('メッセージを保存', { exact: false }).last().click();
    await wait(page, 2_500);
  }
  await patchFlexLabels(page, id, labels);
  const verified = await readFlexState(page, id);
  if (verified.length !== desired.length || !verified.every((card, index) => {
    const tag = tagForSlot(tags, desired[index]);
    return card.label === labels[index] && !!tag && card.action.includes(`タグ[${tag.name}]`);
  })) throw new Error(`テンプレート${id}: 保存後検証に失敗しました`);
  return `${desired.length}枠を更新・アクション検証済み`;
}

async function readDateTemplate(page: Page): Promise<string[]> {
  await goto(page, DATE_TEMPLATE_URL, 3_000);
  const values = await page.locator('[contenteditable="true"]').evaluateAll((elements) => elements.map((element) => (element.textContent ?? '').trim()));
  return values.filter((value) => DATE_LABEL_RE.test(value));
}

async function updateDateTemplate(page: Page, desired: SeminarSlot[], tags: DateTag[], apply: boolean): Promise<string> {
  const current = await readDateTemplate(page);
  const labels = desired.map((slot) => capacityLabel(slot, tags));
  if (JSON.stringify(current) === JSON.stringify(labels)) return '変更なし';
  if (!apply) return `${current.join(' / ')} -> ${labels.join(' / ')}`;
  await patchFlexLabels(page, '268609107', labels);
  const verified = await readDateTemplate(page);
  if (JSON.stringify(verified) !== JSON.stringify(labels)) throw new Error('日程選択テンプレートの保存後検証に失敗しました');
  return `${labels.length}枠を更新・検証済み`;
}

function compactReminderLabel(slot: SeminarSlot): string {
  return `・${slot.month}/${slot.day}(${slot.weekday})${slot.hour}:00~`;
}

async function reminderEditor(page: Page): Promise<Locator> {
  await goto(page, REMINDER_TEMPLATE_URL, 3_000);
  const editors = page.locator('textarea,[contenteditable="true"]');
  for (let index = 0; index < await editors.count(); index += 1) {
    const editor = editors.nth(index);
    const value = await editor.evaluate((element) => (element as HTMLTextAreaElement).value || element.textContent || '');
    if (/・\d{1,2}\/\d{1,2}\([日月火水木金土]\)/.test(value)) return editor;
  }
  throw new Error('最終リマインドの日程本文が見つかりません');
}

async function readReminderDates(page: Page): Promise<string[]> {
  const editor = await reminderEditor(page);
  const value = await editor.evaluate((element) => (element as HTMLTextAreaElement).value || element.textContent || '');
  return value.match(/・\d{1,2}\/\d{1,2}\([日月火水木金土]\)\s*\d{1,2}:00~/g) ?? [];
}

async function updateReminder(page: Page, desired: SeminarSlot[], apply: boolean): Promise<string> {
  const editor = await reminderEditor(page);
  const currentValue = await editor.evaluate((element) => (element as HTMLTextAreaElement).value || element.textContent || '');
  const nextDates = desired.map(compactReminderLabel);
  const currentDates = currentValue.match(/・\d{1,2}\/\d{1,2}\([日月火水木金土]\)\s*\d{1,2}:00~/g) ?? [];
  if (JSON.stringify(currentDates) === JSON.stringify(nextDates)) return '変更なし';
  if (!apply) return `${currentDates.join(' / ')} -> ${nextDates.join(' / ')}`;
  const block = /(?:・\d{1,2}\/\d{1,2}\([日月火水木金土]\)\s*\d{1,2}:00~\s*)+/;
  if (!block.test(currentValue)) throw new Error('最終リマインドの日程ブロックを安全に置換できません');
  await editor.fill(currentValue.replace(block, `${nextDates.join('\n')}\n`));
  const save = page.getByRole('button', { name: /保存|更新/, exact: true });
  if (await save.count()) await save.last().click();
  else await page.getByText(/保存|更新/, { exact: true }).last().click();
  await wait(page, 3_000);
  const verified = await readReminderDates(page);
  if (JSON.stringify(verified) !== JSON.stringify(nextDates)) throw new Error('最終リマインドの保存後検証に失敗しました');
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
  const steps: StepResult[] = [];
  const issues: string[] = [];
  const { browser, page } = await openBrowser();
  try {
    let tags = await readDateTags(page);
    steps.push({ step: 'Lステップログイン・日程タグ', status: 'ok', detail: `${tags.length}件を取得` });
    const desiredForm = upcomingSlots(now, FORM_COUNT);
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
      issues.push(...assertTagSummary(slot, tag));
    }
    if (issues.length) throw new Error(`タグ設定に異常があります: ${issues.join(' / ')}`);

    steps.push({ step: 'セミナー申込フォーム', status: 'ok', detail: await updateForm(page, desiredForm, tags, apply) });
    const desiredFlex = upcomingSlots(now, FLEX_COUNT);
    for (const template of FLEX_TEMPLATES) {
      steps.push({ step: `ワンタップ ${template.label}`, status: 'ok', detail: await updateFlex(page, template.id, desiredFlex, tags, apply) });
    }
    steps.push({ step: 'セミナー日程選択テンプレート', status: 'ok', detail: await updateDateTemplate(page, upcomingSlots(now, DATE_TEMPLATE_COUNT), tags, apply) });
    steps.push({ step: '最終リマインド', status: 'ok', detail: await updateReminder(page, upcomingSlots(now, REMINDER_COUNT), apply) });

    if (apply) {
      const after = await snapshot(page);
      steps.push({
        step: '全画面再読込検証',
        status: 'ok',
        detail: `フォーム${after.form.length}件・ワンタップ${Object.values(after.flex).reduce((sum, cards) => sum + cards.length, 0)}件・日程選択${after.dateTemplate.length}件・リマインド${after.reminder.length}件`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    steps.push({ step: '処理中断', status: 'failed', detail: message });
    issues.push(message);
  } finally {
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
