import { useState, useEffect } from 'react'
import './App.css'
import Auth from './Auth'

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [userEmail, setUserEmail] = useState(localStorage.getItem('email'))

  const [pickup, setPickup] = useState('')
  const [drop, setDrop] = useState('')
  const [fares, setFares] = useState(null)
  const [recommendations, setRecommendations] = useState(null)
  const [preference, setPreference] = useState('')
  const [aiService, setAiService] = useState('')
  const [aiRecommendation, setAiRecommendation] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [recentPickups, setRecentPickups] = useState([])
  const [recentDrops, setRecentDrops] = useState([])

  const handleLoginSuccess = (newToken, email) => {
    setToken(newToken)
    setUserEmail(email)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('email')
    setToken(null)
    setUserEmail(null)
    setFares(null)
    setRecommendations(null)
    setPickup('')
    setDrop('')
    setPreference('')
    setAiRecommendation('')
    setAiService('')
  }

  const fetchRecentLocations = () => {
    fetch('http://127.0.0.1:5000/api/recent-locations', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setRecentPickups(data.recent_pickups || [])
        setRecentDrops(data.recent_drops || [])
      })
  }

  useEffect(() => {
    if (token) {
      fetchRecentLocations()
    }
  }, [token])

  const handleSearch = async () => {
    const response = await fetch('http://127.0.0.1:5000/api/search-fares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ pickup, drop })
    })

    if (response.status === 401) {
      handleLogout()
      return
    }

    const data = await response.json()
    setFares(data.fares)
    setRecommendations(data.recommendations)
    setAiRecommendation('')
    setAiService('')
    fetchRecentLocations()
  }

  const handleAskAi = async () => {
    setLoadingAi(true)
    const response = await fetch('http://127.0.0.1:5000/api/recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ fares, preference })
    })
    const data = await response.json()
    setAiService(data.service)
    setAiRecommendation(data.recommendation)
    setLoadingAi(false)
  }

  if (!token) {
    return <Auth onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className="App">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>FairFare</h1>
        <button onClick={handleLogout} style={{ width: 'auto', padding: '6px 12px' }}>
          Logout
        </button>
      </div>

      <input
        type="text"
        placeholder="Pickup location"
        value={pickup}
        onChange={(e) => setPickup(e.target.value)}
        list="pickup-suggestions"
      />
      <datalist id="pickup-suggestions">
        {recentPickups.map((loc, i) => (
          <option key={i} value={loc} />
        ))}
      </datalist>

      <input
        type="text"
        placeholder="Drop location"
        value={drop}
        onChange={(e) => setDrop(e.target.value)}
        list="drop-suggestions"
      />
      <datalist id="drop-suggestions">
        {recentDrops.map((loc, i) => (
          <option key={i} value={loc} />
        ))}
      </datalist>

      <button onClick={handleSearch}>Search Fares</button>

      {fares && (
        <div>
          <h2>Fare Comparison</h2>
          {fares.map((fare) => (
            <div key={fare.service}>
              {fare.service}: ₹{fare.fare} — {fare.eta_minutes} mins
            </div>
          ))}
          <p>Cheapest: {recommendations.best_for_cost}</p>
          <p>Fastest: {recommendations.best_for_time}</p>

          <div>
            <h3>Have a specific need? Ask the assistant</h3>
            <input
              type="text"
              placeholder="e.g. I need to reach by 6:15, it's 5:45 now"
              value={preference}
              onChange={(e) => setPreference(e.target.value)}
            />
            <button onClick={handleAskAi} disabled={loadingAi || !preference}>
              {loadingAi ? 'Thinking...' : 'Get Recommendation'}
            </button>

            {aiRecommendation && (
              <div>
                <strong>{aiService}:</strong> {aiRecommendation}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App