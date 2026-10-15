import type { ReactNode } from 'react';
import './PageHeader.css';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  action?: { label: string; onClick: () => void; icon?: ReactNode } | ReactNode;
}

/**
 * Shared page header component for consistent styling across all pages.
 */
export function PageHeader({ title, subtitle, badge, icon, actions, action }: PageHeaderProps) {
  let renderedAction: ReactNode = null;
  if (action) {
    if (typeof action === 'object' && action !== null && 'label' in action && 'onClick' in action) {
      const act = action as { label: string; onClick: () => void; icon?: ReactNode };
      renderedAction = (
        <button className="btn btn-primary" onClick={act.onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {act.icon} {act.label}
        </button>
      );
    } else {
      renderedAction = action as ReactNode;
    }
  }

  return (
    <header className="page-header">
      <div className="page-header__title-group">
        {icon && <span className="page-header__icon" style={{ marginRight: '0.5rem', display: 'inline-flex', verticalAlign: 'middle' }}>{icon}</span>}
        <h1>{title}</h1>
        {badge && <span className="page-header__badge">{badge}</span>}
      </div>
      {(actions || renderedAction) && (
        <div className="page-header__actions">{actions || renderedAction}</div>
      )}
      {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
    </header>
  );
}
