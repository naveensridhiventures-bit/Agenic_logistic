# Agenic Batter Ledger

A React + Vite PWA for Agenic idli batter deliveries. For every day it shows **profit or loss** after batter cost, driver salary, diesel, porter and other expenses. It tracks which hotels have paid, warns when a customer crosses the credit limit, and emails reminders. Data lives in your **Google Sheet** through a small Apps Script.

## 1. Run the app

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

The app starts empty and is pre-pointed at the Agenic Google Sheet web app. Add customers with **Customers → Import** (CSV or paste from Excel/Sheets) or one by one.

## 2. Connect the Google Sheet (about 5 minutes)

1. Create a new Google Sheet, e.g. "Agenic Ledger".
2. **Extensions → Apps Script**, delete the sample code and paste `backend/Code.gs`.
3. Change `API_KEY` at the top to your own secret word.
4. Choose the function **`setup`** and press **Run**. Approve the permissions (Sheets and Gmail send). It creates the tabs and a daily 9 AM reminder trigger.
5. **Deploy → New deployment → Web app**. Set *Execute as: Me* and *Who has access: Anyone*. Copy the URL ending in `/exec`.
6. In the app open **Settings → Google Sheet backend**, paste the URL and key, press **Test connection**, then **Save & connect**.
7. Add your hotels in **Customers**, or type them straight into the `Customers` tab.

Whenever you change `Code.gs`, use **Deploy → Manage deployments → Edit → New version**.

## 3. Host it so staff can install it

Upload `dist/` to Netlify, Vercel, Cloudflare Pages or Firebase Hosting (HTTPS is required for a PWA). Open the URL on a phone and choose **Install app / Add to Home Screen**. Optionally set `VITE_API_URL` and `VITE_API_KEY` in your host's environment so devices don't need the Settings step.

## How it works

| Idea | Rule |
| --- | --- |
| Day profit/loss | Sales − (kg × batter cost) − driver − diesel − porter − other |
| Price differences | Each customer has a usual rate. Override it per delivery, e.g. ₹40 higher or lower, and the margin updates. |
| Batter cost | Saved on each delivery, so changing it later doesn't rewrite old days. |
| Paid or not | Payments clear the **oldest bill first**. Tick "paid on delivery" to record cash or UPI instantly. |
| Limits | Per customer: **credit limit (₹)** and **max unpaid days**. Reaching either marks the customer *Over limit*. |
| Warnings | Red banner, a popup when a customer newly crosses a limit, and a pulsing card. |
| Emails | "Send reminder" or "Email all" from the popup. The Apps Script sends from your Gmail, copying your email. A daily trigger also emails customers over limit, plus a summary to you. |

Notes: Gmail allows about 100 emails a day for a normal account (1,500 for Workspace). The API key is a simple shared secret. Don't share the web app URL publicly.

## Sheet tabs

`Customers`, `Deliveries`, `DayCosts`, `Payments`, `Settings`. You can view or edit them directly, and the app picks up changes when you press the sync badge.

## Orders, reports and PDFs

- **Daily Entry** → after entering deliveries and the day's driver / diesel / porter cost, press **Download PDF** (or **Share** on a phone, e.g. WhatsApp). Deliveries, day cost and porter can all be edited or deleted.
- **Orders** tab → switch **Day / Week / Month**, move with the arrows, open any date to see each order's payment status, and download a **PDF report** or **CSV**.
- Every PDF ends with the **pending customers** list (what each customer still owes, oldest bill, status) and sign-off lines for management. Amounts in PDFs print as "Rs." because the built-in PDF font has no rupee sign.
- Payment status is worked out by clearing each customer's oldest bills first.
