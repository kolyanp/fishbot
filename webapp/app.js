const tg = window.Telegram.WebApp;

// Initialize Telegram Web App
tg.ready();
tg.expand(); // Make it full height

// Apply theme from Telegram
document.documentElement.style.setProperty('--bg-color', tg.themeParams.bg_color || '#0f172a');
document.documentElement.style.setProperty('--text-color', tg.themeParams.text_color || '#f8fafc');

const form = document.getElementById('catch-form');

form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const species = document.getElementById('species').value;
    const weight = document.getElementById('weight').value;
    const bait = document.getElementById('bait').value;
    
    const data = {
        species: species,
        weight: parseFloat(weight),
        bait: bait
    };
    
    // Telegram will receive this data in message.web_app_data.data
    tg.sendData(JSON.stringify(data));
});
