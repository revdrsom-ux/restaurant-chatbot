/**
 * models/Session.js
 *
 * One Session document per device. It remembers where the customer is in the
 * conversation, so the bot knows whether a number means "menu item 2" or
 * "main option 2". No login is needed: the device is identified by a random ID
 * that the browser creates and keeps in localStorage.
 */
import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    // `unique` guarantees one session per device
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // 'main'          = customer is at the main options
    // 'choosing_item' = the menu was just shown, so a number picks a food item
    state: {
      type: String,
      enum: ["main", "choosing_item"],
      default: "main",
    },
  },
  { timestamps: true }, // adds createdAt and updatedAt automatically
);

const Session = mongoose.model("Session", sessionSchema);

export default Session;
