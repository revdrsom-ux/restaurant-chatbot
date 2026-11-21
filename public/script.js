/**
 * public/script.js
 *
 * The chat page's behaviour: it keeps a device ID, sends messages to the
 * server, shows replies as chat bubbles, draws the menu panel, offers the
 * Pay now button, and shows the result when the customer returns from Paystack.
 */

// Elements from index.html
const messagesBox = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const quickActions = document.getElementById("quick-actions");
const chatWindow = document.querySelector(".chat");

// Gets this device's ID from the browser, or creates one the first time.
// The server uses it to remember each device's orders (no login needed).
function getDeviceId() {
  let deviceId = localStorage.getItem("deviceId");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("deviceId", deviceId);
  }

  return deviceId;
}

const deviceId = getDeviceId();

// Keeps the newest message in view
function scrollToBottom() {
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

// Formats money, e.g. 3500 -> ₦3,500
function formatNaira(amount) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

// Adds a chat bubble. `sender` is 'user' or 'bot'; `extraClass` is optional
// (for example 'success' for the green payment message).
// textContent is used instead of innerHTML, so typed text can never run as code.
function addMessage(text, sender, extraClass) {
  const bubble = document.createElement("div");
  bubble.classList.add("message", sender);

  if (extraClass) {
    bubble.classList.add(extraClass);
  }

  bubble.textContent = text;
  messagesBox.appendChild(bubble);
  scrollToBottom();
}

// Removes the menu panel if it is open
function closeMenuPanel() {
  const existing = document.getElementById("menu-panel");
  if (existing) existing.remove();
}

// Opens the menu as a panel covering the chat window, so every item is visible
// without scrolling on any screen size. `menu` is the list sent by the server.
function openMenuPanel(menu) {
  closeMenuPanel(); // never stack two panels

  const panel = document.createElement("div");
  panel.id = "menu-panel";
  panel.classList.add("menu-panel");

  // Heading bar with a close button
  const head = document.createElement("div");
  head.classList.add("menu-panel-head");

  const title = document.createElement("h2");
  title.textContent = "Our Menu";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "✕";
  closeButton.setAttribute("aria-label", "Close menu"); // for screen readers
  closeButton.addEventListener("click", closeMenuPanel);

  head.append(title, closeButton);
  panel.appendChild(head);

  // One row per menu item
  const list = document.createElement("div");
  list.classList.add("menu-items");

  menu.forEach((item) => {
    const row = document.createElement("div");
    row.classList.add("menu-item");

    const info = document.createElement("div");

    const name = document.createElement("div");
    name.classList.add("menu-item-name");
    name.textContent = `${item.id}. ${item.name}`;

    const price = document.createElement("div");
    price.classList.add("menu-item-price");
    price.textContent = formatNaira(item.price);

    info.append(name, price);

    // The Add button sends the item number, exactly as if it was typed
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.classList.add("menu-item-add");
    addButton.textContent = "Add";
    addButton.addEventListener("click", () => {
      sendMessage(String(item.id));

      // Brief "Added" feedback, because the panel hides the chat
      addButton.textContent = "Added ✓";
      setTimeout(() => {
        addButton.textContent = "Add";
      }, 1000);
    });

    row.append(info, addButton);
    list.appendChild(row);
  });

  panel.appendChild(list);

  // Bottom buttons: view the current order (97) or checkout (99)
  const foot = document.createElement("div");
  foot.classList.add("menu-panel-foot");

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.textContent = "97 · View order";
  viewButton.addEventListener("click", () => {
    closeMenuPanel();
    sendMessage("97");
  });

  const checkoutButton = document.createElement("button");
  checkoutButton.type = "button";
  checkoutButton.textContent = "99 · Checkout";
  checkoutButton.addEventListener("click", () => {
    closeMenuPanel();
    sendMessage("99");
  });

  foot.append(viewButton, checkoutButton);
  panel.appendChild(foot);

  chatWindow.appendChild(panel);
}

// Sends JSON to the server and returns its JSON answer
async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json();
}

