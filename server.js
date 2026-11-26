
const express = require("express");
const helmet = require("helmet");
const crypto = require("crypto");
const { Pool } = require("pg");
const bot = require("./bot");

const app = express();
const PORT = process.env.PORT || 3000;
const adminSessions = new Map();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Temporary transaction storage for sandbox testing.
// We will replace this with a database later.
const transactions = new Map();

app.use(helmet());
app.use(express.json());

const webhookPath = "/telegram/webhook";
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!webhookSecret) {
  throw new Error("Telegram webhook secret is missing.");
}

app.use(
  bot.webhookCallback(webhookPath, {
    secretToken: webhookSecret
  })
);

app.use(express.static("public"));

app.get("/api/status", (req, res) => {
  res.json({ message: "M-Pesa server is running!" });
});

function getTimestamp() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const values = {};
  for (const part of parts) values[part.type] = part.value;

  return values.year + values.month + values.day +
    values.hour + values.minute + values.second;
}

app.post("/api/mpesa/stkpush", async (req, res) => {
  try {
    const {
      MPESA_CONSUMER_KEY,
      MPESA_CONSUMER_SECRET,
      MPESA_SHORTCODE,
      MPESA_PASSKEY,
      MPESA_CALLBACK_URL
    } = process.env;

    if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET ||
        !MPESA_SHORTCODE || !MPESA_PASSKEY || !MPESA_CALLBACK_URL) {
      return res.status(500).json({
        error: "M-Pesa environment settings are incomplete."
      });
    }

    const phone = String(req.body.phone || "").replace(/\s+/g, "");
    const amount = Number(req.body.amount);

    if (!/^254[71]\d{8}$/.test(phone)) {
      return res.status(400).json({
        error: "Enter a valid Kenyan phone number."
      });
    }

    if (!Number.isSafeInteger(amount) || amount < 1) {
      return res.status(400).json({
        error: "Enter a valid whole-number amount."
      });
    }

    const auth = Buffer.from(
      MPESA_CONSUMER_KEY + ":" + MPESA_CONSUMER_SECRET
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      { headers: { Authorization: "Basic " + auth } }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Daraja authentication failed:", tokenData);
      return res.status(502).json({
        error: "Could not authenticate with Daraja."
      });
    }

    const timestamp = getTimestamp();
    const password = Buffer.from(
      MPESA_SHORTCODE + MPESA_PASSKEY + timestamp
    ).toString("base64");

    const stkResponse = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + tokenData.access_token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          BusinessShortCode: MPESA_SHORTCODE,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: amount,
          PartyA: phone,
          PartyB: MPESA_SHORTCODE,
          PhoneNumber: phone,
          CallBackURL: MPESA_CALLBACK_URL,
          AccountReference: "OnlinePayment",
          TransactionDesc: "Website payment"
        })
      }
    );

    const result = await stkResponse.json();

    if (!stkResponse.ok) {
      console.error("Daraja STK error:", result);
      return res.status(502).json({
        error: result.errorMessage || "Daraja rejected the request."
      });
    }

    if (result.CheckoutRequestID) {
  await pool.query(
    `INSERT INTO payments
     (checkout_id, phone, amount, status, result_description)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (checkout_id) DO NOTHING`,
    [
      result.CheckoutRequestID,
      phone,
      amount,
      "pending",
      "Waiting for payment confirmation."
    ]
  );
          }

    res.json(result);

  } catch (error) {
    console.error("STK Push error:", error);
    res.status(500).json({
      error: "Server error while sending payment request."
    });
  }
});

async function processTelegramOrder(checkoutId) {
  console.log("Checking Telegram order for:", checkoutId);

  // We will add the secure Digitex order processing here next.
}
// Safaricom sends the final transaction result here.
app.post("/api/mpesa/callback", async (req, res) => {
  const callback = req.body?.Body?.stkCallback;

  if (callback) {
    const checkoutId = callback.CheckoutRequestID;
    const resultCode = Number(callback.ResultCode);
    const items = callback.CallbackMetadata?.Item || [];

    const receipt = items.find(
      item => item.Name === "MpesaReceiptNumber"
    )?.Value;

    const amount = items.find(
      item => item.Name === "Amount"
    )?.Value;

    if (checkoutId) {
      await pool.query(
  `UPDATE payments
   SET status = $1,
       amount = COALESCE($2, amount),
       receipt = $3,
       result_description = $4
   WHERE checkout_id = $5`,
  [
    resultCode === 0 ? "success" : "failed",
    amount ?? null,
    resultCode === 0 ? receipt || null : null,
    callback.ResultDesc || "Payment result received.",
    checkoutId
  ]
);
      if (resultCode === 0) {
  await processTelegramOrder(checkoutId);
      }
    }

    console.log("M-Pesa callback received:", JSON.stringify({
      CheckoutRequestID: checkoutId,
      ResultCode: resultCode,
      ResultDesc: callback.ResultDesc
    }));
  }

  res.status(200).json({
    ResultCode: 0,
    ResultDesc: "Accepted"
  });
});
// Website checks this endpoint for the payment result.


