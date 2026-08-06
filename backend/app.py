from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import random
import os
import re
import datetime
import bcrypt
import jwt
import smtplib
from email.mime.text import MIMEText
from functools import wraps
from dotenv import load_dotenv
from groq import Groq
import requests

load_dotenv()

app = Flask(__name__)
CORS(app)

DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET = os.getenv("JWT_SECRET", "temporary-dev-secret-change-this")

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def geocode_location(place_name):
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": place_name,
        "format": "json",
        "limit": 1
    }
    headers = {"User-Agent": "FairFareApp/1.0"}

    response = requests.get(url, params=params, headers=headers)
    results = response.json()

    if not results:
        return None

    return {
        "lat": float(results[0]["lat"]),
        "lon": float(results[0]["lon"]),
        "display_name": results[0]["display_name"]
    }

def get_route(pickup_coords, drop_coords):
    url = f"http://router.project-osrm.org/route/v1/driving/{pickup_coords['lon']},{pickup_coords['lat']};{drop_coords['lon']},{drop_coords['lat']}"
    params = {"overview": "full", "geometries": "geojson"}

    response = requests.get(url, params=params)
    data = response.json()

    if data.get("code") != "Ok":
        return None

    route = data["routes"][0]
    base_duration_minutes = route["duration"] / 60

    # OSRM gives theoretical driving time with no live traffic data.
    # Apply a randomized multiplier to roughly simulate typical urban traffic conditions.
    traffic_multiplier = random.uniform(1.3, 2.0)
    adjusted_duration_minutes = base_duration_minutes * traffic_multiplier

    return {
        "distance_km": round(route["distance"] / 1000, 2),
        "duration_minutes": round(adjusted_duration_minutes, 1),
        "geometry": route["geometry"]
    }

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")

        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid authorization token"}), 401

        token = auth_header.split(" ")[1]

        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired, please log in again"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        request.user_id = payload["user_id"]
        return f(*args, **kwargs)

    return decorated


@app.route("/")
def home():
    return "FairFare backend is running!"


# ---------------- AUTH ROUTES ----------------

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO users (email, password_hash, username) VALUES (%s, %s, %s) RETURNING id",
            (email, password_hash.decode("utf-8"), email)
        )
        user_id = cur.fetchone()[0]
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        cur.close()
        conn.close()
        return jsonify({"error": "An account with this email already exists"}), 409

    cur.close()
    conn.close()

    token = jwt.encode(
        {"user_id": user_id, "email": email, "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)},
        JWT_SECRET,
        algorithm="HS256"
    )

    return jsonify({"token": token, "email": email, "username": email}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash, username FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    user_id, stored_hash, username = user

    if not bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8")):
        return jsonify({"error": "Invalid email or password"}), 401

    token = jwt.encode(
        {"user_id": user_id, "email": email, "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)},
        JWT_SECRET,
        algorithm="HS256"
    )

    return jsonify({"token": token, "email": email, "username": username})

@app.route("/api/update-username", methods=["POST"])
@require_auth
def update_username():
    data = request.get_json()
    new_username = data.get("username")

    if not new_username or len(new_username.strip()) == 0:
        return jsonify({"error": "Username cannot be empty"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("UPDATE users SET username = %s WHERE id = %s", (new_username.strip(), request.user_id))
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"username": new_username.strip()})


@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json()
    email = data.get("email")

    if not email:
        return jsonify({"error": "Email is required"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
    user = cur.fetchone()

    if not user:
        cur.close()
        conn.close()
        return jsonify({"message": "If this email exists, an OTP has been sent"}), 200

    otp_code = str(random.randint(100000, 999999))
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)

    cur.execute(
        "INSERT INTO password_resets (email, otp_code, expires_at) VALUES (%s, %s, %s)",
        (email, otp_code, expires_at)
    )
    conn.commit()
    cur.close()
    conn.close()

    try:
        msg = MIMEText(f"Your FairFare password reset code is: {otp_code}\nThis code expires in 10 minutes.")
        msg["Subject"] = "FairFare Password Reset Code"
        msg["From"] = os.getenv("EMAIL_ADDRESS")
        msg["To"] = email

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(os.getenv("EMAIL_ADDRESS"), os.getenv("EMAIL_APP_PASSWORD"))
            server.send_message(msg)
    except Exception as e:
        return jsonify({"error": "Failed to send email"}), 500

    return jsonify({"message": "If this email exists, an OTP has been sent"}), 200


@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json()
    email = data.get("email")
    otp_code = data.get("otp_code")
    new_password = data.get("new_password")

    if not email or not otp_code or not new_password:
        return jsonify({"error": "Email, OTP code, and new password are required"}), 400

    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """SELECT id, expires_at, used FROM password_resets
           WHERE email = %s AND otp_code = %s
           ORDER BY id DESC LIMIT 1""",
        (email, otp_code)
    )
    reset_row = cur.fetchone()

    if not reset_row:
        cur.close()
        conn.close()
        return jsonify({"error": "Invalid OTP code"}), 400

    reset_id, expires_at, used = reset_row

    if used:
        cur.close()
        conn.close()
        return jsonify({"error": "This OTP code has already been used"}), 400

    if datetime.datetime.utcnow() > expires_at:
        cur.close()
        conn.close()
        return jsonify({"error": "This OTP code has expired"}), 400

    new_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt())

    cur.execute("UPDATE users SET password_hash = %s WHERE email = %s", (new_hash.decode("utf-8"), email))
    cur.execute("UPDATE password_resets SET used = TRUE WHERE id = %s", (reset_id,))
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"message": "Password reset successful"})


