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
      onLoginSuccess(data.token, data.email, data.username)
    } catch (err) {
      setError('Could not connect to server')
    }

    setLoading(false)
  }

  return (
    <div className="App">
      <h1>FairFare</h1>
      <h2>{isSignup ? 'Create Account' : 'Log In'}</h2>

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

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? 'Please wait...' : isSignup ? 'Sign Up' : 'Log In'}
      </button>

      <p onClick={() => setIsSignup(!isSignup)} style={{ cursor: 'pointer', textAlign: 'center' }}>
        {isSignup ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
      </p>
    </div>
  )
}

export default Auth