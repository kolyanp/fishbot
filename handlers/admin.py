from aiogram import Router, F, Bot
from aiogram.filters import Command
from aiogram.types import Message, FSInputFile
from sqlalchemy.future import select
from sqlalchemy import func, desc
from sqlalchemy.orm import selectinload
import os

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
        total_weight = await session.scalar(select(func.sum(CatchLog.weight)))
        
        # Get most popular fish
        fish_result = await session.execute(
            select(CatchLog.fish_species, func.count(CatchLog.id).label('c'))
            .group_by(CatchLog.fish_species)
            .order_by(desc('c'))
            .limit(1)
        )
        popular_fish_row = fish_result.first()
        popular_fish = popular_fish_row[0] if popular_fish_row else "Немає даних"
        
    weight_str = f"{total_weight:.1f}" if total_weight else "0"
        
    await message.answer(
        f"👑 **Адмін Панель**\n\n"
        f"👥 Користувачів: {users_count}\n"
        f"🐟 Збережених уловів: {catches_count}\n"
        f"⚖️ Загальна вага риби: {weight_str} кг\n"
        f"🏆 Найпопулярніша риба: {popular_fish}\n\n"
        f"🔧 **Додаткові команди:**\n"
        f"`/recent` - останні 5 уловів\n"
        f"`/backup` - завантажити базу даних\n\n"
        f"Щоб зробити розсилку (можна з фото), відправте:\n"
        f"`/broadcast текст вашого повідомлення`",
        parse_mode="Markdown"
    )

@router.message(Command("broadcast"))
async def cmd_broadcast(message: Message, bot: Bot):
    if not is_admin(message.from_user.id):
        return
        
    text = ""
    photo_file_id = None
    
    if message.caption:
        text = message.caption.replace("/broadcast", "").strip()
        if message.photo:
            photo_file_id = message.photo[-1].file_id
    elif message.text:
        text = message.text.replace("/broadcast", "").strip()
        
    if not text and not photo_file_id:
        await message.answer("Вкажіть текст (або прикріпіть фото з текстом) після команди /broadcast")
        return
        
    async with async_session() as session:
        result = await session.execute(select(User.telegram_id))
        users = result.scalars().all()
        
    success = 0
    for uid in users:
        try:
            if photo_file_id:
                await bot.send_photo(uid, photo_file_id, caption=f"📢 **Оголошення**\n\n{text}", parse_mode="Markdown")
            else:
                await bot.send_message(uid, f"📢 **Оголошення**\n\n{text}", parse_mode="Markdown")
            success += 1
        except Exception:
            pass
            
    await message.answer(f"✅ Розсилка завершена. Успішно відправлено: {success}/{len(users)}.")

@router.message(Command("recent"))
async def cmd_recent(message: Message):
    if not is_admin(message.from_user.id):
        return
        
    async with async_session() as session:
        result = await session.execute(
            select(CatchLog)
            .options(selectinload(CatchLog.user))
            .order_by(desc(CatchLog.created_at))
            .limit(5)
        )
        catches = result.scalars().all()
        
    if not catches:
        await message.answer("Уловів поки немає.")
        return
        
    await message.answer("🎣 **Останні 5 уловів:**", parse_mode="Markdown")
    
    for c in catches:
        date_str = c.created_at.strftime('%d.%m.%Y %H:%M') if c.created_at else "Невідомо"
        username = f"@{c.user.username}" if c.user.username else f"ID: {c.user.telegram_id}"
        loc = c.location if c.location else "Не вказано"
        
        text = (
            f"👤 Рибалка: {username}\n"
            f"🐟 Риба: {c.fish_species}\n"
            f"⚖️ Вага: {c.weight} кг\n"
            f"🪱 Наживка: {c.bait}\n"
            f"📍 Локація: {loc}\n"
            f"📅 Дата: {date_str}"
        )
        
        if c.photo_id and os.path.exists(c.photo_id):
            photo = FSInputFile(c.photo_id)
            await message.answer_photo(photo, caption=text)
        else:
            await message.answer(text)

@router.message(Command("backup"))
async def cmd_backup(message: Message):
    if not is_admin(message.from_user.id):
        return
        
    if os.path.exists("fishbot.db"):
        db_file = FSInputFile("fishbot.db")
        await message.answer_document(db_file, caption="📦 Ось резервна копія вашої бази даних.")
    else:
        await message.answer("Базу даних не знайдено.")
