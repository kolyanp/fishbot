import aiohttp
import logging

logger = logging.getLogger(__name__)

async def get_coordinates_by_city(city_name: str) -> tuple[float, float, str] | None:
    """
    Пошук координат за назвою міста/села через Open-Meteo Geocoding API.
    Повертає (lat, lon, name) або None, якщо не знайдено.
    """
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={city_name}&count=1&language=uk&format=json"
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    results = data.get('results')
                    if results and len(results) > 0:
                        loc = results[0]
                        return loc.get('latitude'), loc.get('longitude'), loc.get('name')
                return None
        except Exception as e:
            logger.error(f"Error fetching geocoding for {city_name}: {e}")
            return None

async def get_weather_forecast(lat: float, lon: float) -> dict | None:
    """
    Отримує поточну погоду для вказаних координат використовуючи Open-Meteo API.
    """
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,surface_pressure,wind_speed_10m"
        f"&wind_speed_unit=ms"
    )
    
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('current', {})
                else:
                    logger.error(f"Weather API error: {response.status}")
                    return None
        except Exception as e:
            logger.error(f"Error fetching weather: {e}")
            return None

def analyze_fishing_conditions(weather_data: dict) -> str:
    """
    Простий алгоритм аналізу умов для риболовлі на основі погоди.
    """
    if not weather_data:
        return "Не вдалося отримати дані про погоду для аналізу."
        
    temp = weather_data.get('temperature_2m', 0)
    # Open-meteo повертає тиск у гПа (hPa), переводимо в мм рт. ст. (1 hPa = 0.750062 mmHg)
    pressure_hpa = weather_data.get('surface_pressure', 1013)
    pressure_mm = pressure_hpa * 0.750062
    wind = weather_data.get('wind_speed_10m', 0)
    
    score = 10
    advice = []
    
    # Аналіз температури (дуже спрощений)
    if temp < 5:
        score -= 3
        advice.append("- Холодно. Активність риби дуже низька.")
    elif temp > 28:
        score -= 2
        advice.append("- Спекотно. Риба ховається на глибині.")
    else:
        advice.append("- Комфортна температура для риболовлі.")
        
    # Аналіз тиску (ідеально ~760 мм рт.ст.)
    if pressure_mm < 750:
        score -= 1
        advice.append("- Низький тиск. Добре для хижака (щука, минь).")
    elif pressure_mm > 770:
        score -= 2
        advice.append("- Високий тиск. Може погіршити кльов білої риби.")
    else:
        advice.append("- Стабільний оптимальний тиск.")
        
    # Аналіз вітру
    if wind > 7:
        score -= 3
        advice.append("- Сильний вітер. Риболовля буде некомфортною, кльов може бути слабким.")
    elif wind == 0:
        advice.append("- Повний штиль. Іноді риба стає обережною, але ловити комфортно.")
        
    score = max(1, min(10, score)) # Обмежуємо від 1 до 10
    
    report = (
        f"🌡 Температура: {temp}°C\n"
        f"⏱ Тиск: {pressure_mm:.1f} мм рт. ст.\n"
        f"💨 Вітер: {wind} м/с\n\n"
        f"📊 **Оцінка умов для риболовлі: {score}/10**\n\n"
        f"Коментарі:\n" + "\n".join(advice)
    )
    return report
