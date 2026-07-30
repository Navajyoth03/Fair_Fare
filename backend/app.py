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

load_dotenv()

app = Flask(__name__)
CORS(app)

DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET = os.getenv("JWT_SECRET", "temporary-dev-secret-change-this")

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def get_db_connection():
    conn = psycopg2.connect(DATABASE_URL)
    return conn


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
            "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id",
            (email, password_hash.decode("utf-8"))
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

    return jsonify({"token": token, "email": email}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    user_id, stored_hash = user

    if not bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8")):
        return jsonify({"error": "Invalid email or password"}), 401

    token = jwt.encode(
        {"user_id": user_id, "email": email, "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)},
        JWT_SECRET,
        algorithm="HS256"
    )

    return jsonify({"token": token, "email": email})


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

@app.route("/api/search-fares", methods=["POST"])
@require_auth
def search_fares():
    data = request.get_json()
    pickup = data.get("pickup")
    drop = data.get("drop")

    if not pickup or not drop:
        return jsonify({"error": "Pickup and drop locations are required"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO fare_searches (pickup_location, drop_location, user_id) VALUES (%s, %s, %s)",
        (pickup, drop, request.user_id)
    )
    conn.commit()
    cur.close()
    conn.close()

    base_fare = random.randint(150, 250)
    base_eta = random.randint(10, 20)

    fare_diff_uber = random.randint(-7, 7)
    fare_diff_ola = random.randint(-7, 7)
    fare_diff_rapido = random.randint(-7, 7)

    eta_diff_uber = random.randint(-4, 4)
    eta_diff_ola = random.randint(-4, 4)
    eta_diff_rapido = random.randint(-4, 4)

    fares = [
        {
            "service": "Uber",
            "fare": base_fare + fare_diff_uber,
            "eta_minutes": max(3, base_eta + eta_diff_uber)
        },
        {
            "service": "Ola",
            "fare": base_fare + fare_diff_ola,
            "eta_minutes": max(3, base_eta + eta_diff_ola)
        },
        {
            "service": "Rapido",
            "fare": base_fare + fare_diff_rapido,
            "eta_minutes": max(3, base_eta + eta_diff_rapido)
        },
    ]

    cheapest = min(fares, key=lambda f: f["fare"])
    fastest = min(fares, key=lambda f: f["eta_minutes"])

    return jsonify({
        "pickup": pickup,
        "drop": drop,
        "fares": fares,
        "recommendations": {
            "best_for_cost": cheapest["service"],
            "best_for_time": fastest["service"]
        }
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


if __name__ == "__main__":
    app.run(debug=True, port=5000)