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
    
    // We also store history data globally so the map tab can use it
    window.historyData = [];
    
    try {
        const queryStr = window.location.search; // Contains ?user_id=...&sig=...
        const res = await fetch(`${API_URL}/api/history${queryStr}`);
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        window.historyData = data;
        
        loading.style.display = 'none';
        
        if (data.length === 0) {
            list.innerHTML = "<p style='text-align:center;'>Ви ще нічого не спіймали 😢</p>";
            return;
        }
        
        data.forEach(catchItem => {
            const date = new Date(catchItem.date).toLocaleDateString('uk-UA');
            
            let photoHtml = '';
            let photoUrl = '';
            if (catchItem.photo_url) {
                photoUrl = `${API_URL}${catchItem.photo_url}`;
                photoHtml = `<img src="${photoUrl}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; margin-right: 15px;" alt="Трофей">`;
            }
            
            const locationText = catchItem.location ? catchItem.location : 'Не вказано';
            
            const itemDiv = document.createElement('div');
            itemDiv.className = 'weather-item';
            itemDiv.style.cssText = 'width:100%; margin-bottom:10px; display:flex; flex-direction:row; align-items:center; cursor:pointer; color: #0f172a !important;';
            itemDiv.innerHTML = `
                ${photoHtml}
                <div style="flex-grow: 1;">
                    <strong>${catchItem.species}</strong><br>
                    <small>${catchItem.weight} кг | ${catchItem.bait}</small>
                </div>
                <div style="text-align:right;">
                    <small>${date}</small>
                </div>
            `;
            
            itemDiv.addEventListener('click', () => {
                document.getElementById('modal-species').innerText = catchItem.species;
                document.getElementById('modal-weight').innerText = catchItem.weight;
                document.getElementById('modal-bait').innerText = catchItem.bait;
                document.getElementById('modal-location').innerText = locationText;
                document.getElementById('modal-date').innerText = date;
                
                const photoContainer = document.getElementById('modal-photo-container');
                if (photoUrl) {
                    photoContainer.innerHTML = `<img src="${photoUrl}" style="max-width: 100%; max-height: 50vh; border-radius: 10px; object-fit: contain;">`;
                } else {
                    photoContainer.innerHTML = `<div style="padding: 20px; background: #f1f5f9; border-radius: 10px; color: #64748b;">Фото відсутнє</div>`;
                }
                
                document.getElementById('catch-modal').style.display = 'flex';
            });
            
            list.appendChild(itemDiv);
        });
        
        document.getElementById('close-modal-btn').addEventListener('click', () => {
            document.getElementById('catch-modal').style.display = 'none';
        });
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('catch-modal');
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    } catch (e) {
        loading.style.display = 'none';
        list.innerHTML = "<p style='text-align:center;color:red;'>Помилка завантаження (перевірте налаштування домену)</p>";
    }
});

// --- MAP PICKER LOGIC ---
let pickerMap = null;
let pickerMarker = null;

document.getElementById('open-picker-btn').addEventListener('click', () => {
    document.getElementById('map-picker-modal').style.display = 'flex';
    
    if (!pickerMap) {
        // Init map (center on Ukraine)
        pickerMap = L.map('picker-map').setView([48.3794, 31.1656], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(pickerMap);
        
        pickerMap.on('click', (e) => {
            if (pickerMarker) {
                pickerMarker.setLatLng(e.latlng);
            } else {
                pickerMarker = L.marker(e.latlng).addTo(pickerMap);
            }
        });
    }
    
    // Fix leaflet render bug in modal
    setTimeout(() => {
        pickerMap.invalidateSize();
    }, 100);
});

document.getElementById('close-picker-btn').addEventListener('click', () => {
    document.getElementById('map-picker-modal').style.display = 'none';
});

document.getElementById('find-me-btn').addEventListener('click', () => {
    if (!navigator.geolocation) {
        alert("Ваш пристрій не підтримує геолокацію.");
        return;
    }
    document.getElementById('find-me-btn').innerText = "⏳...";
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            pickerMap.setView([lat, lon], 13);
            if (pickerMarker) pickerMarker.setLatLng([lat, lon]);
            else pickerMarker = L.marker([lat, lon]).addTo(pickerMap);
            document.getElementById('find-me-btn').innerText = "📍 Знайти мене";
        },
        (err) => {
            alert("Не вдалося отримати локацію.");
            document.getElementById('find-me-btn').innerText = "📍 Знайти мене";
        }
    );
});