# ---------------- FARE SEARCH + AI ROUTES ----------------

VEHICLE_PRICING = {
    "bike": {"base_fare": 40, "per_km": 12, "random_range": 10, "eta_range": (3, 7)},
    "auto": {"base_fare": 40, "per_km": 15, "random_range": 12, "eta_range": (5, 10)},
    "cab_economy": {"base_fare": 50, "per_km": 18, "random_range": 15, "eta_range": (7, 10)},
    "cab_premium": {"base_fare": 65, "per_km": 22, "random_range": 20, "eta_range": (7, 10)},
}


@app.route("/api/search-fares", methods=["POST"])
@require_auth
def search_fares():
    data = request.get_json()
    pickup = data.get("pickup")
    drop = data.get("drop")
    mode = data.get("mode")
    log_history = data.get("log_history", True)

    if not pickup or not drop or not mode:
        return jsonify({"error": "Pickup, drop, and mode are required"}), 400

    if mode not in VEHICLE_PRICING:
        return jsonify({"error": "Invalid mode selected"}), 400

    pickup_coords = geocode_location(pickup)
    if not pickup_coords:
        return jsonify({"error": f"Could not find location: {pickup}"}), 400

    drop_coords = geocode_location(drop)
    if not drop_coords:
        return jsonify({"error": f"Could not find location: {drop}"}), 400

    route = get_route(pickup_coords, drop_coords)
    if not route:
        return jsonify({"error": "Could not calculate a route between these locations"}), 400

    if log_history:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO fare_searches (pickup_location, drop_location, user_id) VALUES (%s, %s, %s)",
            (pickup, drop, request.user_id)
        )
        conn.commit()
        cur.close()
        conn.close()

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO fare_searches (pickup_location, drop_location, user_id) VALUES (%s, %s, %s)",
        (pickup, drop, request.user_id)
    )
    conn.commit()
    cur.close()
    conn.close()

    distance_km = route["distance_km"]
    base_eta = route["duration_minutes"]

    pricing = VEHICLE_PRICING[mode]

    if distance_km <= 3:
        tiered_base_fare = pricing["base_fare"]
    else:
        extra_km = distance_km - 3
        tiered_base_fare = pricing["base_fare"] + (extra_km * pricing["per_km"])

    eta_min, eta_max = pricing["eta_range"]

    fares = []
    for service_name in ["Uber", "Ola", "Rapido"]:
        fare = round(tiered_base_fare + random.uniform(0, pricing["random_range"]))
        eta = round(base_eta + random.uniform(eta_min, eta_max))
        fares.append({
            "service": service_name,
            "fare": fare,
            "eta_minutes": eta
        })

    cheapest = min(fares, key=lambda f: f["fare"])
    fastest = min(fares, key=lambda f: f["eta_minutes"])

    return jsonify({
        "pickup": pickup,
        "drop": drop,
        "mode": mode,
        "distance_km": round(distance_km, 1),
        "fares": fares,
        "recommendations": {
            "best_for_cost": cheapest["service"],
            "best_for_time": fastest["service"]
        },
        "route_geometry": route["geometry"]
    })


