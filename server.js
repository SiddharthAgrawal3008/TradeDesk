const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const USERS_DB = path.join(__dirname, 'users.json');
const PRICE_HISTORY_LENGTH = 30;

const SUPPORTED_TICKERS = ['GOOG', 'TSLA', 'AMZN', 'META', 'NVDA'];

const BASE_PRICES = {
  GOOG: 180.00,
  TSLA: 250.00,
  AMZN: 200.00,
  META: 530.00,
  NVDA: 900.00,
};

const currentPrices = { ...BASE_PRICES };
const previousPrices = { ...BASE_PRICES };

// price history: last 30 ticks per ticker
const priceHistory = {};
SUPPORTED_TICKERS.forEach((t) => { priceHistory[t] = [BASE_PRICES[t]]; });

// in-memory session store: email -> { subscriptions: Set<ticker> }
const sessions = {};
// socketId -> email
const socketToEmail = {};

// demo accounts always available regardless of users.json
const DEMO_ACCOUNTS = {
  'alice@demo.com': { name: 'Alice', email: 'alice@demo.com', password: 'demo123', subscriptions: [] },
  'bob@demo.com':   { name: 'Bob',   email: 'bob@demo.com',   password: 'demo123', subscriptions: [] },
};

// --- Auth DB helpers ---
function loadUsersDB() {
  let db = {};
  if (fs.existsSync(USERS_DB)) {
    try { db = JSON.parse(fs.readFileSync(USERS_DB, 'utf8')); } catch { db = {}; }
  }
  // merge demo accounts (file entries take precedence for subscriptions)
  Object.entries(DEMO_ACCOUNTS).forEach(([email, account]) => {
    if (!db[email]) db[email] = account;
  });
  return db;
}

function saveUsersDB(db) {
  fs.writeFileSync(USERS_DB, JSON.stringify(db, null, 2));
}

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth REST API ---
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.json({ success: false, error: 'All fields are required.' });
  }
  const db = loadUsersDB();
  if (db[email]) {
    return res.json({ success: false, error: 'An account with this email already exists.' });
  }
  db[email] = { name, email, password };
  saveUsersDB(db);
  res.json({ success: true });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.json({ success: false, error: 'Email and password are required.' });
  }
  const db = loadUsersDB();
  const user = db[email];
  if (!user || user.password !== password) {
    return res.json({ success: false, error: 'Invalid email or password.' });
  }
  res.json({ success: true, name: user.name, email: user.email });
});

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Socket.io ---
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('login', ({ email }) => {
    if (!email) return;

    socketToEmail[socket.id] = email;

    // load persisted subscriptions from users.json
    const db = loadUsersDB();
    const savedSubs = db[email] && db[email].subscriptions ? db[email].subscriptions : [];

    if (!sessions[email]) {
      sessions[email] = { subscriptions: new Set(savedSubs) };
    }

    // build price history snapshot for subscribed tickers
    const history = {};
    sessions[email].subscriptions.forEach((ticker) => {
      history[ticker] = [...priceHistory[ticker]];
    });

    socket.emit('authenticated', {
      email,
      subscriptions: Array.from(sessions[email].subscriptions),
      priceHistory: history,
    });

    console.log(`User logged in: ${email} (socket: ${socket.id})`);
  });

  socket.on('subscribe', ({ ticker }) => {
    const email = socketToEmail[socket.id];
    if (!email || !SUPPORTED_TICKERS.includes(ticker)) return;

    sessions[email].subscriptions.add(ticker);

    // persist to users.json
    const db = loadUsersDB();
    if (db[email]) {
      db[email].subscriptions = Array.from(sessions[email].subscriptions);
      saveUsersDB(db);
    }

    socket.emit('subscribed', { ticker });

    // send current price + full history immediately
    const price = currentPrices[ticker];
    const prev = previousPrices[ticker];
    const change = parseFloat((price - prev).toFixed(2));
    const changePercent = parseFloat(((change / prev) * 100).toFixed(2));

    socket.emit('price_update', { ticker, price, change, changePercent });
    socket.emit('price_history', { ticker, history: [...priceHistory[ticker]] });

    console.log(`${email} subscribed to ${ticker}`);
  });

  socket.on('unsubscribe', ({ ticker }) => {
    const email = socketToEmail[socket.id];
    if (!email) return;

    sessions[email].subscriptions.delete(ticker);

    // persist to users.json
    const db = loadUsersDB();
    if (db[email]) {
      db[email].subscriptions = Array.from(sessions[email].subscriptions);
      saveUsersDB(db);
    }

    socket.emit('unsubscribed', { ticker });

    console.log(`${email} unsubscribed from ${ticker}`);
  });

  socket.on('disconnect', () => {
    const email = socketToEmail[socket.id];
    delete socketToEmail[socket.id];
    console.log(`Socket disconnected: ${socket.id} (${email || 'unauthenticated'})`);
  });
});

// --- Price engine ---
function generatePrice(ticker) {
  const current = currentPrices[ticker];
  const changePct = (Math.random() - 0.5) * 0.03;
  const newPrice = parseFloat((current * (1 + changePct)).toFixed(2));
  const floor = BASE_PRICES[ticker] * 0.10;
  return Math.max(newPrice, floor);
}

setInterval(() => {
  SUPPORTED_TICKERS.forEach((ticker) => {
    previousPrices[ticker] = currentPrices[ticker];
    currentPrices[ticker] = generatePrice(ticker);

    // maintain rolling history
    priceHistory[ticker].push(currentPrices[ticker]);
    if (priceHistory[ticker].length > PRICE_HISTORY_LENGTH) {
      priceHistory[ticker].shift();
    }

    const price = currentPrices[ticker];
    const prev = previousPrices[ticker];
    const change = parseFloat((price - prev).toFixed(2));
    const changePercent = parseFloat(((change / prev) * 100).toFixed(2));

    Object.entries(socketToEmail).forEach(([socketId, email]) => {
      if (sessions[email] && sessions[email].subscriptions.has(ticker)) {
        io.to(socketId).emit('price_update', { ticker, price, change, changePercent });
      }
    });
  });
}, 1000);

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
