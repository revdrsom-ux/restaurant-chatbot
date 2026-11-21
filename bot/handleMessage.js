/**
 * bot/handleMessage.js
 *
 * The "brain" of the chatbot. It receives the customer's session and their
 * message, works out what they want (1, 99, 98, 97, 0 or a menu item number),
 * updates MongoDB where needed, and returns the reply.
 *
 * Conversation states (stored on the Session, see models/Session.js):
 *   'main'          -> the customer is at the main options
 *   'choosing_item' -> the menu was just shown, so a number picks a food item
 */
import { menuItems } from "../data/menu.js";
import Order from "../models/Order.js";

// Formats money for display, e.g. 3500 -> ₦3,500
const naira = (amount) => `₦${amount.toLocaleString("en-NG")}`;

// The main options shown when the chat opens (wording comes from the assignment)
export const mainOptionsText = [
  "Welcome to our restaurant! Please choose an option:",
  "Select 1 to Place an order",
  "Select 99 to Checkout order",
  "Select 98 to See order history",
  "Select 97 to See current order",
  "Select 0 to Cancel order",
].join("\n");

// Plain-text version of the menu. The page draws its own menu panel from the
// menu data, but this text keeps the bot readable on its own.
function menuText() {
  const lines = menuItems.map(
    (item) => `${item.id}. ${item.name} - ${naira(item.price)}`,
  );

  return [
    "Here is our menu:",
    ...lines,
    "",
    "Send an item number to add it to your order.",
    "Send 99 to checkout, 97 to see your current order, or 0 to cancel.",
    'Send "menu" to go back to the main options.',
  ].join("\n");
}

// Adds up price x quantity for every line of an order
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// Label shown beside each order in the history (option 98)
function statusLabel(status) {
  return status === "paid" ? "✅ Paid" : "⏳ Awaiting payment";
}

// Formats an order's item lines and total as text
function orderText(order) {
  const lines = order.items.map(
    (item) =>
      `${item.quantity} x ${item.name} - ${naira(item.price * item.quantity)}`,
  );

  return [...lines, `Total: ${naira(order.total)}`].join("\n");
}

// Saves the customer's conversation state to MongoDB
async function setState(session, state) {
  session.state = state;
  await session.save();
}

// Adds one portion of a menu item to the customer's current order
async function addItem(session, itemId) {
  const menuItem = menuItems.find((item) => item.id === itemId);

  // The number is not on the menu
  if (!menuItem) {
    return `Please choose a number from the menu (1 to ${menuItems.length}), or send 99, 98, 97 or 0.`;
  }

  // Reuse the order being built, or start a new one
  let order = await Order.findOne({
    deviceId: session.deviceId,
    status: "current",
  });

  if (!order) {
    order = new Order({ deviceId: session.deviceId });
  }

  // Same food again -> raise the quantity; new food -> add a new line
  const existing = order.items.find((item) => item.menuId === menuItem.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    order.items.push({
      menuId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: 1,
    });
  }

  order.total = calculateTotal(order.items);
  await order.save(); // Mongoose validates the data against models/Order.js

  return `Added ${menuItem.name}.\n\nYour current order:\n${orderText(order)}\n\nSend another item number, 99 to checkout, or 0 to cancel.`;
}

// Option 99: turns the current order into a placed order (waiting for payment)
async function checkout(session) {
  const order = await Order.findOne({
    deviceId: session.deviceId,
    status: "current",
  });

  // Nothing to place
  if (!order || order.items.length === 0) {
    await setState(session, "main");
    return "No order to place.\n\nSelect 1 to place a new order.";
  }

  order.status = "placed";
  order.total = calculateTotal(order.items);
  await order.save();
  await setState(session, "main");

  // The reply must start with "Order placed!" because handleMessage() below
  // uses that to tell the page to show the Pay now button.
  return `Order placed!\n${orderText(order)}\n\nTap Pay now below to pay, or select 1 to place a new order.`;
}

// Option 98: lists every placed or paid order, oldest first
async function orderHistory(session) {
  const orders = await Order.find({
    deviceId: session.deviceId,
    status: { $in: ["placed", "paid"] }, // $in means "any of these values"
  }).sort({ createdAt: 1 }); // 1 = oldest first

  if (orders.length === 0) {
    return "You have no placed orders yet.\n\nSelect 1 to place an order.";
  }

  const blocks = orders.map(
    (order, index) =>
      `Order ${index + 1} - ${statusLabel(order.status)} - ${order.createdAt.toLocaleDateString("en-GB")}\n${orderText(order)}`,
  );

  return ["Your placed orders:", ...blocks].join("\n\n");
}

// Option 97: shows the order that is still being built
async function currentOrder(session) {
  const order = await Order.findOne({
    deviceId: session.deviceId,
    status: "current",
  });

  if (!order || order.items.length === 0) {
    return "You have no current order.\n\nSelect 1 to place an order.";
  }

  return `Your current order:\n${orderText(order)}\n\nSend 99 to checkout or 0 to cancel.`;
}

// Option 0: cancels the current order if there is one (the record is kept)
async function cancelOrder(session) {
  const order = await Order.findOne({
    deviceId: session.deviceId,
    status: "current",
  });

  await setState(session, "main");

  if (!order) {
    return "You have no current order to cancel.\n\nSelect 1 to place an order.";
  }

  order.status = "cancelled";
  await order.save();

  return "Your order has been cancelled.\n\nSelect 1 to place a new order.";
}

// Decides what a message means and returns the reply text
async function routeMessage(session, rawMessage) {
  const message = rawMessage.trim().toLowerCase();

  // Greeting words bring the customer back to the main options
  if (["hi", "hello", "menu", "start"].includes(message)) {
    await setState(session, "main");
    return mainOptionsText;
  }

  // The "1 · Order" quick button sends the word "order". It always opens the
  // menu, even when the customer is already choosing items (where a plain "1"
  // would mean "menu item 1").
  if (message === "order") {
    await setState(session, "choosing_item");
    return menuText();
  }

  // Input validation: only one- or two-digit numbers are accepted
  if (!/^\d{1,2}$/.test(message)) {
    return `Sorry, I did not understand that. Please send a number.\n\n${mainOptionsText}`;
  }

  const choice = Number(message);

  // These four options work in any state
  if (choice === 99) return checkout(session);
  if (choice === 98) return orderHistory(session);
  if (choice === 97) return currentOrder(session);
  if (choice === 0) return cancelOrder(session);

  // After the menu was shown, a number picks a food item
  if (session.state === "choosing_item") {
    return addItem(session, choice);
  }

  // At the main options, 1 opens the menu
  if (choice === 1) {
    await setState(session, "choosing_item");
    return menuText();
  }

  return `Invalid option.\n\n${mainOptionsText}`;
}

// Called by server.js. It returns the reply text plus a `view` label so the
// page knows how to show it:
//   'menu'   -> draw the menu panel (the menu data is sent along)
//   'placed' -> show the reply, then a green Pay now button
//   'text'   -> a normal chat bubble
export async function handleMessage(session, rawMessage) {
  const text = await routeMessage(session, rawMessage);

  if (text.startsWith("Here is our menu:")) {
    return { text, view: "menu", menu: menuItems };
  }

  if (text.startsWith("Order placed!")) {
    return { text, view: "placed" };
  }

  return { text, view: "text" };
}
