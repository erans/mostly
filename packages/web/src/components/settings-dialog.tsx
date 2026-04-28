import { useState } from 'react';
import { Palette, Sun, Moon } from 'lucide-react';
import { TabbedDialog } from './tabbed-dialog';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

const TABS = [{ id: 'appearance', label: 'Appearance', icon: Palette }] as const;

interface SettingsDialogProps {
  onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState('appearance');
  const { theme, setTheme } = useTheme();

  return (
    <TabbedDialog
      title="Settings"
      tabs={[...TABS]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={onClose}
    >
      {activeTab === 'appearance' && (
        <div>
          <h3 className="mb-3 text-sm font-bold text-text">Theme</h3>
          <div className="flex gap-3">
            <button
              onClick={() => setTheme('light')}
              className={cn(
                'flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors',
                theme === 'light'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-text-muted',
              )}
            >
              <Sun size={20} className="text-text-secondary" />
              <span className="text-sm font-medium text-text">Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={cn(
                'flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors',
                theme === 'dark'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-text-muted',
              )}
            >
              <Moon size={20} className="text-text-secondary" />
              <span className="text-sm font-medium text-text">Dark</span>
            </button>
          </div>
        </div>
      )}
    </TabbedDialog>
  );
}
