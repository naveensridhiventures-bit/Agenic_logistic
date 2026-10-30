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

## Profit per kg

The ₹40 selling rate already carries manufacturing and other costs, so you only enter **your profit per kg**. Set it per customer (Customers → edit, or **Rates & profit** for a table of all hotels), with a default in Settings. Day result = Σ(kg × profit) − delivery expenses (driver, diesel, porter, other).

## Routes & drivers

- **Routes tab → Drivers**: add each driver with vehicle, capacity, start point and their current **stretch** (areas they cover).
- New orders are suggested a driver by extra km, stretch/area match and load. One tap assigns; **Choose…** lets you override and pick the position. Drag the handle to reorder, **Optimize** to re-sequence, **Auto-allocate** to place all waiting orders.
- Give each hotel a map location (paste a Google Maps link, `lat,lng` or plus code) or use **Find locations**. Suggestions are only as accurate as the saved locations.
- **Driver PDF / All drivers PDF**: big stop numbers, sketch map, quantity, amount to collect, tap-to-open Google Maps buttons, tick boxes and QR codes.

After updating `Code.gs`: run `setup` once (adds the Drivers tab and new columns), then Deploy → New version.

**Regular route:** in Drivers → edit, paste the route list he drives now (kg is ignored). New orders are suggested by how far they take him off that route; hotels already on it go to him automatically, in his order.

**Hired vehicles (porter / auto / bike):** in Daily Entry → Delivery cost, press *Add vehicle*, choose the vehicle, enter its charge and tap the hotels that went in it. The management PDF lists each trip with hotels, kg, charge and cost per kg, plus total delivery expense ÷ total kg. Run `setup` once to create the new `Trips` tab.

## Driver app (phone)

- Open `https://YOUR-SITE/?driver=1` on the driver's phone and choose *Add to Home screen*. The link is also shown in **Routes → Drivers**.
- Admin sets a **4-digit PIN** for each driver (Routes → Drivers → edit). The driver picks his name and enters the PIN (5 wrong tries lock that driver for 10 minutes). The driver app never receives the admin key, profit or other customers.
- Driver sees only his own route in order, one stop at a time: Navigate, Call, amount to collect (today plus previous pending), then **Delivered**, payment **Cash / GPay / Pending**, optional remark and voice note. Only then does the next stop unlock. At the end: return to the pickup point.
- It works offline: updates are saved on the phone and sent when the network is back.
- Money collected becomes a normal payment in the ledger. **Routes → Live status** shows each stop's state, payment, remark and a voice-note player. Voice notes are stored in a private Google Drive folder created by the script.

## Diesel-saving routes

Every route starts at the pickup point (Settings → Pickup point, default Koratturr) and returns to it. Optimize builds a loop so the far run goes out one way and nearer hotels are served on the way back, and picks the direction that drops heavy loads first. Set truck mileage and diesel price in Settings to see litres and rupees per route and the saving when you optimize.

After updating `Code.gs`: paste it, run `setup` once (creates the Tracking tab and asks for Google Drive permission), then Deploy → New version.

## Unlock codes, route overview and office call

- **Settings → Office phone** is shown in the driver app (Call office button).
- Locked stops, and the final return to the pickup point, open with a **4-digit code**. The driver taps Unlock, sees the office number to call, and enters the code the admin reads out. The admin finds it in **Routes → Live status** (button *Unlock code* on each waiting stop, and *Return code* per driver). Five wrong codes lock the attempts for 10 minutes. Stops opened early are marked *Unlocked early*.
- The driver's **Route** button shows the whole route without locks: stretch, a sketch map, every hotel name in order with its status, and QR codes / buttons that open the full route in Google Maps.

**Porter quick flow:** Daily Entry → Hired vehicles → Add vehicle. Pick the vehicle, search and tick the hotels, and save. The charge can stay empty and be added later with *Enter charge* (marked "pending" until then). The PDF shows "Pending" for trips with no charge.

## Driver link, live summary and date-wise delivery reports
- Routes page now shows the **driver app link** banner on top (Copy, WhatsApp, QR, Drivers & PINs).
- **Live status** has a summary strip: Total / Done / Kg / Bill / Collected / Pending, plus per-driver stop status, remarks and voice notes.
- **Date-wise reports** tab: last 7/14/30 days, tap a day to open it in Live status; download or share the delivery report PDF (summary by date + every stop with status, time, payment, remark).

## Customer ledgers (Tally style)
- Customers page → **Customer ledgers**: customers listed highest pending first, tick any (or "Top 10 pending"), choose Day / Week / Month / Custom / All and download or share one PDF. Each customer gets an account ledger (opening balance b/f, sales as Debit, receipts as Credit, running balance, closing c/f); several customers also get a summary page.
- The date-wise delivery report PDF no longer shows any payment figures (payments are recorded later in Payments and appear in the ledgers).

## Stock (multi-product, date-wise, FIFO)
- New **Stock** tab: products (e.g. Idli batter, Sridhi plain packets) each with packet size, safety %, shelf life. Per date enter Produced / Sent out / Wasted (kg or packets).
- Oldest stock is used first; leftovers show next day as "Clear this old stock first" with kg, packets and age. Sheets tabs `Products` and `Stock` are created by `setup` (Code.gs version `stock-v1`).
- "Make how much for tomorrow?" = expected need (Daily Entry orders for the batter product, else 7-day average dispatch) + safety %, minus stock in hand, rounded up to whole packets.
- Date-wise table and stock report PDF (7/14/30 days, all products).

## Stock in-charge login (`/?stock=1`)
- Separate phone app for the stock in-charge: 4-digit PIN login (no admin key), Made / Sent out / Wasted in kg or packets, clear-first batches, tomorrow's suggestion, offline queue. Installs as "Agenic Stock".
- Admin sets the PIN on the Stock tab (stored in Settings as `stockPin`), shares the link/QR/WhatsApp, and sees today's position, 7-day made-vs-sent bars, wastage %, and who updated when. Stock PDF now has KPI tiles + chart.
- Code.gs version `stock-login-v1`: paste, run `setup`, deploy a New version.

## Pack sizes & more products
- Each pack size is its own stock line (e.g. Idli batter 1 kg / 5 kg, Vada batter 1 kg / 5 kg, Sridhi plain packets). "Product" → type a name and sizes like `1, 5` to create one line per size. Entry defaults to packet counts; products can be hidden (history kept).
- Stock login error now shows which Code.gs version the script is running.
- Default Apps Script URL switched to the new deployment (AKfycby7wN4…).
- Stock entry shows the packet maths (100 packets × 5 kg = 500 kg / 100 kg ÷ 5 kg = 20 packets); quick-add chips for missing products; duplicate products blocked.
- In-charge app: old-stock warning and 'Make today' suggestion now at the top; admin Stock tab shows today's suggestion too.
- In-charge: tapping 'Sent out' (or Wasted) lists available stock by made-date, oldest first, and shows how much of each is used (e.g. finish 29 Oct 300 kg, then 200 kg from today's batch).
- Stock reports: Today / This week / 7 days / Custom from-to, all products with summary page; in-charge can download or share; admin has a period picker.

## Quick order (paste list)
- Daily Entry → **Quick order**: paste the order list (name / phone / address / lat,lng / kg / ₹ per block, or simply "Hotel - 10kg"). Hotels are matched to Customers (by name, phone, location) or added as new. Tick hotels and assign them to an own driver (route is re-ordered to save diesel) or book a Porter / Auto / Bike with its cost (₹/kg shown per trip). **Quick porter / auto / bike order** does the same with one hired trip pre-created. Costs feed the day's delivery cost and the management reports.