// Asks the server to start a payment, then sends the customer to Paystack
async function startPayment(payButton) {
  // Switch the button off so a double tap cannot start two payments
  payButton.disabled = true;
  payButton.textContent = "Opening Paystack...";

  try {
    const data = await postJson("/api/pay", { deviceId });

    if (data.authorizationUrl) {
      // Leave our page for Paystack's checkout page
      window.location.href = data.authorizationUrl;
      return;
    }

    // The server answered with a problem, e.g. "No placed order to pay for"
    addMessage(
      data.message || "Could not start the payment. Please try again.",
      "bot",
    );
  } catch (error) {
    addMessage("Sorry, something went wrong. Please try again.", "bot");
  }

  // Only reached if we did not leave the page: let the customer try again
  payButton.disabled = false;
  payButton.textContent = "Pay now";
}

// Shows a chat bubble with a green Pay now button
function addPayButton() {
  const bubble = document.createElement("div");
  bubble.classList.add("message", "bot", "pay-card");

  const note = document.createElement("div");
  note.textContent =
    "Ready to pay? Tap the button below to pay securely with Paystack.";

  const payButton = document.createElement("button");
  payButton.type = "button";
  payButton.classList.add("pay-button");
  payButton.textContent = "Pay now";
  payButton.addEventListener("click", () => startPayment(payButton));

  bubble.append(note, payButton);
  messagesBox.appendChild(bubble);
  scrollToBottom();
}

// Shows a server reply in the right way, based on its `view` label:
//   'menu'   -> open the menu panel
//   'placed' -> show the reply, then a Pay now button
//   anything else -> a normal bot bubble
function showReply(data) {
  if (data.view === "menu" && Array.isArray(data.menu)) {
    addMessage("Our menu is open. Tap Add on any item.", "bot");
    openMenuPanel(data.menu);
    return;
  }

  closeMenuPanel();
  addMessage(data.reply, "bot");

  if (data.view === "placed") {
    addPayButton();
  }
}

// After paying, Paystack sends the customer back with ?payment=success or
// ?payment=failed in the address. This shows the matching message.
function showPaymentResult() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("payment");

  if (status === "success") {
    addMessage(
      "✅ Payment successful! Thank you, your order is confirmed.",
      "bot",
      "success",
    );
  } else if (status === "failed") {
    addMessage(
      "Your payment was not completed. You can try again below.",
      "bot",
    );
    addPayButton();
  }

  // Clean the address so refreshing the page does not repeat the message
  if (status) {
    window.history.replaceState({}, "", window.location.pathname);
  }
}

// Messages are sent one at a time, in the order tapped. This stops two quick
// taps on Add from reaching the server together and overwriting each other.
let queue = Promise.resolve();

// Shows the customer's message, then sends it to the bot
function sendMessage(text) {
  addMessage(text, "user");

  queue = queue.then(async () => {
    try {
      const data = await postJson("/api/chat", { deviceId, message: text });
      showReply(data);
    } catch (error) {
      addMessage("Sorry, something went wrong. Please try again.", "bot");
    }
  });
}

// Shows the main options when the page opens
async function loadWelcome() {
  try {
    const data = await postJson("/api/welcome", { deviceId });
    showReply(data);
  } catch (error) {
    addMessage(
      "Sorry, I could not load the options. Please refresh the page.",
      "bot",
    );
  }
}

// Typed messages: Enter or the Send button
chatForm.addEventListener("submit", (event) => {
  event.preventDefault(); // stop the page from reloading

  const text = messageInput.value.trim();
  if (text === "") return; // ignore empty messages

  messageInput.value = "";
  sendMessage(text);
});

// Quick buttons: each button carries its message in the data-send attribute.
// One listener on the row serves all five buttons (event delegation).
quickActions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-send]");
  if (!button) return; // clicked the gap between buttons

  sendMessage(button.dataset.send);
});

// Start: show any payment result first, then the main options
showPaymentResult();
loadWelcome();
