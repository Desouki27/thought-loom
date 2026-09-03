import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setInfo(null)
    const { data, error } = await supabase.auth.signUp({ email, password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    if (data.session) {
      navigate('/')
      return
    }
    setInfo('Check your email to confirm your account, then sign in.')
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-8"
      >
        <h1 className="mb-1 text-xl font-medium text-white">Create your loom</h1>
        <p className="mb-6 text-sm text-white/50">Start weaving your notes with AI.</p>

        <label className="mb-1 block text-xs text-white/60">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
        />

        <label className="mb-1 block text-xs text-white/60">Password</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
        />

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
        {info && <p className="mb-4 text-sm text-emerald-400">{info}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-violet-500 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>

        <p className="mt-4 text-center text-sm text-white/50">
          Already have an account?{' '}
          <Link to="/login" className="text-violet-300 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  )
}
