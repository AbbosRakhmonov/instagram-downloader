const { Telegraf } = require("telegraf");
const instagramDl = require("@sasmeee/igdl");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start((ctx) =>
  ctx.reply("Send me an Instagram post URL and I will download it for you!"),
);

const getContentType = async (url) => {
  const response = await axios.get(url);
  return response.headers["content-type"];
};

bot.on("text", async (ctx) => {
  const url = ctx.message.text;

  try {
    const data = await instagramDl(url);
    if (data.length > 0) {
      await Promise.all(
        data.map(async (item) => {
          const contentType = await getContentType(item.download_link);
          const message = await ctx.reply(`Downloading...`);
          if (contentType.includes("video")) {
            await ctx.telegram.sendVideo(ctx.chat.id, item.download_link, {
              thumbnail: item.thumbnail_link,
            });
          } else if (contentType.includes("image")) {
            await ctx.replyWithPhoto(item.download_link);
          } else {
            await ctx.reply("Unsupported media type!");
          }
          await ctx.telegram.deleteMessage(ctx.chat.id, message.message_id);
        }),
      );
    } else {
      await ctx.reply("No media found!");
    }
  } catch (error) {
    console.log("Error:", error);
    await ctx.reply(`Error: ${error.message}`);
  }
});

if (process.env.NODE_ENV === "production") {
  (async () => {
    const webhookUrl = process.env.VERCEL_URL + "/api";
    await bot.telegram.setWebhook(webhookUrl);
    console.log("Bot is running on webhook:", webhookUrl);
  })();
} else {
  bot.launch();
}

module.exports = async (req, res) => {
  try {
    if (req.method === "POST") {
      await bot.handleUpdate(req.body, res);
    } else {
      // check are all good
      res.status(200).json("Listening to bot events...");
    }
  } catch (error) {
    console.error("Error handling update:", error);
    res.status(500).json("Error");
  }
};
