require("dotenv").config();
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const redis = require("redis");
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment");
const rimraf = require("rimraf");
const { v4: uuidv4 } = require("uuid");

// Telegram Bot konfiguratsiyasi
const API_KEY = process.env.BOT_TOKEN;
const bot = new TelegramBot(API_KEY, { polling: true });

// Bot ma'lumotlari
const idbot = 7359677611;
const nurbek = Number.parseInt(process.env.OWNER_ID);
const owners = [nurbek];
const adminUsername = "Nurbek_2255";

// Redis client
let redisClient;

// Express server
const app = express();
app.use(express.json());

// Redis ulanishi
async function initRedis() {
  try {
    console.log("Redis ulanish konfiguratsiyasi:");
    console.log("Host:", process.env.REDIS_HOST);
    console.log("Port:", process.env.REDIS_PORT);
    console.log("Password mavjud:", !!process.env.REDIS_PASSWORD);

    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: Number.parseInt(process.env.REDIS_PORT),
        reconnectDelay: 5000,
        connectTimeout: 10000,
      },
      password: process.env.REDIS_PASSWORD,
    });

    redisClient.on("error", (err) => {
      console.error("Redis xatolik:", err);
    });

    redisClient.on("connect", () => {
      console.log("Redis serverga ulandi");
    });

    redisClient.on("ready", () => {
      console.log("Redis tayyor");
    });

    redisClient.on("reconnecting", () => {
      console.log("Redis qayta ulanmoqda...");
    });

    console.log("Redis ulanishga harakat qilmoqda...");
    await redisClient.connect();
    console.log("Redis muvaffaqiyatli ulandi!");

    await initDefaultData();
  } catch (error) {
    console.error("Redis ulanishida xatolik:", error);
    console.error("Xatolik detallar:", error.message);
    process.exit(1);
  }
}

// Default ma'lumotlarni o'rnatish
async function initDefaultData() {
  try {
    const settingsExists = await redisClient.exists("settings");
    if (!settingsExists) {
      await redisClient.hSet("settings", {
        kino: "0",
        kino2: "0",
      });
    }

    const textsExists = await redisClient.exists("texts:start");
    if (!textsExists) {
      await redisClient.set(
        "texts:start",
        "8J+RiyBBc3NhbG9tdSBhbGF5a3VtIHtuYW1lfSAgYm90aW1pemdhIHh1c2gga2VsaWJzaXouCgrinI3wn4+7IEtpbm8ga29kaW5pIHl1Ym9yaW5nLg=="
      );
    }

    console.log("Default ma'lumotlar o'rnatildi");
  } catch (error) {
    console.error("Default ma'lumotlarni o'rnatishda xatolik:", error);
  }
}

// Redis yordamchi funksiyalari
class RedisDB {
  // Foydalanuvchi CRUD operatsiyalari
  static async getUser(userId) {
    try {
      const userData = await redisClient.hGetAll(`user:${userId}`);
      return Object.keys(userData).length > 0 ? userData : null;
    } catch (error) {
      console.error("Foydalanuvchini olishda xatolik:", error);
      return null;
    }
  }

  static async createUser(userId, data = {}) {
    try {
      const currentTime = moment().format("DD.MM.YYYY | HH:mm");
      const userData = {
        id: userId.toString(),
        step: data.step || "0",
        ban: data.ban || "0",
        lastmsg: data.lastmsg || "start",
        sana: currentTime,
        ...data,
      };
      await redisClient.hSet(`user:${userId}`, userData);
      await redisClient.sAdd("users:all", userId.toString());
      return userData;
    } catch (error) {
      console.error("Foydalanuvchi yaratishda xatolik:", error);
      return null;
    }
  }

  static async updateUser(userId, updates) {
    try {
      const currentTime = moment().format("DD.MM.YYYY | HH:mm");
      await redisClient.hSet(`user:${userId}`, {
        ...updates,
        sana: currentTime,
      });
    } catch (error) {
      console.error("Foydalanuvchini yangilashda xatolik:", error);
    }
  }

  static async getAllUsers() {
    try {
      const userIds = await redisClient.sMembers("users:all");
      const users = [];
      for (const userId of userIds) {
        const userData = await this.getUser(userId);
        if (userData) {
          users.push(userData);
        }
      }
      return users;
    } catch (error) {
      console.error("Barcha foydalanuvchilarni olishda xatolik:", error);
      return [];
    }
  }

  // Kino CRUD operatsiyalari
  static async addMovie(movieData) {
    try {
      const currentId = (await redisClient.hGet("settings", "kino")) || "0";
      const newId = (Number.parseInt(currentId) + 1).toString();
      const movie = {
        id: newId,
        file_name: movieData.file_name,
        file_id: movieData.file_id,
        film_name: movieData.film_name,
        film_date: moment().format("DD.MM.YYYY"),
        created_at: new Date().toISOString(),
      };
      await redisClient.hSet(`movie:${newId}`, movie);
      await redisClient.sAdd("movies:all", newId);
      await redisClient.hSet("settings", "kino", newId);
      return movie;
    } catch (error) {
      console.error("Kino qo'shishda xatolik:", error);
      return null;
    }
  }

  static async getMovie(movieId) {
    try {
      const movieData = await redisClient.hGetAll(`movie:${movieId}`);
      return Object.keys(movieData).length > 0 ? movieData : null;
    } catch (error) {
      console.error("Kinoni olishda xatolik:", error);
      return null;
    }
  }

  static async deleteMovie(movieId) {
    try {
      const exists = await redisClient.exists(`movie:${movieId}`);
      if (exists) {
        await redisClient.del(`movie:${movieId}`);
        await redisClient.sRem("movies:all", movieId);
        const deletedCount =
          (await redisClient.hGet("settings", "kino2")) || "0";
        await redisClient.hSet(
          "settings",
          "kino2",
          (Number.parseInt(deletedCount) + 1).toString()
        );
        return true;
      }
      return false;
    } catch (error) {
      console.error("Kinoni o'chirishda xatolik:", error);
      return false;
    }
  }

  static async getAllMovies() {
    try {
      const movieIds = await redisClient.sMembers("movies:all");
      const movies = [];
      for (const movieId of movieIds) {
        const movieData = await this.getMovie(movieId);
        if (movieData) {
          movies.push(movieData);
        }
      }
      return movies.sort(
        (a, b) => Number.parseInt(a.id) - Number.parseInt(b.id)
      );
    } catch (error) {
      console.error("Barcha kinolarni olishda xatolik:", error);
      return [];
    }
  }

  static async getMovieCount() {
    try {
      return await redisClient.sCard("movies:all");
    } catch (error) {
      return 0;
    }
  }

  // Settings operatsiyalari
  static async getSetting(key) {
    try {
      return await redisClient.hGet("settings", key);
    } catch (error) {
      return null;
    }
  }

  static async setSetting(key, value) {
    try {
      await redisClient.hSet("settings", key, value.toString());
    } catch (error) {
      console.error("Sozlamani o'rnatishda xatolik:", error);
    }
  }

  // Admin operatsiyalari
  static async addAdmin(adminId) {
    try {
      await redisClient.sAdd("admins:all", adminId.toString());
    } catch (error) {
      console.error("Admin qo'shishda xatolik:", error);
    }
  }

  static async removeAdmin(adminId) {
    try {
      await redisClient.sRem("admins:all", adminId.toString());
    } catch (error) {
      console.error("Adminni o'chirishda xatolik:", error);
    }
  }

  static async getAdmins() {
    try {
      const adminIds = await redisClient.sMembers("admins:all");
      return [...owners, ...adminIds.map((id) => Number.parseInt(id))];
    } catch (error) {
      return owners;
    }
  }

  // Kanal operatsiyalari - TO'G'RILANGAN
  static async addChannel(channelId, channelUrl) {
    try {
      await redisClient.sAdd("channels:mandatory", channelId.toString());
      if (channelUrl) {
        await redisClient.hSet(
          "channels:urls",
          channelId.toString(),
          channelUrl
        );
      }
      console.log(`Majburiy kanal qo'shildi: ${channelId}, URL: ${channelUrl}`);
    } catch (error) {
      console.error("Kanal qo'shishda xatolik:", error);
      throw error;
    }
  }

  static async removeChannel(channelId) {
    try {
      await redisClient.sRem("channels:mandatory", channelId.toString());
      await redisClient.hDel("channels:urls", channelId.toString());
      await redisClient.del(`channel:requests:${channelId}`);
      console.log(`Majburiy kanal o'chirildi: ${channelId}`);
    } catch (error) {
      console.error("Kanalni o'chirishda xatolik:", error);
      throw error;
    }
  }

  static async getMandatoryChannels() {
    try {
      return await redisClient.sMembers("channels:mandatory");
    } catch (error) {
      console.error("Majburiy kanallarni olishda xatolik:", error);
      return [];
    }
  }

  static async getChannelUrl(channelId) {
    try {
      return await redisClient.hGet("channels:urls", channelId.toString());
    } catch (error) {
      return null;
    }
  }

  static async addChannelRequest(channelId, userId) {
    try {
      await redisClient.sAdd(
        `channel:requests:${channelId}`,
        userId.toString()
      );
    } catch (error) {
      console.error("Kanal so'rovini qo'shishda xatolik:", error);
    }
  }

  static async isUserRequested(channelId, userId) {
    try {
      return await redisClient.sIsMember(
        `channel:requests:${channelId}`,
        userId.toString()
      );
    } catch (error) {
      return false;
    }
  }

  // Zayavka kanallari operatsiyalari - TO'G'RILANGAN
  static async addJoinRequestChannel(channelId, channelUrl) {
    try {
      await redisClient.sAdd("channels:join_request", channelId.toString());
      if (channelUrl) {
        await redisClient.hSet(
          "channels:join_urls",
          channelId.toString(),
          channelUrl
        );
      }
      console.log(`Zayavka kanali qo'shildi: ${channelId}, URL: ${channelUrl}`);
    } catch (error) {
      console.error("Zayavka kanalini qo'shishda xatolik:", error);
      throw error;
    }
  }

  static async removeJoinRequestChannel(channelId) {
    try {
      await redisClient.sRem("channels:join_request", channelId.toString());
      await redisClient.hDel("channels:join_urls", channelId.toString());
      await redisClient.del(`channel:requests:${channelId}`);
      console.log(`Zayavka kanali o'chirildi: ${channelId}`);
    } catch (error) {
      console.error("Zayavka kanalini o'chirishda xatolik:", error);
      throw error;
    }
  }

  static async getJoinRequestChannels() {
    try {
      return await redisClient.sMembers("channels:join_request");
    } catch (error) {
      console.error("Zayavka kanallarini olishda xatolik:", error);
      return [];
    }
  }

