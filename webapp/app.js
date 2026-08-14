let tg = window.Telegram.WebApp;
const API_URL = "https://api.parafiivka.com.ua";
try { tg.expand(); } catch(e) {}
try { tg.ready(); } catch(e) {}

window.customAlert = function(msg) {
    if (tg && typeof tg.showAlert === 'function') {
        tg.showAlert(msg);
    } else {
        alert(msg);
    }
};

const authUrlParams = new URLSearchParams(window.location.search);
const urlUserId = authUrlParams.get('user_id');
const urlSig = authUrlParams.get('sig');

let appState = {
    isGuest: false,
    guestNickname: localStorage.getItem('fishapp_guest_nickname'),
    token: localStorage.getItem('fishapp_auth_token'),
    tgUser: (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : (urlUserId && urlSig ? { id: urlUserId } : null)
};

if (!appState.tgUser && !appState.token) {
    appState.isGuest = true;
    if (!appState.guestNickname) {
        appState.guestNickname = 'Гість';
    }
}

// Add Catch Button on Map Tab
const addCatchMapBtn = document.getElementById('add-catch-map-btn');
if (addCatchMapBtn) {
    addCatchMapBtn.addEventListener('click', () => {
        const logNav = document.querySelector('[data-target="tab-log"]');
        if (logNav) logNav.click();
    });
}

// Logout Button Logic
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        if (!confirm('Ви дійсно хочете вийти з акаунту?')) return;
        localStorage.clear();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
                    registration.unregister();
                }
            });
        }
        setTimeout(() => {
            window.location.href = window.location.pathname + '?clear=' + new Date().getTime();
        }, 500);
    });
}

function requireAuth() {
    if (appState.isGuest) {
        document.getElementById('auth-alert-modal').style.display = 'flex';
        return false;
    }
    return true;
}

function getAuthQuery() {
    if (appState.tgUser) return window.location.search;
    if (appState.token) return "?token=" + encodeURIComponent(appState.token);
    if (appState.isGuest) return "?guest=" + encodeURIComponent(appState.guestNickname);
    return '';
}

function getAuthBody() {
    if (appState.tgUser) {
        const urlParams = new URLSearchParams(window.location.search);
        return { user_id: urlParams.get('user_id'), sig: urlParams.get('sig') };
    }
    if (appState.token) return { token: appState.token };
    if (appState.isGuest) return { guest: appState.guestNickname };
    return {};
}

// END OF AUTH PREFIX




function checkBan(data) {
    if (data && data.is_banned) {
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; background:white; color:black; font-family:'Inter', sans-serif; text-align:center; padding:20px;">
                <h1 style="color:#ef4444; font-size:64px; margin-bottom:10px;">🛑</h1>
                <h2>Ви забанені</h2>
                <p>Для розбану - зв'яжіться з адміном чи модером.</p>
                ${data.ban_reason ? `<p style="margin-top:20px; font-weight:bold; color:#ef4444;">Причина: ${data.ban_reason}</p>` : ''}
            </div>
        `;
        return true;
    }
    return false;
}

// Tab Navigation Logic
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        const targetId = item.getAttribute('data-target');
        
        // Prevent guests from accessing personal tabs
        if (appState.isGuest && (targetId === 'tab-log' || targetId === 'tab-history')) {
            document.getElementById('auth-alert-modal').style.display = 'flex';
            return; // Do not switch tab
        }
        
        // Remove active class from all
        navItems.forEach(nav => nav.classList.remove('active'));
        tabContents.forEach(tab => tab.classList.remove('active'));
        
        // Add active class to clicked
        item.classList.add('active');
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
        const queryStr = getAuthQuery(); // Contains ?user_id=...&sig=...
        const res = await fetch(`${API_URL}/api/history${queryStr}`);
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        
        if (checkBan(data)) return;
        
        let isAdmin = false;
        let myId = tg.initDataUnsafe?.user?.id?.toString();
        let catchesData = [];
        
        if (data && data.catches) {
            catchesData = data.catches;
            isAdmin = data.is_admin;
            if (isAdmin) {
                const adminNav = document.getElementById('nav-admin');
                if (adminNav) adminNav.style.display = 'flex';
            }
        } else {
            catchesData = data;
        }
        
        window.historyData = catchesData;
        loading.style.display = 'none';
        
        if (catchesData.length === 0) {
            list.innerHTML = "<p style='text-align:center;'>Ви ще нічого не спіймали 😢</p>";
            return;
        }
        
        catchesData.forEach(catchItem => {
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
            const likeIcon = catchItem.is_liked ? '❤️' : '🤍';
            const likeHtml = catchItem.photo_url ? `<button onclick="window.likeCatch(${catchItem.id}, event, this)" style="background:none; border:none; cursor:pointer; font-size: 16px; margin-left: 10px;">${likeIcon} ${catchItem.likes}</button>` : '';

            itemDiv.innerHTML = `
                ${photoHtml}
                <div style="flex-grow: 1;">
                    <strong>${catchItem.species}</strong><br>
                    <small>${catchItem.weight} кг | ${catchItem.bait}</small>
                </div>
                <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end;">
                    <small>${date}</small>
                    ${likeHtml}
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
                
                const actionsDiv = document.getElementById('modal-actions');
                actionsDiv.style.display = 'flex';
                
                document.getElementById('edit-catch-btn').onclick = () => window.editCatch(catchItem);
                document.getElementById('delete-catch-btn').onclick = () => window.deleteCatch(catchItem.id);
                
                document.getElementById('catch-modal').style.display = 'flex';
            });
            
            list.appendChild(itemDiv);
        });
        
    } catch (e) {
        loading.style.display = 'none';
        list.innerHTML = "<p style='text-align:center;color:red;'>Помилка завантаження (перевірте налаштування домену)</p>";
    }
});

