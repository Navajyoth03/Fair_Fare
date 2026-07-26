import { useState } from 'react'
import './App.css'

function App() {
  const [pickup, setPickup] = useState('')
  const [drop, setDrop] = useState('')
  const [fares, setFares] = useState(null)
  const [recommendations, setRecommendations] = useState(null)

  const handleSearch = async () => {
    const response = await fetch('http://127.0.0.1:5000/api/search-fares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickup, drop })
    })
    const data = await response.json()
    setFares(data.fares)
    setRecommendations(data.recommendations)
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
              {fare.service}: ₹{fare.fare} — {fare.eta_minutes} min
            </div>
          ))}
          <p>Best for cost: {recommendations.best_for_cost}</p>
          <p>Best for time: {recommendations.best_for_time}</p>
        </div>
      )}
    </div>
  )
}

export default App