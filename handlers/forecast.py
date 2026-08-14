from aiogram import Router, F
from aiogram.types import Message
from aiogram.filters import Command
from aiogram.utils.keyboard import ReplyKeyboardBuilder
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import StatesGroup, State

from services.weather import get_weather_forecast, analyze_fishing_conditions, get_coordinates_by_city
from handlers.common import get_main_keyboard

router = Router()

class ForecastState(StatesGroup):
    waiting_for_location = State()

@router.message(Command("forecast"))
@router.message(F.text == "🌦 Прогноз кльову")
async def cmd_forecast(message: Message, state: FSMContext):
    builder = ReplyKeyboardBuilder()
    builder.button(text="📍 Надіслати мою локацію", request_location=True)
    
    await message.answer(
        "Щоб я міг дати прогноз кльову, надішли мені свою локацію за допомогою кнопки нижче "
        "або просто **напиши назву села/міста/водойми** текстом (наприклад, 'Київ' або 'Качанівка').",
        reply_markup=builder.as_markup(resize_keyboard=True, one_time_keyboard=True),
        parse_mode="Markdown"
    )
    await state.set_state(ForecastState.waiting_for_location)

@router.message(ForecastState.waiting_for_location, F.location)
async def handle_location(message: Message, state: FSMContext):
    lat = message.location.latitude
    lon = message.location.longitude
    
    await process_forecast(message, state, lat, lon, "твоєю локацією")

@router.message(ForecastState.waiting_for_location, F.text)
async def handle_city_text(message: Message, state: FSMContext):
    city_name = message.text
    if city_name in ["🎣 Додати улов", "🌦 Прогноз кльову", "📖 Довідка"]:
        await state.clear()
        return
        
    await message.answer(f"Шукаю координати для '{city_name}'... 🔍")
    coords = await get_coordinates_by_city(city_name)
    
    if not coords:
        await message.answer(
            f"Не вдалося знайти '{city_name}'. Спробуй написати назву інакше або вкажи більший населений пункт поруч.",
            reply_markup=get_main_keyboard()
        )
        await state.clear()
        return
        
    lat, lon, found_name = coords
    await process_forecast(message, state, lat, lon, found_name)

async def process_forecast(message: Message, state: FSMContext, lat: float, lon: float, place_name: str):
    await message.answer("Збираю погодні дані... ⏳")
    
    weather_data = await get_weather_forecast(lat, lon)
    if weather_data:
        report = analyze_fishing_conditions(weather_data)
        await message.answer(f"📍 **Прогноз для: {place_name}**\n\n{report}", reply_markup=get_main_keyboard(), parse_mode="Markdown")
    else:
        await message.answer("Вибач, не вдалося отримати прогноз погоди для цієї локації. Спробуй пізніше.", reply_markup=get_main_keyboard())
    
    await state.clear()
