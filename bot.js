const { Telegraf } = require("telegraf");
const axios = require("axios");
const puppeteer = require("puppeteer");
const { KnownDevices } = require("puppeteer");
const iPhone = KnownDevices["iPhone 14 Pro"];
const fs = require("fs");
const path = require("path");
let isAuth = true;
const cookiesFilePath = path.join(__dirname, "cookies.json");
const { config } = require("dotenv");
const UserAgent = require("user-agents");
require("dotenv").config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

class InstagramDownloader {
  constructor(url) {
    this.url = url;
    this.isPost =
      url.split("/")[3].toLowerCase() === "p" ||
      url.split("/")[3].toLowerCase() === "reel";
    this.isStories = url.split("/")[3].toLowerCase() === "stories";
    this.browser = null;
    this.axios = axios.create({
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
      },
    });
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 430,
        height: 932,
        deviceScaleFactor: 1,
        isMobile: true,
      },
    });
  }

  async close() {
    await this.browser.close();
  }

  async auth() {
    const browser = await this.browser;
    const page = await browser.newPage();

    await page.setUserAgent(
      new UserAgent({ deviceCategory: "mobile" }).toString()
    );
    await page.goto("https://www.instagram.com/", {
      waitUntil: "networkidle0",
    });

    await page.type("input[name='username']", process.env.IG_USERNAME, {
      delay: 100,
    });
    await page.type("input[name='password']", process.env.IG_PASSWORD, {
      delay: 100,
    });
    await page.click("#loginForm > div > div:nth-child(3) > button > div");
    await page.waitForNavigation({
      waitUntil: ["load", "networkidle0"],
    });
    const cookies = await page.cookies();
    fs.writeFileSync(cookiesFilePath, JSON.stringify(cookies));
    isAuth = true;
    await page.close();
  }

  async getSrcs() {
    const browser = await this.browser;

    if (!isAuth) {
      await this.auth();
    }

    const page = await browser.newPage();
    await page.emulate(iPhone);
    await page.setCookie(
      ...JSON.parse(fs.readFileSync(cookiesFilePath, "utf8"))
    );

    await page.goto(this.url, {
      waitUntil: "networkidle2",
    });

    await page.on("response", async (response) => {
      if (response.status() === 401) {
        console.log('Unauthorized error caught!');
        // You can call your auth function here
        await this.auth();
        await page.setCookie(
          ...JSON.parse(fs.readFileSync(cookiesFilePath, "utf8"))
        );
    
        await page.goto(this.url, {
          waitUntil: "networkidle2",
        });
      }
    })
    
    //   await page.screenshot({
    //     path: path.join(__dirname, "screenshot.png"),
    //     fullPage: true,
    //   });
    //   if is there div role=button text=View Story  click it
    let srcs = null;
    if (this.isStories) {
      await page.evaluate(() => {
        const buttons = document.querySelectorAll("div[role=button]");
        buttons.forEach((button) => {
          if (button.textContent === "View Story") {
            button.click();
          }
        });
      });
      srcs = await page.evaluate(() => {
        const videos = Array.from(document.querySelectorAll(`video`)).map(
          (video) => video.src
        );
        return {
          videos,
        };
      });
    } else {
      let activeClass = `div[role="button"][aria-hidden="true"]`;
      await page.waitForSelector(activeClass);
      srcs = await page.evaluate(async (activeClass) => {
        const lists = document.querySelectorAll("._acnb");
        if (lists.length > 0) {
          // button arial-label="Next"
          const nextButton = document.querySelector(
            "button[aria-label='Next']"
          );
          if (!nextButton) throw new Error("Next button not found");

          let localSrcs = {
            images: [],
            videos: [],
          };
          let counter = 0;
          while (counter < lists.length) {
            let imageSrc = Array.from(
              document.querySelectorAll(`${activeClass} img`)
            );

            let videoSrc = Array.from(
              document.querySelectorAll(`${activeClass} video`)
            );

            if (imageSrc.length > 0) {
              imageSrc = imageSrc.map((image) => image.src);
              localSrcs.images = [...localSrcs.images, ...imageSrc];
            }
            if (videoSrc.length > 0) {
              videoSrc = videoSrc.map((video) => video.src);
              localSrcs.videos = [...localSrcs.videos, ...videoSrc];
            }
            nextButton.click();
            await new Promise((resolve) => setTimeout(resolve, 100));
            counter++;
          }
          return localSrcs;
        } else {
          const images = Array.from(
            document.querySelectorAll(`${activeClass} img`)
          ).map((img) => img.src);
          const videos = Array.from(
            document.querySelectorAll(`${activeClass} video`)
          ).map((video) => video.src);
          return {
            images,
            videos,
          };
        }
      }, activeClass);
    }
    await page.close();
    return srcs;
  }
}

bot.start((ctx) =>
  ctx.reply("Send me an Instagram post URL and I will download it for you!")
);

bot.on("text", async (ctx) => {
  const url = ctx.message.text;
  // check url
  let regex = new RegExp(
    /(?:(?:http|https):\/\/)?(?:www.)?(?:instagram.com|instagr.am|instagr.com)\/(\w+)/gim
  );

  if (!regex.test(url)) {
    await ctx.reply("Link noto'g'ri. Iltimos qayta urunib ko'ring!");
    return;
  }
  await ctx.sendChatAction("typing");
  const message = await ctx.sendMessage("Iltimos kuting...");

  let ig = null;
  try {
    ig = new InstagramDownloader(url);
    await ig.init();
    const srcs = await ig.getSrcs();
    await ctx.telegram.deleteMessage(ctx.chat.id, message.message_id);
    if (srcs?.videos?.length > 0) {
      await ctx.sendChatAction("upload_video");
      let { videos } = srcs;
      videos = new Set(videos);
      await ctx.sendMediaGroup(
        Array.from(videos).map((video) => ({
          type: "video",
          media: video,
        }))
      );
    }
    if (srcs?.images?.length > 0) {
      await ctx.sendChatAction("upload_photo");
      let { images } = srcs;
      images = new Set(images);
      return await ctx.sendMediaGroup(
        Array.from(images).map((image) => ({
          type: "photo",
          media: image,
        }))
      );
    } else {
      await ctx.sendChatAction("typing");
      return await ctx.reply(
        "Hech narsa topilmadi, Iltimos qayta urunib ko'ring!"
      );
    }
  } catch (error) {
    console.log("Error:", error);
    await ctx.reply(`Error: ${error.message}`);
  } finally {
    await ig.close();
  }
});

if (process.env.NODE_ENV === "production") {
  (async () => {
    const webhookUrl = process.env.hook;
    await bot.telegram.setWebhook(webhookUrl);
    console.log("Bot is running on webhook:", webhookUrl);
  })();
} else {
  bot.telegram.deleteWebhook();
  bot.launch(() => {
    console.log("Bot is running on polling mode");
  });
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
