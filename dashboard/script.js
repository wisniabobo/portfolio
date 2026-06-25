const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
const formatPercentage = (val) => `<span class="${val >= 0 ? 'text-green-400' : 'text-red-400'}">${val >= 0 ? '▲' : '▼'} ${Math.abs(val).toFixed(2)}%</span>`;

let chartInstance = null;

// Fetch Top Market Data
async function fetchMarketData() {
    try {
        const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=4&page=1&sparkline=false');
        if (!res.ok) throw new Error('API limit reached or error');
        const data = await res.json();
        
        const overviewEl = document.getElementById('market-overview');
        overviewEl.innerHTML = '';
        
        data.forEach(coin => {
            overviewEl.innerHTML += `
                <div class="glass-panel p-5 rounded-2xl crypto-card flex justify-between items-center cursor-pointer" onclick="updateChart('${coin.id}', '${coin.name}')">
                    <div class="flex items-center gap-3">
                        <img src="${coin.image}" alt="${coin.name}" class="w-10 h-10">
                        <div>
                            <h3 class="text-lg font-semibold text-slate-200">${coin.name}</h3>
                            <p class="text-sm text-slate-400 uppercase">${coin.symbol}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-xl font-bold">${formatCurrency(coin.current_price)}</div>
                        <div class="text-sm">${formatPercentage(coin.price_change_percentage_24h)}</div>
                    </div>
                </div>
            `;
        });
        
    } catch (err) {
        console.error(err);
        document.getElementById('market-overview').innerHTML = `<div class="col-span-4 text-center text-red-400 p-4">Unable to load live data (API rate limit possibly reached). Try again later.</div>`;
    }
}

// Fetch Trending Coins
async function fetchTrending() {
    try {
        const res = await fetch('https://api.coingecko.com/api/v3/search/trending');
        const data = await res.json();
        const listEl = document.getElementById('trending-list');
        listEl.innerHTML = '';
        
        data.coins.slice(0, 10).forEach(item => {
            const coin = item.item;
            const price = coin.data?.price || 0;
            const change = coin.data?.price_change_percentage_24h?.usd || 0;
            
            listEl.innerHTML += `
                <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer" onclick="updateChart('${coin.id}', '${coin.name}')">
                    <img src="${coin.thumb}" alt="${coin.name}" class="w-10 h-10 rounded-full">
                    <div class="flex-1">
                        <h4 class="font-semibold text-slate-200">${coin.name} <span class="text-xs text-slate-500 font-normal ml-1">#${coin.market_cap_rank || '-'}</span></h4>
                        <p class="text-xs text-slate-400 uppercase">${coin.symbol}</p>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-semibold">${typeof price === 'string' ? price : formatCurrency(price)}</div>
                        <div class="text-xs">${formatPercentage(change)}</div>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

// Chart Logic
let currentCoinId = 'bitcoin';
let currentCoinName = 'Bitcoin';

async function updateChart(coinId = currentCoinId, coinName = currentCoinName) {
    currentCoinId = coinId;
    currentCoinName = coinName;
    const days = document.getElementById('chart-days').value;
    const loader = document.getElementById('chart-loader');
    
    document.querySelector('h2').innerText = `${coinName} Price History`;
    loader.classList.remove('hidden');
    
    try {
        const res = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`);
        const data = await res.json();
        
        const prices = data.prices.map(p => p[1]);
        const labels = data.prices.map(p => {
            const d = new Date(p[0]);
            return days == 1 ? d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : d.toLocaleDateString();
        });

        renderChart(labels, prices, coinName);
    } catch (err) {
        console.error(err);
    } finally {
        loader.classList.add('hidden');
    }
}

function renderChart(labels, data, labelName) {
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); // Blue
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelName + ' Price (USD)',
                data: data,
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: '#64748b', maxTicksLimit: 7 }
                },
                y: {
                    grid: { color: 'rgba(51, 65, 85, 0.5)', drawBorder: false },
                    ticks: {
                        color: '#64748b',
                        callback: function(value) {
                            return '$' + (value >= 1000 ? (value/1000).toFixed(1) + 'k' : value);
                        }
                    }
                }
            }
        }
    });
}

document.getElementById('chart-days').addEventListener('change', () => updateChart());

// Init
fetchMarketData();
fetchTrending();
updateChart();

// Refresh data every 60s
setInterval(() => {
    fetchMarketData();
}, 60000);
