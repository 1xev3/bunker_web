import type { InputHTMLAttributes } from 'react';

export default function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`accent-input rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()} {...props} />;
}
