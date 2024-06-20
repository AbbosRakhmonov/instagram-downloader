const bot = require("../bot");

module.exports = async (req, res) => {
  try {
    if (req.method === "POST") {
      await bot(req, res);
    } else {
      res.status(200).send("OK");
    }
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html");
    res.end("<h1>Server Error</h1><p>Sorry, there was a problem</p>");
  }
};
