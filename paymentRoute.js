// const dotenv = require("dotenv");
const formidable = require("formidable");
const https = require("https");
const qs = require("querystring");
const express = require("express");
const router = express.Router();
const PaytmChecksum = require("./PaytmChecksum");
const parseUrl = express.urlencoded({ extended: false });
const parseJson = express.json({ extended: false });
require("dotenv").config();

router.post("/payment", [parseUrl, parseJson], (req, res) => {
  console.log("inside payment", req.body);
  var paymentDetails = {
    orderID: req.body.orderId,
    amount: req.body.cost,
    customerId: req.body.userId,
    customerEmail: req.body.email,
    customerPhone: req.body.phone,
  };
  console.log("payment ",paymentDetails)
  if (
    !paymentDetails.amount ||
    !paymentDetails.customerId ||
    !paymentDetails.customerEmail ||
    !paymentDetails.customerPhone
  ) {
    res.status(400).send("Payment failed");
  } else {
    var params = {};

    /* initialize an array */
    params["MID"] = process.env.PAYTM_MID;
    params["ORDER_ID"] = paymentDetails.orderID;
    params["WEBSITE"] = process.env.PAYTM_WEBSIE;
    params["CHANNEL_ID"] = "WEB";
    params["INDUSTRY_TYPE_ID"] = "Retail";
    params["CUST_ID"] = paymentDetails.customerId;
    params["TXN_AMOUNT"] = paymentDetails.amount;
    /* where is app is hosted (heroku url)*/
    params["CALLBACK_URL"] = process.env.CALLBACK_HOST + "callback";

    params["EMAIL"] = paymentDetails.customerEmail;
    params["MOBILE_NO"] = paymentDetails.customerPhone;

    /**
     * Generate checksum by parameters we have
     * Find your Merchant Key in your Paytm Dashboard at https://dashboard.paytm.com/next/apikeys
     */
    var paytmChecksum = PaytmChecksum.generateSignature(
      params,
      process.env.PAYTM_MKEY
    );
    paytmChecksum
      .then(function (checksum) {
        let paytmParams = {
          ...params,
          CHECKSUMHASH: checksum,
        };
        // res.json(paytmParams)
        // res.status(200).send(paytmParams);
        var txn_url =
          "https://securegw-stage.paytm.in/theia/processTransaction"; // for staging
        // var txn_url = "https://securegw.paytm.in/theia/processTransaction"; // for production

        var form_fields = "";
        for (var x in params) {
          form_fields +=
            "<input type='hidden' name='" + x + "' value='" + params[x] + "' >";
        }
        form_fields +=
          "<input type='hidden' name='CHECKSUMHASH' value='" + checksum + "' >";
        // console.log(form_fields)
        res.writeHead(200, { "Content-Type": "text/html" });
        res.write(
          '<html><head><title>Merchant Checkout Page</title></head><body><center><h1>Please do not refresh this page...</h1></center><form method="post" action="' +
            txn_url +
            '" name="f1">' +
            form_fields +
            '</form><script type="text/javascript">document.f1.submit();</script></body></html>'
        );
        res.end();
      })
      .catch(function (error) {
        console.log(error);
      });
  }
});

router.post("/callback", (req, res) => {
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, file) => {
    console.log(fields);
    let paytmChecksum = fields.CHECKSUMHASH;
    delete fields.CHECKSUMHASH;

    var isVerifySignature = PaytmChecksum.verifySignature(
      fields,
      process.env.PAYTM_MKEY,
      paytmChecksum
    );
    if (isVerifySignature) {
      console.log("Checksum Matched");

      // {
      //   ORDERID: '4908',
      //   MID: 'iJHDqM27078716460573',
      //   TXNID: '20220624111212800110168939803809433',
      //   TXNAMOUNT: '150.00',
      //   PAYMENTMODE: 'NB',
      //   CURRENCY: 'INR',
      //   TXNDATE: '2022-06-24 17:21:00.0',
      //   STATUS: 'TXN_SUCCESS',
      //   RESPCODE: '01',
      //   RESPMSG: 'Txn Success',
      //   GATEWAYNAME: 'SBI',
      //   BANKTXNID: '15293585830',
      //   BANKNAME: 'State Bank of India',
      //   CHECKSUMHASH: 'wH+pAoIL26QY2yiRP4tKsl2eF8mYi34+eRg2LaTvkv/dQz2Wv+j2DBXGDdONhfIRpCAHEkF/B8Py6nantROynzEre7fdt+bcUmpu2ylivU8='
      // }

      /* initialize an object */
      var paytmParams = {};

      /* body parameters */
      paytmParams.body = {
        /* Find your MID in your Paytm Dashboard at https://dashboard.paytm.com/next/apikeys */
        mid: fields.MID,

        /* Enter your order id which needs to be check status for */
        orderId: fields.ORDERID,
      };

      /**
       * Generate checksum by parameters we have in body
       * Find your Merchant Key in your Paytm Dashboard at https://dashboard.paytm.com/next/apikeys
       */
      PaytmChecksum.generateSignature(
        JSON.stringify(paytmParams.body),
        process.env.PAYTM_MKEY
      ).then(function (checksum) {
        /* head parameters */
        paytmParams.head = {
          /* put generated checksum value here */
          signature: checksum,
        };

        /* prepare JSON string for request */
        var post_data = JSON.stringify(paytmParams);
        console.log(" \n\n\n---> ", post_data);
        var options = {
          /* for Staging */
          hostname: "securegw-stage.paytm.in",

          /* for Production */
          // hostname: 'securegw.paytm.in',

          port: 443,
          path: "/v3/order/status",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": post_data.length,
          },
        };

        // Set up the request
        var response = "";
        var post_req = https.request(options, function (post_res) {
          post_res.on("data", function (chunk) {
            response += chunk;
          });

          post_res.on("end", function () {
            var _results = JSON.parse(response);
            console.log("after parsing", _results);
            let _status = _results.body.resultInfo.resultStatus;
            let _orderid = _results.body.orderId;
            let _date = _results.body.txnDate;
            let _bank = _results.body.bankName;
            /* where it will come back after payment*/
            res.redirect(
              `${process.env.WEB_HOST_BOOKINGS}?status=${_status}&orderid=${_orderid}&date=${_date}&bank=${_bank}`
            );
          });
        });

        // post the data
        post_req.write(post_data);
        post_req.end();
      });
    } else {
      console.log("Checksum Mismatched");
    }
  });
});


module.exports = router;
