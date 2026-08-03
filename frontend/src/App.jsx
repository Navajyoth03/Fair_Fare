import { useState, useEffect } from 'react'
import './App.css'
import Auth from './Auth'

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [userEmail, setUserEmail] = useState(localStorage.getItem('email'))
  const [username, setUsername] = useState(localStorage.getItem('username') || localStorage.getItem('email'))

  const [pickup, setPickup] = useState('')
  const [drop, setDrop] = useState('')
  const [mode, setMode] = useState('')
  const [fares, setFares] = useState(null)
  const [recommendations, setRecommendations] = useState(null)
  const [preference, setPreference] = useState('')
  const [aiService, setAiService] = useState('')
  const [aiRecommendation, setAiRecommendation] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [recentPickups, setRecentPickups] = useState([])
  const [recentDrops, setRecentDrops] = useState([])

  const [showSidebar, setShowSidebar] = useState(false)
  const [currentView, setCurrentView] = useState('home')
  const [searchHistory, setSearchHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameDraft, setUsernameDraft] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const handleLoginSuccess = (newToken, email, uname) => {
    setToken(newToken)
    setUserEmail(email)
    setUsername(uname || email)
    localStorage.setItem('username', uname || email)
  }

  const performLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('email')
    localStorage.removeItem('username')
    setToken(null)
    setUserEmail(null)
    setUsername(null)
    setFares(null)
    setRecommendations(null)
    setPickup('')
    setDrop('')
    setPreference('')
    setAiRecommendation('')
    setAiService('')
    setShowSidebar(false)
    setCurrentView('home')
    setShowLogoutConfirm(false)
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
      performLogout()
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

  const openSearchHistory = () => {
    setLoadingHistory(true)
    setCurrentView('history')
    setShowSidebar(false)

    fetch('http://127.0.0.1:5000/api/search-history', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setSearchHistory(data)
        setLoadingHistory(false)
      })
  }

  const goHome = () => {
    setCurrentView('home')
    setShowSidebar(false)
  }

  const startEditingUsername = () => {
    setUsernameDraft(username)
    setEditingUsername(true)
  }

  const saveUsername = async () => {
    if (!usernameDraft.trim()) {
      setEditingUsername(false)
      return
    }

    const response = await fetch('http://127.0.0.1:5000/api/update-username', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ username: usernameDraft })
    })
    const data = await response.json()

    if (response.ok) {
      setUsername(data.username)
      localStorage.setItem('username', data.username)
    }
    setEditingUsername(false)
  }

  if (!token) {
    return <Auth onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className="App" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>FairFare</h1>
        <div
          onClick={() => setShowSidebar(!showSidebar)}
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            overflow: 'hidden',
            cursor: 'pointer'
          }}
        >
          <img
            src="/profile-icon.png"
            alt="Profile"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      </div>

      {/* Sidebar - now on the RIGHT */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: showSidebar ? 0 : '-260px',
        width: '260px',
        height: '100%',
        background: '#1a1a2e',
        color: 'white',
        transition: 'right 0.25s ease',
        zIndex: 100,
        padding: '20px',
        boxSizing: 'border-box'
      }}>
        <div style={{ marginBottom: '10px' }}>
          {editingUsername ? (
            <div>
              <input
                type="text"
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value)}
                style={{ width: '100%', padding: '4px', boxSizing: 'border-box', color: '#000' }}
              />
              <div style={{ marginTop: '6px' }}>
                <button onClick={saveUsername} style={{ width: 'auto', padding: '4px 10px', marginRight: '6px' }}>
                  Save
                </button>
                <button onClick={() => setEditingUsername(false)} style={{ width: 'auto', padding: '4px 10px' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', wordBreak: 'break-all' }}>{username}</span>
              <span onClick={startEditingUsername} style={{ cursor: 'pointer', marginLeft: '8px' }}>✏️</span>
            </div>
          )}
          <p style={{ fontSize: '12px', color: '#aaa', wordBreak: 'break-all', marginTop: '4px' }}>
            {userEmail}
          </p>
        </div>

        <div
          onClick={goHome}
          style={{ padding: '10px 0', cursor: 'pointer', borderTop: '1px solid #444' }}
        >
          Home
        </div>
        <div
          onClick={openSearchHistory}
          style={{ padding: '10px 0', cursor: 'pointer', borderTop: '1px solid #444' }}
        >
          Search History
        </div>
        <div
          onClick={() => setShowLogoutConfirm(true)}
          style={{
            padding: '10px 0',
            cursor: 'pointer',
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            right: '20px',
            borderTop: '1px solid #444'
          }}
        >
          Logout
        </div>
      </div>

      {/* Overlay to close sidebar when clicking outside */}
      {showSidebar && (
        <div
          onClick={() => setShowSidebar(false)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 99
          }}
        />
      )}

      {/* Logout confirmation popup */}
      {showLogoutConfirm && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '10px', maxWidth: '300px', textAlign: 'center' }}>
            <p>Are you sure you want to log out?</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={performLogout} style={{ flex: 1 }}>Confirm</button>
              <button onClick={() => setShowLogoutConfirm(false)} style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Home view */}
      {currentView === 'home' && (
        <>
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

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            marginBottom: '12px',
            maxWidth: '260px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            <div
              onClick={() => setMode('bike')}
              style={{
                border: mode === 'bike' ? '2px solid #4f46e5' : '2px solid #e5e7eb',
                borderRadius: '8px',
                padding: '4px',
                textAlign: 'center',
                cursor: 'pointer',
                background: mode === 'bike' ? '#eef2ff' : 'white'
              }}
            >
              <img src="/bike.png" alt="Bike" style={{ width: '85px', height: '80px', objectFit: 'contain' }} />
              <div style={{ marginTop: '6px', fontSize: '14px' }}>Bike</div>
            </div>

            <div
              onClick={() => setMode('auto')}
              style={{
                border: mode === 'auto' ? '2px solid #4f46e5' : '2px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                background: mode === 'auto' ? '#eef2ff' : 'white'
              }}
            >
              <img src="/auto.png" alt="Auto" style={{ width: '85px', height: '75px', objectFit: 'contain' }} />
              <div style={{ marginTop: '6px', fontSize: '14px' }}>Auto</div>
            </div>

            <div
              onClick={() => setMode('cab_economy')}
              style={{
                border: mode === 'cab_economy' ? '2px solid #4f46e5' : '2px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                background: mode === 'cab_economy' ? '#eef2ff' : 'white'
              }}
            >
              <img src="/cab-economy.png" alt="Cab Economy" style={{ width: '85px', height: '75px', objectFit: 'contain' }} />
              <div style={{ marginTop: '6px', fontSize: '14px' }}>Cab (Economy)</div>
            </div>

            <div
              onClick={() => setMode('cab_premium')}
              style={{
                border: mode === 'cab_premium' ? '2px solid #4f46e5' : '2px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px',
                textAlign: 'center',
                cursor: 'pointer',
                background: mode === 'cab_premium' ? '#eef2ff' : 'white'
              }}
            >
              <img src="/cab-premium.png" alt="Cab Premium" style={{ width: '85px', height: '75px', objectFit: 'contain' }} />
              <div style={{ marginTop: '6px', fontSize: '14px' }}>Cab (Premium)</div>
            </div>
          </div>
        </>
      )}

      {/* Search History view */}
      {currentView === 'history' && (
        <div>
          <h2>Search History</h2>
          {loadingHistory && <p>Loading...</p>}
          {!loadingHistory && searchHistory.length === 0 && <p>No searches yet.</p>}
          {!loadingHistory && searchHistory.map((item, i) => (
            <div key={i} style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
              <strong>{item.pickup}</strong> → <strong>{item.drop}</strong>
              <div style={{ fontSize: '12px', color: '#888' }}>
                {new Date(item.time).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App