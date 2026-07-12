'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWatchlist } from '@/hooks/useWatchlist';

export default function AuthButton() {
  const { user } = useWatchlist();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setSent(true);
    setLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setShowForm(false);
    setSent(false);
    setEmail('');
  }

  if (user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500 truncate max-w-[9rem]">{user.email}</span>
        <button
          onClick={handleSignOut}
          className="text-zinc-500 hover:text-red-400 transition-colors text-xs"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (sent) {
    return (
      <p className="text-xs text-zinc-400">
        Check your email ✓
      </p>
    );
  }

  if (showForm) {
    return (
      <form onSubmit={handleSignIn} className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          autoFocus
          className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-600 w-44"
        />
        <button
          type="submit"
          disabled={loading}
          className="text-sm px-3 py-1.5 bg-amber-400 text-zinc-950 rounded-lg font-medium hover:bg-amber-300 transition-colors disabled:opacity-50"
        >
          {loading ? '…' : 'Send link'}
        </button>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="text-zinc-500 hover:text-white transition-colors"
        >
          ✕
        </button>
      </form>
    );
  }

  return (
    <button
      onClick={() => setShowForm(true)}
      className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-amber-400 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
      Sign in
    </button>
  );
}
