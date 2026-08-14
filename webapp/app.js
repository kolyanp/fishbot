let tg = window.Telegram.WebApp;
const API_URL = "https://api.parafiivka.com.ua";
tg.expand();
tg.ready();

// Apply Telegram theme colors dynamically if they exist
document.documentElement.style.setProperty('--text-color', tg.themeParams.text_color || '#0f172a');
// Background is our beautiful gradient, so we ignore Telegram's bg_color

// Tab Navigation Logic
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Remove active class from all
        navItems.forEach(nav => nav.classList.remove('active'));
        tabContents.forEach(tab => tab.classList.remove('active'));
        
        // Add active class to clicked
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
    });
});

// Check for URL parameters to open a specific tab
const urlParams = new URLSearchParams(window.location.search);
const targetTab = urlParams.get('tab');
if (targetTab === 'forecast') {
    const forecastNav = document.querySelector('[data-target="tab-forecast"]');
    if (forecastNav) forecastNav.click();
} else if (targetTab === 'history') {
    const historyNav = document.querySelector('[data-target="tab-history"]');
    if (historyNav) historyNav.click();
}

// Load History when tab is clicked
document.querySelector('[data-target="tab-history"]').addEventListener('click', async () => {
    const loading = document.getElementById('history-loading');
    const list = document.getElementById('history-list');
    
    loading.style.display = 'block';
    list.innerHTML = '';
    
    try {
        const queryStr = window.location.search; // Contains ?user_id=...&sig=...
        const res = await fetch(`${API_URL}/api/history${queryStr}`);
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        
        loading.style.display = 'none';
        
        if (data.length === 0) {
            list.innerHTML = "<p style='text-align:center;'>Ви ще нічого не спіймали 😢</p>";
            return;
        }
        
        data.forEach(catchItem => {
            const date = new Date(catchItem.date).toLocaleDateString('uk-UA');
            list.innerHTML += `
                <div class="weather-item" style="width:100%; margin-bottom:10px; flex-direction:row; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${catchItem.species}</strong><br>
                        <small>${catchItem.weight} кг | ${catchItem.bait}</small>
                    </div>
                    <div style="text-align:right;">
                        <small>${date}</small>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        loading.style.display = 'none';
        list.innerHTML = "<p style='text-align:center;color:red;'>Помилка завантаження (перевірте налаштування домену)</p>";
    }
});

// Form submission for Catch Log
const form = document.getElementById('catch-form');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.innerText = "Зберігаємо...";
    submitBtn.disabled = true;
    
    const formData = new FormData();
    formData.append('initData', tg.initData);
    formData.append('species', document.getElementById('species').value);
    formData.append('weight', document.getElementById('weight').value);
    formData.append('bait', document.getElementById('bait').value);
    
    const photoInput = document.getElementById('photo');
    if (photoInput.files.length > 0) {
        formData.append('photo', photoInput.files[0]);
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    formData.append('user_id', urlParams.get('user_id') || '');
    formData.append('sig', urlParams.get('sig') || '');
    
    try {
        const res = await fetch(`${API_URL}/api/catch`, {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            tg.showAlert("✅ Улов успішно збережено!");
            form.reset();
        } else {
            tg.showAlert("❌ Помилка збереження (перевірте налаштування домену)");
        }
    } catch (err) {
        tg.showAlert("❌ Помилка мережі (перевірте налаштування домену)");
    }
    
    submitBtn.innerText = "Зберегти улов";
    submitBtn.disabled = false;
});

// Forecast Logic
const locBtn = document.getElementById('get-location-btn');
const searchBtn = document.getElementById('search-city-btn');
const cityInput = document.getElementById('city-input');
const loading = document.getElementById('forecast-loading');
const results = document.getElementById('forecast-results');

async function fetchForecast(lat, lon) {
    loading.style.display = 'block';
    results.style.display = 'none';
    document.getElementById('forecast-controls').style.display = 'none';
    
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,surface_pressure`;
        const response = await fetch(url);
        const data = await response.json();
        
        const temp = data.current.temperature_2m;
        const wind = data.current.wind_speed_10m;
        // Convert hPa to mm Hg
        const pressure = Math.round(data.current.surface_pressure * 0.750062);
        
        // Algorithm
        let score = 5;
        let advice = [];
        
        if (temp >= 10 && temp <= 25) {
            score += 2;
            advice.push("✅ Комфортна температура для риболовлі.");
        } else if (temp > 25) {
            score -= 1;
            advice.push("⚠️ Занадто спекотно, риба може ховатися на глибині.");
        } else {
            score -= 1;
            advice.push("⚠️ Досить холодно, риба може бути малоактивною.");
        }
        
        if (wind < 3) {
            score += 1;
            advice.push("✅ Слабкий вітер, ідеально для закидання.");
        } else if (wind > 6) {
            score -= 2;
            advice.push("❌ Сильний вітер, буде складно закидати та бачити покльовку.");
        }
        
        if (pressure >= 745 && pressure <= 765) {
            score += 2;
            advice.push("✅ Стабільний оптимальний тиск.");
        } else {
            score -= 1;
            advice.push("⚠️ Тиск виходить за межі оптимального.");
        }
        
        if (score > 10) score = 10;
        if (score < 1) score = 1;
        
        // Update UI
        document.getElementById('res-temp').innerText = `${temp}°C`;
        document.getElementById('res-wind').innerText = `${wind} м/с`;
        document.getElementById('res-pressure').innerText = `${pressure} мм`;
        document.getElementById('res-score').innerText = score;
        
        const adviceBox = document.getElementById('res-advice');
        adviceBox.innerHTML = advice.join('<br><br>');
        
        // Color the circle based on score
        const circle = document.querySelector('.score-circle');
        if (score >= 8) circle.style.background = '#059669'; // Green
        else if (score >= 5) circle.style.background = '#d97706'; // Orange
        else circle.style.background = '#dc2626'; // Red
        
        loading.style.display = 'none';
        results.style.display = 'block';
        
    } catch (error) {
        alert('Помилка при отриманні прогнозу: ' + error.message);
        loading.style.display = 'none';
        document.getElementById('forecast-controls').style.display = 'block';
    }
}

// Get Location via Browser Geolocation
locBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
        alert("Ваш пристрій/браузер не підтримує геолокацію.");
        return;
    }
    
    locBtn.innerText = "Отримуємо координати...";
    locBtn.disabled = true;
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            fetchForecast(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
            alert("Не вдалося отримати локацію. Спробуйте ввести назву міста.");
            locBtn.innerText = "📍 Визначити мою локацію";
            locBtn.disabled = false;
        }
    );
});

// Search by City name via Geocoding API
searchBtn.addEventListener('click', async () => {
    const city = cityInput.value.trim();
    if (!city) return;
    
    searchBtn.disabled = true;
    searchBtn.innerText = "⏳";
    
    try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=uk`;
        const res = await fetch(geoUrl);
        const geoData = await res.json();
        
        if (geoData.results && geoData.results.length > 0) {
            const loc = geoData.results[0];
            fetchForecast(loc.latitude, loc.longitude);
        } else {
            alert('Місто не знайдено!');
            searchBtn.disabled = false;
            searchBtn.innerText = "🔍 Шукати";
        }
    } catch (e) {
        alert('Помилка пошуку!');
        searchBtn.disabled = false;
        searchBtn.innerText = "🔍 Шукати";
    }
});
