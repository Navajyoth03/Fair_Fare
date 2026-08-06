import { useState } from 'react'

function Auth({ onLoginSuccess }) {
  const [isSignup, setIsSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setLoading(true)

    const endpoint = isSignup ? '/api/signup' : '/api/login'

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
          <span style={{ color: '#2DD4CF' }}>FairFare</span>
        </h1>
        <p style={{ color: '#e1e5ef', marginBottom: '32px', fontSize: '15px' }}>
          Compare rides. Ride smart.
        </p>

        <h2 style={{ color: '#F5F7FA', marginBottom: '16px' }}>
          {isSignup ? 'Create Account' : 'Welcome Back'}
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
          {loading ? 'Please wait...' : isSignup ? 'Sign Up' : 'Log In'}
        </button>

        <p
          onClick={() => setIsSignup(!isSignup)}
          style={{ cursor: 'pointer', textAlign: 'center', color: '#8B93A7', marginTop: '20px', fontSize: '14px' }}
        >
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
          <span style={{ color: '#2DD4CF', fontWeight: 600 }}>
            {isSignup ? 'Log in' : 'Sign up'}
          </span>
        </p>
      </div>
    </div>
  )
}

export default Auth