// Global Modal Closing Logic for Catch Modal
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
    
    const authBody = getAuthBody();
    if (authBody.user_id) formData.append('user_id', authBody.user_id);
    if (authBody.sig) formData.append('sig', authBody.sig);
    if (authBody.token) formData.append('token', authBody.token);
    
    try {
        const res = await fetch(`${API_URL}/api/catch`, {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            customAlert("✅ Улов успішно збережено!");
            form.reset();
        } else {
            customAlert("❌ Помилка збереження (перевірте налаштування домену)");
        }
    } catch (err) {
        customAlert("❌ Помилка мережі (перевірте налаштування домену)");
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
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,surface_pressure&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum&past_days=1&forecast_days=2&wind_speed_unit=ms&timezone=auto`;
        const response = await fetch(url);
        const data = await response.json();
        
        const temp = data.current.temperature_2m;
        const wind = data.current.wind_speed_10m;
        // Convert hPa to mm Hg
        const pressure = Math.round(data.current.surface_pressure * 0.750062);
        
        // --- ADVICE ALGORITHM (Current Weather) ---
        let advice = [];
        if (temp >= 10 && temp <= 25) advice.push("✅ Температура комфортна для риболовлі.");
        else if (temp > 25) advice.push("⚠️ Спекотно, риба ховається на глибині.");
        else advice.push("⚠️ Досить холодно, риба може бути малоактивною.");
        
        if (wind < 3) advice.push("✅ Слабкий вітер, ідеально для закидання.");
        else if (wind > 6) advice.push("❌ Сильний вітер, буде складно закидати та бачити покльовку.");
        
        if (pressure >= 745 && pressure <= 765) advice.push("✅ Стабільний оптимальний тиск.");
        else advice.push("⚠️ Тиск виходить за межі оптимального.");
        
        // --- BITING SCALES ALGORITHM ---
        function calcBiteScores(tMax, tMin, wMax, precip) {
            let peaceful = 5;
            let predator = 5;
            
            let avgTemp = (tMax + tMin) / 2;
            
            // Peaceful fish (carps, etc) love warm, calm
            if (avgTemp > 15 && avgTemp < 28) peaceful += 3;
            else if (avgTemp > 28) peaceful -= 2;
            else peaceful -= 2;
            
            // Predators (pike, etc) love cooler, active weather
            if (avgTemp > 10 && avgTemp < 22) predator += 2;
            else if (avgTemp > 25) predator -= 3;
            
            // Rain
            if (precip > 0 && precip < 5) { predator += 2; peaceful += 1; }
            else if (precip >= 5) { peaceful -= 3; predator -= 1; }
            
            // Wind
            if (wMax < 5) { peaceful += 2; predator += 1; }
            else if (wMax > 8) { peaceful -= 2; predator -= 1; }
            
            return {
                peaceful: Math.min(10, Math.max(1, Math.round(peaceful))),
                predator: Math.min(10, Math.max(1, Math.round(predator)))
            };
        }

        const daily = data.daily;
        // daily.time array has 3 items: yesterday [0], today [1], tomorrow [2]
        
        let scores = [];
        for(let i = 0; i < 3; i++) {
            let s = calcBiteScores(
                daily.temperature_2m_max[i], 
                daily.temperature_2m_min[i], 
                daily.wind_speed_10m_max[i], 
                daily.precipitation_sum[i]
            );
            // Average total score for the general chart
            let avgScore = Math.round((s.peaceful + s.predator) / 2);
            scores.push({
                peaceful: s.peaceful,
                predator: s.predator,
                total: avgScore
            });
        }
        
        // Today's scores for the detailed scales
        const todayScores = scores[1];
        
        // Update basic weather UI
        document.getElementById('res-temp').innerText = `${temp}°C`;
        document.getElementById('res-wind').innerText = `${wind} м/с`;
        document.getElementById('res-pressure').innerText = `${pressure} мм`;
        
        const adviceBox = document.getElementById('res-advice');
        adviceBox.innerHTML = advice.join('<br><br>');
        
        // Update detailed scales for TODAY
        const pBar = document.getElementById('bar-peaceful');
        const pScore = document.getElementById('score-peaceful');
        const prBar = document.getElementById('bar-predator');
        const prScore = document.getElementById('score-predator');
        
        if (pScore) {
            pScore.innerText = `${todayScores.peaceful}/10`;
            pBar.style.width = `${todayScores.peaceful * 10}%`;
            pBar.style.background = todayScores.peaceful >= 7 ? '#059669' : (todayScores.peaceful >= 4 ? '#d97706' : '#dc2626');
            
            prScore.innerText = `${todayScores.predator}/10`;
            prBar.style.width = `${todayScores.predator * 10}%`;
            prBar.style.background = todayScores.predator >= 7 ? '#059669' : (todayScores.predator >= 4 ? '#d97706' : '#dc2626');
            
            // Update Chart (Yesterday, Today, Tomorrow)
            for(let i=0; i<3; i++) {
                let bar = document.getElementById(`chart-bar-${i}`);
                let val = document.getElementById(`chart-val-${i}`);
                let score = scores[i].total;
                
                val.innerText = score;
                // timeout for animation effect
                setTimeout(() => {
                    bar.style.height = `${score * 10}%`;
                    bar.style.background = score >= 7 ? '#0ea5e9' : (score >= 4 ? '#38bdf8' : '#94a3b8');
                }, 100);
            }
        } else {
            // Fallback for old UI
            const oldScore = document.getElementById('res-score');
            if (oldScore) oldScore.innerText = todayScores.total;
        }
        
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
        const queryStr = getAuthQuery();
        try {
        const res = await fetch(`${API_URL}/api/global_map${queryStr}`);
        const data = await res.json();
        
        if (checkBan(data)) return;
        
        let mapCatches = [];
        let isAdmin = false;
        let myId = tg.initDataUnsafe?.user?.id?.toString();
        
        if (data && data.catches) {
            mapCatches = data.catches;
            isAdmin = data.is_admin;
            if (isAdmin) {
                const adminNav = document.getElementById('nav-admin');
                if (adminNav) adminNav.style.display = 'flex';
            }
        } else {
            mapCatches = data;
        }
        
        if (mapCatches.length > 0) {
            const bounds = L.latLngBounds();
            
            mapCatches.forEach(c => {
                const date = new Date(c.date).toLocaleDateString('uk-UA');
                const photoUrl = c.photo_url ? `${API_URL}${c.photo_url}` : null;
                const photoHtml = photoUrl ? `<img src="${photoUrl}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 8px; margin-bottom: 5px;">` : '';
                
                const isMe = myId === c.user_id?.toString();
                
                let actionsHtml = `<button onclick="window.openChatWith('${c.username}', ${c.id}, '${c.species.replace(/'/g, "\\'")}', ${c.weight})" style="margin-top: 8px; width: 100%; background: #3b82f6; color: white; border: none; padding: 5px; border-radius: 5px; cursor: pointer; font-size: 12px;">Написати 💬</button>`;
                
                if (isAdmin || isMe) {
                    actionsHtml += `<div style="display:flex; gap:5px; margin-top:5px;">
                        <button onclick='window.editCatch(${JSON.stringify(c).replace(/'/g, "&apos;")})' style="flex:1; background: #eab308; color: white; border: none; padding: 5px; border-radius: 5px; cursor: pointer; font-size: 12px;">✏️</button>
                        <button onclick="window.deleteCatch(${c.id})" style="flex:1; background: #ef4444; color: white; border: none; padding: 5px; border-radius: 5px; cursor: pointer; font-size: 12px;">🗑</button>
                    </div>`;
                }
                
                const likeIcon = c.is_liked ? '❤️' : '🤍';
                const likeHtml = c.photo_url ? `<button onclick="window.likeCatch(${c.id}, event, this)" style="margin-top: 5px; width: 100%; background: none; border: 1px solid #ccc; color: #333; padding: 5px; border-radius: 5px; cursor: pointer; font-size: 12px;">${likeIcon} ${c.likes}</button>` : '';
                
                const popupContent = `
                    <div style="text-align: center; width: 150px; font-family: 'Inter', sans-serif;">
                        ${photoHtml}
                        <h4 style="margin: 0 0 2px 0; font-size:14px; color: #0f172a;">${c.species}</h4>
                        <p style="margin: 0; font-size:12px; font-weight:bold;">👤 ${c.username}</p>
                        <p style="margin: 2px 0 0 0; font-size:12px;">⚖️ ${c.weight} кг</p>
                        <p style="margin: 2px 0 0 0; font-size:11px; opacity:0.8;">📍 ${c.location}</p>
                        <p style="margin: 2px 0 0 0; font-size:11px; opacity:0.8;">📅 ${date}</p>
                        ${likeHtml}
                        ${actionsHtml}
                    </div>
                `;
                
                L.marker([c.lat, c.lon]).addTo(catchesMap).bindPopup(popupContent);
                bounds.extend([c.lat, c.lon]);
            });
            
            // Map shows all catches
        }
        } catch (e) { console.error(e); }
    }
}

