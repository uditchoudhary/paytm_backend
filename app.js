const express = require("express");
const app = express();
const cors = require("cors");
const paymentRoute = require("./paymentRoute");
const bodyParser = require("body-parser");
const port = 6001;

app.use(cors());
app.get("", (req, res) => {
  res.send("Welcome to payment gateway");
});
app.use("/api", paymentRoute);
app.use(bodyParser.json());
app.listen(port, () => {
  console.log(`App is running at ${port}`);
});
