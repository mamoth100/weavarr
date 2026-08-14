'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';

interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

function formatBackupSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function BackupRow({ backup, onDeleted }: { backup: BackupInfo; onDeleted: () => void }) {
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'confirm' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleRestore() {
    setRestoreStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: backup.filename }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Restore failed');
      setRestoreStatus('done');
    } catch (err) {
      setRestoreStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete() {
    setDeleteStatus('loading');
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(backup.filename)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      onDeleted();
    } catch (err) {
      setDeleteStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="p-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{backup.filename}</p>
        <p className="text-xs text-zinc-500">
          {new Date(backup.createdAt).toLocaleString()} · {formatBackupSize(backup.sizeBytes)}
        </p>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>

      <a
        href={`/api/backup/${encodeURIComponent(backup.filename)}`}
        download
        className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      >
        Download
      </a>

      {restoreStatus === 'done' ? (
        <span className="text-xs font-medium text-green-400">Restored - restart to apply</span>
      ) : restoreStatus === 'confirm' || restoreStatus === 'loading' ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-400">Overwrite current config/data?</span>
          <button
            onClick={handleRestore}
            disabled={restoreStatus === 'loading'}
            className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-60"
          >
            {restoreStatus === 'loading' ? '…' : 'Yes'}
          </button>
          <button
            onClick={() => setRestoreStatus('idle')}
            disabled={restoreStatus === 'loading'}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
          >
            No
          </button>
        </div>
      ) : (
        <button
          onClick={() => setRestoreStatus('confirm')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            restoreStatus === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-amber-500 hover:text-black'
          }`}
        >
          {restoreStatus === 'error' ? 'Failed - retry' : 'Restore'}
        </button>
      )}

      {deleteStatus === 'confirm' || deleteStatus === 'loading' ? (
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleDelete}
            disabled={deleteStatus === 'loading'}
            className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-60"
          >
            {deleteStatus === 'loading' ? '…' : 'Yes'}
          </button>
          <button
            onClick={() => setDeleteStatus('idle')}
            disabled={deleteStatus === 'loading'}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
          >
            No
          </button>
        </div>
      ) : (
        <button
          onClick={() => setDeleteStatus('confirm')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            deleteStatus === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-red-600 hover:text-white'
          }`}
        >
          {deleteStatus === 'error' ? 'Failed - retry' : 'Delete'}
        </button>
      )}
    </div>
  );
}

function BackupList() {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function fetchBackups() {
    return fetch('/api/backup', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setBackups(data.backups);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    fetchBackups();
  }, []);

  async function handleBackupNow() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Backup failed');
      await fetchBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Existing Backups{backups && backups.length > 0 ? ` (${backups.length})` : ''}
        </h3>
        <button
          onClick={handleBackupNow}
          disabled={creating}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-60"
        >
          {creating ? 'Backing up…' : 'Backup Now'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {backups && backups.length === 0 && (
        <p className="text-xs text-zinc-500">No backups yet - click Backup Now to create one.</p>
      )}
      {backups && backups.length > 0 && (
        <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800">
          {backups.map((b) => (
            <BackupRow key={b.filename} backup={b} onDeleted={fetchBackups} />
          ))}
        </div>
      )}
    </div>
  );
}

const RETENTION_KEY = 'BACKUP_RETENTION_COUNT';
const ENABLE_KEY = 'ENABLE_SCHEDULED_BACKUPS';

function ScheduleSettings() {
  const [enabled, setEnabled] = useState('true');
  const [retention, setRetention] = useState('10');
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restartStatus, setRestartStatus] = useState<'idle' | 'restarting' | 'back' | 'error'>('idle');

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const enableField = data.settings?.find((s: { key: string }) => s.key === ENABLE_KEY);
        const retentionField = data.settings?.find((s: { key: string }) => s.key === RETENTION_KEY);
        if (enableField?.value) setEnabled(enableField.value);
        if (retentionField?.value) setRetention(retentionField.value);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function handleSave() {
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: { [ENABLE_KEY]: enabled, [RETENTION_KEY]: retention } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRestart() {
    setRestartStatus('restarting');
    try {
      await fetch('/api/settings/restart', { method: 'POST' });
    } catch {
      // Expected - the request can fail right as the process dies mid-response.
    }
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        if (res.ok) {
          setRestartStatus('back');
          return;
        }
      } catch {
        // still down, keep polling
      }
    }
    setRestartStatus('error');
  }

  if (!loaded) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Scheduled Backups</h3>
      <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800">
        <div className="p-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="sm:w-52 flex-shrink-0">
            <p className="text-sm font-medium">Enable Scheduled Backups</p>
            <p className="text-xs text-zinc-500">On by default - runs daily, keeps the newest N automatically</p>
          </div>
          <select
            value={enabled}
            onChange={(e) => setEnabled(e.target.value)}
            className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500"
          >
            <option value="true">Enable</option>
            <option value="false">Disable</option>
          </select>
        </div>
        <div className="p-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="sm:w-52 flex-shrink-0">
            <p className="text-sm font-medium">Backups to Keep</p>
            <p className="text-xs text-zinc-500">BACKUP_RETENTION_COUNT</p>
          </div>
          <input
            type="text"
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
            className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
        >
          {saveStatus === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {saveStatus === 'saved' && restartStatus === 'idle' && (
          <span className="text-sm text-green-400">Saved - restart to apply</span>
        )}
        {saveStatus === 'error' && <span className="text-sm text-red-400">Failed: {saveError}</span>}

        <button
          onClick={handleRestart}
          disabled={restartStatus === 'restarting'}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-60"
        >
          {restartStatus === 'restarting' ? 'Restarting…' : 'Restart App'}
        </button>
        {restartStatus === 'back' && <span className="text-sm text-green-400">Back up</span>}
        {restartStatus === 'error' && <span className="text-sm text-red-400">Didn&apos;t come back within 30s - check on the Pi</span>}
      </div>
    </div>
  );
}

function UploadBackup({ onUploaded }: { onUploaded: () => void }) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('uploading');
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/backup/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      onUploaded();
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Upload a Backup to Restore</h3>
      <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 p-3 flex items-center gap-3">
        <p className="text-xs text-zinc-500 flex-1">
          Have a backup from a different install, or from this one before something went wrong? Upload it here - it'll
          show up below with the same Restore option as any other backup.
        </p>
        <label
          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
            status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          } ${status === 'uploading' ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {status === 'uploading' ? 'Uploading…' : status === 'error' ? 'Failed - retry' : 'Choose File'}
          <input ref={inputRef} type="file" accept=".zip" onChange={handleChange} className="hidden" disabled={status === 'uploading'} />
        </label>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function BackupPanel() {
  const [listKey, setListKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
        <p>Backs up .env.local plus everything under data/ except the poster cache (regenerable from Radarr/Sonarr).</p>
        <p>Restoring overwrites current config/data and needs an app restart to take effect.</p>
      </div>
      <ScheduleSettings />
      <UploadBackup onUploaded={() => setListKey((k) => k + 1)} />
      <BackupList key={listKey} />
    </div>
  );
}