document.getElementById('save-loc-btn').addEventListener('click', () => {
    if (pickerMarker) {
        const lat = pickerMarker.getLatLng().lat;
        const lon = pickerMarker.getLatLng().lng;
        document.getElementById('loc_lat').value = lat;
        document.getElementById('loc_lon').value = lon;
        
        const locInput = document.getElementById('location');
        if (!locInput.value.trim()) {
            locInput.value = `📍 Обрано на карті`;
        }
    }
    document.getElementById('map-picker-modal').style.display = 'none';
});

// --- SUBMIT CATCH LOGIC ---
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
    formData.append('location', document.getElementById('location').value);
    formData.append('lat', document.getElementById('loc_lat').value);
    formData.append('lon', document.getElementById('loc_lon').value);
    
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

// --- MAIN CATCHES MAP LOGIC ---
let catchesMap = null;

async function initGlobalMap() {
    if (!catchesMap) {
        catchesMap = L.map('catches-map').setView([48.3794, 31.1656], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(catchesMap);
    }
    
    setTimeout(() => { catchesMap.invalidateSize(); }, 200);
    
    // Clear old markers
    catchesMap.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
            catchesMap.removeLayer(layer);
        }
    });
    
    // Load data if empty
    if (!window.globalMapData || window.globalMapData.length === 0) {
        const queryStr = window.location.search;
        try {
            const res = await fetch(`${API_URL}/api/global_map${queryStr}`);
            window.globalMapData = await res.json();
        } catch (e) { console.error(e); }
    }
    
    if (window.globalMapData && window.globalMapData.length > 0) {
        let hasPins = false;
        const bounds = L.latLngBounds();
        
        window.globalMapData.forEach(c => {
            if (c.lat && c.lon) {
                hasPins = true;
                const photoUrl = c.photo_url ? `${API_URL}${c.photo_url}` : null;
                const imgHtml = photoUrl ? `<img src="${photoUrl}" style="width:100%; height:100px; object-fit:cover; border-radius:5px; margin-bottom:5px;">` : '';
                const date = new Date(c.date).toLocaleDateString('uk-UA');
                
                const popupContent = `
                    <div style="text-align:center; min-width: 130px;">
                        ${imgHtml}
                        <h4 style="margin: 5px 0; color: #0369a1;">${c.species}</h4>
                        <p style="margin: 0; font-size:12px; font-weight:bold;">👤 ${c.username}</p>
                        <p style="margin: 2px 0 0 0; font-size:12px;">⚖️ ${c.weight} кг</p>
                        <p style="margin: 2px 0 0 0; font-size:11px; opacity:0.8;">📍 ${c.location}</p>
                        <p style="margin: 2px 0 0 0; font-size:11px; opacity:0.8;">📅 ${date}</p>
                    </div>
                `;
                
                L.marker([c.lat, c.lon]).addTo(catchesMap).bindPopup(popupContent);
                bounds.extend([c.lat, c.lon]);
            }
        });
        
        if (hasPins) {
            catchesMap.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
        }
    }
}

// Add catch button on map tab
document.getElementById('add-catch-map-btn').addEventListener('click', () => {
    // Switch to log tab
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-log').classList.add('active');
    document.querySelector('.nav-item[data-target="tab-log"]').classList.add('active');
});

// Trigger map load when clicking tab
document.querySelector('[data-target="tab-map"]').addEventListener('click', initGlobalMap);

// Init map immediately on load since it's the active tab
setTimeout(initGlobalMap, 500);
