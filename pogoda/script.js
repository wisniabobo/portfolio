// Teletext Clock
function updateClock() {
    const now = new Date();
    const days = ['NDZ', 'PON', 'WTO', 'SRO', 'CZW', 'PIA', 'SOB'];
    const months = ['STYCZEN', 'LUTY', 'MARZEC', 'KWIECIEN', 'MAJ', 'CZERWIEC', 'LIPIEC', 'SIERPIEN', 'WRZESIEN', 'PAZDZIERNIK', 'LISTOPAD', 'GRUDZIEN'];
    
    const dayName = days[now.getDay()];
    const dayNum = String(now.getDate()).padStart(2, '0');
    const month = months[now.getMonth()].substring(0, 3);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    document.getElementById('datetime').innerText = `${dayName} ${dayNum} ${month} ${hours}:${minutes}:${seconds}`;
}
setInterval(updateClock, 1000);
updateClock();

// App Logic
const searchBtn = document.getElementById('searchBtn');
const cityInput = document.getElementById('cityInput');
const loading = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const weatherData = document.getElementById('weatherData');

const resCity = document.getElementById('resCity');
const resTemp = document.getElementById('resTemp');
const resCond = document.getElementById('resCond');
const resWind = document.getElementById('resWind');
const resHum = document.getElementById('resHum');
const weatherArt = document.getElementById('weatherArt');

const weatherCodes = {
    0: { desc: "BEZCHMURNIE", art: `
    \\  /
  _ /"".\\ _
    \\__(/
    /  \\
` },
    1: { desc: "PRZEWAZNIE SLONECZNIE", art: `
   \\  /       .-.
 _ /"".\\ _   (   ).
   \\__(/    (___(__)
   /  \\
` },
    2: { desc: "CZESCIOWE ZACHMURZENIE", art: `
      .-.
     (   ).
    (___(__)
` },
    3: { desc: "POCHMURNO", art: `
      .-.
     (   ).
    (___(__)
   (       )
  (_________)
` },
    45: { desc: "MGLA", art: `
  _ - _ - _ -
   _ - _ - _
  _ - _ - _ -
` },
    48: { desc: "OSADZAJACA SIE MGLA", art: `
  _ - _ - _ -
   _ - _ - _
  _ - _ - _ -
` },
    51: { desc: "LEKKA MZAWSKA", art: `
      .-.
     (   ).
    (___(__)
     ' ' ' '
    ' ' ' '
` },
    53: { desc: "UMIARKOWANA MZAWSKA", art: `
      .-.
     (   ).
    (___(__)
     ' ' ' '
    ' ' ' '
` },
    55: { desc: "GESTA MZAWSKA", art: `
      .-.
     (   ).
    (___(__)
     ' ' ' '
    ' ' ' '
` },
    61: { desc: "LEKKI DESZCZ", art: `
      .-.
     (   ).
    (___(__)
    / / / /
   / / / /
` },
    63: { desc: "UMIARKOWANY DESZCZ", art: `
      .-.
     (   ).
    (___(__)
    / / / /
   / / / /
` },
    65: { desc: "SILNY DESZCZ", art: `
      .-.
     (   ).
    (___(__)
    / / / /
   / / / /
` },
    71: { desc: "LEKKI SNIEG", art: `
      .-.
     (   ).
    (___(__)
     *  *  *
      *  *
` },
    73: { desc: "UMIARKOWANY SNIEG", art: `
      .-.
     (   ).
    (___(__)
     *  *  *
      *  *
` },
    75: { desc: "SILNY SNIEG", art: `
      .-.
     (   ).
    (___(__)
     *  *  *
      *  *
` },
    95: { desc: "BURZA", art: `
      .-.
     (   ).
    (___(__)
      ⚡  ⚡
     / / / /
` }
};

function getWeatherInfo(code) {
    if (weatherCodes[code]) return weatherCodes[code];
    return { desc: "NIEZNANY STAN (" + code + ")", art: "  ???" };
}

searchBtn.addEventListener('click', () => {
    const city = cityInput.value.trim();
    if (!city) return;

    weatherData.classList.add('hidden');
    errorDiv.classList.add('hidden');
    loading.classList.remove('hidden');

    // 1. Geocoding
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pl`)
        .then(res => res.json())
        .then(data => {
            if (!data.results || data.results.length === 0) {
                throw new Error("City not found");
            }
            const location = data.results[0];
            const lat = location.latitude;
            const lon = location.longitude;
            const cityName = location.name.toUpperCase();
            const country = location.country ? location.country.toUpperCase() : "";

            // 2. Weather
            return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m&timezone=auto`)
                .then(res => res.json())
                .then(weatherData => ({
                    weather: weatherData,
                    city: cityName,
                    country: country
                }));
        })
        .then(result => {
            const current = result.weather.current_weather;
            const humidity = result.weather.hourly.relativehumidity_2m[0]; // approximation for current humidity
            const info = getWeatherInfo(current.weathercode);

            resCity.innerText = `${result.city} ${result.country ? '(' + result.country + ')' : ''}`;
            resTemp.innerText = `${current.temperature} \u00B0C`;
            resCond.innerText = info.desc;
            resWind.innerText = `${current.windspeed} KM/H (KIER. ${current.winddirection}\u00B0)`;
            resHum.innerText = `${humidity}%`;
            weatherArt.innerText = info.art;

            loading.classList.add('hidden');
            weatherData.classList.remove('hidden');
        })
        .catch(err => {
            console.error(err);
            loading.classList.add('hidden');
            errorDiv.classList.remove('hidden');
        });
});

cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchBtn.click();
    }
});
