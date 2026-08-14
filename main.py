import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand

from config import BOT_TOKEN
from database.engine import init_db
from web_server import start_web_server

# Handlers
from handlers import common, logbook, forecast

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
)

async def set_default_commands(bot: Bot):
    await bot.set_my_commands([
        BotCommand(command="start", description="Почати роботу"),
        BotCommand(command="log", description="Записати новий улов"),
        BotCommand(command="forecast", description="Дізнатися прогноз кльову"),
        BotCommand(command="help", description="Допомога"),
    ])

async def main():
    if not BOT_TOKEN:
        logging.error("No BOT_TOKEN provided in .env!")
        return

    # Initialize DB
    await init_db()
    
    # Start Web Server for Mini App
    runner = await start_web_server(port=8080)

    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())

    # Include routers
    dp.include_router(common.router)
    dp.include_router(logbook.router)
    dp.include_router(forecast.router)

    # Set commands
    await set_default_commands(bot)

    logging.info("Starting bot...")
    try:
        await dp.start_polling(bot)
    finally:
        await runner.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
