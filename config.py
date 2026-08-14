import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
if not BOT_TOKEN:
    print("Warning: BOT_TOKEN is not set in .env file!")

DB_URL = os.getenv("DB_URL", "sqlite+aiosqlite:///fishbot.db")
WEBAPP_URL = os.getenv("WEBAPP_URL", "")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))
