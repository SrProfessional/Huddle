// Huddle: the pure progress core (docs/design.md §12). No network: milestones and their Issues go in, numbers and text come out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKER, areaOf, bar, findProgressIssue, issueBody, noAreaCount, percentOf, progressOf, remainingOf, summaryLine, tableText, windowStart } from '../../lib/core/progress.mjs';

const open = (number) => ({ number, open: true, merged: false });
const merged = (number) => ({ number, open: false, merged: true });
const byHand = (number) => ({ number, open: false, merged: false });
const ms = (title, description, issues, extra = {}) => ({ title, description, state: 'open', closedAt: null, issues, ...extra });

// --- the «Huddle remaining: N» line --------------------------------------------------------------------------------------------------

test('remaining line: present, on a line of its own, anywhere in the description', () => {
  assert.deepEqual(remainingOf('Huddle remaining: 4'), { remaining: 4, missing: false, malformed: false });
  assert.equal(remainingOf('Content area.\n\nHuddle remaining: 12\n\nMore text.').remaining, 12);
  assert.equal(remainingOf('x\r\nHuddle remaining:   3  \r\ny').remaining, 3, 'CRLF and spaces are fine');
  assert.equal(remainingOf('Huddle remaining: 0').remaining, 0);
  assert.equal(remainingOf('Huddle remaining: 0').missing, false, 'an explicit 0 is an estimate');
  assert.equal(remainingOf('Huddle remaining: 2\nHuddle remaining: 9').remaining, 2, 'the first line wins');
});

test('remaining line: missing means 0 and says the estimate is missing', () => {
  for (const text of ['', null, undefined, 'Just a description.', 'We have Huddle remaining: 4 in this sentence']) {
    assert.deepEqual(remainingOf(text), { remaining: 0, missing: true, malformed: false }, String(text));
  }
});

test('remaining line: malformed means 0, estimate missing, and it is flagged', () => {
  for (const text of ['Huddle remaining: four', 'Huddle remaining: -2', 'Huddle remaining: 4 or 5', 'Huddle remaining:', 'Huddle remaining: 2.5']) {
    assert.deepEqual(remainingOf(text), { remaining: 0, missing: true, malformed: true }, text);
  }
});

// --- one area -----------------------------------------------------------------------------------------------------------------------

test('area: merged, open and the estimate give merged / (total + remaining)', () => {
  const a = areaOf(ms('Content', 'Huddle remaining: 2', [merged(1), merged(2), merged(3), open(4), open(5)]));
  assert.deepEqual(a, { title: 'Content', state: 'open', merged: 3, total: 5, remaining: 2, percent: 42, estimateMissing: false, malformed: false });
});

test('area: an Issue closed «not planned» or by hand counts in neither part', () => {
  const a = areaOf(ms('Ads', 'Huddle remaining: 0', [merged(1), byHand(2), byHand(3), open(4)]));
  assert.equal(a.merged, 1);
  assert.equal(a.total, 2, 'one merged and one open; the two hand-closed are left out');
  assert.equal(a.percent, 50);
});

test('area: no remaining line is remaining 0 and the estimate is reported missing', () => {
  const a = areaOf(ms('Ads', '', [merged(1), open(2)]));
  assert.deepEqual([a.remaining, a.estimateMissing, a.percent], [0, true, 50]);
});

test('area: 0 ÷ 0 is null (shown as «—»), never NaN', () => {
  const a = areaOf(ms('Empty', 'Huddle remaining: 0', []));
  assert.equal(a.percent, null);
  assert.equal(areaOf(ms('OnlyHandClosed', '', [byHand(1)])).percent, null);
  assert.equal(percentOf(0, 0), null);
  assert.ok(!JSON.stringify(a).includes('NaN'));
});

test('percent rounds down, never up', () => {
  assert.equal(percentOf(1, 3), 33);
  assert.equal(percentOf(2, 3), 66);
  assert.equal(percentOf(199, 200), 99);
  assert.equal(percentOf(29, 100), 29, 'no float surprise at 0.29');
  assert.equal(percentOf(3, 3), 100);
  assert.equal(percentOf(0, 5), 0);
});

// --- the whole project --------------------------------------------------------------------------------------------------------------

