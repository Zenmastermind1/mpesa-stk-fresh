
const express = require("express");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/status", (req, res) => {
  res.json({
    message: "Fresh M-Pesa website is running!"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
