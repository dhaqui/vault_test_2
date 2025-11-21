// Very small helper
const $ = (sel) => document.querySelector(sel);
const show = (el) => (el.hidden = false);

let customerId = localStorage.getItem("pp_customer_id") || "";

async function loadSdkWithIdToken({ clientId, idToken }) {
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    const params = new URLSearchParams({
      "client-id": clientId,
      "components": "buttons",
      "vault": "true",
      "intent": "capture",
      "currency": "JPY",
      "locale": "ja_JP",
      // For Sandbox consistency (optional)
      "buyer-country": "JP"
    });
    s.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    if (idToken) s.setAttribute("data-user-id-token", idToken);
    s.onload = resolve;
    s.onerror = () => reject(new Error("PayPal SDK load failed"));
    document.head.appendChild(s);
  });
}

async function init() {
  try {
    const cfg = await fetch("/api/config").then(r => r.json());
    if (!cfg.clientId) throw new Error("PAYPAL_CLIENT_ID が未設定です");

    // Always get a fresh id_token. Bind to customerId IF we have one.
    const tok = await fetch(`/api/id-token?customerId=${encodeURIComponent(customerId)}`).then(r => r.json());
    if (!tok.id_token) throw new Error("id_token 取得に失敗しました");

    await loadSdkWithIdToken({ clientId: cfg.clientId, idToken: tok.id_token });

    if (customerId) {
      $("#button-title").textContent = "💾 保存済みウォレットで決済";
      show($("#hint"));
      $("#customer-id").textContent = customerId;
      show($("#customer"));
    }

    // Render buttons
    paypal.Buttons({
      style: { layout: "vertical", label: "paypal", height: 48 },
      async createOrder() {
        $("#status").textContent = "注文作成中...";
        const resp = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: "1200", currency: "JPY" })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "Order 作成失敗");
        $("#status").textContent = "注文作成完了";
        return data.id;
      },
      async onApprove(data) {
        $("#status").textContent = "キャプチャ中...";
        const resp = await fetch(`/api/orders/${data.orderID}/capture`, { method: "POST" });
        const cap = await resp.json();
        if (!resp.ok) throw new Error(cap?.error || "Capture 失敗");

        $("#order-json").textContent = JSON.stringify(cap, null, 2);
        show($("#order"));

        const vault = cap?.payment_source?.paypal?.attributes?.vault;
        if (vault) {
          $("#vault-json").textContent = JSON.stringify(vault, null, 2);
          show($("#vault"));
          if (vault.customer?.id) {
            customerId = vault.customer.id;
            localStorage.setItem("pp_customer_id", customerId);
            $("#customer-id").textContent = customerId;
            show($("#customer"));
            $("#status").textContent = "✅ 保存完了（戻り支払者有効）";
          } else {
            $("#status").textContent = "保存は完了しました（customer.id は後続 Webhook で届く場合あり）";
          }
        } else {
          $("#status").textContent = "保存情報はレスポンスに含まれていません（Webhook を確認してください）";
        }
      },
      onError(err) {
        $("#error").textContent = "エラー: " + (err?.message || "unknown");
      },
      onCancel() {
        $("#status").textContent = "キャンセルされました";
      }
    }).render("#paypal-button-container");
  } catch (e) {
    $("#error").textContent = "初期化エラー: " + e.message;
    console.error(e);
  }
}

$("#clear").addEventListener("click", () => {
  localStorage.removeItem("pp_customer_id");
  location.reload();
});

window.addEventListener("DOMContentLoaded", init);