  static async getJoinRequestChannelUrl(channelId) {
    try {
      return await redisClient.hGet("channels:join_urls", channelId.toString());
    } catch (error) {
      return null;
    }
  }

  // Matn operatsiyalari
  static async getText(textKey) {
    try {
      return await redisClient.get(`texts:${textKey}`);
    } catch (error) {
      return null;
    }
  }

  static async setText(textKey, textValue) {
    try {
      await redisClient.set(`texts:${textKey}`, textValue);
    } catch (error) {
      console.error("Matnni o'rnatishda xatolik:", error);
    }
  }

  // Kino kodlari kanali operatsiyalari
  static async setCodesChannel(channelId, channelUrl) {
    try {
      await redisClient.set("codes_channel:id", channelId);
      await redisClient.set("codes_channel:url", channelUrl);
      return true;
    } catch (error) {
      console.error("Redis setCodesChannel xatolik:", error);
      return false;
    }
  }

  static async getCodesChannelId() {
    try {
      return await redisClient.get("codes_channel:id");
    } catch (error) {
      console.error("Redis getCodesChannelId xatolik:", error);
      return null;
    }
  }

  static async getCodesChannelUrl() {
    try {
      return await redisClient.get("codes_channel:url");
    } catch (error) {
      console.error("Redis getCodesChannelUrl xatolik:", error);
      return null;
    }
  }

  static async removeCodesChannel() {
    try {
      await redisClient.del("codes_channel:id");
      await redisClient.del("codes_channel:url");
      return true;
    } catch (error) {
      console.error("Redis removeCodesChannel xatolik:", error);
      return false;
    }
  }
}

// Papkalarni yaratish
async function createDirectories() {
  const dirs = ["admin", "admin/links", "admin/zayavka", "temp"];
  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }
}

// Papkani o'chirish funksiyasi
async function deleteFolder(folderPath) {
  try {
    await rimraf.rimraf(folderPath);
    return true;
  } catch (error) {
    console.error("Papka o'chirishda xatolik:", error);
    return false;
  }
}

// Foydalanuvchi ismini olish
async function getName(id) {
  try {
    const chat = await bot.getChat(id);
    return chat.first_name || chat.title || "User";
  } catch (error) {
    return "User";
  }
}

// Kanal admin tekshirish
async function getAdmin(chatId) {
  try {
    await bot.getChatAdministrators(chatId);
    return true;
  } catch (error) {
    return false;
  }
}

// Majburiy obuna tekshirish - TO'G'RILANGAN
async function joinchat(userId) {
  try {
    const mandatoryChannels = await RedisDB.getMandatoryChannels();
    const joinRequestChannels = await RedisDB.getJoinRequestChannels();
    const allChannels = [...mandatoryChannels, ...joinRequestChannels];

    if (allChannels.length === 0) return true;

    let uns = false;
    const inlineKeyboard = [];

    // Majburiy kanallarni tekshirish
    for (const channelId of mandatoryChannels) {
      try {
        const url = await RedisDB.getChannelUrl(channelId);
        const chat = await bot.getChat(channelId);
        const chatMember = await bot.getChatMember(channelId, userId);
        let status = chatMember.status;

        if (status === "left") {
          const isRequested = await RedisDB.isUserRequested(channelId, userId);
          if (isRequested) {
            status = "member";
          }
        }

        if (["creator", "administrator", "member"].includes(status)) {
          inlineKeyboard.push([
            {
              text: `✅ ${chat.title}`,
              url: url || `https://t.me/${chat.username || "durov"}`,
            },
          ]);
        } else {
          inlineKeyboard.push([
            {
              text: `❌ ${chat.title}`,
              url: url || `https://t.me/${chat.username || "durov"}`,
            },
          ]);
          uns = true;
        }
      } catch (error) {
        console.error("Majburiy kanal tekshirishda xatolik:", error);
        uns = true;
      }
    }

    // Zayavka kanallarni tekshirish
    for (const channelId of joinRequestChannels) {
      try {
        const url = await RedisDB.getJoinRequestChannelUrl(channelId);
        const chat = await bot.getChat(channelId);
        const chatMember = await bot.getChatMember(channelId, userId);
        let status = chatMember.status;

        if (status === "left") {
          const isRequested = await RedisDB.isUserRequested(channelId, userId);
          if (isRequested) {
            status = "member";
          }
        }

        if (["creator", "administrator", "member"].includes(status)) {
          inlineKeyboard.push([
            {
              text: `✅ ${chat.title}`,
              url: url || `https://t.me/${chat.username || "durov"}`,
            },
          ]);
        } else {
          inlineKeyboard.push([
            {
              text: `❌ ${chat.title} `,
              url: url || `https://t.me/${chat.username || "durov"}`,
            },
          ]);
          uns = true;
        }
      } catch (error) {
        console.error("Zayavka kanal tekshirishda xatolik:", error);
        uns = true;
      }
    }

    if (uns) {
      inlineKeyboard.push([
        {
          text: "✅ Tekshirish",
          callback_data: "check",
        },
      ]);
      await bot.sendMessage(
        userId,
        "❌ <b>Botdan to'liq foydalanish uchun quyidagi kanallarimizga obuna bo'ling!</b>",
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: inlineKeyboard },
        }
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Joinchat funksiyasida xatolik:", error);
    return true;
  }
}

// Keyboard yaratish
function createKeyboard(buttons) {
  return {
    keyboard: buttons,
    resize_keyboard: true,
  };
}

// Admin paneli
const panel = createKeyboard([
  [{ text: "📊 Statistika" }],
  [{ text: "🎬 Kino qo'shish" }, { text: "🗑️ Kino o'chirish" }],
  [{ text: "👨‍💼 Adminlar" }, { text: "💬 Kanallar" }],
  [{ text: "🔴 Blocklash" }, { text: "🟢 Blockdan olish" }],
  [{ text: "✍️ Post xabar" }, { text: "📬 Forward xabar" }],
  [{ text: "⬇️ Panelni Yopish" }],
]);

const cancel = createKeyboard([[{ text: "◀️ Orqaga" }]]);

const kanallar_p = createKeyboard([
  [
    { text: "🔷 Majburiy kanal qo'shish" },
    { text: "🔶 Majburiy kanal o'chirish" },
  ],
  [
    { text: "📝 Zayavka kanal qo'shish" },
    { text: "🗑️ Zayavka kanal o'chirish" },
  ],
  [{ text: "💡 Kino saqlash kanali" }, { text: "🗑️ Kino saqlash o'chirish" }],
  [{ text: "🔎 Kino kodlari kanali" }, { text: "🎯 Kodlar kanali o'chirish" }],
  [{ text: "📈 Reklama matni" }, { text: "📊 Start matni" }],
  [
    { text: "🟩 Majburiy kanallar ro'yxati" },
    { text: "📋 Zayavka kanallari ro'yxati" },
  ],
  [{ text: "◀️ Orqaga" }],
]);

const removeKey = { remove_keyboard: true };

// /start komandasi
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const name = msg.from.first_name;

  if (msg.chat.type !== "private") return;

  let user = await RedisDB.getUser(userId);
  if (user && user.ban === "1") return;

  if (!user) {
    user = await RedisDB.createUser(userId);
  } else {
    await RedisDB.updateUser(userId, { lastmsg: "start", step: "0" });
  }

  if (!(await joinchat(userId))) return;

  try {
    // Kino kodlari kanalini olish
    const codesChannelUrl = await RedisDB.getCodesChannelUrl();
    let kinoUrl = codesChannelUrl || "https://t.me/durov";

    const startTextBase64 = await RedisDB.getText("start");
    const startText = startTextBase64
      ? Buffer.from(startTextBase64, "base64").toString()
      : "Salom!";
    const currentTime = moment().format("DD.MM.YYYY | HH:mm");
    const message = startText
      .replace("{name}", `<a href="tg://user?id=${userId}">${name}</a>`)
      .replace("{time}", currentTime);

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "🔎 Kodlarni qidirish",
            url: kinoUrl,
          },
        ],
        [
          {
            text: "🎲 Tasodifiy kino",
            callback_data: "random_movie",
          },
        ],
      ],
    };

    await bot.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } catch (error) {
    console.error("/start komandasi xatolik:", error);
  }
});

// /dev komandasi
bot.onText(/\/dev/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await joinchat(userId))) return;

  const keyboard = {
    inline_keyboard: [
      [{ text: "👨‍💻 Bot dasturchisi", url: "https://t.me/Nurbek_2255" }],
    ],
  };

  await bot.sendMessage(
    chatId,
    "👨‍💻 <b>Botimiz dasturchisi: @Nurbek_2255</b>\n\n<i>🤖 Sizga ham shu kabi botlar kerak bo'lsa bizga buyurtma berishingiz mumkin. Sifatli botlar tuzib beramiz.</i>\n\n<b>📊 Na'munalar:</b> @Nurbek_2255",
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    }
  );
});

// /help komandasi
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!(await joinchat(userId))) return;

  // Kino kodlari kanalini olish
  const codesChannelUrl = await RedisDB.getCodesChannelUrl();
  let kinoUrl = codesChannelUrl || "https://t.me/durov";

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🔎 Kino kodlarini qidirish",
          url: kinoUrl,
        },
      ],
    ],
  };

  await bot.sendMessage(
    chatId,
    "<b>📊 Botimiz buyruqlari:</b>\n/start - Botni yangilash ♻️\n/rand - Tasodifiy film 🍿\n/dev - Bot dasturchisi 👨‍💻\n/help - Bot buyruqlari 🔁\n\n<b>🤖 Ushbu bot orqali kinolarni osongina qidirib topishingiz va yuklab olishingiz mumkin. Kinoni yuklash uchun kino kodini yuborishingiz kerak. Barcha kino kodlari pastdagi kanalda jamlangan.</b>",
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    }
  );
});

