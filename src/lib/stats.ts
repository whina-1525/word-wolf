const STATS = 'wordwolf-stats-v1'
const RECORDED = 'wordwolf-recorded-v1'

export type StatRow = { games: number; citizenWins: number; wolfWins: number }

const empty = (): StatRow => ({ games: 0, citizenWins: 0, wolfWins: 0 })

function readBook(): Record<string, StatRow> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATS) || '{}') as Record<string, StatRow>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function statsFor(name: string): StatRow {
  return readBook()[name] ?? empty()
}

export function winRate(row: StatRow) {
  if (row.games === 0) return null
  return Math.round(((row.citizenWins + row.wolfWins) / row.games) * 100)
}

export function recordResult(name: string, gameKey: string, role: 'citizen' | 'wolf', won: boolean) {
  const seen = new Set<string>(JSON.parse(localStorage.getItem(RECORDED) || '[]'))
  if (seen.has(gameKey)) return
  const book = readBook()
  const row = book[name] ?? empty()
  row.games += 1
  if (won && role === 'citizen') row.citizenWins += 1
  if (won && role === 'wolf') row.wolfWins += 1
  book[name] = row
  localStorage.setItem(STATS, JSON.stringify(book))
  seen.add(gameKey)
  localStorage.setItem(RECORDED, JSON.stringify([...seen].slice(-200)))
}

export function carryStats(oldName: string, newName: string) {
  if (!oldName || oldName === newName) return
  const book = readBook()
  if (book[oldName] && !book[newName]) {
    book[newName] = book[oldName]
    delete book[oldName]
    localStorage.setItem(STATS, JSON.stringify(book))
  }
}
