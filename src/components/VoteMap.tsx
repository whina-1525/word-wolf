import type { PlayerDoc } from '../lib/types'
import { Avatar } from './Avatar'

const COLORS = ['#e15a32', '#1d7a5c', '#2b6cb0', '#c78612', '#8a4fb0', '#c44b78']

export function colorFor(uid: string) {
  let hash = 0
  for (const char of uid) hash = (hash + char.charCodeAt(0)) % COLORS.length
  return COLORS[hash]
}

export function VoteMap({
  players,
  arrows,
}: {
  players: PlayerDoc[]
  arrows: { from: string; to: string }[]
}) {
  const size = 320
  const center = size / 2
  const radius = 112
  const points = Object.fromEntries(
    players.map((player, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / players.length
      return [player.uid, { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle), player }]
    }),
  )
  const nameOf = (uid: string) => players.find((player) => player.uid === uid)?.name ?? '?'

  return (
    <div className="vote-map">
      <div className="vote-stage">
        <svg viewBox={`0 0 ${size} ${size}`} className="vote-lines">
          <defs>
            {COLORS.map((color) => (
              <marker key={color} id={`arrow-${color.slice(1)}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill={color} />
              </marker>
            ))}
          </defs>
          {arrows.map((arrow, index) => {
            const from = points[arrow.from]
            const to = points[arrow.to]
            if (!from || !to) return null
            const dx = to.x - from.x
            const dy = to.y - from.y
            const length = Math.hypot(dx, dy) || 1
            const pad = 36
            const color = colorFor(arrow.from)
            return (
              <line
                key={`${arrow.from}-${arrow.to}-${index}`}
                x1={from.x + (dx / length) * 16}
                y1={from.y + (dy / length) * 16}
                x2={to.x - (dx / length) * pad}
                y2={to.y - (dy / length) * pad}
                stroke={color}
                strokeWidth="3"
                markerEnd={`url(#arrow-${color.slice(1)})`}
              />
            )
          })}
        </svg>
        {players.map((player) => {
          const point = points[player.uid]
          return (
            <div key={player.uid} className="vote-node" style={{ left: `${(point.x / size) * 100}%`, top: `${(point.y / size) * 100}%` }}>
              <Avatar {...player} size={48} />
              <span>{player.name}</span>
            </div>
          )
        })}
      </div>
      <ul className="arrow-list">
        {arrows.map((arrow) => (
          <li key={`${arrow.from}-${arrow.to}`}>
            <i style={{ background: colorFor(arrow.from) }} />
            <span>{nameOf(arrow.from)}</span>
            <em>→</em>
            <span>{nameOf(arrow.to)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
