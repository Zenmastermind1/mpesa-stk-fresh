

const statusText = document.getElementById("status");
const receiptText = document.getElementById("receipt");
const downloadButton = document.getElementById("downloadReceipt");

const params = new URLSearchParams(window.location.search);
const checkoutId = params.get("checkout");

let receiptContent = "";

downloadButton.disabled = true;

downloadButton.addEventListener("click", function() {
  if (!receiptContent) return;

  const blob = new Blob([receiptContent], {
    type: "text/plain;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "mpesa-payment-receipt.txt";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
});

if (!checkoutId) {
  statusText.textContent = "No payment reference was provided.";
} else {
  let attempts = 0;
  const maxAttempts = 30;

  async function checkPayment() {
    try {
      const response = await fetch(
        "/api/mpesa/status/" + encodeURIComponent(checkoutId)
      );

      if (response.ok) {
        const data = await response.json();

        if (data.status === "success") {
          statusText.textContent = "Payment Successful!";

          const receipt = data.receipt || "Not provided";
          const amount = data.amount || "Not provided";

          receiptText.textContent =
            "M-Pesa Receipt: " + receipt +
            " | Amount: KSh " + amount;

          receiptContent =
            "M-PESA PAYMENT RECEIPT\n" +
            "------------------------\n" +
            "Payment Status: SUCCESSFUL\n" +
            "Amount: KSh " + amount + "\n" +
            "M-Pesa Receipt: " + receipt + "\n" +
            "Payment Reference: " + checkoutId + "\n" +
            "------------------------\n" +
            "Thank you for your payment.";

          downloadButton.disabled = false;
          return;
        }

        if (data.status === "failed") {
          statusText.textContent =
            "Payment Failed: " + data.resultDescription;
          return;
        }
      }
    } catch (error) {
      console.error("Payment status check failed:", error);
    }

    attempts++;

    if (attempts < maxAttempts) {
      statusText.textContent =
        "Waiting for M-Pesa confirmation... (" + attempts + ")";
      setTimeout(checkPayment, 3000);
    } else {
      statusText.textContent =
        "We haven't received confirmation yet. Please contact the store.";
    }
  }

  checkPayment();
}