// Add catch button on map tab
document.getElementById('add-catch-map-btn').addEventListener('click', () => {
    if (!requireAuth()) return;
    
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

// --- CHAT LOGIC ---
window.openChatWith = function(username, catchId = null, species = null, weight = null) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-chat').classList.add('active');
    document.querySelector('.nav-item[data-target="tab-chat"]').classList.add('active');
    
    const input = document.getElementById('chat-input');
    
    if (catchId) {
        window.cancelChatPreview(); // clear replies
        document.getElementById('attachment-catch-id').value = catchId;
        document.getElementById('chat-preview-bar').style.display = 'block';
        document.getElementById('preview-title').innerText = 'Прикріплено фото:';
        document.getElementById('preview-title').style.color = '#10b981';
        document.getElementById('preview-content').innerText = `🎣 ${species} (${weight} кг) від @${username}`;
    } else {
        input.value = '@' + username.replace('@', '') + ', ';
    }
    input.focus();
    
    loadChat();
    if (!chatInterval) {
        chatInterval = setInterval(loadChat, 3000);
    }
};

let chatInterval = null;

async function loadChat() {
    const queryStr = getAuthQuery();
    try {
        const res = await fetch(`${API_URL}/api/chat${queryStr}`);
        const data = await res.json();
        
        if (checkBan(data)) return;
        
        let messages = [];
        let isAdmin = false;
        let myId = null;
        
        if (data && data.messages) {
            messages = data.messages;
            isAdmin = data.is_admin;
            if (isAdmin) {
                const adminNav = document.getElementById('nav-admin');
                if (adminNav) adminNav.style.display = 'flex';
            }
            myId = data.current_user_id?.toString();
            
            // Check mute
            const chatInput = document.getElementById('chat-input');
            const chatSendBtn = document.getElementById('chat-send-btn');
            if (data.muted_until && new Date(data.muted_until) > new Date()) {
                chatInput.disabled = true;
                chatSendBtn.disabled = true;
                const muteDate = new Date(data.muted_until).toLocaleString('uk-UA');
                chatInput.placeholder = "🔇 Мут до " + muteDate;
            } else {
                chatInput.disabled = false;
                chatSendBtn.disabled = false;
                chatInput.placeholder = "Напишіть повідомлення...";
            }
        } else {
            messages = data;
        }
        
        const chatContainer = document.getElementById('chat-messages');
        chatContainer.innerHTML = '';
        
        if (messages.length === 0) {
            chatContainer.innerHTML = '<div style="text-align:center; color: #666; font-size: 14px; margin-top: 20px;">Поки що немає повідомлень. Напишіть першим!</div>';
            return;
        }
        
        messages.forEach(m => {
            const isMe = m.user_id.toString() === myId;
            
            const msgDiv = document.createElement('div');
            msgDiv.style.padding = '8px 12px';
            msgDiv.style.borderRadius = '15px';
            msgDiv.style.maxWidth = '80%';
            msgDiv.style.wordBreak = 'break-word';
            msgDiv.style.fontSize = '14px';
            msgDiv.style.position = 'relative';
            
            if (isMe) {
                msgDiv.style.background = '#3b82f6';
                msgDiv.style.color = 'white';
                msgDiv.style.alignSelf = 'flex-end';
                msgDiv.style.borderBottomRightRadius = '5px';
            } else {
                msgDiv.style.background = 'white';
                msgDiv.style.color = '#333';
                msgDiv.style.alignSelf = 'flex-start';
                msgDiv.style.borderBottomLeftRadius = '5px';
                msgDiv.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            }
            
            const nameHtml = !isMe ? `<div style="font-weight: bold; font-size: 11px; color: #0369a1; margin-bottom: 3px;">${m.username}</div>` : '';
            
            let replyHtml = '';
            if (m.reply_to) {
                replyHtml = `<div style="background: rgba(0,0,0,0.1); border-left: 3px solid #3b82f6; padding: 4px 8px; margin-bottom: 5px; border-radius: 4px; font-size: 11px;">
                    <strong style="color: #0369a1;">${m.reply_to.username}</strong><br>
                    <span style="opacity: 0.8;">${m.reply_to.text}</span>
                </div>`;
            }
            
            let attachHtml = '';
            if (m.attachment) {
                const img = m.attachment.photo_url ? `<img src="${API_URL}${m.attachment.photo_url}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 5px;">` : '';
                attachHtml = `<div style="background: rgba(255,255,255,0.8); border: 1px solid #cbd5e1; padding: 5px; margin-bottom: 5px; border-radius: 5px; display: flex; align-items: center; gap: 8px; font-size: 11px; color: #333;">
                    ${img}
                    <div>
                        <strong>🎣 ${m.attachment.species} (${m.attachment.weight} кг)</strong><br>
                        <span style="opacity: 0.8;">Улов від ${m.attachment.username}</span>
                    </div>
                </div>`;
            }
            
            const timeDate = new Date(m.date);
            const timeStr = `${timeDate.getHours().toString().padStart(2, '0')}:${timeDate.getMinutes().toString().padStart(2, '0')}`;
            
            // Actions (Edit/Delete/Mod)
            let actionsHtml = `<div style="display:inline-flex; gap: 5px; margin-right: 8px;">`;
            
            // Reply action
            actionsHtml += `<span onclick="window.replyToMessage(${m.id}, '${m.username.replace(/'/g, "\\'")}', \`${m.text.replace(/`/g, '\\`')}\`)" style="cursor:pointer; font-size:12px; opacity:0.8;">↩️</span>`;
            
            if (isMe || isAdmin) {
                actionsHtml += `<span onclick="window.editChatMessage(${m.id}, \`${m.text.replace(/`/g, '\\`')}\`)" style="cursor:pointer; font-size:12px; opacity:0.8;">✏️</span>`;
            }
            if (isAdmin && !isMe) {
                actionsHtml += `<span onclick="window.openModModal(${m.user_id}, '${m.username}')" style="cursor:pointer; font-size:12px; opacity:0.8;">🛡</span>`;
            }
            if (isAdmin) {
                actionsHtml += `<span onclick="window.deleteChatMessage(${m.id})" style="cursor:pointer; font-size:12px; opacity:0.8; color:#ef4444;">🗑</span>`;
            }
            actionsHtml += `</div>`;
            
            const bottomRow = `<div style="display:flex; justify-content: space-between; align-items: center; margin-top: 3px;">
                                ${actionsHtml}
                                <div style="font-size: 10px; opacity: 0.7;">${timeStr}</div>
                               </div>`;
            
            msgDiv.innerHTML = nameHtml + replyHtml + attachHtml + m.text + bottomRow;
            chatContainer.appendChild(msgDiv);
        });
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
    } catch (e) {
        console.error("Chat load error", e);
    }
}

