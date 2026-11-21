/**
 * server.js
 *
 * Entry point of the Reston Restaurant ChatBot.
 * - Serves the chat page from the /public folder
 * - POST /api/welcome : sends the main options when the page opens
 * - POST /api/chat    : receives a customer's message and returns the bot's reply
 * - Payment routes live in routes/payment.js
 */
import "dotenv/config"; // loads values from .env into process.env
import express from "express";
import mongoose from "mongoose";
import Session from "./models/Session.js";
import paymentRouter from "./routes/payment.js";
import { handleMessage, mainOptionsText } from "./bot/handleMessage.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json()); // lets routes read JSON request bodies
app.use(express.static("public")); // serves index.html, style.css, script.js
app.use(paymentRouter); // adds /api/pay and /payment/callback

// Simple route to check that the server is alive
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Finds this device's session, or creates it the first time (upsert)
async function getSession(deviceId) {
  return Session.findOneAndUpdate(
    { deviceId },
    { $setOnInsert: { state: "main" } }, // applied only when a new session is created
    { upsert: true, returnDocument: "after" },
  );
}

// Sends the main options when the chat page opens
app.post("/api/welcome", async (req, res) => {
  const { deviceId } = req.body ?? {};

  // Validate the input
  if (typeof deviceId !== "string" || deviceId.trim() === "") {
    return res.status(400).json({ reply: "Missing device ID." });
  }

  try {
    const session = await getSession(deviceId.trim());

    // The page was just opened, so the customer is back at the main options
    session.state = "main";
    await session.save();

    res.json({ reply: mainOptionsText, view: "text" });
  } catch (error) {
    console.error("Welcome error:", error.message);
    res.status(500).json({ reply: "Server error. Please try again." });
  }
});

// Receives a customer's message and sends back the bot's reply
app.post("/api/chat", async (req, res) => {
  const { deviceId, message } = req.body ?? {};

  // Validate both inputs before doing any work
  if (typeof deviceId !== "string" || deviceId.trim() === "") {
    return res.status(400).json({ reply: "Missing device ID." });
  }

  if (typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ reply: "Please type a number." });
  }

  try {
    const session = await getSession(deviceId.trim());

    // result = { text, view, menu }; `view` tells the page how to show the reply
    const result = await handleMessage(session, message);

    res.json({ reply: result.text, view: result.view, menu: result.menu });
  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ reply: "Server error. Please try again." });
  }
});

// Connects to MongoDB first, then starts listening for requests
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1); // an app without its database is no use, so stop
  }
}

startServer();
