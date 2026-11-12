import Link from 'next/link';

export function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" stroke="#f2f1ec" strokeWidth="1.5" />
      <rect x="6" y="9.5" width="12" height="5" rx="1.6" fill="#f2f1ec" />
      <circle cx="15.6" cy="12" r="1" fill="#0b0b0a" />
    </svg>
  );
}

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link className="brand" href={href}>
      <BrandMark />
      <span>南洋桌面</span>
      <small>NANYANGDESK</small>
    </Link>
  );
}