document.querySelector('[data-target="tab-chat"]').addEventListener('click', () => {
    loadChat();
    if (!chatInterval) {
        chatInterval = setInterval(loadChat, 3000);
    }
});

// Stop polling when leaving chat tab
document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-target');
        if (target !== 'tab-chat' && chatInterval) {
            clearInterval(chatInterval);
            chatInterval = null;
        }
    });
});

// Emojis logic
const EMOJIS = ['🎣', '🐟', '🦈', '🦐', '🛶', '🏕', '🍻', '🌧', '☀️', '🏆'];
const emojiBar = document.getElementById('emoji-bar');
if (emojiBar) {
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('div');
        btn.innerText = emoji;
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '20px';
        btn.style.padding = '2px 5px';
        btn.addEventListener('click', () => {
            const input = document.getElementById('chat-input');
            input.value += emoji;
            input.focus();
        });
        emojiBar.appendChild(btn);
    });
}

// Chat API Actions
window.editChatMessage = function(id, text) {
    document.getElementById('edit-msg-id').value = id;
    document.getElementById('chat-input').value = text;
    document.getElementById('chat-input').focus();
};

window.deleteChatMessage = async function(id) {
    if(!confirm("Ви впевнені, що хочете видалити це повідомлення?")) return;
    
    const authBody = getAuthBody();
    
    try {
        await fetch(`${API_URL}/api/chat`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...authBody, msg_id: id })
        });
        loadChat();
    } catch(e) {}
};

