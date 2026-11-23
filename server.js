
const express = require("express");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
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
      `SELECT status, amount, receipt, result_description
       FROM payments
       WHERE checkout_id = $1`,
      [checkoutId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "unknown"
      });
    }

    const payment = result.rows[0];

    res.json({
      status: payment.status,
      amount: payment.amount,
      receipt: payment.receipt,
      resultDescription: payment.result_description
    });

  } catch (error) {
    console.error("Payment status error:", error);

    res.status(500).json({
      error: "Could not check payment status."
    });
  }
});
  }

  res.json(transaction);
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

  console.log("Payments table is ready!");
}

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log("Server running on port " + PORT);
    });
  })
  .catch(error => {
    console.error("Database setup failed:", error);
    process.exit(1);
  });


