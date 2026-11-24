export function InterstateLogo({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const wordColor = variant === 'dark' ? '#FFFFFF' : '#111111';
  const subWordColor = variant === 'dark' ? '#C9CED8' : '#3B3B38';

  return (
    <div className="flex items-center gap-2.5 select-none">
      {/* Stylized architectural H / I-beam monogram in Interstate Amber (#FCAE1A) */}
      <svg
        width="34"
        height="34"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Interstate Homes Mark"
      >
        <path d="M5 7H14V33H5V7Z" fill="#FCAE1A" />
        <path d="M26 7H35V33H26V7Z" fill="#FCAE1A" />
        <path d="M14 16.5H26V23.5H14V16.5Z" fill="#FCAE1A" />
      </svg>
      <div className="leading-none">
        <div
          className="font-display text-[13px] font-bold tracking-[0.14em]"
          style={{ color: wordColor }}
        >
          INTERSTATE
        </div>
        <div
          className="font-display text-[10px] font-medium tracking-[0.22em] mt-0.5"
          style={{ color: subWordColor }}
        >
          HOMES
        </div>
      </div>
    </div>
  );
}
