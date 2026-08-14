from aiogram import Router, F, Bot
from aiogram.filters import Command
from aiogram.types import Message, FSInputFile, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery, BufferedInputFile
from aiogram.utils.keyboard import InlineKeyboardBuilder
from sqlalchemy.future import select
from sqlalchemy import func, desc
from sqlalchemy.orm import selectinload
import os

from database.models import User, CatchLog, ChatMessage
from database.engine import async_session
from config import ADMIN_ID

router = Router()

def is_admin(user_id: int) -> bool:
    return ADMIN_ID != 0 and user_id == ADMIN_ID

async def check_is_admin_or_mod(user_id: int, session) -> bool:
    if is_admin(user_id):
        return True
    result = await session.execute(select(User).filter_by(telegram_id=user_id))
    user = result.scalar_one_or_none()
    if user and user.is_moderator:
        return True
    return False

@router.message(Command("admin"))
@router.message(F.text == "👑 Адмінка")
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
        
    admin_kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="👥 Список користувачів", callback_data="admin_users")],
            [InlineKeyboardButton(text="💬 Лог чату", callback_data="admin_chat_log")],
            [InlineKeyboardButton(text="🎣 Останні 5 уловів", callback_data="admin_recent")],
            [InlineKeyboardButton(text="📦 Завантажити бекап БД", callback_data="admin_backup")]
        ]
    )
        
    await message.answer(
        f"👑 **Адмін Панель**\n\n"
        f"👥 Користувачів: {users_count}\n"
        f"🐟 Збережених уловів: {catches_count}\n"
        f"⚖️ Загальна вага риби: {weight_str} кг\n"
        f"🏆 Найпопулярніша риба: {popular_fish}\n\n"
        f"Щоб зробити розсилку (можна з фото), відправте:\n"
        f"`/broadcast текст вашого повідомлення`",
        parse_mode="Markdown",
        reply_markup=admin_kb
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

@router.callback_query(F.data == "admin_recent")
async def cq_admin_recent(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("Ви не адміністратор.", show_alert=True)
        return
        
    await callback.answer()
    
    # Create a mock message to reuse the command logic
    msg = callback.message
    msg_copy = msg.model_copy(update={"from_user": callback.from_user})
    await cmd_recent(msg_copy)

@router.message(Command("backup"))
async def cmd_backup(message: Message):
    if not is_admin(message.from_user.id):
        return
        
    if os.path.exists("fishbot.db"):
        db_file = FSInputFile("fishbot.db")
        await message.answer_document(db_file, caption="📦 Ось резервна копія вашої бази даних.")
    else:
        await message.answer("Базу даних не знайдено.")

@router.callback_query(F.data == "admin_backup")
async def cq_admin_backup(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("Ви не адміністратор.", show_alert=True)
        return
        
    await callback.answer()
    msg = callback.message
    msg_copy = msg.model_copy(update={"from_user": callback.from_user})
    await cmd_backup(msg_copy)

@router.callback_query(F.data.startswith("admin_users"))
async def cq_admin_users(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("Ви не адміністратор.", show_alert=True)
        return
        
    parts = callback.data.split("_")
    page = int(parts[2]) if len(parts) > 2 else 0
    per_page = 10
    
    async with async_session() as session:
        result = await session.execute(select(User).order_by(User.id.desc()))
        users = result.scalars().all()
        
    if not users:
        await callback.message.answer("Користувачів не знайдено.")
        return
        
    total_pages = (len(users) + per_page - 1) // per_page
    if page >= total_pages: page = total_pages - 1
    if page < 0: page = 0
    
    start = page * per_page
    end = start + per_page
    page_users = users[start:end]
    
    text = f"👥 **Список всіх користувачів ({len(users)} чол.):**\nСторінка {page+1}/{total_pages}\n\n"
    
    builder = InlineKeyboardBuilder()
    
    for u in page_users:
        username = f"@{u.username}" if u.username else "без_юзернейму"
        status = ""
        if getattr(u, 'is_banned', False): status = "🛑"
        elif getattr(u, 'muted_until', None): status = "🔇"
        
        text += f"ID: `{u.telegram_id}` | {username} {status}\n"
        builder.button(text=f"⚙️ {u.telegram_id}", callback_data=f"mod_user_{u.telegram_id}")
        
    builder.adjust(2) # 2 buttons per row for users
    
    # Pagination buttons
    nav_buttons = []
    if page > 0:
        nav_buttons.append(InlineKeyboardButton(text="⬅️ Назад", callback_data=f"admin_users_{page-1}"))
    if page < total_pages - 1:
        nav_buttons.append(InlineKeyboardButton(text="Вперед ➡️", callback_data=f"admin_users_{page+1}"))
        
    if nav_buttons:
        builder.row(*nav_buttons)
        
    try:
        if callback.message.text and callback.message.text.startswith("👥"):
            await callback.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="Markdown")
        else:
            await callback.message.answer(text, reply_markup=builder.as_markup(), parse_mode="Markdown")
    except:
        pass
    await callback.answer()

@router.callback_query(F.data == "admin_chat_log")
async def cq_admin_chat_log(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("Ви не адміністратор.", show_alert=True)
        return
        
    await callback.answer()
    
    async with async_session() as session:
        result = await session.execute(
            select(ChatMessage)
            .options(selectinload(ChatMessage.user))
            .order_by(ChatMessage.created_at.desc())
            .limit(15)
        )
        messages = result.scalars().all()
        
    if not messages:
        await callback.message.answer("У чаті поки що немає повідомлень.")
        return
        
    messages.reverse() # Oldest first in the message
    
    text = "💬 **Останні 15 повідомлень чату:**\n\n"
    builder = InlineKeyboardBuilder()
    
    unique_users = {}
    
    for m in messages:
        date_str = m.created_at.strftime('%H:%M:%S') if m.created_at else ""
        username = f"@{m.user.username}" if m.user.username else f"ID:{m.user.telegram_id}"
        text += f"[{date_str}] {username}: {m.text}\n"
        
        if m.user.telegram_id not in unique_users:
            unique_users[m.user.telegram_id] = username
            
    for uid, uname in unique_users.items():
        builder.button(text=f"⚙️ {uname}", callback_data=f"mod_user_{uid}")
        
    builder.adjust(2)
    
    await callback.message.answer(text, reply_markup=builder.as_markup(), parse_mode="Markdown")



# --- Модерація ---
@router.message(Command("ban"))
async def cmd_ban(message: Message):
    args = message.text.split(maxsplit=2)
    if len(args) < 2:
        await message.answer("Використання: `/ban <ID> [причина]`", parse_mode="Markdown")
        return
        
    target_id = args[1]
    reason = args[2] if len(args) > 2 else "Не вказано"
    
    if not target_id.isdigit():
        await message.answer("ID має бути числом.")
        return
        
    async with async_session() as session:
        if not await check_is_admin_or_mod(message.from_user.id, session):
            return
            
        result = await session.execute(select(User).filter_by(telegram_id=int(target_id)))
        target = result.scalar_one_or_none()
        
        if not target:
            await message.answer("Користувача не знайдено.")
            return
            
        target.is_banned = True
        target.ban_reason = reason
        await session.commit()
        
    await message.answer(f"✅ Користувача {target_id} забанено.\nПричина: {reason}")

@router.message(Command("unban"))
@router.message(Command("unmute"))
async def cmd_unban(message: Message):
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        await message.answer("Використання: `/unban <ID>`", parse_mode="Markdown")
        return
        
    target_id = args[1]
    
    if not target_id.isdigit():
        await message.answer("ID має бути числом.")
        return
        
    async with async_session() as session:
        if not await check_is_admin_or_mod(message.from_user.id, session):
            return
            
        result = await session.execute(select(User).filter_by(telegram_id=int(target_id)))
        target = result.scalar_one_or_none()
        
        if not target:
            await message.answer("Користувача не знайдено.")
            return
            
        target.is_banned = False
        target.ban_reason = None
        target.muted_until = None
        target.mute_reason = None
        await session.commit()
        
    await message.answer(f"✅ Всі обмеження з користувача {target_id} знято.")

@router.message(Command("mute"))
async def cmd_mute(message: Message):
    args = message.text.split(maxsplit=3)
    if len(args) < 3:
        await message.answer("Використання: `/mute <ID> <години> [причина]`", parse_mode="Markdown")
        return
        
    target_id = args[1]
    hours = args[2]
    reason = args[3] if len(args) > 3 else "Не вказано"
    
    if not target_id.isdigit() or not hours.isdigit():
        await message.answer("ID та години мають бути числами.")
        return
        
    async with async_session() as session:
        if not await check_is_admin_or_mod(message.from_user.id, session):
            return
            
        result = await session.execute(select(User).filter_by(telegram_id=int(target_id)))
        target = result.scalar_one_or_none()
        
        if not target:
            await message.answer("Користувача не знайдено.")
            return
            
        from datetime import datetime, timedelta
        target.muted_until = datetime.utcnow() + timedelta(hours=int(hours))
        target.mute_reason = reason
        await session.commit()
        
    await message.answer(f"✅ Користувача {target_id} замучено на {hours} годин.\nПричина: {reason}")

@router.message(Command("setmod"))
async def cmd_setmod(message: Message):
    if not is_admin(message.from_user.id): # Тільки головний адмін може давати права
        return
        
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        await message.answer("Використання: `/setmod <ID>`", parse_mode="Markdown")
        return
        
    target_id = args[1]
    
    if not target_id.isdigit():
        await message.answer("ID має бути числом.")
        return
        
    async with async_session() as session:
        result = await session.execute(select(User).filter_by(telegram_id=int(target_id)))
        target = result.scalar_one_or_none()
        
        if not target:
            await message.answer("Користувача не знайдено.")
            return
            
        target.is_moderator = True
        await session.commit()
        
    await message.answer(f"✅ Користувача {target_id} призначено модератором.")

@router.message(Command("delmod"))
async def cmd_delmod(message: Message):
    if not is_admin(message.from_user.id):
        return
        
    args = message.text.split(maxsplit=1)
    if len(args) < 2:
        await message.answer("Використання: `/delmod <ID>`", parse_mode="Markdown")
        return
        
    target_id = args[1]
    
    if not target_id.isdigit():
        await message.answer("ID має бути числом.")
        return
        
    async with async_session() as session:
        result = await session.execute(select(User).filter_by(telegram_id=int(target_id)))
        target = result.scalar_one_or_none()
        
        if not target:
            await message.answer("Користувача не знайдено.")
            return
            
        target.is_moderator = False
        await session.commit()
        
    await message.answer(f"✅ Користувача {target_id} більше не модератор.")

@router.callback_query(F.data.startswith("mod_user_"))
async def cq_mod_user(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("Ви не адміністратор.", show_alert=True)
        return
        
    target_id = int(callback.data.split("_")[2])
    
    async with async_session() as session:
        result = await session.execute(select(User).filter_by(telegram_id=target_id))
        target = result.scalar_one_or_none()
        
    if not target:
        await callback.answer("Користувача не знайдено.", show_alert=True)
        return
        
    username = f"@{target.username}" if target.username else "без_юзернейму"
    status = "Нормальний"
    if target.is_banned:
        status = "🛑 ЗАБАНЕНИЙ"
    elif target.muted_until:
        status = f"🔇 МУТ до {target.muted_until.strftime('%Y-%m-%d %H:%M')}"
        
    text = f"🛡 **Модерація користувача**\n\n" \
           f"ID: `{target_id}`\n" \
           f"Ім'я: {username}\n" \
           f"Статус: {status}\n\n" \
           f"Оберіть дію:"
           
    builder = InlineKeyboardBuilder()
    builder.button(text="🔇 Мут 1 год", callback_data=f"mod_act_{target_id}_mute1")
    builder.button(text="🔇 Мут 24 год", callback_data=f"mod_act_{target_id}_mute24")
    builder.button(text="🛑 Бан назавжди", callback_data=f"mod_act_{target_id}_ban")
    builder.button(text="✅ Зняти обмеження", callback_data=f"mod_act_{target_id}_unban")
    builder.adjust(2, 1, 1)
    
    try:
        await callback.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="Markdown")
    except:
        await callback.message.answer(text, reply_markup=builder.as_markup(), parse_mode="Markdown")
    await callback.answer()

@router.callback_query(F.data.startswith("mod_act_"))
async def cq_mod_act(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer("Ви не адміністратор.", show_alert=True)
        return
        
    parts = callback.data.split("_")
    target_id = int(parts[2])
    action = parts[3]
    
    async with async_session() as session:
        result = await session.execute(select(User).filter_by(telegram_id=target_id))
        target = result.scalar_one_or_none()
        
        if not target:
            await callback.answer("Користувача не знайдено.", show_alert=True)
            return
            
        from datetime import datetime, timedelta
        
        if action == "mute1":
            target.muted_until = datetime.utcnow() + timedelta(hours=1)
            target.mute_reason = "Через адмін-панель"
            msg = f"🔇 Користувача {target_id} замучено на 1 год."
        elif action == "mute24":
            target.muted_until = datetime.utcnow() + timedelta(hours=24)
            target.mute_reason = "Через адмін-панель"
            msg = f"🔇 Користувача {target_id} замучено на 24 год."
        elif action == "ban":
            target.is_banned = True
            target.ban_reason = "Через адмін-панель"
            msg = f"🛑 Користувача {target_id} забанено."
        elif action == "unban":
            target.is_banned = False
            target.ban_reason = None
            target.muted_until = None
            target.mute_reason = None
            msg = f"✅ З користувача {target_id} знято всі обмеження."
            
        await session.commit()
        
    await callback.answer(msg, show_alert=True)
    
    # Refresh the mod menu text to show new status
    username = f"@{target.username}" if target.username else "без_юзернейму"
    status = "Нормальний"
    if target.is_banned:
        status = "🛑 ЗАБАНЕНИЙ"
    elif target.muted_until:
        status = f"🔇 МУТ до {target.muted_until.strftime('%Y-%m-%d %H:%M')}"
        
    text = f"🛡 **Модерація користувача**\n\n" \
           f"ID: `{target_id}`\n" \
           f"Ім'я: {username}\n" \
           f"Статус: {status}\n\n" \
           f"Оберіть дію:"
           
    builder = InlineKeyboardBuilder()
    builder.button(text="🔇 Мут 1 год", callback_data=f"mod_act_{target_id}_mute1")
    builder.button(text="🔇 Мут 24 год", callback_data=f"mod_act_{target_id}_mute24")
    builder.button(text="🛑 Бан назавжди", callback_data=f"mod_act_{target_id}_ban")
    builder.button(text="✅ Зняти обмеження", callback_data=f"mod_act_{target_id}_unban")
    builder.adjust(2, 1, 1)
    
    try:
        await callback.message.edit_text(text, reply_markup=builder.as_markup(), parse_mode="Markdown")
    except:
        pass


@router.message(Command("mod"))
async def cmd_mod(message: Message):
    if not is_admin(message.from_user.id):
        return
        
    target_username = None
    target_id = None
    
    if message.reply_to_message:
        target_id = message.reply_to_message.from_user.id
        target_username = message.reply_to_message.from_user.username
    else:
        parts = message.text.split(maxsplit=1)
        if len(parts) > 1:
            target_username = parts[1].replace('@', '').strip()
            
    if not target_username and not target_id:
        await message.answer("Вкажіть юзернейм або зробіть реплай на повідомлення користувача: /mod @username")
        return
        
    async with async_session() as session:
        if target_id:
            result = await session.execute(select(User).filter_by(telegram_id=target_id))
        else:
            result = await session.execute(select(User).filter_by(username=target_username))
            
        target = result.scalar_one_or_none()
        
        if not target:
            await message.answer("Користувача не знайдено в базі даних.")
            return
            
        target.is_moderator = True
        await session.commit()
        
    name = f"@{target.username}" if target.username else f"ID: {target.telegram_id}"
    await message.answer(f"✅ Користувача {name} призначено модератором!")


@router.message(Command("unmod"))
async def cmd_unmod(message: Message):
    if not is_admin(message.from_user.id):
        return
        
    target_username = None
    target_id = None
    
    if message.reply_to_message:
        target_id = message.reply_to_message.from_user.id
    else:
        parts = message.text.split(maxsplit=1)
        if len(parts) > 1:
            target_username = parts[1].replace('@', '').strip()
            
    if not target_username and not target_id:
        await message.answer("Вкажіть юзернейм або зробіть реплай на повідомлення користувача: /unmod @username")
        return
        
    async with async_session() as session:
        if target_id:
            result = await session.execute(select(User).filter_by(telegram_id=target_id))
        else:
            result = await session.execute(select(User).filter_by(username=target_username))
            
        target = result.scalar_one_or_none()
        
        if not target:
            await message.answer("Користувача не знайдено в базі даних.")
            return
            
        target.is_moderator = False
        await session.commit()
        
    name = f"@{target.username}" if target.username else f"ID: {target.telegram_id}"
    await message.answer(f"❌ З користувача {name} знято права модератора.")


@router.message(Command("mods"))
async def cmd_mods(message: Message):
    if not is_admin(message.from_user.id):
        return
        
    async with async_session() as session:
        result = await session.execute(select(User).filter_by(is_moderator=True))
        mods = result.scalars().all()
        
    if not mods:
        await message.answer("Наразі немає жодного модератора.")
        return
        
    text = "🛡 **Список модераторів:**\n\n"
    for i, mod in enumerate(mods, 1):
        name = f"@{mod.username}" if mod.username else f"ID: {mod.telegram_id}"
        text += f"{i}. {name}\n"
        
    await message.answer(text, parse_mode="Markdown")
