import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ */
/* Contenedores                                                        */
/* ------------------------------------------------------------------ */

export const Card = ({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) => (
  <section
    className={cx(
      'rounded-2xl border border-line bg-surface shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]',
      padded && 'p-5',
      className,
    )}
  >
    {children}
  </section>
);

export const CardHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
      {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </div>
);

/* ------------------------------------------------------------------ */
/* Botones                                                             */
/* ------------------------------------------------------------------ */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export const Button = ({
  variant = 'ghost',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) => (
  <button
    {...rest}
    disabled={disabled || loading}
    className={cx(
      'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
      size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
      variant === 'primary' &&
        'bg-accent text-white shadow-sm hover:brightness-110 dark:text-[#04120d]',
      variant === 'ghost' && 'border border-line bg-surface text-ink hover:border-muted/50 hover:bg-surface-2',
      variant === 'subtle' && 'bg-surface-2 text-ink hover:bg-line/60',
      variant === 'danger' && 'border border-down/40 text-down hover:bg-down/10',
      className,
    )}
  >
    {loading ? <Spinner className="size-4" /> : null}
    {children}
  </button>
);

/* ------------------------------------------------------------------ */
/* Formularios                                                         */
/* ------------------------------------------------------------------ */

export const Field = ({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) => (
  <label className={cx('block', className)}>
    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">
      {label}
    </span>
    {children}
    {error ? (
      <span className="mt-1 block text-xs text-down">{error}</span>
    ) : hint ? (
      <span className="mt-1 block text-xs text-muted/80">{hint}</span>
    ) : null}
  </label>
);

const controlClass =
  'w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted/50 transition focus:border-accent/60 focus:outline-none';

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...rest} className={cx(controlClass, className)} />
);

export const Select = ({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...rest} className={cx(controlClass, 'appearance-none pr-8', className)}>
    {children}
  </select>
);

export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...rest} className={cx(controlClass, 'min-h-20 resize-y', className)} />
);

/* ------------------------------------------------------------------ */
/* Estados                                                             */
/* ------------------------------------------------------------------ */

export const Spinner = ({ className }: { className?: string }) => (
  <span
    aria-hidden="true"
    className={cx(
      'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
      className ?? 'size-5',
    )}
  />
);

export const LoadingBlock = ({ label = 'Cargando…' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
    <Spinner />
    {label}
  </div>
);

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-12 text-center">
    <p className="text-sm font-medium text-ink">{title}</p>
    {description ? <p className="max-w-sm text-xs text-muted">{description}</p> : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);

export const ErrorNote = ({ children }: { children: ReactNode }) => (
  <div
    role="alert"
    className="rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-xs text-down"
  >
    {children}
  </div>
);

export const Badge = ({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'up' | 'down' | 'accent' | 'warn';
}) => (
  <span
    className={cx(
      'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
      tone === 'neutral' && 'bg-line/60 text-muted',
      tone === 'up' && 'bg-up/15 text-up',
      tone === 'down' && 'bg-down/15 text-down',
      tone === 'accent' && 'bg-accent/15 text-accent',
      tone === 'warn' && 'bg-amber-400/15 text-amber-500',
    )}
  >
    {children}
  </span>
);

export const Segmented = <T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) => (
  <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={cx(
          'rounded-md font-medium transition',
          size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
          option.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/* Modales                                                             */
/* ------------------------------------------------------------------ */

export const Modal = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'animate-rise max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Cifras                                                              */
/* ------------------------------------------------------------------ */

export const Stat = ({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
  className?: string;
}) => (
  <Card className={cx('flex flex-col justify-between gap-3', className)}>
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
    <div>
      <p className={cx('tabular text-2xl font-semibold leading-tight', tone ?? 'text-ink')}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  </Card>
);
