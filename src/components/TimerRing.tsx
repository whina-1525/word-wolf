export function TimerRing({ remainMs, totalMs }: { remainMs: number; totalMs: number }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const ratio = totalMs <= 0 ? 0 : Math.max(0, Math.min(1, remainMs / totalMs))
  const dash = circumference * ratio
  const seconds = Math.ceil(remainMs / 1000)
  return (
    <div className={`timer ${remainMs <= 10000 ? 'urgent' : ''}`} aria-label={`残り${seconds}秒`}>
      <svg viewBox="0 0 100 100">
        <circle className="timer-track" cx="50" cy="50" r={radius} />
        <circle
          className="timer-value"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <strong>{seconds}</strong>
    </div>
  )
}
