let tg = window.Telegram.WebApp;
const API_URL = "https://api.parafiivka.com.ua";
tg.expand();
tg.ready();

// Apply Telegram theme colors dynamically if they exist
document.documentElement.style.setProperty('--text-color', tg.themeParams.text_color || '#0f172a');
// Background is our beautiful gradient, so we ignore Telegram's bg_color

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
                
                const actionsDiv = document.getElementById('modal-actions');
                actionsDiv.style.display = 'flex';
                
                document.getElementById('edit-catch-btn').onclick = () => window.editCatch(catchItem);
                document.getElementById('delete-catch-btn').onclick = () => window.deleteCatch(catchItem.id);
                
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
        const data = await res.json();
        
        if (checkBan(data)) return;
        
        let mapCatches = [];
        let isAdmin = false;
        let myId = tg.initDataUnsafe?.user?.id?.toString();
        
        if (data && data.catches) {
            mapCatches = data.catches;
            isAdmin = data.is_admin;
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
                
                let actionsHtml = `<button onclick="window.openChatWith('${c.username}')" style="margin-top: 8px; width: 100%; background: #3b82f6; color: white; border: none; padding: 5px; border-radius: 5px; cursor: pointer; font-size: 12px;">Написати 💬</button>`;
                
                if (isAdmin || isMe) {
                    actionsHtml += `<div style="display:flex; gap:5px; margin-top:5px;">
                        <button onclick='window.editCatch(${JSON.stringify(c).replace(/'/g, "&apos;")})' style="flex:1; background: #eab308; color: white; border: none; padding: 5px; border-radius: 5px; cursor: pointer; font-size: 12px;">✏️</button>
                        <button onclick="window.deleteCatch(${c.id})" style="flex:1; background: #ef4444; color: white; border: none; padding: 5px; border-radius: 5px; cursor: pointer; font-size: 12px;">🗑</button>
                    </div>`;
                }
                
                const popupContent = `
                    <div style="text-align: center; width: 150px; font-family: 'Inter', sans-serif;">
                        ${photoHtml}
                        <h4 style="margin: 0 0 2px 0; font-size:14px; color: #0f172a;">${c.species}</h4>
                        <p style="margin: 0; font-size:12px; font-weight:bold;">👤 ${c.username}</p>
                        <p style="margin: 2px 0 0 0; font-size:12px;">⚖️ ${c.weight} кг</p>
                        <p style="margin: 2px 0 0 0; font-size:11px; opacity:0.8;">📍 ${c.location}</p>
                        <p style="margin: 2px 0 0 0; font-size:11px; opacity:0.8;">📅 ${date}</p>
                        ${actionsHtml}
                    </div>
                `;
                
                L.marker([c.lat, c.lon]).addTo(catchesMap).bindPopup(popupContent);
                bounds.extend([c.lat, c.lon]);
            }
        });
        
        if (hasPins) {
            // Keep map zoomed out to show all of Ukraine
            catchesMap.setView([48.3794, 31.1656], 5);
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

// --- CHAT LOGIC ---
window.openChatWith = function(username) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    document.getElementById('tab-chat').classList.add('active');
    document.querySelector('.nav-item[data-target="tab-chat"]').classList.add('active');
    
    const input = document.getElementById('chat-input');
    input.value = '@' + username.replace('@', '') + ', ';
    input.focus();
    
    loadChat();
    if (!chatInterval) {
        chatInterval = setInterval(loadChat, 3000);
    }
};

let chatInterval = null;

async function loadChat() {
    const queryStr = window.location.search;
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
            
            const timeDate = new Date(m.date);
            const timeStr = `${timeDate.getHours().toString().padStart(2, '0')}:${timeDate.getMinutes().toString().padStart(2, '0')}`;
            
            // Actions (Edit/Delete/Mod)
            let actionsHtml = `<div style="display:inline-flex; gap: 5px; margin-right: 8px;">`;
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
            
            msgDiv.innerHTML = nameHtml + m.text + bottomRow;
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
    
    const urlParams = new URLSearchParams(window.location.search);
    const user_id = urlParams.get('user_id');
    const sig = urlParams.get('sig');
    
    try {
        await fetch(`${API_URL}/api/chat`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id, sig, msg_id: id })
        });
        loadChat();
    } catch(e) {}
};

document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msgIdInput = document.getElementById('edit-msg-id');
    
    const text = input.value.trim();
    const msgId = msgIdInput.value;
    
    if (!text) return;
    
    // Optimistic clear
    input.value = '';
    msgIdInput.value = '';
    
    const urlParams = new URLSearchParams(window.location.search);
    const user_id = urlParams.get('user_id');
    const sig = urlParams.get('sig');
    
    try {
        if (msgId) {
            // Edit
            await fetch(`${API_URL}/api/chat`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id, sig, text, msg_id: msgId })
            });
        } else {
            // Send new
            await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id, sig, text })
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
    
    const urlParams = new URLSearchParams(window.location.search);
    const user_id = urlParams.get('user_id');
    const sig = urlParams.get('sig');
    
    try {
        const res = await fetch(`${API_URL}/api/moderate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id, sig, target_id: parseInt(target_id), action, reason })
        });
        
        if (res.ok) {
            document.getElementById('mod-modal').style.display = 'none';
            tg.showAlert("Дію виконано!");
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
    
    const urlParams = new URLSearchParams(window.location.search);
    const user_id = urlParams.get('user_id');
    const sig = urlParams.get('sig');
    
    try {
        const res = await fetch(`${API_URL}/api/catch`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id, sig, catch_id: id })
        });
        
        if (res.ok) {
            document.getElementById('catch-modal').style.display = 'none';
            // Reload history and map
            document.querySelector('[data-target="tab-history"]').click();
            if (catchesMap) initGlobalMap(); // reload map
            tg.showAlert("Улов видалено!");
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
