import { useState } from 'react'
import './App.css'

function App() {
  const [pickup, setPickup] = useState('')
  const [drop, setDrop] = useState('')
  const [fares, setFares] = useState(null)
  const [recommendations, setRecommendations] = useState(null)
  const [preference, setPreference] = useState('')
  const [aiService, setAiService] = useState('')
  const [aiRecommendation, setAiRecommendation] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)

  const handleSearch = async () => {
    const response = await fetch('http://127.0.0.1:5000/api/search-fares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickup, drop })
    })
    const data = await response.json()
    setFares(data.fares)
    setRecommendations(data.recommendations)
    setAiRecommendation('')
    setAiService('')
  }

  const handleAskAi = async () => {
    setLoadingAi(true)
    const response = await fetch('http://127.0.0.1:5000/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fares, preference })
    })
    const data = await response.json()
    setAiService(data.service)
    setAiRecommendation(data.recommendation)
    setLoadingAi(false)
  }

  return (
    <div className="App">
      <h1>FairFare</h1>

      <input
        type="text"
        placeholder="Pickup location"
        value={pickup}
        onChange={(e) => setPickup(e.target.value)}
      />
      <input
        type="text"
        placeholder="Drop location"
        value={drop}
        onChange={(e) => setDrop(e.target.value)}
      />
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
              placeholder="e.g. I need to be there in 15 mins"
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