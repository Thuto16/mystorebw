# config.py — Loads secret settings from the .env file

import os
from dotenv import load_dotenv

# Load the .env file into environment variables
load_dotenv()

# Read each setting. If it's missing, use a default.
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "mystorebw")

FLASK_SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "changeme123")

# Shop's WhatsApp number in international format, no + or spaces
WHATSAPP_NUMBER = os.getenv("WHATSAPP_NUMBER", "")