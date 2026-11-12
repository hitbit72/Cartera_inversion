import type { ReactNode } from 'react';

export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink lg:text-2xl">{title}</h1>
      {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);
