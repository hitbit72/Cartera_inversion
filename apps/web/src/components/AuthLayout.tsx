import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export const AuthLayout = ({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
    <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-10 lg:flex">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(60% 45% at 20% 10%, rgba(45,212,167,0.18), transparent 70%), radial-gradient(45% 35% at 90% 85%, rgba(96,165,250,0.14), transparent 70%)',
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 15l4-5 3 2.5L17 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-base font-semibold tracking-wide">
            Cartera<span className="text-accent">.</span>
          </span>
        </div>

        <h1 className="mt-16 max-w-md text-4xl font-semibold leading-[1.15] tracking-tight">
          Todas tus inversiones,
          <br />
          con números que
          <span className="text-accent"> cuadran</span>.
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
          Acciones, ETF y cripto en una sola vista. Plusvalías FIFO o coste medio, dividendos netos y
          rentabilidad real frente al mercado.
        </p>

        <svg viewBox="0 0 420 120" className="mt-12 w-full max-w-md" aria-hidden="true">
          <defs>
            <linearGradient id="authFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4a7" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#2dd4a7" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 96 L40 88 L80 92 L120 74 L160 78 L200 58 L240 64 L280 42 L320 48 L360 26 L420 18 L420 120 L0 120 Z"
            fill="url(#authFill)"
          />
          <path
            d="M0 96 L40 88 L80 92 L120 74 L160 78 L200 58 L240 64 L280 42 L320 48 L360 26 L420 18"
            fill="none"
            stroke="#2dd4a7"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <ul className="relative grid gap-2 text-xs text-muted">
        <li>· Cálculo FIFO y coste medio con comisiones y tipo de cambio del día.</li>
        <li>· Precios de mercado con caché y entrada manual de respaldo.</li>
        <li>· Datos aislados por usuario en la propia base de datos.</li>
      </ul>
    </aside>

    <main className="flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 lg:hidden">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
              <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 15l4-5 3 2.5L17 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-base font-semibold tracking-wide">
              Cartera<span className="text-accent">.</span>
            </span>
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">{subtitle}</p>

        <div className="mt-7">{children}</div>

        {footer ? <div className="mt-6 text-center text-xs text-muted">{footer}</div> : null}

        <p className="mt-10 text-center text-[11px] text-muted/70">
          <Link to="/login" className="hover:text-muted">
            Acceso privado
          </Link>{' '}
          · Cartera de inversión
        </p>
      </div>
    </main>
  </div>
);
