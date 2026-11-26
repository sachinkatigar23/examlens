const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium ' +
  'transition-[background-color,color,box-shadow,transform] duration-150 ease-out ' +
  'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60';

const variants = {
  primary: 'bg-ink text-paper shadow-[0_2px_0_0_rgb(0_0_0/0.25)] hover:bg-ink/90',
  secondary: 'border border-ink/25 bg-card text-ink hover:border-ink/50',
  ghost: 'text-ink-muted hover:bg-ink/5 hover:text-ink',
  danger: 'bg-pen text-white shadow-[0_2px_0_0_rgb(0_0_0/0.2)] hover:bg-pen/90',
};

export default function Button({ variant = 'primary', className = '', type = 'button', ...props }) {
  return <button type={type} className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