document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

window.replyToMessage = function(msgId, username, text) {
    if (!requireAuth()) return;
    window.cancelChatPreview(); // clear attachments
    document.getElementById('reply-to-id').value = msgId;
    document.getElementById('chat-preview-bar').style.display = 'block';
    document.getElementById('preview-title').innerText = `Відповідь для: ${username}`;
    document.getElementById('preview-title').style.color = '#3b82f6';
    document.getElementById('preview-content').innerText = text;
    document.getElementById('chat-input').focus();
};

window.cancelChatPreview = function() {
    document.getElementById('reply-to-id').value = '';
    document.getElementById('attachment-catch-id').value = '';
    document.getElementById('chat-preview-bar').style.display = 'none';
};

document.getElementById('cancel-preview-btn').addEventListener('click', window.cancelChatPreview);

async function sendChatMessage() {
    if (!requireAuth()) return;
    const input = document.getElementById('chat-input');
    const msgIdInput = document.getElementById('edit-msg-id');
    const replyIdInput = document.getElementById('reply-to-id');
    const attachIdInput = document.getElementById('attachment-catch-id');
    
    const text = input.value.trim();
    const msgId = msgIdInput.value;
    const reply_to_id = replyIdInput.value ? parseInt(replyIdInput.value) : null;
    const attachment_catch_id = attachIdInput.value ? parseInt(attachIdInput.value) : null;
    
    if (!text) return;
    
    // Optimistic clear
    input.value = '';
    msgIdInput.value = '';
    window.cancelChatPreview();
    
    const authBody = getAuthBody();
    
    try {
        let res;
        if (msgId) {
            // Edit
            res = await fetch(`${API_URL}/api/chat`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...authBody, text, msg_id: msgId })
            });
        } else {
            // Send new
            res = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...authBody, text, reply_to_id, attachment_catch_id })
            });
        }
        if (!res.ok) {
            const err = await res.json();
            alert(err.error || "Помилка відправки");
            if (err.reason) {
                alert(`Причина: ${err.reason}`);
            }
            if (err.error === "У вас мут чату.") {
                loadChat();
            }
            return;
        }
        
        loadChat();
    } catch (e) {
        alert("Помилка відправки");
    }
}

// Moderation
window.openModModal = function(userId, username) {
    document.getElementById('mod-target-name').innerText = username;
    document.getElementById('mod-target-id').value = userId;
    document.getElementById('mod-reason').value = '';
    document.getElementById('mod-modal').style.display = 'flex';
};

