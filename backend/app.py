from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import random
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL)
    return conn

@app.route("/")
def home():
    return "FairFare backend is running!"

@app.route("/api/search-fares", methods=["POST"])
def search_fares():
    data = request.get_json()
    pickup = data.get("pickup")
    drop = data.get("drop")

    if not pickup or not drop:
        return jsonify({"error": "Pickup and drop locations are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO fare_searches (pickup_location, drop_location) VALUES (%s, %s)",
        (pickup, drop)
    )
    conn.commit()
    cur.close()
    conn.close()

    base_fare = random.randint(160, 240)
    base_eta = random.randint(16, 25)

    fares = [
        {
            "service": "Uber",
            "fare": base_fare + random.randint(-15, 10),
            "eta_minutes": base_eta + random.randint(-5, 3)
        },
        {
            "service": "Ola",
            "fare": base_fare + random.randint(-15, 15),
            "eta_minutes": base_eta + random.randint(-3, 5)
        },
        {
            "service": "Rapido",
            "fare": base_fare  + random.randint(-20, 10),
            "eta_minutes": base_eta + random.randint(-5, 3)
        },
    ]  

    cheapest = min(fares, key=lambda f: f["fare"])
    fastest = min(fares, key=lambda f: f["eta_minutes"])

    return jsonify({
        "pickup":pickup, "drop": drop, "fares": fares, 
        "recommendations": {"best_for_cost": cheapest["service"],
        "best_for_time": fastest["service"]}
        })


if __name__ == "__main__":
    app.run(debug=True, port=5000)