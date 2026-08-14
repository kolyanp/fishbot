from aiogram import Router, F, Bot
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy.future import select
from sqlalchemy import func

from database.models import User, CatchLog
from database.engine import async_session
from config import ADMIN_ID

router = Router()

def is_admin(user_id: int) -> bool:
    return ADMIN_ID != 0 and user_id == ADMIN_ID

@router.message(Command("admin"))
async def cmd_admin(message: Message):
    if not is_admin(message.from_user.id):
        return
        
    async with async_session() as session:
        users_count = await session.scalar(select(func.count()).select_from(User))
        catches_count = await session.scalar(select(func.count()).select_from(CatchLog))
        
    await message.answer(
        f"👑 **Адмін Панель**\n\n"
        f"👥 Користувачів: {users_count}\n"
        f"🐟 Збережених уловів: {catches_count}\n\n"
        f"Щоб зробити розсилку, відправте:\n"
        f"`/broadcast текст вашого повідомлення`",
        parse_mode="Markdown"
    )

@router.message(Command("broadcast"))
async def cmd_broadcast(message: Message, bot: Bot):
    if not is_admin(message.from_user.id):
        return
        
    text = message.text.replace("/broadcast", "").strip()
    if not text:
        await message.answer("Вкажіть текст після команди /broadcast")
        return
        
    async with async_session() as session:
        result = await session.execute(select(User.telegram_id))
        users = result.scalars().all()
        
    success = 0
    for uid in users:
        try:
            await bot.send_message(uid, f"📢 **Оголошення**\n\n{text}", parse_mode="Markdown")
            success += 1
        except Exception:
            pass
            
    await message.answer(f"✅ Розсилка завершена. Успішно відправлено: {success}/{len(users)}.")