window.moderateUser = async function(action) {
    const target_id = document.getElementById('mod-target-id').value;
    const reason = document.getElementById('mod-reason').value.trim();
    
    if (!target_id) return;
    
    const authBody = getAuthBody();
    
    try {
        const res = await fetch(`${API_URL}/api/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...authBody, target_id: parseInt(target_id), action, reason })
        });
        
        if (res.ok) {
            document.getElementById('mod-modal').style.display = 'none';
            customAlert("Дію виконано!");
            loadChat();
        } else {
            const err = await res.json();
            alert("Помилка: " + (err.error || "Невідомо"));
        }
    } catch (e) {
        alert("Помилка з'єднання");
    }
};

// Catch Edit / Delete API
window.editCatch = function(catchItem) {
    document.getElementById('catch-modal').style.display = 'none';
    
    // Switch to log tab
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-log').classList.add('active');
    document.querySelector('.nav-item[data-target="tab-log"]').classList.add('active');
    
    // Populate form
    document.getElementById('catch-id').value = catchItem.id;
    document.getElementById('species').value = catchItem.species || '';
    document.getElementById('weight').value = catchItem.weight || '';
    document.getElementById('bait').value = catchItem.bait || '';
    
    document.getElementById('loc-name').value = catchItem.location || '';
    document.getElementById('loc-lat').value = catchItem.lat || '';
    document.getElementById('loc-lon').value = catchItem.lon || '';
    
    document.getElementById('submit-btn').innerText = '💾 Зберегти зміни';
};

window.deleteCatch = async function(id) {
    if(!confirm("Ви впевнені, що хочете видалити цей улов?")) return;
    
    const authBody = getAuthBody();
    
    try {
        const res = await fetch(`${API_URL}/api/catch`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...authBody, catch_id: id })
        });
        
        if (res.ok) {
            document.getElementById('catch-modal').style.display = 'none';
            // Reload history and map
            document.querySelector('[data-target="tab-history"]').click();
            if (catchesMap) initGlobalMap(); // reload map
            customAlert("Улов видалено!");
        } else {
            alert("Помилка видалення");
        }
    } catch(e) {
        alert("Помилка сервера");
    }
};

// Reset form when opening Log tab
document.querySelector('[data-target="tab-log"]').addEventListener('click', () => {
    if (document.getElementById('catch-id').value === "") return; // Already new
    // Ask if want to create new or continue editing
    document.getElementById('catch-form').reset();
    document.getElementById('catch-id').value = '';
    document.getElementById('photo').value = '';
    document.getElementById('submit-btn').innerText = '💾 Зберегти улов';
});

// Moderation Modal Dynamic Creation (To avoid Windows Defender false positive)
function createModModal() {
    const modalHtml = `
        <div id="mod-modal" class="modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center;">
            <div class="modal-content" style="background: white; width: 90%; max-height: 90%; border-radius: 15px; padding: 20px; position: relative; font-family: 'Inter', sans-serif;">
                <button onclick="document.getElementById('mod-modal').style.display='none'" style="position: absolute; top: 15px; right: 15px; background: #e2e8f0; border: none; width: 30px; height: 30px; border-radius: 15px; font-weight: bold; font-size: 16px;">✕</button>
                <h3 style="margin-top: 0;">🛡 Модерація</h3>
                <p>Користувач: <strong id="mod-target-name"></strong></p>
                <input type="hidden" id="mod-target-id" value="">
                
                <input type="text" id="mod-reason" placeholder="Причина (необов'язково)" style="width: 100%; box-sizing: border-box; padding: 10px; margin-bottom: 15px; border-radius: 8px; border: 1px solid #ccc;">
                
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button onclick="window.moderateUser('mute_1h')" style="background: #f59e0b; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer;">🔇 Мут 1 година</button>
                    <button onclick="window.moderateUser('mute_24h')" style="background: #f97316; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer;">🔇 Мут 24 години</button>
                    <button onclick="window.moderateUser('ban')" style="background: #ef4444; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer;">🛑 Забанити назавжди</button>
                    <hr style="width: 100%; border: 0; border-top: 1px solid #eee; margin: 5px 0;">
                    <button onclick="window.moderateUser('unban')" style="background: #10b981; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer;">✅ Зняти всі обмеження</button>
                </div>
            </div>
        </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div.firstElementChild);
}
createModModal();

window.likeCatch = async (catchId, event, btnElement) => {
    if (event) event.stopPropagation();
    if (!requireAuth()) return; // Prevent opening modal
    
    try {
        const queryStr = getAuthQuery(); // ?user_id=...&sig=...
        const authBody = getAuthBody();
        
        const res = await fetch(`${API_URL}/api/like`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ...authBody, catch_id: catchId })
        });
        
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        
        if (data.success) {
            // Update button UI
            btnElement.innerHTML = data.action === 'liked' ? `❤️ ${data.likes_count}` : `🤍 ${data.likes_count}`;
            // Add a little pop animation
            btnElement.style.transform = 'scale(1.2)';
            setTimeout(() => { btnElement.style.transform = 'scale(1)'; }, 200);
            
            // Re-render leaderboard if it's open
            if (document.getElementById('tab-leaderboard').classList.contains('active')) {
                // Not ideal, but we can just let user refresh or we can re-fetch
            }
        }
    } catch (e) {
        customAlert("Помилка оцінки фото");
    }
};

// Leaderboard Logic
document.querySelector('[data-target="tab-leaderboard"]').addEventListener('click', async () => {
    const list = document.getElementById('leaderboard-content');
    list.innerHTML = "<div style='text-align:center; color: #666; font-size: 14px; margin-top: 20px;'>Завантаження рейтингу...</div>";
    
    try {
        const queryStr = getAuthQuery();
        const res = await fetch(`${API_URL}/api/leaderboard${queryStr}`);
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        
        window.leaderboardData = data;
        
        // Default render: Weight
        renderLeaderboardWeight();
        
    } catch (e) {
        list.innerHTML = "<p style='text-align:center;color:red;'>Помилка завантаження рейтингу</p>";
    }
});

document.getElementById('btn-leader-weight').addEventListener('click', (e) => {
    e.target.style.background = '#3b82f6';
    e.target.style.color = 'white';
    document.getElementById('btn-leader-photo').style.background = 'transparent';
    document.getElementById('btn-leader-photo').style.color = '#333';
    renderLeaderboardWeight();
});

document.getElementById('btn-leader-photo').addEventListener('click', (e) => {
    e.target.style.background = '#3b82f6';
    e.target.style.color = 'white';
    document.getElementById('btn-leader-weight').style.background = 'transparent';
    document.getElementById('btn-leader-weight').style.color = '#333';
    renderLeaderboardPhoto();
});

