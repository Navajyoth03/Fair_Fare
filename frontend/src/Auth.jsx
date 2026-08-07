import { useState } from 'react'

function Auth({ onLoginSuccess }) {
  const [view, setView] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setLoading(true)

    const endpoint = view === 'signup' ? '/api/signup' : '/api/login'

    try {
      const response = await fetch(`http://127.0.0.1:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Something went wrong')
        setLoading(false)
        return
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('email', data.email)
      localStorage.setItem('username', data.username)
      onLoginSuccess(data.token, data.email, data.username)
    } catch (err) {
      setError('Could not connect to server')
    }

    setLoading(false)
  }

  const handleForgotPassword = async () => {
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch('http://127.0.0.1:5000/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Something went wrong')
        setLoading(false)
        return
      }

      setMessage('If this email exists, a reset code has been sent. Check your inbox (and spam folder).')
      setView('reset')
    } catch (err) {
      setError('Could not connect to server')
    }

    setLoading(false)
  }

  const handleResetPassword = async () => {
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const response = await fetch('http://127.0.0.1:5000/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp_code: otpCode, new_password: newPassword })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Something went wrong')
        setLoading(false)
        return
      }

      setMessage('Password reset successful. You can now log in.')
      setView('login')
      setPassword('')
      setOtpCode('')
      setNewPassword('')
    } catch (err) {
      setError('Could not connect to server')
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0F1420',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px'
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 700,
          fontSize: '36px',
          color: '#F5F7FA',
          marginBottom: '4px'
        }}>
          Fair<span style={{ color: '#2DD4CF' }}>Fare</span>
        </h1>
        <p style={{ color: '#8B93A7', marginBottom: '32px', fontSize: '15px' }}>
          Compare rides. Ride smart.
        </p>

        {(view === 'login' || view === 'signup') && (
          <>
            <h2 style={{ color: '#F5F7FA', marginBottom: '16px' }}>
              {view === 'signup' ? 'Create Account' : 'Welcome Back'}
            </h2>

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <p style={{ color: '#F87171', fontSize: '14px' }}>{error}</p>}

            <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
              {loading ? 'Please wait...' : view === 'signup' ? 'Sign Up' : 'Log In'}
            </button>

            {view === 'login' && (
              <p
                onClick={() => { setView('forgot'); setError(''); setMessage('') }}
                style={{ cursor: 'pointer', textAlign: 'center', color: '#8B93A7', marginTop: '14px', fontSize: '13px' }}
              >
                Forgot password?
              </p>
            )}

            <p
              onClick={() => { setView(view === 'signup' ? 'login' : 'signup'); setError(''); setMessage('') }}
              style={{ cursor: 'pointer', textAlign: 'center', color: '#8B93A7', marginTop: '10px', fontSize: '14px' }}
            >
              {view === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
              <span style={{ color: '#2DD4CF', fontWeight: 600 }}>
                {view === 'signup' ? 'Log in' : 'Sign up'}
              </span>
            </p>
          </>
        )}

        {view === 'forgot' && (
          <>
            <h2 style={{ color: '#F5F7FA', marginBottom: '8px' }}>Reset Password</h2>
            <p style={{ color: '#8B93A7', fontSize: '14px', marginBottom: '16px' }}>
              Enter your email and we'll send you a reset code.
            </p>

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {error && <p style={{ color: '#F87171', fontSize: '14px' }}>{error}</p>}

            <button onClick={handleForgotPassword} disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
              {loading ? 'Sending...' : 'Send Reset Code'}
            </button>

            <p
              onClick={() => { setView('login'); setError(''); setMessage('') }}
              style={{ cursor: 'pointer', textAlign: 'center', color: '#2DD4CF', marginTop: '14px', fontSize: '14px', fontWeight: 600 }}
            >
              Back to login
            </p>
          </>
        )}

        {view === 'reset' && (
          <>
            <h2 style={{ color: '#F5F7FA', marginBottom: '8px' }}>Enter Reset Code</h2>
            {message && <p style={{ color: '#4ADE80', fontSize: '13px', marginBottom: '12px' }}>{message}</p>}

            <input
              type="text"
              placeholder="6-digit code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
            />
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />

            {error && <p style={{ color: '#F87171', fontSize: '14px' }}>{error}</p>}

            <button onClick={handleResetPassword} disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <p
              onClick={() => { setView('login'); setError(''); setMessage('') }}
              style={{ cursor: 'pointer', textAlign: 'center', color: '#8B93A7', marginTop: '14px', fontSize: '13px' }}
            >
              Back to login
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default Auth