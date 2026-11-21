/**
 * routes/payment.js
 *
 * Paystack payment flow (test mode):
 *   1. POST /api/pay          -> asks Paystack to start a payment and returns
 *                                the Paystack checkout address.
 *   2. GET  /payment/callback -> Paystack sends the customer back here. We ask
 *                                Paystack to confirm the payment, mark the order
 *                                as paid, then redirect to the chat page.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import Order from "../models/Order.js";

const router = Router();

const PAYSTACK_URL = "https://api.paystack.co";

// Headers Paystack requires on every call. The secret key comes from .env
// and must never be written in the code or pushed to GitHub.
function paystackHeaders() {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

// Starts a payment for the device's latest placed order
router.post("/api/pay", async (req, res) => {
  const { deviceId } = req.body ?? {};

  // Validate the input
  if (typeof deviceId !== "string" || deviceId.trim() === "") {
    return res.status(400).json({ message: "Missing device ID." });
  }

  // Fail early with a clear log if the key was never set up
  if (!process.env.PAYSTACK_SECRET_KEY) {
    console.error("PAYSTACK_SECRET_KEY is missing in .env");
    return res.status(500).json({ message: "Payment is not set up yet." });
  }

  try {
    // Find this device's newest order that is waiting for payment
    const order = await Order.findOne({
      deviceId: deviceId.trim(),
      status: "placed",
    }).sort({ createdAt: -1 });

    if (!order) {
      return res.status(404).json({
        message: "No placed order to pay for. Send 99 to checkout first.",
      });
    }

    // Unique code for this payment attempt; we use it to find the order later
    const reference = `ORD-${randomUUID()}`;
    const baseUrl =
      process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

    // Ask Paystack to create the payment
    const response = await fetch(`${PAYSTACK_URL}/transaction/initialize`, {
      method: "POST",
      headers: paystackHeaders(),
      body: JSON.stringify({
        // Paystack requires an email; we do not collect one, so we make a placeholder
        email: `${deviceId.trim().slice(0, 8)}@example.com`,
        // Paystack counts money in kobo (100 kobo = 1 naira)
        amount: Math.round(order.total * 100),
        reference,
        // Where Paystack sends the customer after paying
        callback_url: `${baseUrl}/payment/callback`,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.status) {
      console.error("Paystack initialize failed:", result.message);
      return res
        .status(502) // 502 = a service we depend on failed
        .json({ message: "Could not start the payment. Please try again." });
    }

    // Save the reference on the order so the callback can find it
    order.paymentReference = reference;
    await order.save();

    // The page redirects the customer to this Paystack checkout address
    res.json({ authorizationUrl: result.data.authorization_url });
  } catch (error) {
    console.error("Pay error:", error.message);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// Paystack sends the customer here after they pay (or cancel)
router.get("/payment/callback", async (req, res) => {
  // Paystack sends the reference under two possible names
  const reference = req.query.reference ?? req.query.trxref;

  if (typeof reference !== "string" || reference.trim() === "") {
    return res.redirect("/?payment=failed");
  }

  try {
    const order = await Order.findOne({ paymentReference: reference });

    // An unknown reference cannot mark anything as paid
    if (!order) {
      return res.redirect("/?payment=failed");
    }

    // Already confirmed earlier (for example the customer refreshed this page)
    if (order.status === "paid") {
      return res.redirect("/?payment=success");
    }

    // Never trust the redirect alone: ask Paystack directly if it succeeded
    const response = await fetch(
      `${PAYSTACK_URL}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: paystackHeaders() },
    );
    const result = await response.json();

    // The payment counts only if Paystack says "success" AND the amount paid
    // matches the order total (this blocks underpaying)
    const isPaid =
      response.ok &&
      result.status &&
      result.data?.status === "success" &&
      result.data?.amount === Math.round(order.total * 100);

    if (!isPaid) {
      return res.redirect("/?payment=failed");
    }

    order.status = "paid";
    await order.save();

    // The chat page reads ?payment=success and shows the thank-you message
    res.redirect("/?payment=success");
  } catch (error) {
    console.error("Callback error:", error.message);
    res.redirect("/?payment=failed");
  }
});

export default router;
