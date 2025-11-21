import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const {
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_ENV = "sandbox", // "live" for production
  BASE_URL,
} = process.env;
const PORT = process.env.PORT || 3000;

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  console.warn("[WARN] Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET. Set them in environment variables.");
}

const PAYPAL_API_BASE = PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const SELF_BASE_URL = BASE_URL || `http://localhost:${PORT}`;

// ---- Helpers ----
async function getAccessToken({ withIdToken = false, customerId = "" } = {}) {
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  if (withIdToken) params.append("response_type", "id_token");
  if (customerId) params.append("options[customer_id]", customerId);

  const basicAuth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get access token: ${res.status} ${text}`);
  }
  return res.json();
}

// ---- API routes ----
app.get("/api/config", (req, res) => {
  res.json({ clientId: PAYPAL_CLIENT_ID, env: PAYPAL_ENV });
});

// return payer experience: issue id_token bound to (optional) customer.id
app.get("/api/id-token", async (req, res) => {
  try {
    const customerId = (req.query.customerId || "").trim();
    const tokenRes = await getAccessToken({ withIdToken: true, customerId });
    res.json({ id_token: tokenRes.id_token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create order with vault ON_SUCCESS
app.post("/api/orders", async (req, res) => {
  try {
    const { amount = "1200", currency = "JPY" } = req.body || {};
    const { access_token } = await getAccessToken();

    const orderBody = {
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: currency, value: amount } }],
      payment_source: {
        paypal: {
          attributes: {
            vault: {
              store_in_vault: "ON_SUCCESS",
              usage_type: "MERCHANT",
              customer_type: "CONSUMER",
            },
          },
          experience_context: {
            return_url: `${SELF_BASE_URL}/return`,
            cancel_url: `${SELF_BASE_URL}/cancel`,
            locale: "ja-JP"
          },
        },
      },
    };

    const resp = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${access_token}`,
        "PayPal-Request-Id": `req-${Date.now()}`,
      },
      body: JSON.stringify(orderBody),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Capture
app.post("/api/orders/:id/capture", async (req, res) => {
  try {
    const { access_token } = await getAccessToken();
    const { id } = req.params;
    const resp = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${id}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${access_token}`,
      },
      body: JSON.stringify({}),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Simple return pages
app.get("/return", (req, res) => {
  res.send(`<h1>Return</h1><p>承認ありがとうございました。このウィンドウを閉じてください。</p>`);
});
app.get("/cancel", (req, res) => {
  res.send(`<h1>Cancelled</h1><p>支払いがキャンセルされました。</p>`);
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
