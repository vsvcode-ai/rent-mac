import type { InputHTMLAttributes } from 'react';

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-10 w-full rounded-lg border border-line2 bg-s1 px-3 text-[14px] text-ink placeholder:text-ink3 focus:border-line3 focus:outline-none ${className}`}
      {...rest}
    />
  );
}
