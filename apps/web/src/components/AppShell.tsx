import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth, useTheme } from '../app/providers';
import { cx } from './ui';

const NAV = [
  { to: '/', label: 'Resumen', icon: 'chart', end: true },
  { to: '/operaciones', label: 'Operaciones', icon: 'swap', end: false },
  { to: '/dividendos', label: 'Dividendos', icon: 'coin', end: false },
  { to: '/activos', label: 'Activos', icon: 'layers', end: false },
  { to: '/ajustes', label: 'Ajustes', icon: 'gear', end: false },
] as const;

const Icon = ({ name }: { name: (typeof NAV)[number]['icon'] }) => {
  const paths: Record<string, ReactNode> = {
    chart: <path d="M3 16.5l4.5-4.5 3 3L17 8.5M15 8.5h4v4" strokeLinecap="round" strokeLinejoin="round" />,
    swap: (
      <>
        <path d="M4 7h11m0 0-3-3m3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 13H5m0 0 3-3m-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    coin: (
      <>
        <ellipse cx="10" cy="6" rx="6" ry="2.5" />
        <path d="M4 6v8c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6" />
        <path d="M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" />
      </>
    ),
    layers: (
      <>
        <path d="M10 3l7 4-7 4-7-4 7-4Z" strokeLinejoin="round" />
        <path d="M3 11l7 4 7-4M3 14.5l7 4 7-4" strokeLinejoin="round" />
      </>
    ),
    gear: (
      <>
        <circle cx="10" cy="10" r="2.6" />
        <path d="M10 3.5v1.8M10 14.7v1.8M3.5 10h1.8M14.7 10h1.8M5.4 5.4l1.3 1.3M13.3 13.3l1.3 1.3M14.6 5.4l-1.3 1.3M6.7 13.3l-1.3 1.3" strokeLinecap="round" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6">
      {paths[name]}
    </svg>
  );
};

const Logo = () => (
  <div className="flex items-center gap-2.5">
    <span className="grid size-8 place-items-center rounded-lg bg-accent/15 text-accent">
      <svg viewBox="0 0 20 20" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 15l4-5 3 2.5L17 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
    <span className="text-sm font-semibold tracking-wide">
      Cartera<span className="text-accent">.</span>
    </span>
  </div>
);

const ThemeToggle = () => {
  const { resolved, setTheme } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={next === 'dark' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      aria-label={next === 'dark' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      className="grid size-9 place-items-center rounded-lg border border-line text-muted transition hover:text-ink"
    >
      {resolved === 'dark' ? (
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="10" cy="10" r="3.4" />
          <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M16 12.4A6.6 6.6 0 0 1 7.6 4a6.8 6.8 0 1 0 8.4 8.4Z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
};

const UserMenu = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!user) return null;
  // Iniciales de hasta dos palabras: «Prueba Web» → PW.
  const initials =
    user.display_name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || user.email.slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-left transition hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid size-6 place-items-center rounded-md bg-accent/15 text-[11px] font-semibold text-accent">
          {initials}
        </span>
        <span className="hidden text-xs font-medium sm:block">{user.display_name}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-xs font-medium">{user.display_name}</p>
            <p className="truncate text-[11px] text-muted">{user.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/ajustes');
            }}
            className="flex w-full items-center px-3 py-2 text-left text-xs text-ink transition hover:bg-surface-2"
          >
            Ajustes de la cuenta
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout().then(() => navigate('/login', { replace: true }));
            }}
            className="flex w-full items-center px-3 py-2 text-left text-xs text-down transition hover:bg-down/10"
          >
            Cerrar sesión
          </button>
        </div>
      ) : null}
    </div>
  );
};

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
    isActive
      ? 'bg-accent/12 font-medium text-accent'
      : 'text-muted hover:bg-surface-2 hover:text-ink',
  );

export const AppShell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
    <aside className="hidden border-r border-line bg-surface/40 px-4 py-5 lg:flex lg:flex-col">
      <div className="px-2">
        <Logo />
      </div>
      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <p className="px-2 text-[11px] leading-relaxed text-muted/70">
        Datos privados de tu cuenta.
        <br />
        Precios de Yahoo Finance.
      </p>
    </aside>

    <div className="flex min-h-dvh min-w-0 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              <Icon name={item.icon} />
              <span className="whitespace-nowrap">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  </div>
);
