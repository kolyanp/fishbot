import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    print("Warning: BOT_TOKEN is not set in .env file!")

DB_URL = os.getenv("DB_URL", "sqlite+aiosqlite:///fishbot.db")
WEBAPP_URL = os.getenv("WEBAPP_URL", "")
