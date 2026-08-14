from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, ReplyKeyboardRemove
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import StatesGroup, State
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database.models import User, CatchLog
from database.engine import async_session

router = Router()

class LogbookState(StatesGroup):
    waiting_for_species = State()
    waiting_for_weight = State()
    waiting_for_bait = State()
    waiting_for_photo = State()

@router.message(Command("log"))
@router.message(F.text == "🎣 Додати улов")
async def cmd_log_catch(message: Message, state: FSMContext):
    await message.answer("Супер! Давай запишемо твій улов. 🐟\n\nЯку рибу ти спіймав?")
    await state.set_state(LogbookState.waiting_for_species)

@router.message(LogbookState.waiting_for_species, F.text)
async def process_species(message: Message, state: FSMContext):
    await state.update_data(species=message.text)
    await message.answer("Чудово. Яка вага риби (в кг, наприклад 1.5)? Якщо не знаєш, напиши 0.")
    await state.set_state(LogbookState.waiting_for_weight)

@router.message(LogbookState.waiting_for_weight, F.text)
async def process_weight(message: Message, state: FSMContext):
    try:
        weight = float(message.text.replace(',', '.'))
        await state.update_data(weight=weight)
        await message.answer("На яку наживку чи приманку клюнула?")
        await state.set_state(LogbookState.waiting_for_bait)
    except ValueError:
        await message.answer("Будь ласка, введи число (наприклад, 1.5 або 2).")

@router.message(LogbookState.waiting_for_bait, F.text)
async def process_bait(message: Message, state: FSMContext):
    await state.update_data(bait=message.text)
    await message.answer("Клас! Надішли фото улову (або напиши 'пропустити', якщо фото немає).")
    await state.set_state(LogbookState.waiting_for_photo)

@router.message(LogbookState.waiting_for_photo)
async def process_photo(message: Message, state: FSMContext):
    photo_id = None
    if message.photo:
        photo_id = message.photo[-1].file_id # Get highest resolution
    elif message.text and message.text.lower() != 'пропустити':
        await message.answer("Будь ласка, надішли фото або напиши 'пропустити'.")
        return

    data = await state.get_data()
    
    # Save to database
    async with async_session() as session:
        # Get user
        result = await session.execute(select(User).filter_by(telegram_id=message.from_user.id))
        user = result.scalar_one_or_none()
        
        if not user:
            user = User(telegram_id=message.from_user.id, username=message.from_user.username)
            session.add(user)
            await session.commit()
            await session.refresh(user)
            
        new_log = CatchLog(
            user_id=user.id,
            fish_species=data['species'],
            weight=data['weight'],
            bait=data['bait'],
            photo_id=photo_id
        )
        session.add(new_log)
        await session.commit()
    
    await state.clear()
    await message.answer("✅ Твій улов успішно збережено в Щоденник рибалки!")

