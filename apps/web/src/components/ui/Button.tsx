import type { ButtonHTMLAttributes } from 'react';

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-200 ease-ink disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
const variants = {
  /** 反色主按钮：骨白底 + 墨字 */
  primary: 'bg-ink text-on-ink hover:bg-white',
  /** 次按钮：透明 + 细线 */
  ghost: 'border border-line2 text-ink hover:bg-s3',
};
const sizes = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-[14px]',
  lg: 'h-12 px-6 text-[15px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function Button({ variant = 'primary', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest} />
  );
}
