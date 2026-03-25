import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Library from './pages/Library';
import Upload from './pages/Upload';
import Settings from './pages/Settings';
import SharePage from './pages/SharePage';
import HelpMe from './pages/HelpMe';
import OnboardingTour from './components/OnboardingTour';
import Toast from './components/Toast';
import { getAuthStatus } from './lib/api';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/library', label: 'Clip Library' },
  { to: '/upload', label: 'Upload Recording' },
  { to: '/settings', label: 'Settings' },
  { to: '/help', label: 'Help Me' },
];

function PlatformBadges({ authStatus }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${
          authStatus.twitch
            ? 'border-purple-500/40 bg-purple-500/15 text-text-primary'
            : 'border-border bg-bg-elevated text-text-secondary'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${authStatus.twitch ? 'bg-purple-500' : 'bg-slate-400'}`} />
        Twitch
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${
          authStatus.kick
            ? 'border-emerald-500/40 bg-emerald-500/15 text-text-primary'
            : 'border-border bg-bg-elevated text-text-secondary'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${authStatus.kick ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        Kick
      </span>
    </div>
  );
}

function Sidebar({ authStatus, micActive }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[240px] border-r border-border bg-bg-card px-4 py-5 md:block">
      <div className="mb-8 flex items-center gap-2" data-tour="logo">
        <p className="text-lg font-bold tracking-tight text-text-primary">CliptorWho</p>
      </div>

      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            data-tour={`nav-${item.to === '/' ? 'dashboard' : item.to.replace('/', '')}`}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm transition ${
                isActive
                  ? 'bg-accent-purple/20 text-text-primary'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
              }`
            }
            end={item.to === '/'}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="absolute bottom-14 left-4 right-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-text-muted">Connected</p>
        <PlatformBadges authStatus={authStatus} />
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 text-xs text-text-secondary">
        <span
          className={`h-2.5 w-2.5 rounded-full ${micActive ? 'bg-accent-green animate-pulseSoft' : 'bg-slate-500'}`}
        />
        Mic {micActive ? 'active' : 'idle'}
      </div>
    </aside>
  );
}

function MobileHeader({ authStatus, micActive }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg-card/95 px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">CliptorWho</p>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className={`h-2 w-2 rounded-full ${micActive ? 'bg-accent-green' : 'bg-slate-400'}`} />
          Mic
        </div>
      </div>
      <div className="mt-2">
        <PlatformBadges authStatus={authStatus} />
      </div>
    </header>
  );
}

function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-bg-card/95 px-2 py-2 backdrop-blur md:hidden">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          data-tour={`nav-${item.to === '/' ? 'dashboard' : item.to.replace('/', '')}`}
          className={({ isActive }) =>
            `rounded-md px-2 py-2 text-center text-xs transition ${
              isActive
                ? 'bg-accent-purple/20 text-text-primary'
                : 'text-text-secondary hover:bg-bg-elevated'
            }`
          }
        >
          {item.label
            .replace('Upload Recording', 'Upload')
            .replace('Clip Library', 'Library')
            .replace('Help Me', 'Help')}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const [authStatus, setAuthStatus] = useState({ twitch: false, kick: false });
  const [micActive, setMicActive] = useState(false);
  const location = useLocation();

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((previous) => [...previous, { id, ...toast }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setAuthStatus({
        twitch: Boolean(status.twitch),
        kick: Boolean(status.kick),
      });
    } catch (_error) {
      setAuthStatus({ twitch: false, kick: false });
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth, location.pathname]);

  const isShareRoute = useMemo(() => location.pathname.startsWith('/share/'), [location.pathname]);

  if (isShareRoute) {
    return <SharePage />;
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <MobileHeader authStatus={authStatus} micActive={micActive} />
      <Sidebar authStatus={authStatus} micActive={micActive} />

      <main className="p-4 pb-24 md:ml-[240px] md:p-6 md:pb-6">
        <Routes>
          <Route path="/" element={<Dashboard pushToast={pushToast} onMicStatusChange={setMicActive} />} />
          <Route path="/library" element={<Library pushToast={pushToast} />} />
          <Route path="/upload" element={<Upload pushToast={pushToast} />} />
          <Route path="/settings" element={<Settings pushToast={pushToast} />} />
          <Route path="/help" element={<HelpMe pushToast={pushToast} />} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <MobileNav />

      <div className="fixed right-4 top-4 z-[60] space-y-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={dismissToast} />
        ))}
      </div>

      <OnboardingTour
        pathname={location.pathname}
        onNavigate={(to) => navigate(to)}
        onToast={pushToast}
      />
    </div>
  );
}