// /rand komandasi
bot.onText(/\/rand/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.chat.type !== "private") return;

  const user = await RedisDB.getUser(userId);
  if (user && user.ban === "1") return;

  if (!(await joinchat(userId))) return;

  try {
    const movieCount = await RedisDB.getMovieCount();
    if (movieCount === 0) {
      await bot.sendMessage(chatId, "<b>📛 Hozircha kinolar mavjud emas!</b>", {
        parse_mode: "HTML",
      });
      return;
    }

    const randomId = Math.floor(Math.random() * movieCount) + 1;
    const movie = await RedisDB.getMovie(randomId.toString());

    if (movie) {
      const filmName = Buffer.from(movie.film_name, "base64").toString();
      const reklama = await fs
        .readFile("admin/rek.txt", "utf8")
        .catch(() => "");
      const bot_username = (await bot.getMe()).username;

      // Kino kodlari kanalini olish
      const codesChannelUrl = await RedisDB.getCodesChannelUrl();
      let kinoUrl = codesChannelUrl || "https://t.me/durov";

      const reklamaText = reklama.replace("%admin%", adminUsername);

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "↗️ Do'stlarga ulashish",
              url: `https://t.me/share/url/?url=https://t.me/${bot_username}?start=${randomId}`,
            },
          ],
          [{ text: "🔎 Boshqa kodlar", url: kinoUrl }],
          [{ text: "🎲 Yana tasodifiy", callback_data: "random_movie" }],
        ],
      };

      await bot.sendVideo(chatId, movie.file_id, {
        caption: `<b>🎲 Tasodifiy film: ${filmName}</b>\n<b>🆔 Kod: ${randomId}</b>\n\n${reklamaText}`,
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } else {
      await bot.sendMessage(chatId, "<b>📛 Tasodifiy kino topilmadi!</b>", {
        parse_mode: "HTML",
      });
    }
  } catch (error) {
    console.error("Tasodifiy kino olishda xatolik:", error);
    await bot.sendMessage(
      chatId,
      "⚠️ Tasodifiy kino olishda xatolik yuz berdi!"
    );
  }
});

// Admin panel
bot.onText(/\/(panel|a|admin|p)$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const admins = await RedisDB.getAdmins();

  if (!admins.includes(userId)) return;

  await bot.sendMessage(
    chatId,
    "<b>👨🏻‍💻 Boshqaruv paneliga xush kelibsiz.</b>\n\n<i>Nimani o'zgartiramiz?</i>",
    {
      parse_mode: "HTML",
      reply_markup: panel,
    }
  );
  await RedisDB.updateUser(userId, { lastmsg: "panel", step: "0" });
});

