
const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");

loginForm.addEventListener("submit", async function(event) {
  event.preventDefault();
  message.textContent = "Checking password...";

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: document.getElementById("password").value
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Login failed.");
    }

    document.getElementById("loginPanel").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
    loadPayments();
  } catch (error) {
    message.textContent = error.message;
  }
});

async function loadPayments() {
  try {
    const response = await fetch("/api/admin/payments");

    if (!response.ok) {
      throw new Error("Could not load payments. Please log in again.");
    }

    const data = await response.json();
    const totals = data.totals;

    document.getElementById("total").textContent = totals.total;
    document.getElementById("successful").textContent = totals.successful;
    document.getElementById("pending").textContent = totals.pending;
    document.getElementById("failed").textContent = totals.failed;

    document.getElementById("revenue").textContent =
      "KSh " + Number(totals.revenue).toLocaleString();

    const table = document.getElementById("paymentsTable");
    table.replaceChildren();

    data.payments.forEach(payment => {
      const row = document.createElement("tr");

      [
        payment.phone || "-",
        "KSh " + Number(payment.amount).toLocaleString(),
        payment.status,
        payment.receipt || "-",
        payment.created_at
          ? new Date(payment.created_at).toLocaleString()
          : "-"
      ].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });

      table.appendChild(row);
    });
  } catch (error) {
    alert(error.message);
  }
}
