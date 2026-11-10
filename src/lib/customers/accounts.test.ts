import assert from 'node:assert/strict';
import test from 'node:test';
import { snsAccounts, parseAccountAnswers, matchAccountAnswer, type AccountAnswer } from './accounts';

test('preserves bare handles, @handles with queries, and multiple answers', () => {
  assert.equal(snsAccounts('', 'nakamura_nkshinkyuseitai')[0].id, '@nakamura_nkshinkyuseitai');
  assert.equal(snsAccounts('', '@yoshiko_mind_trainer?hl=ja')[0].id, '@yoshiko_mind_trainer');
  assert.deepEqual(snsAccounts('', 'matsui_mie  , harmonylife.iki').map((a) => a.id), ['@matsui_mie', '@harmonylife.iki']);
  assert.ok(snsAccounts('', 'example_handle').every((a) => !a.url), 'Do not invent a platform from a handle');
});

test('keeps free text and explicit no-account answers visible without unsafe links', () => {
  for (const answer of ['きら', 'なし', 'たくさんあります', 'minori_marke_51他3つあります…', 'javascript:alert(1)']) {
    const account = snsAccounts('', answer)[0];
    assert.equal(account.name, answer);
    assert.equal(account.url, undefined);
  }
  assert.deepEqual(snsAccounts('', ''), []);
});

test('recognizes profile URLs with or without scheme, but not post URLs as handles', () => {
  assert.equal(snsAccounts('名前', 'www.threads.com/@example?xmt=abc')[0].id, '@example');
  assert.equal(snsAccounts('', 'https://www.instagram.com/reel/abc')[0].id, undefined);
});

const answer: AccountAnswer = { respondentId: '123', email: 'one@example.com', name: '山田 花子', lineName: 'はな', answer: 'hana' };
const member = { elmeId: '123', email: '', name: '', lineName: '' };
test('matches by respondent ID, unique email, or both legal name and LINE name', () => {
  assert.equal(matchAccountAnswer(member, [answer]), answer);
  assert.equal(matchAccountAnswer({ ...member, elmeId: '', email: 'ONE@example.com' }, [answer]), answer);
  assert.equal(matchAccountAnswer({ ...member, elmeId: '', name: '山田花子', lineName: 'はな' }, [answer]), answer);
  assert.equal(matchAccountAnswer({ ...member, elmeId: '', name: '山田花子' }, [answer]), undefined);
  assert.equal(matchAccountAnswer({ ...member, elmeId: '', lineName: 'はな' }, [answer]), undefined);
});

test('rejects shared emails and conflicting IDs instead of attaching another customer', () => {
  const other = { ...answer, respondentId: '456', answer: 'other' };
  assert.equal(matchAccountAnswer({ ...member, elmeId: '', email: answer.email }, [answer, other]), undefined);
  assert.equal(matchAccountAnswer({ ...member, elmeId: '999', email: answer.email }, [answer]), undefined);
  assert.equal(matchAccountAnswer(member, [answer, { ...answer, name: '別人' }]), undefined);
});

test('reads SNS by its form heading and fails visibly if the column disappears', () => {
  const headers = ['LINE名', '回答者ID', 'メールアドレスを入力してください', 'お名前を入力してください', 'ThreadsまたはInstagramのアカウント（まだない場合は「なし」と記載してください）'];
  assert.deepEqual(parseAccountAnswers([headers, ['はな', '123', 'ONE@example.com', '山田 花子', 'hana']]), [answer]);
  assert.throws(() => parseAccountAnswers([headers.slice(0, 4)]));
});
