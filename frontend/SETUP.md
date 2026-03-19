# =============================================
# STOCK WATCHER — MULTI-USER SETUP GUIDE
# =============================================

# ── 1. POSTGRESQL (on Oracle VM) ──────────────
# Install:
#   sudo apt install postgresql postgresql-contrib -y
#   sudo systemctl start postgresql
#   sudo systemctl enable postgresql
#
# Create DB and user:
#   sudo -u postgres psql
#   CREATE USER stockuser WITH PASSWORD 'yourpassword';
#   CREATE DATABASE stockwatcher OWNER stockuser;
#   \q

# ── 2. FIREBASE SETUP ─────────────────────────
# 1. Go to https://console.firebase.google.com
# 2. Create a new project
# 3. Enable Authentication → Google provider
# 4. Go to Project Settings → General → Your Apps → Add Web App
# 5. Copy the firebaseConfig object into App.jsx
# 6. Go to Project Settings → General → scroll to "Web API Key"
#    — copy the "Web client ID" from OAuth 2.0 section
#    — this is FIREBASE_WEB_CLIENT_ID in .env

# ── 3. .ENV FILE (on Oracle VM, same folder as app.py) ──
DATABASE_URL=postgresql://stockuser:yourpassword@localhost:5432/stockwatcher
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com

# ── 4. INSTALL DEPENDENCIES ───────────────────
# pip install flask flask-cors psycopg2-binary yfinance twilio python-dotenv requests

# ── 5. FRONTEND ───────────────────────────────
# In App.jsx, replace:
#   const API = "http://YOUR_ORACLE_IP:5000"
#   firebaseConfig = { ... }  ← from Firebase console

# ── 6. RUN ────────────────────────────────────
# python app.py
# (or as systemd service — see previous setup guide)