function renderLeaderboardWeight() {
    const list = document.getElementById('leaderboard-content');
    list.innerHTML = '';
    
    if (!window.leaderboardData || !window.leaderboardData.weight_leaders.length) {
        list.innerHTML = "<p style='text-align:center;'>Рейтинг порожній</p>";
        return;
    }
    
    let html = '';
    window.leaderboardData.weight_leaders.forEach((u, index) => {
        let badge = '';
        if (index === 0) badge = '🥇';
        else if (index === 1) badge = '🥈';
        else if (index === 2) badge = '🥉';
        else badge = `${index + 1}.`;
        
        html += `
            <div class="weather-item" onclick="window.openChatWith('${u.username}')" style="display:flex; justify-content:space-between; align-items:center; color: #0f172a !important; padding: 12px; margin-bottom: 5px; cursor: pointer;">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <div style="font-size: 20px; width: 25px; text-align:center; font-weight:bold;">${badge}</div>
                    <div>
                        <div style="font-weight:bold;">@${u.username}</div>
                        <div style="font-size: 11px; opacity:0.8;">Уловів: ${u.total_catches} | Рекорд: ${u.max_weight} кг</div>
                    </div>
                </div>
                <div style="font-weight:bold; color: #3b82f6; font-size: 16px;">
                    ${u.total_weight} кг
                </div>
            </div>
        `;
    });
    list.innerHTML = html;
}

function renderLeaderboardPhoto() {
    const list = document.getElementById('leaderboard-content');
    list.innerHTML = '';
    
    if (!window.leaderboardData || !window.leaderboardData.top_photos.length) {
        list.innerHTML = "<p style='text-align:center;'>Ще немає фото з оцінками</p>";
        return;
    }
    
    let html = '';
    window.leaderboardData.top_photos.forEach((c, index) => {
        let badge = '';
        if (index === 0) badge = '🥇';
        else if (index === 1) badge = '🥈';
        else if (index === 2) badge = '🥉';
        else badge = `${index + 1}.`;
        
        const photoUrl = c.photo_url ? `${API_URL}${c.photo_url}` : '';
        const likeIcon = c.is_liked ? '❤️' : '🤍';
        
        html += `
            <div class="weather-item" onclick="window.showLeaderboardPhoto(${index})" style="display:flex; align-items:center; gap: 15px; color: #0f172a !important; padding: 10px; margin-bottom: 5px; cursor: pointer;">
                <div style="font-size: 20px; font-weight:bold; width: 20px; text-align:center;">${badge}</div>
                <img src="${photoUrl}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;" alt="Photo">
                <div style="flex-grow: 1;">
                    <div style="font-weight:bold;">${c.species} (${c.weight} кг)</div>
                    <div style="font-size: 11px; opacity:0.8;">@${c.username}</div>
                </div>
                <button onclick="window.likeCatch(${c.id}, event, this)" style="background:none; border:none; cursor:pointer; font-size: 18px; transition: transform 0.2s;">
                    ${likeIcon} ${c.likes}
                </button>
            </div>
        `;
    });
    list.innerHTML = html;
}

window.showLeaderboardPhoto = (index) => {
    const c = window.leaderboardData.top_photos[index];
    if (!c) return;
    
    document.getElementById('modal-species').innerText = c.species;
    document.getElementById('modal-weight').innerText = c.weight;
    document.getElementById('modal-bait').innerText = c.bait || 'Не вказано';
    document.getElementById('modal-location').innerText = c.location || 'Не вказано';
    
    const dateStr = c.date ? new Date(c.date).toLocaleDateString('uk-UA') : 'Невідомо';
    document.getElementById('modal-date').innerText = dateStr;
    
    const photoContainer = document.getElementById('modal-photo-container');
    if (c.photo_url) {
        const photoUrl = `${API_URL}${c.photo_url}`;
        photoContainer.innerHTML = `<img src="${photoUrl}" style="max-width: 100%; max-height: 50vh; border-radius: 10px; object-fit: contain;">`;
    } else {
        photoContainer.innerHTML = `<div style="padding: 20px; background: #f1f5f9; border-radius: 10px; color: #64748b;">Фото відсутнє</div>`;
    }
    
    document.getElementById('modal-actions').style.display = 'none'; // hide edit/delete buttons
    document.getElementById('catch-modal').style.display = 'flex';
};


// --- AUTH LOGIC ---
document.getElementById('btn-guest-login').addEventListener('click', () => {
    const nick = document.getElementById('guest-nickname').value.trim();
    if (!nick) {
        alert("Введіть нікнейм!");
        return;
    }
    localStorage.setItem('fishapp_guest_nickname', nick);
    appState.guestNickname = nick;
    appState.isGuest = true;
    document.getElementById('auth-modal').style.display = 'none';
    window.location.reload();
});

// Google Auth Callback
window.handleGoogleAuth = async function(response) {
    try {
        const res = await fetch(`${API_URL}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        if (data.token) {
            localStorage.setItem('fishapp_auth_token', data.token);
            appState.token = data.token;
            appState.isGuest = false;
            document.getElementById('auth-modal').style.display = 'none';
            document.getElementById('auth-alert-modal').style.display = 'none';
            window.location.reload();
        } else {
            alert(data.error || "Помилка авторизації Google");
        }
    } catch (e) {
        alert("Помилка з'єднання");
    }
};

// Telegram Login Widget logic
window.onTelegramWidgetAuth = async function(user) {
    try {
        const res = await fetch(`${API_URL}/api/auth/telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        });
        const data = await res.json();
        if (data.token) {
            localStorage.setItem('fishapp_auth_token', data.token);
            appState.token = data.token;
            appState.isGuest = false;
            document.getElementById('auth-modal').style.display = 'none';
            document.getElementById('auth-alert-modal').style.display = 'none';
            window.location.reload();
        } else {
            alert(data.error || "Помилка авторизації Telegram");
        }
    } catch (e) {
        alert("Помилка з'єднання");
    }
};