// Callback query ishlovchisi - TO'G'RILANGAN
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const messageId = query.message.message_id;

  try {
    if (data === "check") {
      await bot.deleteMessage(chatId, messageId);
      if (await joinchat(userId)) {
        const kino_id = await fs
          .readFile("admin/kino.txt", "utf8")
          .catch(() => "");
        let kino = "";
        let kinoUrl = "";

        if (kino_id) {
          try {
            const chat = await bot.getChat(kino_id);
            if (chat.username) {
              kino = chat.username;
              kinoUrl = `https://t.me/${kino}`;
            } else {
              kino = chat.title || "Kino Kanali";
              kinoUrl = `https://t.me/c/${Math.abs(kino_id)
                .toString()
                .slice(4)}`;
            }
          } catch (error) {
            console.error("Kino kanal ma'lumotlarini olishda xatolik:", error);
            kino = "";
            kinoUrl = "";
          }
        }

        const startTextBase64 = await RedisDB.getText("start");
        const startText = startTextBase64
          ? Buffer.from(startTextBase64, "base64").toString()
          : "Salom!";
        const currentTime = moment().format("DD.MM.YYYY | HH:mm");
        const name = query.from.first_name;
        const message = startText
          .replace("{name}", `<a href="tg://user?id=${userId}">${name}</a>`)
          .replace("{time}", currentTime);

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: "🔎 Kodlarni qidirish",
                url: kinoUrl || `https://t.me/durov`,
              },
            ],
            [
              {
                text: "🎲 Tasodifiy kino",
                callback_data: "random_movie",
              },
            ],
          ],
        };

        await bot.sendMessage(chatId, message, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
        await RedisDB.updateUser(userId, { lastmsg: "start", step: "0" });
      }
    }

    // Admin callback query lar
    const admins = await RedisDB.getAdmins();
    if (
      !admins.includes(userId) &&
      !data.startsWith("random_movie") &&
      data !== "check"
    ) {
      await bot.answerCallbackQuery(query.id, { text: "Ruxsat rad etildi!" });
      return;
    }

    // Kanal qo'shish callback lari - TO'G'RILANGAN
    if (data === "add_mandatory_channel") {
      await bot.editMessageText(
        "<b>🔷 Majburiy kanal qo'shish:</b>\n\n📝 Kanal turini tanlang:",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔒 Shaxsiy kanal",
                  callback_data: "add_private_channel",
                },
              ],
              [
                {
                  text: "🌐 Ommaviy kanal",
                  callback_data: "add_public_channel",
                },
              ],
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
    }

    if (data === "add_private_channel") {
      await bot.editMessageText(
        "<b>🔒 Shaxsiy majburiy kanal qo'shish:</b>\n\nKanalning ID sini yuboring\nMisol: -1001234567890",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Orqaga", callback_data: "add_mandatory_channel" }],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "add-private-mandatory" });
    }

    if (data === "add_public_channel") {
      await bot.editMessageText(
        "<b>🌐 Ommaviy majburiy kanal qo'shish:</b>\n\nKanal username ini yuboring\nMisol: @kanalname yoki kanalname",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Orqaga", callback_data: "add_mandatory_channel" }],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "add-public-mandatory" });
    }

    // Zayavka kanal qo'shish callback lari
    if (data === "add_join_request_channel") {
      await bot.editMessageText(
        "<b>📝 Zayavka kanal qo'shish:</b>\n\n📝 Kanal turini tanlang:",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔒 Shaxsiy kanal",
                  callback_data: "add_private_join_request",
                },
              ],
              [
                {
                  text: "🌐 Ommaviy kanal",
                  callback_data: "add_public_join_request",
                },
              ],
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
    }

    if (data === "add_private_join_request") {
      await bot.editMessageText(
        "<b>🔒 Shaxsiy zayavka kanal qo'shish:</b>\n\nKanalning ID sini yuboring\nMisol: -1001234567890",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "◀️ Orqaga",
                  callback_data: "add_join_request_channel",
                },
              ],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "add-private-join-request" });
    }

    if (data === "add_public_join_request") {
      await bot.editMessageText(
        "<b>🌐 Ommaviy zayavka kanal qo'shish:</b>\n\nKanal username ini yuboring\nMisol: @kanalname yoki kanalname",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "◀️ Orqaga",
                  callback_data: "add_join_request_channel",
                },
              ],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "add-public-join-request" });
    }

    // kino kodlari kanali callback lari
    if (data === "set_codes_search_channel") {
      await bot.editMessageText(
        "<b>🔎 Kino kodlari kanali:</b>\n\n📝 Kanal turini tanlang:",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔒 Shaxsiy kanal",
                  callback_data: "set_private_codes_channel",
                },
              ],
              [
                {
                  text: "🌐 Ommaviy kanal",
                  callback_data: "set_public_codes_channel",
                },
              ],
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
    }

    if (data === "set_private_codes_channel") {
      await bot.editMessageText(
        "<b>🔒 Shaxsiy kino kodlari kanali:</b>\n\nKanalning ID sini yuboring\nMisol: -1001234567890",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "◀️ Orqaga",
                  callback_data: "set_codes_search_channel",
                },
              ],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "set-private-codes-channel" });
    }

    if (data === "set_public_codes_channel") {
      await bot.editMessageText(
        "<b>🌐 Ommaviy kino kodlari kanali:</b>\n\nKanal username ini yuboring\nMisol: @kanalname yoki kanalname",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "◀️ Orqaga",
                  callback_data: "set_codes_search_channel",
                },
              ],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "set-public-codes-channel" });
    }

    // kino saqlash kanali callback lari
    if (data === "set_codes_channel") {
      await bot.editMessageText(
        "<b>� Kino saqlash kanali:</b>\n\n📝 Kanal turini tanlang:",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔒 Shaxsiy kanal",
                  callback_data: "set_private_codes",
                },
              ],
              [{ text: "🌐 Ommaviy kanal", callback_data: "set_public_codes" }],
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
    }

    // Kodlar kanali o'chirish callback
    if (data === "remove_codes_channel") {
      const removed = await RedisDB.removeCodesChannel();
      if (removed) {
        await bot.editMessageText(
          "<b>✅ Kino kodlari kanali muvaffaqiyatli o'chirildi!</b>",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
              ],
            },
          }
        );
      } else {
        await bot.editMessageText(
          "<b>❌ Kino kodlari kanalini o'chirishda xatolik yuz berdi!</b>",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
              ],
            },
          }
        );
      }
    }

    // Kino saqlash kanali o'chirish callback
    if (data === "remove_storage_channel") {
      try {
        await fs.remove("admin/kino.txt");
        await bot.editMessageText(
          "<b>✅ Kino saqlash kanali muvaffaqiyatli o'chirildi!</b>",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
              ],
            },
          }
        );
      } catch (error) {
        await bot.editMessageText(
          "<b>❌ Kino saqlash kanalini o'chirishda xatolik yuz berdi!</b>",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
              ],
            },
          }
        );
      }
    }

    // Reklama matni callback
    if (data === "set_ads_text") {
      await bot.editMessageText(
        "<b>📈 Reklama matnini yuboring:\n\n%admin% - admin username</b>",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "reklama" });
    }

    // Start matni callback
    if (data === "set_start_text") {
      await bot.editMessageText(
        "<b>📊 Start matnini yuboring:\n\n{name} - foydalanuvchi ismi\n{time} - joriy vaqt</b>",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "start-text" });
    }

    {
      text: " Majburiy kanallar ro'yxati";
    }
    if (data === "list_mandatory_channels") {
      await handleMandatoryChannels(chatId, messageId, true);
    }

    // Zayavka kanallari ro'yxati callback
    if (data === "list_join_request_channels") {
      await handleJoinRequestChannels(chatId, messageId, true);
    }

    // kino saqlash kanali callback lari
    if (data === "set_codes_channel") {
      await bot.editMessageText(
        "<b>💡 Kino saqlash kanali:</b>\n\n📝 Kanal turini tanlang:",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔒 Shaxsiy kanal",
                  callback_data: "set_private_codes",
                },
              ],
              [{ text: "🌐 Ommaviy kanal", callback_data: "set_public_codes" }],
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
    }

    if (data === "set_private_codes") {
      await bot.editMessageText(
        "<b>🔒 Shaxsiy kino saqlash kanali:</b>\n\nKanalning ID sini yuboring\nMisol: -1001234567890",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Orqaga", callback_data: "set_codes_channel" }],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "set-private-codes" });
    }

    if (data === "set_public_codes") {
      await bot.editMessageText(
        "<b>🌐 Ommaviy kino saqlash kanali:</b>\n\nKanal username ini yuboring\nMisol: @kanalname yoki kanalname",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Orqaga", callback_data: "set_codes_channel" }],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "set-public-codes" });
    }

    if (data === "back_to_channels") {
      await bot.editMessageText(
        `<b>🔰 Kanallar bo'limi:\n🆔 Admin: ${userId}</b>`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔷 Majburiy kanal qo'shish",
                  callback_data: "add_mandatory_channel",
                },
                {
                  text: "🔶 Majburiy kanal o'chirish",
                  callback_data: "remove_mandatory_channel",
                },
              ],
              [
                {
                  text: "📝 Zayavka kanal qo'shish",
                  callback_data: "add_join_request_channel",
                },
                {
                  text: "🗑️ Zayavka kanal o'chirish",
                  callback_data: "remove_join_request_channel",
                },
              ],
              [
                {
                  text: "💡 Kino saqlash kanali",
                  callback_data: "set_codes_channel",
                },
                {
                  text: " Kino saqlash o'chirish",
                  callback_data: "remove_storage_channel",
                },
              ],
              [
                {
                  text: "🔎 Kino kodlari kanali",
                  callback_data: "set_codes_search_channel",
                },
                {
                  text: "🎯 Kodlar kanali o'chirish",
                  callback_data: "remove_codes_channel",
                },
              ],
              [
                { text: "📈 Reklama matni", callback_data: "set_ads_text" },
                { text: "📊 Start matni", callback_data: "set_start_text" },
              ],
              [
                {
                  callback_data: "list_mandatory_channels",
                },
                {
                  text: "📋 Zayavka kanallari ro'yxati",
                  callback_data: "list_join_request_channels",
                },
              ],
              [{ text: "◀️ Orqaga", callback_data: "back_to_admin" }],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { lastmsg: "channels", step: "0" });
    }

    // Admin callback lari
    if (data === "add-admin") {
      await bot.editMessageText(
        "<b>➕ Yangi admin qo'shish:\n\nYangi adminning Telegram ID sini yuboring</b>",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Orqaga", callback_data: "back-admin" }],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "add-admin" });
    }

    if (data === "list-admin") {
      let message = "<b>📑 Adminlar ro'yxati:</b>\n\n";
      for (const adminId of admins) {
        try {
          const name = await getName(adminId);
          message += `• <a href="tg://user?id=${adminId}">${name}</a> (${adminId})\n`;
        } catch (error) {
          message += `• Admin ID: ${adminId}\n`;
        }
      }
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "◀️ Orqaga", callback_data: "back-admin" }],
          ],
        },
      });
    }

    if (data === "remove-admin") {
      await bot.editMessageText(
        "<b>🗑 Admin o'chirish:\n\nO'chirmoqchi bo'lgan adminning Telegram ID sini yuboring</b>",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Orqaga", callback_data: "back-admin" }],
            ],
          },
        }
      );
      await RedisDB.updateUser(userId, { step: "remove-admin" });
    }

    if (data === "back-admin") {
      const keyboard = {
        inline_keyboard: [
          [{ text: "➕ Yangi admin qo'shish", callback_data: "add-admin" }],
          [
            { text: "📑 Ro'yxat", callback_data: "list-admin" },
            { text: "🗑 O'chirish", callback_data: "remove-admin" },
          ],
          [{ text: "◀️ Orqaga", callback_data: "back_to_admin" }],
        ],
      };
      await bot.editMessageText("👇🏻 <b>Quyidagilardan birini tanlang:</b>", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      await RedisDB.updateUser(userId, { lastmsg: "admins", step: "0" });
    }

    // Tasodifiy kino callback
    if (data === "random_movie") {
      try {
        const movieCount = await RedisDB.getMovieCount();
        if (movieCount === 0) {
          await bot.answerCallbackQuery(query.id, {
            text: "Kinolar mavjud emas!",
          });
          return;
        }

        const randomId = Math.floor(Math.random() * movieCount) + 1;
        const movie = await RedisDB.getMovie(randomId.toString());

        if (movie) {
          const filmName = Buffer.from(movie.film_name, "base64").toString();
          const reklama = await fs
            .readFile("admin/rek.txt", "utf8")
            .catch(() => "");
          const bot_username = (await bot.getMe()).username;

          // Kino kodlari kanalini olish
          const codesChannelUrl = await RedisDB.getCodesChannelUrl();
          let kinoUrl = codesChannelUrl || "https://t.me/durov";

          const reklamaText = reklama.replace("%admin%", adminUsername);

          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: "↗️ Do'stlarga ulashish",
                  url: `https://t.me/share/url/?url=https://t.me/${bot_username}?start=${randomId}`,
                },
              ],
              [
                {
                  text: "🔎 Boshqa kodlar",
                  url: kinoUrl,
                },
              ],
              [{ text: "🎲 Yana tasodifiy", callback_data: "random_movie" }],
            ],
          };

          await bot.editMessageMedia(
            {
              type: "video",
              media: movie.file_id,
              caption: `<b>🎲 Tasodifiy film: ${filmName}</b>\n<b>🆔 Kod: ${randomId}</b>\n\n${reklamaText}`,
              parse_mode: "HTML",
            },
            {
              chat_id: chatId,
              message_id: messageId,
              reply_markup: keyboard,
            }
          );

          await bot.answerCallbackQuery(query.id, {
            text: `🎲 Yangi tasodifiy film: ${filmName}`,
          });
        } else {
          await bot.answerCallbackQuery(query.id, {
            text: "Tasodifiy kino topilmadi!",
          });
        }
      } catch (error) {
        console.error("Tasodifiy kino callback xatolik:", error);
        await bot.answerCallbackQuery(query.id, { text: "Xatolik yuz berdi!" });
      }
    }

    // Kanalga kino yuborish callback
    if (data.startsWith("channel_")) {
      try {
        const tempId = data.split("_")[1];
        const fileId = await fs.readFile(`temp/file_${tempId}.id`, "utf8");
        const fileName = Buffer.from(
          await fs.readFile(`temp/file_${tempId}.name`, "utf8"),
          "base64"
        ).toString();
        const caption = Buffer.from(
          await fs.readFile(`temp/film_${tempId}.caption`, "utf8"),
          "base64"
        ).toString();

        const movieData = {
          file_name: fileName,
          file_id: fileId,
          film_name: Buffer.from(caption).toString("base64"),
        };

        const movie = await RedisDB.addMovie(movieData);

        if (movie) {
          const kino_id = await fs
            .readFile("admin/kino.txt", "utf8")
            .catch(() => "");
          if (kino_id) {
            try {
              const reklama = await fs
                .readFile("admin/rek.txt", "utf8")
                .catch(() => "");
              const bot_username = (await bot.getMe()).username;
              const chat = await bot.getChat(kino_id);
              let kino = "";
              if (chat.username) {
                kino = chat.username;
              } else {
                kino = chat.title || "Kino Kanali";
              }

              const reklamaText = reklama
                .replace("%kino%", kino)
                .replace("%admin%", adminUsername);

              const keyboard = {
                inline_keyboard: [
                  [
                    {
                      text: "📥 Kinoni yuklash",
                      url: `https://t.me/${bot_username}?start=${movie.id}`,
                    },
                  ],
                ],
              };

              await bot.sendVideo(kino_id, fileId, {
                caption: `<b>${caption}</b>\n\n<b>🆔 Kod: ${movie.id}</b>\n\n${reklamaText}`,
                parse_mode: "HTML",
                reply_markup: keyboard,
              });

              await bot.editMessageCaption(
                `<b>✅ Kino muvaffaqiyatli qo'shildi va kanalga yuborildi!</b>\n\n🎬 Film: ${caption}\n🆔 Kod: ${movie.id}`,
                {
                  chat_id: chatId,
                  message_id: messageId,
                  parse_mode: "HTML",
                }
              );
            } catch (channelError) {
              await bot.editMessageCaption(
                `<b>✅ Kino bazaga qo'shildi!</b>\n<b>⚠️ Lekin kanalga yuborishda xatolik yuz berdi!</b>\n\n🎬 Film: ${caption}\n🆔 Kod: ${movie.id}`,
                {
                  chat_id: chatId,
                  message_id: messageId,
                  parse_mode: "HTML",
                }
              );
            }
          } else {
            await bot.editMessageCaption(
              `<b>✅ Kino bazaga qo'shildi!</b>\n<b>⚠️ Kino kanal sozlanmagan!</b>\n\n🎬 Film: ${caption}\n🆔 Kod: ${movie.id}`,
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "HTML",
              }
            );
          }

          // Temp fayllarni o'chirish
          try {
            await fs.remove(`temp/file_${tempId}.id`);
            await fs.remove(`temp/file_${tempId}.name`);
            await fs.remove(`temp/film_${tempId}.caption`);
          } catch (cleanupError) {
            console.error("Temp fayllarni o'chirishda xatolik:", cleanupError);
          }

          await bot.answerCallbackQuery(query.id, {
            text: "✅ Kino qo'shildi!",
          });
        } else {
          await bot.answerCallbackQuery(query.id, {
            text: "❌ Kinoni qo'shishda xatolik!",
          });
        }
      } catch (error) {
        console.error("Kanalga kino yuborish xatolik:", error);
        await bot.answerCallbackQuery(query.id, {
          text: "❌ Xatolik yuz berdi!",
        });
      }
    }

    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error("Callback query ishlov berish xatolik:", error);
    await bot.answerCallbackQuery(query.id, { text: "Xatolik yuz berdi!" });
  }
});

