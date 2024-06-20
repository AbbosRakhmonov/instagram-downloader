const { Telegraf } = require("telegraf");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { VercelRequest, VercelResponse } = require("@vercel/node");
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

module.exports = async (req = VercelRequest, res = VercelResponse) => {
  if (req.method === "POST") {
    await bot.handleUpdate(req.body, res);
  } else {
    res.status(200).send("OK");
  }
};
