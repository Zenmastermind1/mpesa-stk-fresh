
const statusText = document.getElementById("status");
const receiptText = document.getElementById("receipt");

const params = new URLSearchParams(window.location.search);
const checkoutId = params.get("checkout");

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
          receiptText.textContent =
            "M-Pesa Receipt: " + (data.receipt || "Not provided");
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
