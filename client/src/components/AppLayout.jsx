import { Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import Logo from './Logo.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import ModeToggle from './ModeToggle.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ModelProvider, useModels } from '../context/ModelContext.jsx';
import { useReadOnly } from '../hooks/usePublicConfig.js';

export default function AppLayout() {
  return (
    <ModelProvider>
      <AppShell />
    </ModelProvider>
  );
}

function AppShell() {
  const { user, logout } = useAuth();
  const readOnly = useReadOnly();
  return (
    <div className="min-h-dvh">
      <header className="no-print border-b border-rule bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Logo />
          <div className="flex items-center gap-1 sm:gap-3">
            <span className="hidden text-sm text-ink-muted md:inline">{user?.name}</span>
            {!readOnly && <DefaultModel />}
            <ThemeToggle />
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink"
              aria-label="Log out"
            >
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="print-page mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
    </div>
  );
}

// The user's default model, used to pre-select the toggle in Ask, Study and the Question Bank.
function DefaultModel() {
  const { defaultMode, saveSettings } = useModels();
  return (
    <div className="flex items-center gap-1.5" title="Default model for new answers">
      <span className="hidden font-mono text-[10px] tracking-wider text-ink-muted uppercase lg:inline">Default</span>
      <ModeToggle mode={defaultMode} onChange={(m) => saveSettings({ defaultMode: m }).catch(() => {})} />
    </div>
  );
}
