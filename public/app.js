(function () {
  'use strict';

  // ── Auth guard ───────────────────────────────────────────────────────────
  const email = sessionStorage.getItem('td_email');
  const name  = sessionStorage.getItem('td_name') || (email ? email.split('@')[0] : null);
  if (!email) { window.location.href = 'login.html'; return; }

  // ── Theme ────────────────────────────────────────────────────────────────
  (function initTheme() {
    const saved = localStorage.getItem('td_theme') || 'dark';
    if (saved === 'light') document.body.classList.add('light-mode');
    updateThemeIcon(saved);
  })();

  function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = theme === 'light' ? '&#9790;' : '&#9788;';
  }

  document.getElementById('theme-toggle').addEventListener('click', function () {
    const isLight = document.body.classList.toggle('light-mode');
    const theme = isLight ? 'light' : 'dark';
    localStorage.setItem('td_theme', theme);
    updateThemeIcon(theme);
  });

  // ── Stock metadata ────────────────────────────────────────────────────────
  const STOCKS = [
    { ticker: 'GOOG', name: 'Alphabet Inc.' },
    { ticker: 'TSLA', name: 'Tesla Inc.' },
    { ticker: 'AMZN', name: 'Amazon.com Inc.' },
    { ticker: 'META', name: 'Meta Platforms' },
    { ticker: 'NVDA', name: 'NVIDIA Corp.' },
  ];

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {};
  STOCKS.forEach(({ ticker }) => {
    state[ticker] = { subscribed: false, price: null, change: null, changePercent: null, history: [], timestamps: [] };
  });

  const charts = {};

  // ── Helpers ───────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  function formatPrice(price) {
    if (price === null || price === undefined) return '—';
    return '$' + Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatChange(change, changePercent) {
    if (change === null || change === undefined) return '';
    const sign  = change >= 0 ? '+' : '';
    const arrow = change >= 0 ? '▲' : '▼';
    return arrow + ' ' + sign + Number(change).toFixed(2) + '  (' + sign + Number(changePercent).toFixed(2) + '%)';
  }

  function setConnectionStatus(connected) {
    const dot   = $('status-dot');
    const label = $('status-label');
    dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    label.textContent = connected ? 'Live' : 'Disconnected';
  }

  // ── User UI ───────────────────────────────────────────────────────────────
  function initUserUI() {
    $('user-email-display').textContent = email;
    $('user-name-display').textContent  = name;
    $('user-avatar').textContent        = (name || email).charAt(0).toUpperCase();

    $('btn-logout').addEventListener('click', function () {
      sessionStorage.removeItem('td_email');
      sessionStorage.removeItem('td_name');
      window.location.href = 'login.html';
    });
  }

  // ── Market Watch cards ────────────────────────────────────────────────────
  function buildCards() {
    const grid = $('stocks-grid');
    grid.innerHTML = '';
    STOCKS.forEach(({ ticker, name: sName }) => {
      const card = document.createElement('div');
      card.className = 'stock-card';
      card.id = 'card-' + ticker;
      card.innerHTML = `
        <div class="card-header">
          <div class="ticker-info">
            <div class="ticker-symbol">${ticker}</div>
            <div class="ticker-name">${sName}</div>
          </div>
          <div class="live-badge"><span class="live-dot"></span>LIVE</div>
        </div>
        <div class="price-area" id="price-area-${ticker}">
          <div class="price-placeholder">Subscribe to see price</div>
        </div>
        <button class="btn-subscribe sub" id="btn-${ticker}" data-ticker="${ticker}">
          Subscribe
        </button>`;
      grid.appendChild(card);
      card.querySelector('.btn-subscribe').addEventListener('click', function () {
        const t = this.dataset.ticker;
        socket.emit(state[t].subscribed ? 'unsubscribe' : 'subscribe', { ticker: t });
      });
    });
  }

  function updateCard(ticker) {
    const s     = state[ticker];
    const card  = $('card-' + ticker);
    const btn   = $('btn-' + ticker);
    const area  = $('price-area-' + ticker);
    if (!card) return;

    if (s.subscribed) {
      card.classList.add('subscribed');
      btn.textContent = 'Unsubscribe';
      btn.className   = 'btn-subscribe unsub';
      const changeClass = s.change === null ? '' : (s.change >= 0 ? 'positive' : 'negative');
      area.innerHTML  = `
        <div class="price-value">${formatPrice(s.price)}</div>
        <div class="price-change ${changeClass}">${formatChange(s.change, s.changePercent)}</div>`;
    } else {
      card.classList.remove('subscribed');
      btn.textContent = 'Subscribe';
      btn.className   = 'btn-subscribe sub';
      area.innerHTML  = '<div class="price-placeholder">Subscribe to see price</div>';
    }
  }

  function flashCard(ticker, direction) {
    const area = $('price-area-' + ticker);
    if (!area) return;
    area.classList.remove('flash-up', 'flash-down');
    void area.offsetWidth;
    area.classList.add(direction === 'up' ? 'flash-up' : 'flash-down');
  }

  // ── Portfolio cards & charts ──────────────────────────────────────────────
  function chartColors(s) {
    const up = s.change === null ? true : s.change >= 0;
    return {
      line: up ? '#00c853' : '#ff1744',
      fill: up ? 'rgba(0,200,83,0.12)' : 'rgba(255,23,68,0.12)',
    };
  }

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  function buildTimestamps(count) {
    const now = Date.now();
    return Array.from({ length: count }, (_, i) => fmtTime(now - (count - 1 - i) * 1000));
  }

  function createChart(ticker) {
    const canvas = $('chart-' + ticker);
    if (!canvas) return null;
    const s = state[ticker];
    const c = chartColors(s);
    return new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: s.timestamps.slice(),
        datasets: [{
          data: s.history.slice(),
          borderColor: c.line,
          backgroundColor: c.fill,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: { label: ctx => '$' + ctx.parsed.y.toFixed(2) },
          },
        },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: 'rgba(128,128,128,0.65)',
              font: { size: 9, family: 'inherit' },
              maxTicksLimit: 5,
              maxRotation: 0,
            },
          },
          y: {
            display: true,
            position: 'right',
            grid: { color: 'rgba(128,128,128,0.08)', drawBorder: false },
            border: { display: false },
            ticks: {
              color: 'rgba(128,128,128,0.7)',
              font: { size: 10, family: 'inherit' },
              maxTicksLimit: 3,
              callback: v => '$' + Number(v).toFixed(0),
            },
          },
        },
      },
    });
  }

  function updateChart(ticker) {
    const chart = charts[ticker];
    const s     = state[ticker];
    if (!chart) return;
    const c = chartColors(s);
    chart.data.labels                    = s.timestamps.slice();
    chart.data.datasets[0].data         = s.history.slice();
    chart.data.datasets[0].borderColor  = c.line;
    chart.data.datasets[0].backgroundColor = c.fill;
    chart.update('none');
  }

  function buildPortfolioCard(ticker) {
    if ($('pcrd-' + ticker)) return;
    const meta = STOCKS.find(s => s.ticker === ticker);
    const s    = state[ticker];

    const card = document.createElement('div');
    card.className = 'portfolio-card';
    card.id = 'pcrd-' + ticker;
    card.innerHTML = `
      <div class="pcrd-header">
        <div class="pcrd-left">
          <div class="pcrd-ticker">${ticker}</div>
          <div class="pcrd-name">${meta.name}</div>
        </div>
        <div class="pcrd-right">
          <div class="pcrd-price" id="pcrd-price-${ticker}">${formatPrice(s.price)}</div>
          <div class="pcrd-change ${s.change === null ? '' : s.change >= 0 ? 'positive' : 'negative'}"
               id="pcrd-change-${ticker}">${formatChange(s.change, s.changePercent)}</div>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="chart-${ticker}"></canvas>
      </div>`;

    $('portfolio-grid').appendChild(card);
    $('portfolio-empty').style.display = 'none';
    charts[ticker] = createChart(ticker);
  }

  function destroyPortfolioCard(ticker) {
    if (charts[ticker]) { charts[ticker].destroy(); delete charts[ticker]; }
    const card = $('pcrd-' + ticker);
    if (card) card.remove();
    const hasAny = STOCKS.some(({ ticker: t }) => state[t].subscribed);
    if (!hasAny) $('portfolio-empty').style.display = '';
  }

  function updatePortfolioCard(ticker) {
    const s = state[ticker];
    const priceEl  = $('pcrd-price-'  + ticker);
    const changeEl = $('pcrd-change-' + ticker);
    if (!priceEl) return;
    priceEl.textContent = formatPrice(s.price);
    changeEl.textContent = formatChange(s.change, s.changePercent);
    changeEl.className   = 'pcrd-change ' + (s.change === null ? '' : s.change >= 0 ? 'positive' : 'negative');
  }

  // ── Socket.io ─────────────────────────────────────────────────────────────
  const socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', function () {
    setConnectionStatus(true);
    socket.emit('login', { email });
  });

  socket.on('disconnect', function () { setConnectionStatus(false); });

  socket.on('authenticated', function (data) {
    const subs    = Array.isArray(data.subscriptions) ? data.subscriptions : [];
    const history = data.priceHistory || {};

    subs.forEach(function (ticker) {
      if (!state[ticker]) return;
      state[ticker].subscribed  = true;
      state[ticker].history     = (history[ticker] || []).slice(-30);
      state[ticker].timestamps  = buildTimestamps(state[ticker].history.length);
      if (state[ticker].history.length > 0) {
        state[ticker].price = state[ticker].history[state[ticker].history.length - 1];
      }
      updateCard(ticker);
      buildPortfolioCard(ticker);
    });
  });

  socket.on('subscribed', function (data) {
    const ticker = data.ticker;
    if (!state[ticker]) return;
    state[ticker].subscribed = true;
    updateCard(ticker);
    buildPortfolioCard(ticker);
  });

  // Server sends full history after a live subscribe action
  socket.on('price_history', function (data) {
    const ticker = data.ticker;
    if (!state[ticker]) return;
    state[ticker].history    = (data.history || []).slice(-30);
    state[ticker].timestamps = buildTimestamps(state[ticker].history.length);
    if (charts[ticker]) updateChart(ticker);
    else buildPortfolioCard(ticker);
  });

  socket.on('unsubscribed', function (data) {
    const ticker = data.ticker;
    if (!state[ticker]) return;
    state[ticker].subscribed    = false;
    state[ticker].price         = null;
    state[ticker].change        = null;
    state[ticker].changePercent = null;
    state[ticker].history       = [];
    state[ticker].timestamps    = [];
    updateCard(ticker);
    destroyPortfolioCard(ticker);
  });

  socket.on('price_update', function (data) {
    const { ticker, price, change, changePercent } = data;
    if (!state[ticker]) return;

    const prev = state[ticker].price;
    state[ticker].price         = price;
    state[ticker].change        = change;
    state[ticker].changePercent = changePercent;

    state[ticker].history.push(price);
    state[ticker].timestamps.push(fmtTime(Date.now()));
    if (state[ticker].history.length > 30) state[ticker].history.shift();
    if (state[ticker].timestamps.length > 30) state[ticker].timestamps.shift();

    updateCard(ticker);

    if (state[ticker].subscribed) {
      updatePortfolioCard(ticker);
      updateChart(ticker);
    }

    if (prev !== null) flashCard(ticker, price >= prev ? 'up' : 'down');
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  initUserUI();
  buildCards();

})();
