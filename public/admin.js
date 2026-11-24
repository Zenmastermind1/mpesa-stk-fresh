

const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");

let allPayments = [];

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

    allPayments = data.payments;
    renderPayments();
  } catch (error) {
    alert(error.message);
  }
}

function renderPayments() {
  const search = document.getElementById("paymentSearch").value
    .trim().toLowerCase();

  const status = document.getElementById("statusFilter").value;
  const fromDate = document.getElementById("fromDate").value;
  const toDate = document.getElementById("toDate").value;

  const filtered = allPayments.filter(payment => {
    const phone = String(payment.phone || "").toLowerCase();
    const receipt = String(payment.receipt || "").toLowerCase();

    const matchesSearch =
      phone.includes(search) || receipt.includes(search);

    const matchesStatus =
      !status || payment.status === status;

    const paymentDate = payment.created_at
      ? new Date(payment.created_at)
      : null;

    const matchesFrom = !fromDate || (
      paymentDate && paymentDate >= new Date(fromDate + "T00:00:00")
    );

    const matchesTo = !toDate || (
      paymentDate && paymentDate <= new Date(toDate + "T23:59:59")
    );

    return matchesSearch && matchesStatus && matchesFrom && matchesTo;
  });

  const table = document.getElementById("paymentsTable");
  table.replaceChildren();

  if (filtered.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "No matching payments found.";
    row.appendChild(cell);
    table.appendChild(row);
    return;
  }

  filtered.forEach(payment => {
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
}

function clearFilters() {
  document.getElementById("paymentSearch").value = "";
  document.getElementById("statusFilter").value = "";
  document.getElementById("fromDate").value = "";
  document.getElementById("toDate").value = "";
  renderPayments();
}
