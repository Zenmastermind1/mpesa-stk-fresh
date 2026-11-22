
const form = document.getElementById("paymentForm");
const message = document.getElementById("message");
const button = form.querySelector("button");

form.addEventListener("submit", async function(event) {
  event.preventDefault();

  const phone = document.getElementById("phone").value.trim();
  const amount = Number(document.getElementById("amount").value);

  if (!/^254[71]\d{8}$/.test(phone)) {
    message.textContent = "Use a Kenyan number starting with 254.";
    return;
  }

  if (!Number.isSafeInteger(amount) || amount < 1) {
    message.textContent = "Enter a valid amount.";
    return;
  }

  button.disabled = true;
  button.textContent = "SENDING REQUEST...";
  message.textContent = "Please wait...";

  try {
    const response = await fetch("/api/mpesa/stkpush", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ phone, amount })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Payment request failed.");
    }

    if (data.ResponseCode === "0") {
      message.textContent =
        "STK request accepted. Check your supported sandbox test setup.";
    } else {
      message.textContent =
        data.ResponseDescription || "Request was not accepted.";
    }

  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "PAY WITH M-PESA";
  }
});

