import { useMemo, useState } from 'react'

const FACES = ['🍎', '🍊', '🍋', '🍇', '🍓', '🍑', '🍒', '🥝']

type Card = { id: string; face: string; pair: number }

function shuffle(): Card[] {
  const deck = FACES.flatMap((face, pair) => [
    { id: `${pair}-a-${Math.random()}`, face, pair },
    { id: `${pair}-b-${Math.random()}`, face, pair },
  ])
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[deck[index], deck[swap]] = [deck[swap], deck[index]]
  }
  return deck
}

export function MemoryGame() {
  const [deck, setDeck] = useState(shuffle)
  const [open, setOpen] = useState<string[]>([])
  const [matched, setMatched] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [lock, setLock] = useState(false)
  const [best, setBest] = useState<number | null>(() => {
    const saved = Number(sessionStorage.getItem('wordwolf-memory-best') || 0)
    return saved > 0 ? saved : null
  })
  const done = matched.length === FACES.length
  const openCards = useMemo(() => deck.filter((card) => open.includes(card.id)), [deck, open])

  const flip = (card: Card) => {
    if (lock || done || matched.includes(card.pair) || open.includes(card.id)) return
    const next = [...open, card.id]
    setOpen(next)
    if (next.length < 2) return
    setMoves((count) => count + 1)
    const [firstId, secondId] = next
    const first = deck.find((item) => item.id === firstId)
    const second = deck.find((item) => item.id === secondId)
    if (first && second && first.pair === second.pair) {
      const pairs = [...matched, first.pair]
      setMatched(pairs)
      setOpen([])
      if (pairs.length === FACES.length) {
        const nextMoves = moves + 1
        if (best == null || nextMoves < best) {
          setBest(nextMoves)
          sessionStorage.setItem('wordwolf-memory-best', String(nextMoves))
        }
      }
      return
    }
    setLock(true)
    window.setTimeout(() => {
      setOpen([])
      setLock(false)
    }, 700)
  }

  const restart = () => {
    setDeck(shuffle())
    setOpen([])
    setMatched([])
    setMoves(0)
    setLock(false)
  }

  return (
    <section className="memory">
      <div className="section-head">
        <div>
          <h2>あそぶ</h2>
          <p>みんながそろうまで、神経衰弱</p>
        </div>
        <div className="memory-score">
          <span>{moves}手</span>
          {best != null ? <span>さいしょう {best}</span> : null}
        </div>
      </div>
      <div className="memory-grid">
        {deck.map((card) => {
          const shown = open.includes(card.id) || matched.includes(card.pair)
          return (
            <button
              key={card.id}
              type="button"
              className={`memory-card ${shown ? 'shown' : ''} ${matched.includes(card.pair) ? 'matched' : ''}`}
              onClick={() => flip(card)}
              aria-label={shown ? card.face : 'うら'}
            >
              <span className="memory-inner">
                <span className="memory-face back">?</span>
                <span className="memory-face front">{card.face}</span>
              </span>
            </button>
          )
        })}
      </div>
      {done ? (
        <button type="button" className="btn ghost" onClick={restart}>
          もう一回
        </button>
      ) : null}
      <span className="sr-only">{openCards.length}</span>
    </section>
  )
}
