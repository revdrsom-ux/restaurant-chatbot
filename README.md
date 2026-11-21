# Reston Restaurant ChatBot

A restaurant chatbot where customers place orders by sending numbers in a chat window. No login is needed: each device keeps its own session and order history. Payments use a Paystack test account.

**Live demo:** _add your Render link here after deployment_

## Features

- Chat-style interface with a welcome message listing the options
- Device-based sessions (a random device ID stored in the browser), with no authentication
- Menu shown as a full-window panel with Add buttons, so it fits any screen without scrolling
- Quick buttons for the main options, which send the same numbers a customer could type
- Order history that marks paid orders with a green tick
- Paystack test payment, with a redirect back to the chat and a success message
- Input validation on both the page and the server

## Chat options

- `1`: place an order (shows the menu; send an item number to add it)
- `99`: checkout the current order ("Order placed!"), or "No order to place." if there is none
- `98`: see all placed orders
- `97`: see the current order
- `0`: cancel the current order, if there is one
- After checkout, a **Pay now** button opens Paystack, and on success the customer returns to the chat

## Tech stack

- Node.js and Express
- MongoDB with Mongoose
- Plain HTML, CSS and JavaScript for the chat page
- Paystack (test mode) for payments

## Project structure

- `server.js`: starts the server and defines the chat routes
- `bot/handleMessage.js`: the bot's logic for 1, 99, 98, 97, 0 and menu item numbers
- `routes/payment.js`: starts a Paystack payment and verifies it on return
- `models/Session.js`: one session per device
- `models/Order.js`: orders and their items
- `data/menu.js`: the restaurant menu
- `public/`: the chat page (`index.html`, `style.css`, `script.js`) and the background photo

## Run it locally

1. Install Node.js (version 20 or newer) and create a free MongoDB Atlas cluster.
2. Clone the repository and open its folder:

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/restaurant-chatbot.git
cd restaurant-chatbot
```

3. Install the packages:

```bash
npm install
```

4. Create a `.env` file by copying `.env.example`, then fill in your values:

- `PORT`: for example `4000`
- `MONGODB_URI`: your Atlas connection string, ending with the database name `restaurant-chatbot`
- `PAYSTACK_SECRET_KEY`: your Paystack **test** secret key (it starts with `sk_test_`)
- `BASE_URL`: `http://localhost:4000` locally, or your live address once deployed

5. Start the app:

```bash
npm run dev
```

6. Open `http://localhost:4000` in your browser.

## Test a payment

1. Send `1`, tap **Add** on an item, then send `99`.
2. Tap **Pay now**.
3. Pay with a test card from Paystack's test payments documentation.
4. You return to the chat with a success message, and `98` shows the order as paid.

## API routes

- `POST /api/welcome`: sends the main options when the page opens
- `POST /api/chat`: receives a message and returns the bot's reply
- `POST /api/pay`: starts a Paystack payment for the latest placed order
- `GET /payment/callback`: where Paystack sends the customer back; it verifies the payment, checks the amount, and marks the order as paid
- `GET /health`: checks that the server is running

## Notes

- Never commit your real `.env` file. It holds your database password and Paystack key.
- Only Paystack **test** keys should be used with this project.
- Scheduling orders (the optional extra) is not implemented.