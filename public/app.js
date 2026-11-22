
const form = document.getElementById("paymentForm");
const message = document.getElementById("message");
const button = form.querySelector("button");

form.addEventListener("submit", function(event) {
  event.preventDefault();

  message.textContent = "Your payment page is working!";
  button.textContent = "TEST RECEIVED";
});
