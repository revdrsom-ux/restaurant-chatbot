/**
 * models/Order.js
 *
 * An order belongs to one device and holds a list of items.
 * Status flow: current -> placed -> paid   (or current -> cancelled)
 */
import mongoose from "mongoose";

// One line of an order, e.g. "2 x Suya Platter".
// The name and price are copied from the menu at order time, so old orders
// stay correct even if the menu changes later.
const orderItemSchema = new mongoose.Schema(
  {
    menuId: { type: Number, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false }, // item lines do not need their own ID
);

const orderSchema = new mongoose.Schema(
  {
    // Which device this order belongs to (indexed because we search by it often)
    deviceId: { type: String, required: true, index: true },

    items: { type: [orderItemSchema], default: [] },

    // current   = still being built (shown by option 97)
    // placed    = checked out, waiting for payment (option 99)
    // paid      = payment confirmed by Paystack
    // cancelled = cancelled by the customer (option 0)
    status: {
      type: String,
      enum: ["current", "placed", "paid", "cancelled"],
      default: "current",
    },

    total: { type: Number, default: 0, min: 0 }, // order total in naira

    // Unique reference of the Paystack payment, used to find this order when
    // the customer returns from Paystack (see routes/payment.js)
    paymentReference: { type: String },
  },
  { timestamps: true }, // adds createdAt and updatedAt automatically
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
