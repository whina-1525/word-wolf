import assert from 'node:assert/strict'
import { BANNED_FRAGMENTS, PAIRS } from './pairs'
import {
  assignWords,
  cleanWord,
  containsBanned,
  pickPair,
  resolveVotes,
} from './logic'

const pair = { id: 'x', a: 'スマホ', b: 'テレビ' }

function sequence(values: number[]) {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)]
}

assert.equal(PAIRS.length, 100)
const words = new Set<string>()
for (const item of PAIRS) {
  assert.notEqual(item.a, item.b)
  assert.equal(words.has(item.a), false)
  assert.equal(words.has(item.b), false)
  words.add(item.a)
  words.add(item.b)
  assert.equal(containsBanned(item.a), false, item.a)
  assert.equal(containsBanned(item.b), false, item.b)
}
assert.equal(new Set(PAIRS.map((item) => item.id)).size, 100)
for (const fragment of BANNED_FRAGMENTS) assert.equal(containsBanned(fragment), true)

const picked = pickPair(PAIRS, [], ['p001'], () => 0)
assert.notEqual(picked.id, 'p001')
const onlyRecent = pickPair([{ id: 'c1', a: '左', b: '右' }], [], ['c1'], () => 0)
assert.equal(onlyRecent.id, 'c1')

const deal = assignWords(pair, ['a', 'b', 'c'], sequence([0.1, 0]))
assert.equal(deal.wolfUid, 'a')
assert.equal(deal.wolfWord, 'スマホ')
assert.equal(deal.citizenWord, 'テレビ')
assert.equal(deal.hands.a, 'スマホ')
assert.equal(deal.hands.b, 'テレビ')
assert.equal(deal.hands.c, 'テレビ')

const otherSide = assignWords(pair, ['a', 'b', 'c'], sequence([0.8, 0.9]))
assert.equal(otherSide.wolfWord, 'テレビ')
assert.equal(otherSide.wolfUid, 'c')

assert.equal(
  resolveVotes({
    aliveUids: ['a', 'b', 'c'],
    wolfUid: 'a',
    ballots: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ],
    skipped: [],
  }).kind,
  'waiting',
)

const citizenWin = resolveVotes({
  aliveUids: ['a', 'b', 'c'],
  wolfUid: 'a',
  ballots: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'a' },
    { from: 'c', to: 'a' },
  ],
  skipped: [],
})
assert.equal(citizenWin.kind, 'eliminate')
if (citizenWin.kind === 'eliminate') {
  assert.equal(citizenWin.eliminatedUid, 'a')
  assert.equal(citizenWin.winner, 'citizen')
}

const wolfWin = resolveVotes({
  aliveUids: ['a', 'b', 'c'],
  wolfUid: 'a',
  ballots: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'b' },
  ],
  skipped: [],
})
assert.equal(wolfWin.kind, 'eliminate')
if (wolfWin.kind === 'eliminate') {
  assert.equal(wolfWin.eliminatedUid, 'b')
  assert.equal(wolfWin.winner, 'wolf')
  assert.deepEqual(wolfWin.aliveAfter, ['a', 'c'])
}

const continueGame = resolveVotes({
  aliveUids: ['a', 'b', 'c', 'd'],
  wolfUid: 'a',
  ballots: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'b' },
    { from: 'd', to: 'b' },
  ],
  skipped: [],
})
assert.equal(continueGame.kind, 'eliminate')
if (continueGame.kind === 'eliminate') assert.equal(continueGame.winner, null)

const tie = resolveVotes({
  aliveUids: ['a', 'b', 'c'],
  wolfUid: 'a',
  ballots: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'a' },
  ],
  skipped: [],
})
assert.equal(tie.kind, 'tie')

const skipped = resolveVotes({
  aliveUids: ['a', 'b', 'c'],
  wolfUid: 'c',
  ballots: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'a' },
  ],
  skipped: ['c'],
})
assert.equal(skipped.kind, 'tie')

assert.throws(
  () =>
    resolveVotes({
      aliveUids: ['a', 'b'],
      wolfUid: 'a',
      ballots: [
        { from: 'a', to: 'a' },
        { from: 'b', to: 'a' },
      ],
      skipped: [],
    }),
  /自分には投票できません/,
)

assert.throws(() => cleanWord('お酒'), /使えません/)
assert.doesNotThrow(() => cleanWord('おにぎり'))

console.log('logic tests ok')
