import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary: 'btn-primary text-white',
  secondary: 'border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white',
  danger: 'btn-danger text-red-100',
  ghost: 'border border-transparent text-zinc-500 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
}

export default function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`.trim()} {...props} />;
}