// --- FIX KEYBOARD OBSCURING BOTTOM NAV ON MOBILE ---
(function() {
    const originalHeight = window.innerHeight;
    const bottomNav = document.querySelector('.bottom-nav');
    if (!bottomNav) return;
    
    window.addEventListener('resize', () => {
        // If the window height decreases by more than 100px, 
        // it's highly likely the virtual keyboard was opened.
        if (window.innerHeight < originalHeight - 100) {
            bottomNav.style.display = 'none';
        } else {
            bottomNav.style.display = 'flex';
        }
    });
    
    // Also use focus/blur events on input and textarea as a fallback
    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            bottomNav.style.display = 'none';
        }
    });
    document.addEventListener('focusout', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            setTimeout(() => {
                bottomNav.style.display = 'flex';
            }, 100);
        }
    });
})();

// --- ADMIN PANEL LOGIC ---

async function loadAdminUsers() {
    const listDiv = document.getElementById('admin-users-list');
    listDiv.innerHTML = "<div style='text-align:center; color:#666; margin-top:20px;'>Завантаження...</div>";
    
    try {
        const queryStr = appState.isTelegram 
            ? `?user_id=${window.userId}&sig=${window.authSig}`
            : `?user_id=${window.userId}&sig=${window.authSig}`;
            
        const res = await fetch(`${API_URL}/api/users`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(getAuthBody())
        });
        
        if (res.status === 403) {
            listDiv.innerHTML = `
                <div style="text-align:center; padding: 20px;">
                    <div style="font-size:40px; margin-bottom:10px;">🛑</div>
                    <h3 style="color:#ef4444; margin:0;">Доступ заборонено</h3>
                    <p style="color:#64748b; font-size:14px;">Ця вкладка доступна лише Головному Адміністратору.</p>
                </div>
            `;
            return;
        }
        
        const data = await res.json();
        if (data.error) {
            listDiv.innerHTML = `<div style="color:red; text-align:center;">Помилка: ${data.error}</div>`;
            return;
        }
        
        renderAdminUsers(data.users);
        
    } catch (e) {
        listDiv.innerHTML = `<div style="color:red; text-align:center;">Помилка з'єднання</div>`;
    }
}

function renderAdminUsers(users) {
    const listDiv = document.getElementById('admin-users-list');
    listDiv.innerHTML = '';
    
    if (users.length === 0) {
        listDiv.innerHTML = "<div style='text-align:center; color:#666; margin-top:20px;'>Користувачів немає</div>";
        return;
    }
    
    users.forEach(u => {
        const item = document.createElement('div');
        item.style.cssText = "background: rgba(255,255,255,0.6); padding: 12px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;";
        
        const name = u.username ? `@${u.username}` : `ID: ${u.telegram_id}`;
        let statusHtml = '';
        if (u.is_banned) statusHtml += '<span style="color:red; font-size:12px; font-weight:bold;">ЗАБАНЕНИЙ</span> ';
        if (u.is_admin) statusHtml += '<span style="color:#8b5cf6; font-size:12px; font-weight:bold;">АДМІН</span> ';
        
        item.innerHTML = `
            <div>
                <div style="font-weight:bold;">${name}</div>
                <div style="font-size:12px; color:#666;">ID DB: ${u.id} | TG: ${u.telegram_id}</div>
                <div>${statusHtml}</div>
            </div>
            <div>
                ${!u.is_admin ? `
                    <label style="display: flex; align-items: center; gap: 5px; font-size: 14px; cursor: pointer;">
                        <input type="checkbox" onchange="window.toggleModerator(${u.id}, this.checked)" ${u.is_moderator ? 'checked' : ''} style="accent-color: #3b82f6; width:18px; height:18px;">
                        Модератор
                    </label>
                ` : ''}
            </div>
        `;
        listDiv.appendChild(item);
    });
}

window.toggleModerator = async function(targetId, isMod) {
    try {
        const res = await fetch(`${API_URL}/api/set_mod`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                ...getAuthBody(),
                target_id: targetId,
                is_moderator: isMod
            })
        });
        
        const data = await res.json();
        if (data.error) {
            alert(data.error);
        }
    } catch (e) {
        alert("Помилка з'єднання");
    }
};

// Hook into nav click for admin tab
document.querySelector('.nav-item[data-target="tab-admin"]').addEventListener('click', (e) => {
    e.preventDefault();
    // Assuming auth check passed
    loadAdminUsers();
});

// Search functionality for admin users list
document.getElementById('admin-search-input').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const listDiv = document.getElementById('admin-users-list');
    const items = listDiv.children;
    for (let i = 0; i < items.length; i++) {
        if (items[i].innerText.toLowerCase().includes(val)) {
            items[i].style.display = 'flex';
        } else {
            items[i].style.display = 'none';
        }
    }
});

// To unhide the nav item when admin:
// We need to inject this into the login flow where `data.is_admin` is processed.
// We'll run a quick find-and-replace in app.js for `isAdmin = data.is_admin;` to also unhide the tab.