// Xabar ishlovchisi - TO'G'RILANGAN
bot.on("message", async (msg) => {
  if (msg.text && msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (msg.chat.type !== "private") return;

  const user = await RedisDB.getUser(userId);
  if (user && user.ban === "1") return;

  if (!user) {
    await RedisDB.createUser(userId);
  }

  const admins = await RedisDB.getAdmins();
  const isAdmin = admins.includes(userId);

  // Kino kodi qidirish
  if (user && user.lastmsg === "start" && text && !text.startsWith("/")) {
    let searchCode = text;
    if (text.startsWith("/start ")) {
      searchCode = text.split(" ")[1];
    }
    if (text === "/rand") {
      const movieCount = await RedisDB.getMovieCount();
      if (movieCount > 0) {
        searchCode = Math.floor(Math.random() * movieCount) + 1;
      }
    }

    if (!(await joinchat(userId))) return;

    if (!isNaN(searchCode)) {
      try {
        const movie = await RedisDB.getMovie(searchCode);
        if (movie) {
          const filmName = Buffer.from(movie.film_name, "base64").toString();
          const reklama = await fs
            .readFile("admin/rek.txt", "utf8")
            .catch(() => "");
          const bot_username = (await bot.getMe()).username;

          // Kino kodlari kanalini olish
          const codesChannelUrl = await RedisDB.getCodesChannelUrl();
          let kinoUrl = codesChannelUrl || "https://t.me/durov";

          const reklamaText = reklama.replace("%admin%", adminUsername);

          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: "↗️ Do'stlarga ulashish",
                  url: `https://t.me/share/url/?url=https://t.me/${bot_username}?start=${searchCode}`,
                },
              ],
              [
                {
                  text: "🔎 Boshqa kodlar",
                  url: kinoUrl,
                },
              ],
            ],
          };

          await bot.sendVideo(chatId, movie.file_id, {
            caption: `<b>${filmName}</b>\n\n${reklamaText}`,
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        } else {
          await bot.sendMessage(
            chatId,
            `📛 ${searchCode} <b>kodli kino mavjud emas!</b>`,
            {
              parse_mode: "HTML",
            }
          );
        }
      } catch (error) {
        console.error("Kino qidirishda xatolik:", error);
        await bot.sendMessage(chatId, "⚠️ Kino qidirishda xatolik yuz berdi!");
      }
    } else {
      await bot.sendMessage(
        chatId,
        "<b>📛 Faqat raqamlardan foydalaning!</b>",
        {
          parse_mode: "HTML",
        }
      );
    }
    return;
  }

  // Admin komandalarini ishlov berish
  if (isAdmin) {
    await handleAdminCommands(msg, user);
  }
});

// Admin komandalarini ishlov berish - TO'G'RILANGAN
async function handleAdminCommands(msg, user) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const step = user ? user.step : "0";

  switch (text) {
    case "◀️ Orqaga":
      await bot.sendMessage(
        chatId,
        "<b>👨🏻‍💻 Boshqaruv paneliga xush kelibsiz.</b>\n\n<i>Nimani o'zgartiramiz?</i>",
        {
          parse_mode: "HTML",
          reply_markup: panel,
        }
      );
      await RedisDB.updateUser(userId, { lastmsg: "panel", step: "0" });
      break;

    case "⬇️ Panelni Yopish":
      await bot.sendMessage(
        chatId,
        "<b>🚪 Panelni tark etdingiz unga /panel yoki /admin xabarini yuborib kirishingiz mumkin.\n\nYangilash /start</b>",
        {
          parse_mode: "HTML",
          reply_markup: removeKey,
        }
      );
      await RedisDB.updateUser(userId, { lastmsg: "start", step: "0" });
      break;

    case "🎬 Kino qo'shish":
      await bot.sendMessage(chatId, "<b>🎬 Kinoni yuboring:</b>", {
        parse_mode: "HTML",
        reply_markup: cancel,
      });
      await RedisDB.updateUser(userId, { step: "movie" });
      break;

    case "🗑️ Kino o'chirish":
      await bot.sendMessage(
        chatId,
        "<b>🗑️ Kino o'chirish uchun menga kino kodini yuboring:</b>",
        {
          parse_mode: "HTML",
          reply_markup: cancel,
        }
      );
      await RedisDB.updateUser(userId, {
        lastmsg: "deleteMovie",
        step: "movie-remove",
      });
      break;

    case "📊 Statistika":
      await handleStatistics(chatId);
      break;

    case "💬 Kanallar":
      await bot.sendMessage(
        chatId,
        `<b>🔰 Kanallar bo'limi:\n🆔 Admin: ${userId}</b>`,
        {
          parse_mode: "HTML",
          reply_markup: kanallar_p,
        }
      );
      await RedisDB.updateUser(userId, { lastmsg: "channels" });
      break;

    case "👨‍💼 Adminlar":
      await handleAdminPanel(chatId, userId);
      break;

    case "🔷 Majburiy kanal qo'shish":
      await bot.sendMessage(
        chatId,
        "<b>🔷 Majburiy kanal qo'shish:</b>\n\n📝 Kanal turini tanlang:",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔒 Shaxsiy kanal",
                  callback_data: "add_private_channel",
                },
              ],
              [
                {
                  text: "🌐 Ommaviy kanal",
                  callback_data: "add_public_channel",
                },
              ],
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
      break;

    case "🔶 Majburiy kanal o'chirish":
      await bot.sendMessage(
        chatId,
        "<b>🔶 Majburiy kanal o'chirish:\n\nO'chirmoqchi bo'lgan kanalning ID sini yuboring</b>",
        {
          parse_mode: "HTML",
          reply_markup: cancel,
        }
      );
      await RedisDB.updateUser(userId, { step: "remove-mandatory-channel" });
      break;

    case "📝 Zayavka kanal qo'shish":
      await bot.sendMessage(
        chatId,
        "<b>📝 Zayavka kanal qo'shish:</b>\n\n📝 Kanal turini tanlang:",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔒 Shaxsiy kanal",
                  callback_data: "add_private_join_request",
                },
              ],
              [
                {
                  text: "🌐 Ommaviy kanal",
                  callback_data: "add_public_join_request",
                },
              ],
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
      break;

    case "🗑️ Zayavka kanal o'chirish":
      await bot.sendMessage(
        chatId,
        "<b>🗑️ Zayavka kanal o'chirish:\n\nO'chirmoqchi bo'lgan kanalning ID sini yuboring</b>",
        {
          parse_mode: "HTML",
          reply_markup: cancel,
        }
      );
      await RedisDB.updateUser(userId, { step: "remove-join-request-channel" });
      break;

    case "💡 Kino saqlash kanali":
      await bot.sendMessage(
        chatId,
        "<b>💡 Kino saqlash kanali:</b>\n\n📝 Kanal turini tanlang:",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔒 Shaxsiy kanal",
                  callback_data: "set_private_codes",
                },
              ],
              [{ text: "🌐 Ommaviy kanal", callback_data: "set_public_codes" }],
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
      break;

      try {
        await fs.remove("admin/kino.txt");
        await bot.sendMessage(
          chatId,
          "<b>✅ Kino saqlash kanali muvaffaqiyatli o'chirildi!</b>",
          {
            parse_mode: "HTML",
            reply_markup: cancel,
          }
        );
      } catch (error) {
        await bot.sendMessage(
          chatId,
          "<b>❌ Kino saqlash kanalini o'chirishda xatolik yuz berdi!</b>",
          {
            parse_mode: "HTML",
            reply_markup: cancel,
          }
        );
      }
      break;

    case "🔎 Kino kodlari kanali":
      await bot.sendMessage(
        chatId,
        "<b>🔎 Kino kodlari kanali:</b>\n\n📝 Kanal turini tanlang:",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔒 Shaxsiy kanal",
                  callback_data: "set_private_codes_channel",
                },
              ],
              [
                {
                  text: "🌐 Ommaviy kanal",
                  callback_data: "set_public_codes_channel",
                },
              ],
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          },
        }
      );
      break;

    case "🎯 Kodlar kanali o'chirish":
      const removed = await RedisDB.removeCodesChannel();
      if (removed) {
        await bot.sendMessage(
          chatId,
          "<b>✅ Kino kodlari kanali muvaffaqiyatli o'chirildi!</b>",
          {
            parse_mode: "HTML",
            reply_markup: cancel,
          }
        );
      } else {
        await bot.sendMessage(
          chatId,
          "<b>❌ Kino kodlari kanalini o'chirishda xatolik yuz berdi!</b>",
          {
            parse_mode: "HTML",
            reply_markup: cancel,
          }
        );
      }
      break;

    case "📈 Reklama matni":
      await bot.sendMessage(
        chatId,
        "<b>📈 Reklama matnini yuboring:\n\n%admin% - admin username</b>",
        {
          parse_mode: "HTML",
          reply_markup: cancel,
        }
      );
      await RedisDB.updateUser(userId, { step: "reklama" });
      break;

    case "📊 Start matni":
      await bot.sendMessage(
        chatId,
        "<b>📊 Start matnini yuboring:\n\n{name} - foydalanuvchi ismi\n{time} - joriy vaqt</b>",
        {
          parse_mode: "HTML",
          reply_markup: cancel,
        }
      );
      await RedisDB.updateUser(userId, { step: "start-text" });
      break;

    case "🟩 Majburiy kanallar ro'yxati":
      await handleMandatoryChannels(chatId);
      break;

    case "📋 Zayavka kanallari ro'yxati":
      await handleJoinRequestChannels(chatId);
      break;

    case "🔴 Blocklash":
      await bot.sendMessage(
        chatId,
        "<b>🔴 Foydalanuvchini blocklash:\n\nBlocklamoqchi bo'lgan foydalanuvchining Telegram ID sini yuboring</b>",
        {
          parse_mode: "HTML",
          reply_markup: cancel,
        }
      );
      await RedisDB.updateUser(userId, { step: "block-user" });
      break;

    case "🟢 Blockdan olish":
      await bot.sendMessage(
        chatId,
        "<b>🟢 Foydalanuvchini blockdan olish:\n\nBlockdan olmoqchi bo'lgan foydalanuvchining Telegram ID sini yuboring</b>",
        {
          parse_mode: "HTML",
          reply_markup: cancel,
        }
      );
      await RedisDB.updateUser(userId, { step: "unblock-user" });
      break;

    case "✍️ Post xabar":
      await bot.sendMessage(
        chatId,
        "<b>✍️ Post xabar:\n\nBarcha foydalanuvchilarga yubormoqchi bo'lgan xabaringizni yuboring</b>",
        {
          parse_mode: "HTML",
          reply_markup: cancel,
        }
      );
      await RedisDB.updateUser(userId, { step: "broadcast" });
      break;

    case "📬 Forward xabar":
      await bot.sendMessage(
        chatId,
        "<b>📬 Forward xabar:\n\nBarcha foydalanuvchilarga forward qilmoqchi bo'lgan xabaringizni yuboring</b>",
        {
          parse_mode: "HTML",
          reply_markup: cancel,
        }
      );
      await RedisDB.updateUser(userId, { step: "forward" });
      break;

    default:
      // Step-based ishlov berish
      await handleStepBasedCommands(msg, user);
  }
}

