
require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const API_URL = "https://digitexsmartsolutions.com/api/v2";

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

  await ctx.reply(
    `📦 ${service.name}\n\n` +
    `🆔 Service ID: ${service.service}\n` +
    `📂 Category: ${service.category || "Other"}\n` +
    `💵 Digitex rate: ${service.rate} USD\n` +
    `🔢 Minimum: ${service.min}\n` +
    `🔢 Maximum: ${service.max}\n` +
    `🔄 Refill: ${service.refill ? "Yes" : "No"}\n\n` +
    "This is the provider rate, not yet the final customer price.\n\n" +
    "Order placement will be enabled after customer payments and pricing are configured."
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
  await ctx.reply("📞 Welcome to OG ZEN SMM support.\n\nPlease contact our administrator for assistance.");
});

bot.catch((error) => {
  console.error("Telegram bot error:", error.message);
});

module.exports = bot;