@app.route("/api/recommend", methods=["POST"])
@require_auth
def recommend():
    data = request.get_json()
    fares = data.get("fares")
    preference = data.get("preference")

    if not fares or not preference:
        return jsonify({"error": "Fares and preference are required"}), 400

    pref_lower = preference.lower()
    time_match = re.search(r'(\d+)\s*(?:min|mins|minute|minutes)', pref_lower)
    budget_match = re.search(r'(?:₹|rs\.?|rupees?)\s*(\d+)|(\d+)\s*(?:₹|rs\.?|rupees?)', pref_lower)

    fact = None
    pick = None

    if time_match:
        max_minutes = int(time_match.group(1))
        eligible = [f for f in fares if f["eta_minutes"] <= max_minutes]
        if eligible:
            pick = min(eligible, key=lambda f: f["fare"])
            fact = f"{pick['service']} takes {pick['eta_minutes']} mins to reach your destination (within your {max_minutes} mins limit), at ₹{pick['fare']}, the cheapest option that qualifies."
        else:
            pick = min(fares, key=lambda f: f["eta_minutes"])
            fact = f"No option meets your {max_minutes} mins limit. {pick['service']} is closest, taking {pick['eta_minutes']} mins to reach your destination — recommend it as the best available."

    elif budget_match:
        max_budget = int(budget_match.group(1) or budget_match.group(2))
        eligible = [f for f in fares if f["fare"] <= max_budget]
        if eligible:
            pick = min(eligible, key=lambda f: f["eta_minutes"])
            fact = f"{pick['service']} costs ₹{pick['fare']} (within your ₹{max_budget} budget) and takes {pick['eta_minutes']} mins to reach your destination, the fastest option that qualifies."
        else:
            pick = min(fares, key=lambda f: f["fare"])
            fact = f"No option fits your ₹{max_budget} budget. {pick['service']} is closest at ₹{pick['fare']} — recommend it as the best available."

    if fact:
        prompt = f"""Write ONE short, friendly sentence (max 15 words) based on this fact: {fact}
        Do not add extra information or change the facts."""
        completion = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}]
        )
        return jsonify({
            "service": pick["service"],
            "recommendation": completion.choices[0].message.content.strip()
        })

    # No explicit numeric constraint — AI interprets urgency, code decides using normalized scoring
    urgency_prompt = f"""The user said: "{preference}"

    On a scale of 1 to 10, how much do they prioritize SPEED over COST?
    1 means they only care about saving money, 10 means they only care about arriving fast, 5 means balanced.

    Respond with ONLY a single number, nothing else."""

    urgency_completion = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": urgency_prompt}]
    )

    try:
        urgency_score = int(re.search(r'\d+', urgency_completion.choices[0].message.content).group())
        urgency_score = max(1, min(10, urgency_score))
    except (AttributeError, ValueError):
        urgency_score = 5

    fare_values = [f["fare"] for f in fares]
    eta_values = [f["eta_minutes"] for f in fares]
    fare_range = max(fare_values) - min(fare_values) or 1
    eta_range = max(eta_values) - min(eta_values) or 1

    urgency_frac = urgency_score / 10

    for f in fares:
        normalized_fare = (f["fare"] - min(fare_values)) / fare_range
        normalized_eta = (f["eta_minutes"] - min(eta_values)) / eta_range
        f["value_score"] = (normalized_fare * (1 - urgency_frac)) + (normalized_eta * urgency_frac)

    best_value = min(fares, key=lambda f: f["value_score"])

    fact = f"{best_value['service']} offers the best overall balance for your preference (₹{best_value['fare']}, {best_value['eta_minutes']} mins)."

    prompt = f"""Write ONE short, friendly sentence (max 15 words) based on this fact: {fact}
    Do not add extra information or change the facts."""
    completion = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}]
    )
    return jsonify({
        "service": best_value["service"],
        "recommendation": completion.choices[0].message.content.strip()
    })


@app.route("/api/search-history", methods=["GET"])
@require_auth
def search_history():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """SELECT fs.pickup_location, fs.drop_location, fs.created_at
           FROM fare_searches fs
           JOIN users u ON fs.user_id = u.id
           WHERE u.id = %s
           ORDER BY fs.created_at DESC
           LIMIT 25""",
        (request.user_id,)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    history = [
        {"pickup": row[0], "drop": row[1], "time": row[2].isoformat()}
        for row in rows
    ]
    return jsonify(history)


@app.route("/api/recent-locations", methods=["GET"])
@require_auth
def recent_locations():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """SELECT pickup_location, MAX(created_at) as last_used
           FROM fare_searches
           WHERE user_id = %s
           GROUP BY pickup_location
           ORDER BY last_used DESC
           LIMIT 5""",
        (request.user_id,)
    )
    pickups = [row[0] for row in cur.fetchall()]

    cur.execute(
        """SELECT drop_location, MAX(created_at) as last_used
           FROM fare_searches
           WHERE user_id = %s
           GROUP BY drop_location
           ORDER BY last_used DESC
           LIMIT 5""",
        (request.user_id,)
    )
    drops = [row[0] for row in cur.fetchall()]

    cur.close()
    conn.close()

    return jsonify({"recent_pickups": pickups, "recent_drops": drops})

BANGALORE_DEFAULT = {"lat": 12.9716, "lon": 77.5946}


@app.route("/api/last-location", methods=["GET"])
@require_auth
def last_location():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT drop_location FROM fare_searches WHERE user_id = %s ORDER BY created_at DESC LIMIT 1",
        (request.user_id,)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        return jsonify({"lat": BANGALORE_DEFAULT["lat"], "lon": BANGALORE_DEFAULT["lon"]})

    coords = geocode_location(row[0])
    if not coords:
        return jsonify({"lat": BANGALORE_DEFAULT["lat"], "lon": BANGALORE_DEFAULT["lon"]})

    return jsonify({"lat": coords["lat"], "lon": coords["lon"]})


if __name__ == "__main__":
    app.run(debug=True, port=5000)