// Statistika
async function handleStatistics(chatId) {
  try {
    const allUsers = await RedisDB.getAllUsers();
    const totalUsers = allUsers.length;
    const leftUsers = allUsers.filter((user) => user.sana === "tark").length;
    const activeUsers = totalUsers - leftUsers;
    const movieCount = await RedisDB.getMovieCount();
    const totalMoviesAdded = (await RedisDB.getSetting("kino")) || "0";
    const deletedMovies = (await RedisDB.getSetting("kino2")) || "0";
    const uptime = process.uptime();

    const statsMessage = `💡 <b>Server ishlash vaqti:</b> <code>${Math.floor(
      uptime / 3600
    )}h ${Math.floor((uptime % 3600) / 60)}m</code>

• <b>Jami a'zolar:</b> ${totalUsers} ta
• <b>Tark etgan a'zolar:</b> ${leftUsers} ta
• <b>Faol a'zolar:</b> ${activeUsers} ta

—————————————

• <b>Faol kinolar:</b> ${movieCount} ta
• <b>O'chirilgan kinolar:</b> ${deletedMovies} ta
• <b>Barcha kinolar:</b> ${totalMoviesAdded} ta`;

    await bot.sendMessage(chatId, statsMessage, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Statistika olishda xatolik:", error);
    await bot.sendMessage(chatId, "⚠️ Statistika olishda xatolik yuz berdi!");
  }
}

// Admin panel
async function handleAdminPanel(chatId, userId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: "➕ Yangi admin qo'shish", callback_data: "add-admin" }],
      [
        { text: "📑 Ro'yxat", callback_data: "list-admin" },
        { text: "🗑 O'chirish", callback_data: "remove-admin" },
      ],
    ],
  };

  await bot.sendMessage(chatId, "👇🏻 <b>Quyidagilardan birini tanlang:</b>", {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
  await RedisDB.updateUser(userId, { lastmsg: "admins" });
}

// Majburiy kanallarni ko'rsatish
async function handleMandatoryChannels(
  chatId,
  messageId = null,
  isCallback = false
) {
  try {
    const channels = await RedisDB.getMandatoryChannels();
    if (channels.length === 0) {
      const message = "<b>📋 Majburiy kanallar ro'yxati bo'sh!</b>";
      const markup = isCallback
        ? {
            inline_keyboard: [
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          }
        : undefined;

      if (isCallback && messageId) {
        await bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: markup,
        });
      } else {
        await bot.sendMessage(chatId, message, {
          parse_mode: "HTML",
          reply_markup: markup,
        });
      }
      return;
    }

    let message = "<b>🟩 Majburiy kanallar ro'yxati:</b>\n\n";
    for (const channelId of channels) {
      try {
        const chat = await bot.getChat(channelId);
        const url = await RedisDB.getChannelUrl(channelId);
        message += `• <b>${chat.title}</b>\n`;
        message += `  ID: <code>${channelId}</code>\n`;
        message += `  URL: ${url || "Yo'q"}\n\n`;
      } catch (error) {
        message += `• <b>Noma'lum kanal</b>\n`;
        message += `  ID: <code>${channelId}</code>\n`;
        message += `  ⚠️ Kanal ma'lumotlari olinmadi\n\n`;
      }
    }
    const markup = isCallback
      ? {
          inline_keyboard: [
            [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
          ],
        }
      : undefined;

    if (isCallback && messageId) {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: markup,
      });
    } else {
      await bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: markup,
      });
    }
  } catch (error) {
    console.error("Majburiy kanallarni ko'rsatishda xatolik:", error);
    const errorMessage =
      "⚠️ Majburiy kanallarni ko'rsatishda xatolik yuz berdi!";
    const markup = isCallback
      ? {
          inline_keyboard: [
            [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
          ],
        }
      : undefined;

    if (isCallback && messageId) {
      await bot.editMessageText(errorMessage, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: markup,
      });
    } else {
      await bot.sendMessage(chatId, errorMessage, {
        reply_markup: markup,
      });
    }
  }
}

// Zayavka kanallarini ko'rsatish
async function handleJoinRequestChannels(
  chatId,
  messageId = null,
  isCallback = false
) {
  try {
    const channels = await RedisDB.getJoinRequestChannels();
    if (channels.length === 0) {
      const message = "<b>📋 Zayavka kanallari ro'yxati bo'sh</b>";
      const markup = isCallback
        ? {
            inline_keyboard: [
              [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
            ],
          }
        : undefined;

      if (isCallback && messageId) {
        await bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
          reply_markup: markup,
        });
      } else {
        await bot.sendMessage(chatId, message, {
          parse_mode: "HTML",
          reply_markup: markup,
        });
      }
      return;
    }

    let message = "<b>📋 Zayavka kanallari ro'yxati:</b>\n\n";
    for (const channelId of channels) {
      try {
        const url = await RedisDB.getJoinRequestChannelUrl(channelId);
        const chat = await bot.getChat(channelId);
        const requestCount = await redisClient.sCard(
          `channel:requests:${channelId}`
        );
        message += `• <b>${chat.title}</b>\n`;
        message += `  ID: <code>${channelId}</code>\n`;
        message += `  URL: ${url || "Yo'q"}\n`;
        message += `  Zayavkalar: ${requestCount} ta\n\n`;
      } catch (error) {
        message += `• <b>Noma'lum kanal</b>\n`;
        message += `  ID: <code>${channelId}</code>\n`;
        message += `  ⚠️ Kanal ma'lumotlari olinmadi\n\n`;
      }
    }

    const markup = isCallback
      ? {
          inline_keyboard: [
            [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
          ],
        }
      : undefined;

    if (isCallback && messageId) {
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: markup,
      });
    } else {
      await bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: markup,
      });
    }
  } catch (error) {
    console.error("Zayavka kanallarini ko'rsatishda xatolik:", error);
    const errorMessage =
      "⚠️ Zayavka kanallar ro'yxatini olishda xatolik yuz berdi!";
    const markup = isCallback
      ? {
          inline_keyboard: [
            [{ text: "◀️ Orqaga", callback_data: "back_to_channels" }],
          ],
        }
      : undefined;

    if (isCallback && messageId) {
      await bot.editMessageText(errorMessage, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: markup,
      });
    } else {
      await bot.sendMessage(chatId, errorMessage, {
        reply_markup: markup,
      });
    }
  }
}