test('total is the sum of merged over the sum of (total + remaining), not the mean of the percents', () => {
  const r = progressOf({
    milestones: [
      ms('Content', 'Huddle remaining: 2', [merged(1), merged(2), merged(3), open(4), open(5)]), // 3 / 7
      ms('Social', 'Huddle remaining: 0', [merged(6)]), // 1 / 1
    ],
  });
  assert.deepEqual(r.total, { merged: 4, total: 6, remaining: 2, percent: 50 });
  assert.deepEqual(r.areas.map((a) => [a.title, a.percent]), [['Content', 42], ['Social', 100]]);
});

test('total with nothing to count is null, not NaN', () => {
  const r = progressOf({ milestones: [ms('A', '', []), ms('B', '', [byHand(1)])] });
  assert.equal(r.total.percent, null);
  assert.equal(progressOf({ milestones: [] }).total.percent, null);
});

test('no area: Issues without a milestone are counted apart and left out of the percent; the progress Issue is not one of them', () => {
  const issues = [
    { number: 1, milestone: null, body: 'x' },
    { number: 2, milestone: 'Content', body: 'x' },
    { number: 3, milestone: null, body: `${MARKER}\n# Huddle progress` },
    { number: 4, body: 'x' },
  ];
  assert.equal(noAreaCount(issues), 2);
  const r = progressOf({ milestones: [ms('Content', '', [merged(2)])], noArea: noAreaCount(issues) });
  assert.equal(r.noArea, 2);
  assert.equal(r.total.percent, 100, 'the Issues with no area change nothing');
});

test('windowStart is 90 days before now', () => {
  assert.equal(windowStart(new Date('2026-11-06T12:00:00Z')), '2026-08-08T12:00:00.000Z');
});

// --- text ---------------------------------------------------------------------------------------------------------------------------

test('bar: ten cells, filled by tens, empty for «—»', () => {
  assert.equal(bar(0), '[..........]');
  assert.equal(bar(42), '[####......]');
  assert.equal(bar(100), '[##########]');
  assert.equal(bar(null), '[..........]');
});

const sample = progressOf({
  milestones: [
    ms('Content', 'Huddle remaining: 2', [merged(1), merged(2), merged(3), open(4), open(5)]),
    ms('Ads', '', []),
  ],
  noArea: 3,
});

test('table: area, merged/total +remaining, percent, bar, the total, the no-area line and the missing estimates', () => {
  const t = tableText(sample);
  assert.match(t, /Content\s+3\/5 \+2\s+42%\s+\[####\.\.\.\.\.\.\]/);
  assert.match(t, /Ads\s+0\/0 \+0\s+—\s+\[\.\.\.\.\.\.\.\.\.\.\]/);
  assert.match(t, /Total\s+3\/5 \+2\s+42%/);
  assert.match(t, /No area: 3 open Issues without a milestone/);
  assert.match(t, /Estimate missing.*Ads/s);
  assert.ok(!t.includes('NaN'));
});

test('table: no milestones says so', () => {
  assert.match(tableText(progressOf({ milestones: [] })), /No milestones/);
});

test('summary line: one line, areas then the total, «—» when it cannot be computed', () => {
  assert.equal(summaryLine(sample), 'Progress: Content 42% · Ads — · Total 42%');
  assert.equal(summaryLine(progressOf({ milestones: [] })), null, 'no milestones: no line');
});

// --- the progress Issue -------------------------------------------------------------------------------------------------------------

test('issue body starts with the marker, is stable for the same data, and changes when the data does', () => {
  const body = issueBody(sample);
  assert.ok(body.startsWith(`${MARKER}\n`));
  assert.match(body, /Content/);
  assert.equal(issueBody(sample), body);
  const other = progressOf({ milestones: [ms('Content', 'Huddle remaining: 2', [merged(1), open(2)])] });
  assert.notEqual(issueBody(other), body);
  assert.ok(!/^## Depends on/mi.test(body), 'no «Depends on»: the labels logic ignores it');
});

test('findProgressIssue finds it by the marker in the body, never by the title', () => {
  const issues = [
    { number: 1, title: 'Huddle progress', body: 'someone else wrote this title' },
    { number: 2, title: 'Totally other title', body: `${MARKER}\nold text` },
  ];
  assert.equal(findProgressIssue(issues).number, 2);
  assert.equal(findProgressIssue([issues[0]]), null);
});