app.get("/api/mpesa/status/:checkoutId", async (req, res) => {
  try {
    const checkoutId = req.params.checkoutId;

    const result = await pool.query(
      `SELECT status, amount, receipt, phone,
              created_at, result_description
       FROM payments
       WHERE checkout_id = $1`,
      [checkoutId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "unknown" });
    }

    const payment = result.rows[0];

    res.json({
      status: payment.status,
      amount: payment.amount,
      receipt: payment.receipt,
      phone: payment.phone,
      createdAt: payment.created_at,
      resultDescription: payment.result_description
    });

  } catch (error) {
    console.error("Payment status error:", error);
    res.status(500).json({
      error: "Could not check payment status."
    });
  }
});


function requireAdmin(req, res, next) {
  const cookieHeader = req.headers.cookie || "";

  const tokenCookie = cookieHeader
    .split(";")
    .map(item => item.trim())
    .find(item => item.startsWith("admin_session="));

  const token = tokenCookie
    ? tokenCookie.substring("admin_session=".length)
    : null;

  const session = token ? adminSessions.get(token) : null;

  if (!session || session.expires < Date.now()) {
    if (token) adminSessions.delete(token);

    return res.status(401).json({
      error: "Please log in as admin."
    });
  }

  next();
}

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({
      error: "Admin password is not configured."
    });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({
      error: "Incorrect admin password."
    });
  }

  const token = crypto.randomBytes(32).toString("hex");

  adminSessions.set(token, {
    expires: Date.now() + 60 * 60 * 1000
  });

  res.cookie("admin_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 1000,
    path: "/api/admin"
  });

  res.json({
    success: true,
    message: "Admin login successful."
  });
});

app.get("/api/admin/payments", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT checkout_id, phone, amount, status,
             receipt, result_description, created_at
      FROM payments
      ORDER BY created_at DESC
      LIMIT 200
    `);
    const totals = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'success') AS successful,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0) AS revenue
      FROM payments
    `);

    res.json({
      payments: result.rows,
      totals: totals.rows[0]
    });

  } catch (error) {
    console.error("Admin payments error:", error);

    res.status(500).json({
      error: "Could not load payments."
    });
  }
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      checkout_id TEXT PRIMARY KEY,
      phone TEXT,
      amount NUMERIC,
      status TEXT NOT NULL,
      receipt TEXT,
      result_description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

    await pool.query(`
    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT,
      ADD COLUMN IF NOT EXISTS service_id TEXT,
      ADD COLUMN IF NOT EXISTS service_name TEXT,
      ADD COLUMN IF NOT EXISTS target_link TEXT,
      ADD COLUMN IF NOT EXISTS quantity INTEGER,
      ADD COLUMN IF NOT EXISTS digitex_rate NUMERIC,
      ADD COLUMN IF NOT EXISTS provider_order_id TEXT,
      ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'not_created'
  `);
  console.log("Payments table is ready!");
}

initializeDatabase()
  .then(() => {
    app.listen(PORT, async () => {
      console.log("Server running on port " + PORT);

      try {
        const baseUrl = process.env.RENDER_EXTERNAL_URL;

        if (!baseUrl) {
          throw new Error("RENDER_EXTERNAL_URL is missing.");
        }

        const webhookUrl =
          baseUrl.replace(/\/$/, "") + webhookPath;

        await bot.telegram.setWebhook(webhookUrl, {
          secret_token: webhookSecret
        });

        console.log("OG ZEN SMM Telegram webhook connected!");
      } catch (error) {
        console.error("Telegram webhook setup failed:", error.message);
      }
    });
  })
  .catch(error => {
    console.error("Database setup failed:", error);
    process.exit(1);
  });