// Step-based komandalarni ishlov berish - TO'G'RILANGAN
async function handleStepBasedCommands(msg, user) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const step = user ? user.step : "0";

  // Video yuklash
  if (step === "movie" && msg.video) {
    const tempId = uuidv4();
    await fs.writeFile(`temp/file_${tempId}.id`, msg.video.file_id);
    await fs.writeFile(
      `temp/file_${tempId}.name`,
      Buffer.from(msg.video.file_name || "video").toString("base64")
    );

    await bot.sendMessage(chatId, "<b>🎬 Kino ma'lumotini yuboring:</b>", {
      parse_mode: "HTML",
      reply_markup: cancel,
    });
    await RedisDB.updateUser(userId, { step: "caption", temp_id: tempId });
  }

  // Caption qo'shish
  if (step === "caption" && text && text !== "🎬 Kino qo'shish") {
    const tempId = user.temp_id;
    await fs.writeFile(
      `temp/film_${tempId}.caption`,
      Buffer.from(text).toString("base64")
    );

    const fileId = await fs.readFile(`temp/file_${tempId}.id`, "utf8");
    const reklama = await fs.readFile("admin/rek.txt", "utf8").catch(() => "");

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "🎞️ Kanalga yuborish",
            callback_data: `channel_${tempId}`,
          },
        ],
      ],
    };

    await bot.sendVideo(chatId, fileId, {
      caption: `<b>${text}</b>\n\n<b>${reklama}</b>`,
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    await RedisDB.updateUser(userId, { step: "0" });
  }

  // Kino o'chirish
  if (step === "movie-remove" && text && text !== "🗑️ Kino o'chirish") {
    const movie = await RedisDB.getMovie(text);
    if (movie) {
      const deleted = await RedisDB.deleteMovie(text);
      if (deleted) {
        await bot.sendMessage(
          chatId,
          `🗑️ ${text} <b>raqamli kino olib tashlandi!</b>`,
          {
            parse_mode: "HTML",
          }
        );
      } else {
        await bot.sendMessage(
          chatId,
          "⚠️ Kinoni o'chirishda xatolik yuz berdi!"
        );
      }
    } else {
      await bot.sendMessage(
        chatId,
        `📛 ${text} <b>mavjud emas!</b>\n\n🔄 Qayta urinib ko'ring:`,
        {
          parse_mode: "HTML",
        }
      );
      return;
    }
    await RedisDB.updateUser(userId, { step: "0" });
  }

  // Shaxsiy majburiy kanal qo'shish - TO'G'RILANGAN
  if (
    step === "add-private-mandatory" &&
    text &&
    text !== "🔷 Majburiy kanal qo'shish"
  ) {
    try {
      const channelId = text.trim();

      // ID formatini tekshirish
      if (!channelId.startsWith("-100")) {
        await bot.sendMessage(
          chatId,
          "<b>⚠️ Shaxsiy kanal ID si noto'g'ri formatda!</b>\n\nMisol: -1001234567890",
          {
            parse_mode: "HTML",
          }
        );
        return;
      }

      // Kanal mavjudligini tekshirish
      const chat = await bot.getChat(channelId);

      await bot.sendMessage(
        chatId,
        `<b>📝 Kanal topildi: ${chat.title}</b>\n\nKanal URL sini yuboring (ixtiyoriy):\nMisol: https://t.me/joinchat/xxxxx\n\nYoki <b>yo'q</b> deb yozing`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, {
        step: "add-mandatory-url",
        temp_channel_id: channelId,
        temp_channel_title: chat.title,
        temp_channel_type: "private",
      });
    } catch (error) {
      console.error("Shaxsiy kanal qo'shish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "<b>❌ Kanal topilmadi yoki bot kanal a'zosi emas!</b>\n\nIltimos tekshiring va qayta urinib ko'ring.",
        { parse_mode: "HTML" }
      );
    }
  }

  // Ommaviy majburiy kanal qo'shish - TO'G'RILANGAN
  if (
    step === "add-public-mandatory" &&
    text &&
    text !== "🔷 Majburiy kanal qo'shish"
  ) {
    try {
      let username = text.trim();

      // @ belgisini olib tashlash
      if (username.startsWith("@")) {
        username = username.slice(1);
      }

      // Kanalning mavjudligini tekshirish
      const chat = await bot.getChat(`@${username}`);

      await bot.sendMessage(
        chatId,
        `<b>📝 Kanal topildi: ${chat.title}</b>\n\nKanal URL sini yuboring (ixtiyoriy):\nMisol: https://t.me/${username}\n\nYoki <b>yo'q</b> deb yozing`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, {
        step: "add-mandatory-url",
        temp_channel_id: chat.id,
        temp_channel_title: chat.title,
        temp_channel_type: "public",
        temp_channel_username: username,
      });
    } catch (error) {
      console.error("Ommaviy kanal qo'shish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "<b>❌ Kanal topilmadi!</b>\n\nKanal username ini to'g'ri kiriting.\nMisol: @kanalname yoki kanalname",
        { parse_mode: "HTML" }
      );
    }
  }

  // Majburiy kanal URL qo'shish - TO'G'RILANGAN
  if (
    step === "add-mandatory-url" &&
    text &&
    text !== "🔷 Majburiy kanal qo'shish"
  ) {
    const channelId = user.temp_channel_id;
    const channelTitle = user.temp_channel_title;
    const channelType = user.temp_channel_type;
    const channelUsername = user.temp_channel_username;

    let channelUrl;
    if (text.toLowerCase() === "yo'q") {
      channelUrl =
        channelType === "public" ? `https://t.me/${channelUsername}` : null;
    } else {
      channelUrl = text.trim();
    }

    try {
      await RedisDB.addChannel(channelId, channelUrl);

      await bot.sendMessage(
        chatId,
        `<b>✅ Majburiy kanal muvaffaqiyatli qo'shildi!</b>\n\n📛 Kanal: ${channelTitle}\n🆔 ID: <code>${channelId}</code>\n🔗 URL: ${
          channelUrl || "Yo'q"
        }\n📱 Turi: ${channelType === "private" ? "🔒 Shaxsiy" : "🌐 Ommaviy"}`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      console.error("Kanal URL qo'shish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "⚠️ Kanalni qo'shishda xatolik yuz berdi!",
        { parse_mode: "HTML" }
      );
    }
  }

  // Majburiy kanal o'chirish - TO'G'RILANGAN
  if (
    step === "remove-mandatory-channel" &&
    text &&
    text !== "🔶 Majburiy kanal o'chirish"
  ) {
    try {
      const channelId = text.trim();

      // Kanal mavjudligini tekshirish
      const channels = await RedisDB.getMandatoryChannels();
      if (!channels.includes(channelId)) {
        await bot.sendMessage(
          chatId,
          "<b>❌ Bu kanal majburiy kanallar ro'yxatida mavjud emas!</b>",
          {
            parse_mode: "HTML",
          }
        );
        return;
      }

      // Kanalni aslida o'chirish
      await RedisDB.removeChannel(channelId);

      await bot.sendMessage(
        chatId,
        `<b>✅ Majburiy kanal muvaffaqiyatli o'chirildi!</b>\n\n🆔 ID: <code>${channelId}</code>`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      console.error("Majburiy kanal o'chirish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "⚠️ Kanalni o'chirishda xatolik yuz berdi!",
        { parse_mode: "HTML" }
      );
    }
  }

  // Shaxsiy zayavka kanal qo'shish - TO'G'RILANGAN
  if (
    step === "add-private-join-request" &&
    text &&
    text !== "📝 Zayavka kanal qo'shish"
  ) {
    try {
      const channelId = text.trim();

      if (!channelId.startsWith("-100")) {
        await bot.sendMessage(
          chatId,
          "<b>⚠️ Shaxsiy kanal ID si noto'g'ri formatda!</b>\n\nMisol: -1001234567890",
          {
            parse_mode: "HTML",
          }
        );
        return;
      }

      const chat = await bot.getChat(channelId);

      await bot.sendMessage(
        chatId,
        `<b>📝 Kanal topildi: ${chat.title}</b>\n\nKanal URL sini yuboring (ixtiyoriy):\nMisol: https://t.me/joinchat/xxxxx\n\nYoki <b>yo'q</b> deb yozing`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, {
        step: "add-join-request-url",
        temp_channel_id: channelId,
        temp_channel_title: chat.title,
        temp_channel_type: "private",
      });
    } catch (error) {
      console.error("Shaxsiy zayavka kanal qo'shish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "<b>❌ Kanal topilmadi yoki bot kanal a'zosi emas!</b>\n\nIltimos tekshiring va qayta urinib ko'ring.",
        { parse_mode: "HTML" }
      );
    }
  }

  // Ommaviy zayavka kanal qo'shish - TO'G'RILANGAN
  if (
    step === "add-public-join-request" &&
    text &&
    text !== "📝 Zayavka kanal qo'shish"
  ) {
    try {
      let username = text.trim();

      if (username.startsWith("@")) {
        username = username.slice(1);
      }

      const chat = await bot.getChat(`@${username}`);

      await bot.sendMessage(
        chatId,
        `<b>📝 Kanal topildi: ${chat.title}</b>\n\nKanal URL sini yuboring (ixtiyoriy):\nMisol: https://t.me/${username}\n\nYoki <b>yo'q</b> deb yozing`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, {
        step: "add-join-request-url",
        temp_channel_id: chat.id,
        temp_channel_title: chat.title,
        temp_channel_type: "public",
        temp_channel_username: username,
      });
    } catch (error) {
      console.error("Ommaviy zayavka kanal qo'shish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "<b>❌ Kanal topilmadi!</b>\n\nKanal username ini to'g'ri kiriting.\nMisol: @kanalname yoki kanalname",
        { parse_mode: "HTML" }
      );
    }
  }

  // Zayavka kanal URL qo'shish - TO'G'RILANGAN
  if (
    step === "add-join-request-url" &&
    text &&
    text !== "📝 Zayavka kanal qo'shish"
  ) {
    const channelId = user.temp_channel_id;
    const channelTitle = user.temp_channel_title;
    const channelType = user.temp_channel_type;
    const channelUsername = user.temp_channel_username;

    let channelUrl;
    if (text.toLowerCase() === "yo'q") {
      channelUrl =
        channelType === "public" ? `https://t.me/${channelUsername}` : null;
    } else {
      channelUrl = text.trim();
    }

    try {
      await RedisDB.addJoinRequestChannel(channelId, channelUrl);

      await bot.sendMessage(
        chatId,
        `<b>✅ Zayavka kanali muvaffaqiyatli qo'shildi!</b>\n\n📛 Kanal: ${channelTitle}\n🆔 ID: <code>${channelId}</code>\n🔗 URL: ${
          channelUrl || "Yo'q"
        }\n📱 Turi: ${channelType === "private" ? "🔒 Shaxsiy" : "🌐 Ommaviy"}`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      console.error("Zayavka kanal URL qo'shish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "⚠️ Zayavka kanalini qo'shishda xatolik yuz berdi!",
        { parse_mode: "HTML" }
      );
    }
  }

  // Zayavka kanal o'chirish - TO'G'RILANGAN
  if (
    step === "remove-join-request-channel" &&
    text &&
    text !== "🗑️ Zayavka kanal o'chirish"
  ) {
    try {
      const channelId = text.trim();

      const channels = await RedisDB.getJoinRequestChannels();
      if (!channels.includes(channelId)) {
        await bot.sendMessage(
          chatId,
          "<b>❌ Bu kanal zayavka kanallari ro'yxatida mavjud emas!</b>",
          {
            parse_mode: "HTML",
          }
        );
        return;
      }

      await RedisDB.removeJoinRequestChannel(channelId);

      await bot.sendMessage(
        chatId,
        `<b>✅ Zayavka kanali muvaffaqiyatli o'chirildi!</b>\n\n🆔 ID: <code>${channelId}</code>`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      console.error("Zayavka kanal o'chirish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "⚠️ Zayavka kanalini o'chirishda xatolik yuz berdi!",
        { parse_mode: "HTML" }
      );
    }
  }

  // Shaxsiy kino saqlash kanali o'rnatish - TO'G'RILANGAN
  if (
    step === "set-private-codes" &&
    text &&
    text !== "💡 kino saqlash kanali"
  ) {
    try {
      const channelId = text.trim();

      if (!channelId.startsWith("-100")) {
        await bot.sendMessage(
          chatId,
          "<b>⚠️ Shaxsiy kanal ID si noto'g'ri formatda!</b>\n\nMisol: -1001234567890",
          {
            parse_mode: "HTML",
          }
        );
        return;
      }

      const chat = await bot.getChat(channelId);
      await fs.writeFile("admin/kino.txt", channelId);

      await bot.sendMessage(
        chatId,
        `<b>✅ kino saqlash kanali muvaffaqiyatli o'rnatildi!</b>\n\n📛 Kanal: ${chat.title}\n🆔 ID: <code>${channelId}</code>\n📱 Turi: 🔒 Shaxsiy`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      console.error("Shaxsiy kino saqlash kanali o'rnatish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "<b>❌ Kanal topilmadi yoki bot kanal a'zosi emas!</b>\n\nIltimos tekshiring va qayta urinib ko'ring.",
        { parse_mode: "HTML" }
      );
    }
  }

  // Ommaviy kino saqlash kanali o'rnatish - TO'G'RILANGAN
  if (
    step === "set-public-codes" &&
    text &&
    text !== "💡 kino saqlash kanali"
  ) {
    try {
      let username = text.trim();

      if (username.startsWith("@")) {
        username = username.slice(1);
      }

      const chat = await bot.getChat(`@${username}`);
      await fs.writeFile("admin/kino.txt", chat.id.toString());

      await bot.sendMessage(
        chatId,
        `<b>✅ kino saqlash kanali muvaffaqiyatli o'rnatildi!</b>\n\n📛 Kanal: ${chat.title}\n👤 Username: @${username}\n🆔 ID: <code>${chat.id}</code>\n📱 Turi: 🌐 Ommaviy`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      console.error("Ommaviy kino saqlash kanali o'rnatish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "<b>❌ Kanal topilmadi!</b>\n\nKanal username ini to'g'ri kiriting.\nMisol: @kanalname yoki kanalname",
        { parse_mode: "HTML" }
      );
    }
  }

  // Kino kodlari kanali o'rnatish - Shaxsiy kanal
  if (
    step === "set-private-codes-channel" &&
    text &&
    text !== "🔎 Kino kodlari kanali"
  ) {
    try {
      const channelId = text.trim();

      if (!channelId.startsWith("-100")) {
        await bot.sendMessage(
          chatId,
          "<b>❌ Shaxsiy kanal ID si -100 bilan boshlanishi kerak!</b>\n\nMisol: -1001234567890",
          { parse_mode: "HTML" }
        );
        return;
      }

      const isAdmin = await getAdmin(channelId);
      if (!isAdmin) {
        await bot.sendMessage(
          chatId,
          "<b>❌ Bot ushbu kanalda admin emas!</b>\n\nBotni kanalga admin qilib qo'ying va qaytadan urinib ko'ring.",
          { parse_mode: "HTML" }
        );
        return;
      }

      const chat = await bot.getChat(channelId);
      const channelUrl = `https://t.me/c/${Math.abs(channelId)
        .toString()
        .slice(4)}`;

      await RedisDB.setCodesChannel(channelId, channelUrl);
      await bot.sendMessage(
        chatId,
        `<b>✅ Kino kodlari kanali muvaffaqiyatli o'rnatildi!</b>\n\n📺 Kanal: ${chat.title}\n🆔 ID: ${channelId}\n🔗 URL: ${channelUrl}`,
        { parse_mode: "HTML" }
      );
      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      console.error("Shaxsiy kino kodlari kanali o'rnatish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "<b>❌ Kanal topilmadi!</b>\n\nKanal ID sini to'g'ri kiriting.\nMisol: -1001234567890",
        { parse_mode: "HTML" }
      );
    }
  }

  // Kino kodlari kanali o'rnatish - Ommaviy kanal
  if (
    step === "set-public-codes-channel" &&
    text &&
    text !== "🔎 Kino kodlari kanali"
  ) {
    try {
      let username = text.trim().replace("@", "").toLowerCase();

      const isAdmin = await getAdmin(`@${username}`);
      if (!isAdmin) {
        await bot.sendMessage(
          chatId,
          "<b>❌ Bot ushbu kanalda admin emas!</b>\n\nBotni kanalga admin qilib qo'ying va qaytadan urinib ko'ring.",
          { parse_mode: "HTML" }
        );
        return;
      }

      const chat = await bot.getChat(`@${username}`);
      const channelUrl = `https://t.me/${username}`;

      await RedisDB.setCodesChannel(chat.id, channelUrl);
      await bot.sendMessage(
        chatId,
        `<b>✅ Kino kodlari kanali muvaffaqiyatli o'rnatildi!</b>\n\n📺 Kanal: ${chat.title}\n👤 Username: @${username}\n🔗 URL: ${channelUrl}`,
        { parse_mode: "HTML" }
      );
      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      console.error("Ommaviy kino kodlari kanali o'rnatish xatolik:", error);
      await bot.sendMessage(
        chatId,
        "<b>❌ Kanal topilmadi!</b>\n\nKanal username ini to'g'ri kiriting.\nMisol: @kanalname yoki kanalname",
        { parse_mode: "HTML" }
      );
    }
  }

  // Reklama matni o'rnatish
  if (step === "reklama" && text && text !== "📈 Reklama matni") {
    try {
      await fs.writeFile("admin/rek.txt", text);
      await bot.sendMessage(
        chatId,
        "<b>✅ Reklama matni muvaffaqiyatli o'rnatildi!</b>",
        { parse_mode: "HTML" }
      );
      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      await bot.sendMessage(
        chatId,
        "⚠️ Reklama matnini saqlashda xatolik yuz berdi!",
        { parse_mode: "HTML" }
      );
    }
  }

  // Start matni o'rnatish
  if (step === "start-text" && text && text !== "📊 Start matni") {
    try {
      const encodedText = Buffer.from(text).toString("base64");
      await RedisDB.setText("start", encodedText);
      await bot.sendMessage(
        chatId,
        "<b>✅ Start matni muvaffaqiyatli o'rnatildi!</b>",
        { parse_mode: "HTML" }
      );
      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      await bot.sendMessage(
        chatId,
        "⚠️ Start matnini saqlashda xatolik yuz berdi!",
        { parse_mode: "HTML" }
      );
    }
  }

  // Admin qo'shish
  if (step === "add-admin" && text && !text.startsWith("/") && !isNaN(text)) {
    try {
      const newAdminId = Number.parseInt(text);
      const admins = await RedisDB.getAdmins();

      if (admins.includes(newAdminId)) {
        await bot.sendMessage(
          chatId,
          "<b>⚠️ Bu foydalanuvchi allaqachon admin!</b>",
          { parse_mode: "HTML" }
        );
        return;
      }

      await RedisDB.addAdmin(newAdminId);

      try {
        const name = await getName(newAdminId);
        await bot.sendMessage(
          chatId,
          `<b>✅ Yangi admin muvaffaqiyatli qo'shildi!</b>\n\n👤 Ism: <a href="tg://user?id=${newAdminId}">${name}</a>\n🆔 ID: ${newAdminId}`,
          { parse_mode: "HTML" }
        );
      } catch (error) {
        await bot.sendMessage(
          chatId,
          `<b>✅ Yangi admin muvaffaqiyatli qo'shildi!</b>\n\n🆔 ID: ${newAdminId}`,
          {
            parse_mode: "HTML",
          }
        );
      }

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      await bot.sendMessage(chatId, "⚠️ Admin qo'shishda xatolik yuz berdi!", {
        parse_mode: "HTML",
      });
    }
  }

  // Admin o'chirish
  if (
    step === "remove-admin" &&
    text &&
    !text.startsWith("/") &&
    !isNaN(text)
  ) {
    try {
      const removeAdminId = Number.parseInt(text);
      const admins = await RedisDB.getAdmins();

      if (!admins.includes(removeAdminId)) {
        await bot.sendMessage(
          chatId,
          "<b>⚠️ Bu foydalanuvchi admin emas!</b>",
          { parse_mode: "HTML" }
        );
        return;
      }

      await RedisDB.removeAdmin(removeAdminId);

      await bot.sendMessage(
        chatId,
        `<b>✅ Admin muvaffaqiyatli o'chirildi!</b>\n\n🆔 ID: ${removeAdminId}`,
        {
          parse_mode: "HTML",
        }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      await bot.sendMessage(
        chatId,
        "⚠️ Adminni o'chirishda xatolik yuz berdi!",
        { parse_mode: "HTML" }
      );
    }
  }

  // Foydalanuvchini blocklash
  if (step === "block-user" && text && !text.startsWith("/") && !isNaN(text)) {
    try {
      const blockUserId = Number.parseInt(text);
      await RedisDB.updateUser(blockUserId, { ban: "1" });

      await bot.sendMessage(
        chatId,
        `<b>✅ Foydalanuvchi muvaffaqiyatli blocklandi!</b>\n\n🆔 ID: ${blockUserId}`,
        {
          parse_mode: "HTML",
        }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      await bot.sendMessage(
        chatId,
        "⚠️ Foydalanuvchini blocklashda xatolik yuz berdi!",
        { parse_mode: "HTML" }
      );
    }
  }

  // Foydalanuvchini blockdan olish
  if (
    step === "unblock-user" &&
    text &&
    !text.startsWith("/") &&
    !isNaN(text)
  ) {
    try {
      const unblockUserId = Number.parseInt(text);
      await RedisDB.updateUser(unblockUserId, { ban: "0" });

      await bot.sendMessage(
        chatId,
        `<b>✅ Foydalanuvchi muvaffaqiyatli blockdan olindi!</b>\n\n🆔 ID: ${unblockUserId}`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      await bot.sendMessage(
        chatId,
        "⚠️ Foydalanuvchini blockdan olishda xatolik yuz berdi!",
        { parse_mode: "HTML" }
      );
    }
  }

  // Broadcast xabar
  if (
    step === "broadcast" &&
    (text || msg.photo || msg.video || msg.document)
  ) {
    try {
      const users = await RedisDB.getAllUsers();
      let sentCount = 0;
      let errorCount = 0;

      await bot.sendMessage(chatId, "<b>📤 Xabar yuborish boshlandi...</b>", {
        parse_mode: "HTML",
      });

      for (const user of users) {
        try {
          if (user.ban === "1") continue;

          if (text) {
            await bot.sendMessage(user.id, text, { parse_mode: "HTML" });
          } else if (msg.photo) {
            await bot.sendPhoto(
              user.id,
              msg.photo[msg.photo.length - 1].file_id,
              {
                caption: msg.caption || "",
                parse_mode: "HTML",
              }
            );
          } else if (msg.video) {
            await bot.sendVideo(user.id, msg.video.file_id, {
              caption: msg.caption || "",
              parse_mode: "HTML",
            });
          } else if (msg.document) {
            await bot.sendDocument(user.id, msg.document.file_id, {
              caption: msg.caption || "",
              parse_mode: "HTML",
            });
          }

          sentCount++;

          if (sentCount % 20 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          errorCount++;
          if (error.response && error.response.statusCode === 403) {
            await RedisDB.updateUser(user.id, { sana: "tark" });
          }
        }
      }

      await bot.sendMessage(
        chatId,
        `<b>✅ Xabar yuborish yakunlandi!</b>\n\n📤 Yuborildi: ${sentCount} ta\n❌ Xatolik: ${errorCount} ta`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      await bot.sendMessage(chatId, "⚠️ Xabar yuborishda xatolik yuz berdi!", {
        parse_mode: "HTML",
      });
    }
  }

  // Forward xabar
  if (step === "forward" && msg.message_id) {
    try {
      const users = await RedisDB.getAllUsers();
      let sentCount = 0;
      let errorCount = 0;

      await bot.sendMessage(
        chatId,
        "<b>📤 Xabar forward qilish boshlandi...</b>",
        {
          parse_mode: "HTML",
        }
      );

      for (const user of users) {
        try {
          if (user.ban === "1") continue;

          await bot.forwardMessage(user.id, chatId, msg.message_id);
          sentCount++;

          if (sentCount % 20 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          errorCount++;
          if (error.response && error.response.statusCode === 403) {
            await RedisDB.updateUser(user.id, { sana: "tark" });
          }
        }
      }

      await bot.sendMessage(
        chatId,
        `<b>✅ Xabar forward qilish yakunlandi!</b>\n\n📤 Yuborildi: ${sentCount} ta\n❌ Xatolik: ${errorCount} ta`,
        { parse_mode: "HTML" }
      );

      await RedisDB.updateUser(userId, { step: "0" });
    } catch (error) {
      await bot.sendMessage(
        chatId,
        "⚠️ Xabar forward qilishda xatolik yuz berdi!",
        { parse_mode: "HTML" }
      );
    }
  }
}

// Chat join request ishlovchisi
bot.on("chat_join_request", async (request) => {
  const chatId = request.chat.id;
  const userId = request.from.id;

  try {
    await RedisDB.addChannelRequest(chatId, userId);
  } catch (error) {
    console.error("Chat join request ishlov berish xatolik:", error);
  }
});

// Chat member update ishlovchisi
bot.on("chat_member", async (update) => {
  if (update.new_chat_member && update.new_chat_member.status === "kicked") {
    await RedisDB.updateUser(update.from.id, { sana: "tark" });
  }
});

// Server ishga tushirish
async function startServer() {
  await createDirectories();
  await initRedis();
  console.log("Telegram bot ishga tushdi...");

  // Express server (webhook uchun)
  app.post(`/webhook/${API_KEY}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server ${PORT} portda ishlamoqda`);
  });
}

// Xatoliklarni ushlash
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Bot to'xtatilmoqda...");
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});

startServer().catch(console.error);

module.exports = { bot, redisClient, RedisDB };
