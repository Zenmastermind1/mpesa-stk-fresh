
require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const orderSessions = new Map();

const API_URL = "https://digitexsmartsolutions.com/api/v2";
const USD_TO_KES = 132;
const PROFIT_MARGIN = 1.30;

function calculateSellingPrice(rate) {
  const providerRate = Number(rate);

  if (!Number.isFinite(providerRate) || providerRate < 0) {
    throw new Error("Invalid Digitex service rate.");
  }

  return Math.ceil(
    providerRate * USD_TO_KES * PROFIT_MARGIN
  );
}
function calculateOrderTotal(rate, quantity) {
  const providerRate = Number(rate);
  const units = Number(quantity);

  if (
    !Number.isFinite(providerRate) ||
    providerRate < 0 ||
    !Number.isSafeInteger(units) ||
    units < 1 ||
    units > 100000
  ) {
    throw new Error("Invalid order price or quantity.");
  }

  return Math.ceil(
    providerRate * USD_TO_KES * PROFIT_MARGIN * units / 1000
  );
}
async function digitex(action, extra = {}) {
  const body = new URLSearchParams({
    key: process.env.DIGITEX_API_KEY,
    action,
    ...extra
  });

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error("Digitex API request failed");
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

bot.start(async (ctx) => {
  await ctx.reply(
    "👋 Welcome to OG ZEN SMM!\n\n" +
    "Your social media growth services are here.\n\n" +
    "Choose an option below:",
    Markup.inlineKeyboard([
      [Markup.button.callback("🛍 Browse Services", "services")],
      [Markup.button.callback("💰 Account Balance", "balance")],
      [Markup.button.callback("📞 Support", "support")]
    ])
  );
});

bot.action("services", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const services = await digitex("services");

    if (!Array.isArray(services) || services.length === 0) {
      return ctx.reply("No services are currently available.");
    }

    const categories = [
      ...new Set(
        services.map(s => s.category || "Other")
      )
    ].sort();

    const keyboard = categories.map((category, index) => {
  const safeCategory = String(category)
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, 50) || "Other";

  return [
    Markup.button.callback(
      safeCategory,
      "cat:" + index
    )
  ];
});
    await ctx.reply(
      "📂 Choose a service category:",
      Markup.inlineKeyboard(keyboard)
    );

    // Keep service data in memory for this initial version.
    global.serviceCache = services;
    global.categoryCache = categories;

  } catch (error) {
    console.error("Services error:", error.message);
    await ctx.reply("Unable to load services. Please try again later.");
  }
});

bot.action(/^cat:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const index = Number(ctx.match[1]);
  const category = global.categoryCache?.[index];
  const services = global.serviceCache;

  if (!category || !services) {
    return ctx.reply("Please open Services again.");
  }

  const selected = services.filter(
    s => (s.category || "Other") === category
  );

  const keyboard = selected.slice(0, 20).map(service => [
    Markup.button.callback(
      `${service.name.slice(0, 35)} | ID ${service.service}`,
      "svc:" + service.service
    )
  ]);

  keyboard.push([
    Markup.button.callback("⬅️ Categories", "services")
  ]);

  await ctx.reply(
    `📂 ${category}\n\nChoose a service:`,
    Markup.inlineKeyboard(keyboard)
  );
});

bot.action(/^svc:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const id = Number(ctx.match[1]);
  const service = global.serviceCache?.find(
    s => Number(s.service) === id
  );

  if (!service) {
    return ctx.reply("Service not found. Please reload Services.");
  }

  orderSessions.set(ctx.from.id, {
    step: "waiting_link",
    service: service
  });

  return ctx.reply(
    `📦 ${service.name}\n\n` +
    `🆔 Service ID: ${service.service}\n` +
    `💵 Price: KES ${calculateSellingPrice(service.rate)} per 1,000\n` +
    `🔢 Minimum: ${service.min}\n\n` +
    "Please send the link for your order."
  );
});
bot.action("balance", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const result = await digitex("balance");

    await ctx.reply(
      `💰 Digitex provider balance: ${result.balance} ${result.currency}`
    );
  } catch (error) {
    console.error("Balance error:", error.message);
    await ctx.reply("Could not retrieve the provider balance.");
  }
});

bot.action("support", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("📞 Welcome to OG ZEN SMM support.\n\nPlease contact our administrator @ogzenm7 for assistance.");
});

bot.on("text", async (ctx) => {
  const session = orderSessions.get(ctx.from.id);

  if (!session) return;

  if (session.step === "waiting_link") {
    const link = ctx.message.text.trim();

    let validUrl;

    try {
      validUrl = new URL(link);
    } catch {
      return ctx.reply("Invalid link. Please send a valid URL.");
    }

    if (!["http:", "https:"].includes(validUrl.protocol)) {
      return ctx.reply("Please send a valid HTTP or HTTPS link.");
    }

    session.link = link;
    session.step = "waiting_quantity";

    return ctx.reply(
      "Link received!\n\nPlease enter your order quantity."
    );
  }

  if (session.step === "waiting_quantity") {
    const quantity = Number(ctx.message.text.trim());
    const minimum = Number(session.service.min);

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < minimum ||
      quantity > 100000
    ) {
      return ctx.reply(
        `Please enter a whole number between ${minimum} and 100000.`
      );
    }

    session.quantity = quantity;

    try {
      session.total = calculateOrderTotal(
        session.service.rate,
        quantity
      );
    } catch (error) {
      return ctx.reply("Unable to calculate the price. Please try again.");
    }

    session.step = "waiting_phone";

    return ctx.reply(
      `Quantity: ${quantity}\n` +
      `Total price: KES ${session.total}\n\n` +
      "Enter your M-Pesa phone number in this format:\n2547XXXXXXXX"
    );
  }

  if (session.step === "waiting_phone") {
  const phone = ctx.message.text.trim();

  if (!/^254[17]\d{8}$/.test(phone)) {
    return ctx.reply(
      "Invalid phone number. Use 2547XXXXXXXX or 2541XXXXXXXX."
    );
  }

  session.phone = phone;
  session.step = "payment_requested";

  try {
    const baseUrl = process.env.RENDER_EXTERNAL_URL;

    if (!baseUrl || !process.env.TELEGRAM_PAYMENT_SECRET) {
      throw new Error("Payment configuration is missing.");
    }

    await ctx.reply(
      "Please wait. Sending your M-Pesa payment request..."
    );

    const response = await fetch(
      baseUrl.replace(/\/$/, "") + "/api/telegram/payment",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-payment-secret":
            process.env.TELEGRAM_PAYMENT_SECRET
        },
        body: JSON.stringify({
          telegramUserId: ctx.from.id,
          serviceId: session.service.service,
          link: session.link,
          quantity: session.quantity,
          phone: session.phone
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      session.step = "waiting_phone";

      return ctx.reply(
        "Payment request failed: " +
        (result.error || "Please try again later.")
      );
    }

    orderSessions.delete(ctx.from.id);

    return ctx.reply(
      "M-Pesa STK Push sent!\n\n" +
      "Amount: KES " + result.amount +
      "\nPhone: " + phone +
      "\n\nEnter your M-Pesa PIN on your phone to complete payment."
    );

  } catch (error) {
    console.error("Telegram payment request failed:", error.message);
    session.step = "waiting_phone";

    return ctx.reply(
      "Unable to send the payment request. Please try again later."
    );
  }
}
});
bot.catch((error) => {
  console.error("Telegram bot error:", error.message);
});

bot.digitex = digitex;

module.exports = bot;
