# TradeDesk — Real-Time Stock Broker Dashboard

Built by **Siddharth Agrawal** · Final-year IS @ RVCE · [siddharthagrawal804@gmail.com](mailto:siddharthagrawal804@gmail.com)

A real-time stock broker client dashboard with live price streaming, per-user subscriptions, and persistent accounts.

---

## Features

- Email + password authentication (Sign Up / Sign In)
- Subscribe to 5 stocks: `GOOG`, `TSLA`, `AMZN`, `META`, `NVDA`
- Live price updates every second via WebSockets (Socket.io) — no page refresh
- Live line charts per subscribed stock (last 30 price points)
- Subscriptions persist across sessions and server restarts
- Dark / Light mode toggle
- Multi-user support — open two tabs with different accounts, both update independently

---

## Tech Stack

- **Backend:** Node.js, Express, Socket.io
- **Frontend:** Vanilla HTML, CSS, JavaScript, Chart.js
- **Storage:** JSON file (`users.json`) for auth + subscription persistence

---

## Demo Accounts

Two accounts are pre-seeded — no sign-up needed to evaluate:

| Email | Password |
|---|---|
| alice@demo.com | demo123 |
| bob@demo.com | demo123 |

To test multi-user: open the app in two browser tabs, log in with different accounts, subscribe to different stocks, and watch both dashboards update live.

---

## Running Locally

**Prerequisites:** Node.js v18+

```bash
# 1. Clone the repo
git clone https://github.com/SiddharthAgrawal3008/TradeDesk.git
cd TradeDesk

# 2. Install dependencies
npm install

# 3. Start the server
node server.js
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
TradeDesk/
├── server.js          # Express + Socket.io backend, price engine, auth API
├── package.json
├── users.json         # Auto-created on first sign-up (gitignored)
└── public/
    ├── index.html     # Landing page
    ├── login.html     # Sign in
    ├── signup.html    # Create account
    ├── dashboard.html # Main trading dashboard
    ├── app.js         # Client-side Socket.io logic + charts
    └── style.css      # Dark/light theme styles
```
