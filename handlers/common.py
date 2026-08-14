from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton
from aiogram.types.web_app_info import WebAppInfo
from sqlalchemy.future import select
import json
import hmac
import hashlib
from config import WEBAPP_URL, BOT_TOKEN, ADMIN_ID
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import User
from database.engine import async_session

router = Router()

def generate_secure_url(user_id: int, tab: str = None) -> str:
    if not WEBAPP_URL:
        return ""
    sig = hmac.new(BOT_TOKEN.encode(), str(user_id).encode(), hashlib.sha256).hexdigest()
    separator = "&" if "?" in WEBAPP_URL else "?"
    import time
    url = f"{WEBAPP_URL}{separator}user_id={user_id}&sig={sig}&cb={int(time.time())}"
    if tab:
        url += f"&tab={tab}"
    return url

def get_main_keyboard(user_id: int) -> ReplyKeyboardMarkup:
    keyboard = [
        [KeyboardButton(text="🎣 ПОЧАТИ", web_app=WebAppInfo(url=generate_secure_url(user_id)))]
    ]
    
    if ADMIN_ID != 0 and user_id == ADMIN_ID:
        keyboard.append([KeyboardButton(text="👑 Адмінка")])
        
    return ReplyKeyboardMarkup(
        keyboard=keyboard,
        resize_keyboard=True
    )

@router.message(CommandStart())
async def cmd_start(message: Message):
    async with async_session() as session:
        # Check if user exists
        result = await session.execute(select(User).filter_by(telegram_id=message.from_user.id))
        user = result.scalar_one_or_none()
        
        if not user:
            user = User(
                telegram_id=message.from_user.id,
                username=message.from_user.username
            )
            session.add(user)
            await session.commit()
            
    await message.answer(
        f"Привіт, {message.from_user.first_name}! 🎣\n\n"
        "Я твій особистий бот-помічник для риболовлі.\n"
        "Натискай кнопку «ПОЧАТИ» нижче, щоб відкрити додаток!",
        reply_markup=get_main_keyboard(message.from_user.id)
    )

@router.message(Command("help"))
@router.message(F.text == "📖 Довідка")
async def cmd_help(message: Message):
    await message.answer(
        "Доступні команди:\n"
        "/start - Почати роботу з ботом\n"
        "/help - Отримати допомогу\n"
        "/log - Записати новий улов у щоденник"
    )

@router.message(F.web_app_data)
async def web_app_data_handler(message: Message):
    try:
        data = json.loads(message.web_app_data.data)
        
        # Save to database
        async with async_session() as session:
            result = await session.execute(select(User).filter_by(telegram_id=message.from_user.id))
            user = result.scalar_one_or_none()
            
            if not user:
                user = User(telegram_id=message.from_user.id, username=message.from_user.username)
                session.add(user)
                await session.commit()
                await session.refresh(user)
                
            from database.models import CatchLog
            new_log = CatchLog(
                user_id=user.id,
                fish_species=data.get('species', 'Невідомо'),
                weight=data.get('weight', 0.0),
                bait=data.get('bait', ''),
                photo_id=None
            )
            session.add(new_log)
            await session.commit()
            
        await message.answer(
            f"✅ Улов збережено через Web App!\n"
            f"Риба: {data.get('species')}\n"
            f"Вага: {data.get('weight')} кг\n"
            f"Наживка: {data.get('bait')}",
            reply_markup=get_main_keyboard()
        )
    except Exception as e:
        await message.answer(f"Помилка при збереженні: {e}")
