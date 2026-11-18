export function Logo({ size = 72 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <rect x="2" y="2" width="68" height="68" rx="22" fill="#fffaf4" stroke="#e4d5c3" />
      <path
        d="M16 28c0-7 6-12 16-12h8c8 0 14 5 14 12v8c0 6-4 10-10 11l-6 6-2-6H32c-9 0-16-5-16-11z"
        fill="#e15a32"
      />
      <circle cx="46" cy="24" r="10" fill="#f3ecdf" />
      <circle cx="50" cy="22" r="8" fill="#e15a32" />
      <circle cx="30" cy="32" r="2.2" fill="#fffaf4" />
      <circle cx="39" cy="32" r="2.2" fill="#fffaf4" />
    </svg>
  )
}
