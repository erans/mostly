import { useState } from 'react';
import { Key, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { TabbedDialog } from './tabbed-dialog';
import { ApiKeysContent } from './api-keys-content';
import { useAuth } from '@/hooks/use-auth';

const TABS = [{ id: 'api-keys', label: 'API Keys', icon: Key }] as const;

interface UserDialogProps {
  onClose: () => void;
}

export function UserDialog({ onClose }: UserDialogProps) {
  const [activeTab, setActiveTab] = useState('api-keys');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    onClose();
    await logout();
    navigate('/login', { replace: true });
  }

  const footer = (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex items-center gap-2 px-1">
        <div
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-border/50 text-[10px] font-semibold text-text-secondary"
        >
          {user?.handle ? user.handle.charAt(0).toUpperCase() : '?'}
        </div>
        <div className="min-w-0 flex-1">
          {user?.display_name ? (
            <>
              <div className="truncate text-xs font-medium text-text">{user.display_name}</div>
              <div className="truncate text-[10px] text-text-muted">{user.handle}</div>
            </>
          ) : (
            <div className="truncate text-xs text-text-secondary">{user?.handle ?? '—'}</div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-border/30"
      >
        <LogOut size={14} className="shrink-0" />
        <span>Log out</span>
      </button>
    </div>
  );

  return (
    <TabbedDialog
      title="Account"
      tabs={[...TABS]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={onClose}
      footer={footer}
    >
      {activeTab === 'api-keys' && <ApiKeysContent />}
    </TabbedDialog>
  );
}
