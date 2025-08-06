import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import redis from "redis";
import moment from "moment";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

// Telegram Bot konfiguratsiyasi
const API_KEY = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://your-vercel-app.vercel.app";

// Bot ni webhook rejimida ishga tushirish (polling: false!)
const bot = new TelegramBot(API_KEY, { 
  polling: false,
  webHook: false
});

// Bot ma'lumotlari
const idbot = 7359677611;
const nurbek = Number.parseInt(process.env.OWNER_ID || "123456789");
const owners = [nurbek];
const adminUsername = process.env.ADMIN_USERNAME || "Nurbek_2255";

// Redis client
let redisClient;
let isRedisConnected = false;

// Redis ulanishi - Fixed version
async function initRedis() {
  if (redisClient && isRedisConnected && redisClient.isOpen) {
    return redisClient;
  }

  try {
    console.log("Redis ulanish...");
    
    // Redis konfiguratsiyasi - SSL/TLS ni to'g'ri sozlash
    const redisConfig = {
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT) || 6379,
        reconnectDelay: 5000,
        connectTimeout: 15000,
        // TLS ni faqat kerak bo'lganda yoqish
        ...(process.env.REDIS_TLS === "true" && {
          tls: {
            rejectUnauthorized: false, // Self-signed sertifikatlar uchun
            // Agar kerak bo'lsa qo'shimcha TLS sozlamalar
          }
        })
      },
      password: process.env.REDIS_PASSWORD,
      // Connection retry strategiyasi
      retry: {
        retries: 3,
        delay: (attempt) => Math.min(attempt * 50, 500)
      }
    };

    // Agar TLS kerak bo'lmasa, uni umuman qo'shmaslik
    if (process.env.REDIS_TLS !== "true") {
      // HTTP Redis connection uchun
      delete redisConfig.socket.tls;
    }

    redisClient = redis.createClient(redisConfig);

    redisClient.on("error", (err) => {
      console.error("Redis xatolik:", err);
      isRedisConnected = false;
      
      // Agar SSL xatolik bo'lsa, TLS ni o'chirish
      if (err.code === 'ERR_SSL_PACKET_LENGTH_TOO_LONG') {
        console.log("SSL xatolik aniqlandi, TLS ni o'chirish...");
        process.env.REDIS_TLS = "false";
      }
    });

    redisClient.on("connect", () => {
      console.log("Redis ulanmoqda...");
    });

    redisClient.on("ready", () => {
      console.log("Redis tayyor!");
      isRedisConnected = true;
    });

    redisClient.on("end", () => {
      console.log("Redis aloqa uzildi");
      isRedisConnected = false;
    });

    // Timeout bilan ulanish
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Redis connection timeout')), 20000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);
    isRedisConnected = true;
    console.log("Redis muvaffaqiyatli ulandi!");
    
    await initDefaultData();
    return redisClient;
  } catch (error) {
    console.error("Redis ulanishida xatolik:", error);
    isRedisConnected = false;
    
    // Agar SSL xatolik bo'lsa, TLS ni o'chirib qayta urinish
    if (error.code === 'ERR_SSL_PACKET_LENGTH_TOO_LONG' && process.env.REDIS_TLS === "true") {
      console.log("SSL xatolik tufayli TLS ni o'chirib qayta urinish...");
      process.env.REDIS_TLS = "false";
      return await initRedis(); // Recursive call
    }
    
    throw error;
  }
} 

// Default ma'lumotlarni o'rnatish
async function initDefaultData() {
  try {
    if (!isRedisConnected) return;

    const settingsExists = await redisClient.exists("settings");
    if (!settingsExists) {
      await redisClient.hSet("settings", {
        kino: "0",
        kino2: "0",
        movie_channel: "",
        ads_text: "🎬 Kinolarni bepul tomosha qiling!\n\n📢 Kanalimiz: %kino%\n👨‍💼 Admin: @%admin%",
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
  static checkRedisClient() {
    if (!redisClient || !isRedisConnected || !redisClient.isOpen) {
      console.warn("Redis client is not available");
      return false;
    }
    return true;
  }

  static async getUser(userId) {
    try {
      if (!this.checkRedisClient()) return null;
      const userData = await redisClient.hGetAll(`user:${userId}`);
      return Object.keys(userData).length > 0 ? userData : null;
    } catch (error) {
      console.error("Foydalanuvchini olishda xatolik:", error);
      return null;
    }
  }

  static async createUser(userId, data = {}) {
    try {
      if (!this.checkRedisClient()) return null;
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
      if (!this.checkRedisClient()) return;
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
      if (!this.checkRedisClient()) return [];
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

  static async addMovie(movieData) {
    try {
      if (!this.checkRedisClient()) return null;
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
      if (!this.checkRedisClient()) return null;
      const movieData = await redisClient.hGetAll(`movie:${movieId}`);
      return Object.keys(movieData).length > 0 ? movieData : null;
    } catch (error) {
      console.error("Kinoni olishda xatolik:", error);
      return null;
    }
  }

  static async deleteMovie(movieId) {
    try {
      if (!this.checkRedisClient()) return false;
      const exists = await redisClient.exists(`movie:${movieId}`);
      if (exists) {
        await redisClient.del(`movie:${movieId}`);
        await redisClient.sRem("movies:all", movieId);
        const deletedCount = (await redisClient.hGet("settings", "kino2")) || "0";
        await redisClient.hSet("settings", "kino2", (Number.parseInt(deletedCount) + 1).toString());
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
      if (!this.checkRedisClient()) return [];
      const movieIds = await redisClient.sMembers("movies:all");
      const movies = [];
      for (const movieId of movieIds) {
        const movieData = await this.getMovie(movieId);
        if (movieData) {
          movies.push(movieData);
        }
      }
      return movies.sort((a, b) => Number.parseInt(a.id) - Number.parseInt(b.id));
    } catch (error) {
      console.error("Barcha kinolarni olishda xatolik:", error);
      return [];
    }
  }

  static async getMovieCount() {
    try {
      if (!this.checkRedisClient()) return 0;
      return await redisClient.sCard("movies:all");
    } catch (error) {
      return 0;
    }
  }

  static async getSetting(key) {
    try {
      if (!this.checkRedisClient()) return null;
      return await redisClient.hGet("settings", key);
    } catch (error) {
      return null;
    }
  }

  static async setSetting(key, value) {
    try {
      if (!this.checkRedisClient()) return;
      await redisClient.hSet("settings", key, value.toString());
    } catch (error) {
      console.error("Sozlamani o'rnatishda xatolik:", error);
    }
  }

  static async setMovieChannel(channelId) {
    try {
      if (!this.checkRedisClient()) return;
      await redisClient.hSet("settings", "movie_channel", channelId.toString());
      console.log(`Kino kanali o'rnatildi: ${channelId}`);
    } catch (error) {
      console.error("Kino kanalini o'rnatishda xatolik:", error);
      throw error;
    }
  }

  static async getMovieChannel() {
    try {
      if (!this.checkRedisClient()) return null;
      return await redisClient.hGet("settings", "movie_channel");
    } catch (error) {
      console.error("Kino kanalini olishda xatolik:", error);
      return null;
    }
  }

  static async setAdsText(text) {
    try {
      if (!this.checkRedisClient()) return;
      await redisClient.hSet("settings", "ads_text", text);
      console.log("Reklama matni o'rnatildi");
    } catch (error) {
      console.error("Reklama matnini o'rnatishda xatolik:", error);
      throw error;
    }
  }

  static async getAdsText() {
    try {
      if (!this.checkRedisClient()) return "🎬 Kinolarni bepul tomosha qiling!\n\n📢 Kanalimiz: %kino%\n👨‍💼 Admin: @%admin%";
      const adsText = await redisClient.hGet("settings", "ads_text");
      return adsText || "🎬 Kinolarni bepul tomosha qiling!\n\n📢 Kanalimiz: %kino%\n👨‍💼 Admin: @%admin%";
    } catch (error) {
      console.error("Reklama matnini olishda xatolik:", error);
      return "🎬 Kinolarni bepul tomosha qiling!\n\n📢 Kanalimiz: %kino%\n👨‍💼 Admin: @%admin%";
    }
  }

  static async addAdmin(adminId) {
    try {
      if (!this.checkRedisClient()) return;
      await redisClient.sAdd("admins:all", adminId.toString());
    } catch (error) {
      console.error("Admin qo'shishda xatolik:", error);
    }
  }

  static async removeAdmin(adminId) {
    try {
      if (!this.checkRedisClient()) return;
      await redisClient.sRem("admins:all", adminId.toString());
    } catch (error) {
      console.error("Adminni o'chirishda xatolik:", error);
    }
  }

  static async getAdmins() {
    try {
      if (!this.checkRedisClient()) return owners;
      const adminIds = await redisClient.sMembers("admins:all");
      return [...owners, ...adminIds.map((id) => Number.parseInt(id))];
    } catch (error) {
      return owners;
    }
  }

  static async addChannel(channelId, channelUrl) {
    try {
      if (!this.checkRedisClient()) return;
      await redisClient.sAdd("channels:mandatory", channelId.toString());
      if (channelUrl) {
        await redisClient.hSet("channels:urls", channelId.toString(), channelUrl);
      }
      console.log(`Majburiy kanal qo'shildi: ${channelId}, URL: ${channelUrl}`);
    } catch (error) {
      console.error("Kanal qo'shishda xatolik:", error);
      throw error;
    }
  }

  static async removeChannel(channelId) {
    try {
      if (!this.checkRedisClient()) return;
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
      if (!this.checkRedisClient()) return [];
      return await redisClient.sMembers("channels:mandatory");
    } catch (error) {
      console.error("Majburiy kanallarni olishda xatolik:", error);
      return [];
    }
  }

  static async getChannelUrl(channelId) {
    try {
      if (!this.checkRedisClient()) return null;
      return await redisClient.hGet("channels:urls", channelId.toString());
    } catch (error) {
      return null;
    }
  }

  static async addChannelRequest(channelId, userId) {
    try {
      if (!this.checkRedisClient()) return;
      await redisClient.sAdd(`channel:requests:${channelId}`, userId.toString());
    } catch (error) {
      console.error("Kanal so'rovini qo'shishda xatolik:", error);
    }
  }

  static async isUserRequested(channelId, userId) {
    try {
      if (!this.checkRedisClient()) return false;
      return await redisClient.sIsMember(`channel:requests:${channelId}`, userId.toString());
    } catch (error) {
      return false;
    }
  }

  static async addJoinRequestChannel(channelId, channelUrl) {
    try {
      if (!this.checkRedisClient()) return;
      await redisClient.sAdd("channels:join_request", channelId.toString());
      if (channelUrl) {
        await redisClient.hSet("channels:join_urls", channelId.toString(), channelUrl);
      }
      console.log(`Zayavka kanali qo'shildi: ${channelId}, URL: ${channelUrl}`);
    } catch (error) {
      console.error("Zayavka kanalini qo'shishda xatolik:", error);
      throw error;
    }
  }

  static async removeJoinRequestChannel(channelId) {
    try {
      if (!this.checkRedisClient()) return;
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
      if (!this.checkRedisClient()) return [];
      return await redisClient.sMembers("channels:join_request");
    } catch (error) {
      console.error("Zayavka kanallarini olishda xatolik:", error);
      return [];
    }
  }

  static async getJoinRequestChannelUrl(channelId) {
    try {
      if (!this.checkRedisClient()) return null;
      return await redisClient.hGet("channels:join_urls", channelId.toString());
    } catch (error) {
      return null;
    }
  }

  static async getText(textKey) {
    try {
      if (!this.checkRedisClient()) return null;
      return await redisClient.get(`texts:${textKey}`);
    } catch (error) {
      return null;
    }
  }

  static async setText(textKey, textValue) {
    try {
      if (!this.checkRedisClient()) return;
      await redisClient.set(`texts:${textKey}`, textValue);
    } catch (error) {
      console.error("Matnni o'rnatishda xatolik:", error);
    }
  }

  static async getUserCount() {
    try {
      if (!this.checkRedisClient()) return 0;
      return await redisClient.sCard("users:all");
    } catch (error) {
      console.error("Foydalanuvchilar sonini olishda xatolik:", error);
      return 0;
    }
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

// Majburiy obuna tekshirish - xatoliklarni boshqarish bilan
async function joinchat(userId) {
  try {
    const mandatoryChannels = await RedisDB.getMandatoryChannels();
    const joinRequestChannels = await RedisDB.getJoinRequestChannels();
    const allChannels = [...mandatoryChannels, ...joinRequestChannels];

    if (allChannels.length === 0) return true;

    let uns = false;
    const inlineKeyboard = [];

    for (const channelId of mandatoryChannels) {
      try {
        const url = await RedisDB.getChannelUrl(channelId);
        
        // Retry mexanizmi
        let chat, chatMember;
        let retries = 3;
        
        while (retries > 0) {
          try {
            chat = await bot.getChat(channelId);
            chatMember = await bot.getChatMember(channelId, userId);
            break;
          } catch (error) {
            console.log(`Kanal tekshirishda xatolik (qolgan urinish: ${retries-1}):`, error.message);
            retries--;
            if (retries === 0) throw error;
            // 1 sekund kutish
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
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
        console.error(`Majburiy kanal tekshirishda xatolik (${channelId}):`, error.message);
        // Kanal mavjud bo'lmasa, uni e'tiborsiz qoldirish
        if (error.code === 'ETELEGRAM' && error.response?.body?.description?.includes('not found')) {
          console.log(`Kanal topilmadi: ${channelId}`);
          continue;
        }
        uns = true;
      }
    }

    for (const channelId of joinRequestChannels) {
      try {
        const url = await RedisDB.getJoinRequestChannelUrl(channelId);
        
        // Retry mexanizmi
        let chat, chatMember;
        let retries = 3;
        
        while (retries > 0) {
          try {
            chat = await bot.getChat(channelId);
            chatMember = await bot.getChatMember(channelId, userId);
            break;
          } catch (error) {
            console.log(`Zayavka kanal tekshirishda xatolik (qolgan urinish: ${retries-1}):`, error.message);
            retries--;
            if (retries === 0) throw error;
            // 1 sekund kutish
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
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
              text: `❌ ${chat.title} (Zayavka yuborish)`,
              url: url || `https://t.me/${chat.username || "durov"}`,
            },
          ]);
          uns = true;
        }
      } catch (error) {
        console.error(`Zayavka kanal tekshirishda xatolik (${channelId}):`, error.message);
        // Kanal mavjud bo'lmasa, uni e'tiborsiz qoldirish
        if (error.code === 'ETELEGRAM' && error.response?.body?.description?.includes('not found')) {
          console.log(`Zayavka kanali topilmadi: ${channelId}`);
          continue;
        }
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

      try {
        await bot.sendMessage(
          userId,
          "❌ <b>Botdan to'liq foydalanish uchun quyidagi kanallarimizga obuna bo'ling!</b>",
          {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: inlineKeyboard },
          }
        );
      } catch (error) {
        console.error("Kanal obuna xabarini yuborishda xatolik:", error);
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error("Joinchat funksiyasida umumiy xatolik:", error);
    return true; // Xatolik bo'lsa ham botni ishlashga ruxsat berish
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
const removeKey = { remove_keyboard: true };


    // /start komandasi
    bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const name = msg.from.first_name;

      console.log(`Start command received from user ${userId}`);

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
        const kino_id = await RedisDB.getMovieChannel();
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
              kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`;
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
          : "👋 Assalomu alaykum {name}  botimizga xush kelibsiz.\n\n✅🎭 Kino kodini yuboring.";
        const currentTime = moment().format("DD.MM.YYYY | HH:mm");
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

        console.log(`Start message sent to user ${userId}`);
      } catch (error) {
        console.error("/start komandasi xatolik:", error);
        
        // Fallback message
        try {
          await bot.sendMessage(chatId, "👋 Assalomu alaykum! Botga xush kelibsiz.\n\n🎬 Kino kodini yuboring:");
        } catch (fallbackError) {
          console.error("Fallback message ham yuborilmadi:", fallbackError);
        }
      }
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
          const reklama = await RedisDB.getAdsText();
          const bot_username = (await bot.getMe()).username;
          const kino_id = await RedisDB.getMovieChannel();
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
                kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`;
              }
            } catch (error) {
              console.error("Kino kanal ma'lumotlarini olishda xatolik:", error);
              kino = "";
              kinoUrl = "";
            }
          }

          const reklamaText = reklama
            .replace("%kino%", kino)
            .replace("%admin%", adminUsername);

          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: "↗️ Do'stlarga ulashish",
                  url: `https://t.me/share/url/?url=https://t.me/${bot_username}?start=${randomId}`,
                },
              ],
              [{ text: "🔎 Boshqa kodlar", url: kinoUrl || `https://t.me/durov` }],
              [{ text: "🎲 Yana tasodifiy", callback_data: "random_movie" }]
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
        await bot.sendMessage(chatId, "⚠️ Tasodifiy kino olishda xatolik yuz berdi!");
      }
    });

    // Admin paneli
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

    // Callback query ishlovchisi
    bot.on("callback_query", async (query) => {
      const chatId = query.message.chat.id;
      const userId = query.from.id;
      const data = query.data;
      const messageId = query.message.message_id;

      try {
        if (data === "check") {
          await bot.deleteMessage(chatId, messageId).catch(() => {});
          if (await joinchat(userId)) {
            // Start message logic here
            const kino_id = await RedisDB.getMovieChannel();
            let kinoUrl = "";

            if (kino_id) {
              try {
                const chat = await bot.getChat(kino_id);
                if (chat.username) {
                  kinoUrl = `https://t.me/${chat.username}`;
                } else {
                  kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`;
                }
              } catch (error) {
                console.error("Kino kanal ma'lumotlarini olishda xatolik:", error);
                kinoUrl = "";
              }
            }

            const startTextBase64 = await RedisDB.getText("start");
            const startText = startTextBase64
              ? Buffer.from(startTextBase64, "base64").toString()
              : "👋 Assalomu alaykum {name}  botimizga xush kelibsiz.\n\n✅🎭 Kino kodini yuboring.";
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
              const reklama = await RedisDB.getAdsText();
              const bot_username = (await bot.getMe()).username;
              const kino_id = await RedisDB.getMovieChannel();
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
                    kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`;
                  }
                } catch (error) {
                  console.error("Kino kanal ma'lumotlarini olishda xatolik:", error);
                  kino = "";
                  kinoUrl = "";
                }
              }

              const reklamaText = reklama
                .replace("%kino%", kino)
                .replace("%admin%", adminUsername);

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
                      url: kinoUrl || `https://t.me/durov`,
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

        await bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error("Callback query ishlov berish xatolik:", error);
        await bot.answerCallbackQuery(query.id, { text: "Xatolik yuz berdi!" }).catch(() => {});
      }
    });

    // Xabar ishlovchisi
    bot.on("message", async (msg) => {
      if (msg.text && msg.text.startsWith("/")) return;

      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const text = msg.text;

      console.log(`Message received from user ${userId}: ${text}`);

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
              const reklama = await RedisDB.getAdsText();
              const bot_username = (await bot.getMe()).username;
              const kino_id = await RedisDB.getMovieChannel();
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
                    kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`;
                  }
                } catch (error) {
                  console.error("Kino kanal ma'lumotlarini olishda xatolik:", error);
                  kino = "";
                  kinoUrl = "";
                }
              }

              const reklamaText = reklama
                .replace("%kino%", kino)
                .replace("%admin%", adminUsername);

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
                      url: kinoUrl || `https://t.me/durov`,
                    },
                  ],
                ],
              };

              await bot.sendVideo(chatId, movie.file_id, {
                caption: `<b>${filmName}</b>\n\n${reklamaText}`,
                parse_mode: "HTML",
                reply_markup: keyboard,
              });

              console.log(`Movie sent to user ${userId}: ${searchCode}`);
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
          await bot.sendMessage(chatId, "<b>📛 Faqat raqamlardan foydalaning!</b>", {
            parse_mode: "HTML",
          });
        }
        return;
      }

      // Admin komandalarini ishlov berish
      if (isAdmin) {
        await handleAdminCommands(msg, user);
      }
    });

    // Chat join request ishlovchisi
    bot.on("chat_join_request", async (request) => {
      const chatId = request.chat.id;
      const userId = request.from.id;

      try {
        await RedisDB.addChannelRequest(chatId, userId);
        console.log(`Join request added: ${userId} -> ${chatId}`);
      } catch (error) {
        console.error("Chat join request ishlov berish xatolik:", error);
      }
    });

    // Chat member update ishlovchisi
    bot.on("chat_member", async (update) => {
      try {
        if (update.new_chat_member && update.new_chat_member.status === "kicked") {
          await RedisDB.updateUser(update.from.id, { sana: "tark" });
        }
      } catch (error) {
        console.error("Chat member update ishlov berish xatolik:", error);
      }
    });

    console.log("Bot handlers setup completed");
  

// Admin komandalarini ishlov berish
async function handleAdminCommands(msg, user) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const step = user ? user.step : "0";

  try {
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

      case "📊 Statistika":
        await handleStatistics(chatId);
        break;

      case "🎬 Kino qo'shish":
        await bot.sendMessage(chatId, "<b>🎬 Kinoni yuboring:</b>", {
          parse_mode: "HTML",
          reply_markup: cancel,
        });
        await RedisDB.updateUser(userId, { step: "movie" });
        break;

      default:
        // Step-based ishlov berish
        await handleStepBasedCommands(msg, user);
    }
  } catch (error) {
    console.error("Admin komandalarini ishlov berish xatolik:", error);
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

    const statsMessage = `💡 <b>Bot statistikasi:</b>

• <b>Jami a'zolar:</b> ${totalUsers} ta
• <b>Tark etgan a'zolar:</</b> ${leftUsers} ta
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

// Step-based komandalarni ishlov berish
async function handleStepBasedCommands(msg, user) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const step = user ? user.step : "0";

  try {
    // Video yuklash
    if (step === "movie" && msg.video) {
      const tempId = uuidv4();
      
      // Redis'da temp ma'lumot saqlash
      await redisClient.hSet(`film:${tempId}`, {
        file_id: msg.video.file_id,
        file_name: Buffer.from(msg.video.file_name || "video").toString("base64"),
      });

      await bot.sendMessage(chatId, "<b>🎬 Kino ma'lumotini yuboring:</b>", {
        parse_mode: "HTML",
        reply_markup: cancel,
      });
      await RedisDB.updateUser(userId, { step: "caption", temp_id: tempId });
    }

    // Caption qo'shish
    if (step === "caption" && text && text !== "🎬 Kino qo'shish") {
      const tempId = user.temp_id;
      
      // Caption ni redisga yozamiz
      await redisClient.hSet(`film:${tempId}`, {
        caption: Buffer.from(text).toString("base64"),
      });

      // Redisdan ma'lumotlarni o'qib olamiz
      const filmData = await redisClient.hGetAll(`film:${tempId}`);
      const fileId = filmData.file_id;
      const reklama = await RedisDB.getAdsText();

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
  } catch (error) {
    console.error("Step-based komandalar xatolik:", error);
  }
}

// Direct webhook update handler
async function handleWebhookUpdate(update) {
  try {
    console.log("Processing webhook update:", JSON.stringify(update, null, 2));

    // Handle message
    if (update.message) {
      await handleMessage(update.message);
      return;
    }

    // Handle callback query
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }

    // Handle chat join request
    if (update.chat_join_request) {
      await handleChatJoinRequest(update.chat_join_request);
      return;
    }

    // Handle chat member update
    if (update.chat_member) {
      await handleChatMember(update.chat_member);
      return;
    }

    console.log("Unhandled update type:", Object.keys(update));
  } catch (error) {
    console.error("Webhook update handler error:", error);
  }
}

// Handle message
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  console.log(`Message received from user ${userId}: ${text}`);

  if (msg.chat.type !== "private") {
    console.log(`Ignoring non-private chat: ${msg.chat.type}`);
    return;
  }

  // Handle /start command
  if (text && text.startsWith("/start")) {
    await handleStartCommand(msg);
    return;
  }

  // Handle /rand command
  if (text === "/rand") {
    await handleRandCommand(msg);
    return;
  }

  // Handle admin commands
  if (
    text &&
    (text === "/panel" || text === "/a" || text === "/admin" || text === "/p")
  ) {
    await handleAdminPanel(msg);
    return;
  }

  // Handle regular messages
  if (text && !text.startsWith("/")) {
    await handleRegularMessage(msg);
    return;
  }
}

// Handle /start command
async function handleStartCommand(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const name = msg.from.first_name;

  console.log(`START COMMAND: User ${userId} (${name}) in chat ${chatId}`);

  try {
    let user = await RedisDB.getUser(userId);
    console.log(`User data:`, user);

    if (user && user.ban === "1") {
      console.log(`User ${userId} is banned`);
      return;
    }

    if (!user) {
      console.log(`Creating new user ${userId}`);
      user = await RedisDB.createUser(userId);
      console.log(`User created:`, user);
    } else {
      console.log(`Updating existing user ${userId}`);
      await RedisDB.updateUser(userId, { lastmsg: "start", step: "0" });
    }

    console.log(`Checking channel membership for user ${userId}`);
    const joinResult = await joinchat(userId);
    console.log(`Join check result:`, joinResult);

    if (!joinResult) {
      console.log(`User ${userId} failed channel check`);
      return;
    }

    console.log(`Preparing start message for user ${userId}`);

    const kino_id = await RedisDB.getMovieChannel();
    console.log(`Movie channel ID:`, kino_id);

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
          kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`;
        }
        console.log(`Movie channel info: ${kino}, URL: ${kinoUrl}`);
      } catch (error) {
        console.error("Kino kanal ma'lumotlarini olishda xatolik:", error);
        kino = "";
        kinoUrl = "";
      }
    }

    const startTextBase64 = await RedisDB.getText("start");
    console.log(`Start text base64:`, startTextBase64);

    const startText = startTextBase64
      ? Buffer.from(startTextBase64, "base64").toString()
      : "👋 Assalomu alaykum {name}  botimizga xush kelibsiz.\n\n✅🎭 Kino kodini yuboring.";

    console.log(`Start text decoded:`, startText);

    const currentTime = moment().format("DD.MM.YYYY | HH:mm");
    const message = startText
      .replace("{name}", `<a href="tg://user?id=${userId}">${name}</a>`)
      .replace("{time}", currentTime);

    console.log(`Final message:`, message);

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

    console.log(`Sending start message to user ${userId}`);

    await bot.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });

    console.log(`Start message sent successfully to user ${userId}`);
  } catch (error) {
    console.error(`/start command error for user ${userId}:`, error);

    // Fallback message
    try {
      console.log(`Sending fallback message to user ${userId}`);
      await bot.sendMessage(
        chatId,
        "👋 Assalomu alaykum! Botga xush kelibsiz.\n\n🎬 Kino kodini yuboring:"
      );
      console.log(`Fallback message sent to user ${userId}`);
    } catch (fallbackError) {
      console.error(
        `Fallback message ham yuborilmadi user ${userId}:`,
        fallbackError
      );
    }
  }
}

// Handle /rand command
async function handleRandCommand(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  console.log(`Random command from user ${userId}`);

  try {
    const joinResult = await joinchat(userId);
    if (!joinResult) {
      console.log(`User ${userId} failed channel check for /rand`);
      return;
    }

    const movies = await RedisDB.getAllMovies();
    if (!movies || movies.length === 0) {
      await bot.sendMessage(chatId, "❌ Hozircha kinolar mavjud emas.");
      return;
    }

    const randomMovie = movies[Math.floor(Math.random() * movies.length)];
    console.log(`Random movie selected:`, randomMovie);

    if (randomMovie) {
      const filmName = Buffer.from(randomMovie.film_name, "base64").toString();
      const reklama = await RedisDB.getAdsText();
      const bot_username = (await bot.getMe()).username;
      const kino_id = await RedisDB.getMovieChannel();
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
            kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`;
          }
        } catch (error) {
          console.error("Kino kanal ma'lumotlarini olishda xatolik:", error);
          kino = "";
          kinoUrl = "";
        }
      }

      const reklamaText = reklama
        .replace("%kino%", kino)
        .replace("%admin%", adminUsername);

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "↗️ Do'stlarga ulashish",
              url: `https://t.me/share/url/?url=https://t.me/${bot_username}?start=${randomMovie.id}`,
            },
          ],
          [
            {
              text: "🔎 Boshqa kodlar",
              url: kinoUrl || `https://t.me/durov`,
            },
          ],
          [{ text: "🎲 Yana tasodifiy", callback_data: "random_movie" }],
        ],
      };

      await bot.sendVideo(chatId, randomMovie.file_id, {
        caption: `<b>🎲 Tasodifiy film: ${filmName}</b>\n<b>🆔 Kod: ${randomMovie.id}</b>\n\n${reklamaText}`,
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } else {
      await bot.sendMessage(chatId, "❌ Tasodifiy kino topilmadi.");
    }
  } catch (error) {
    console.error(`Random command error for user ${userId}:`, error);
  }
}

// Handle admin panel
async function handleAdminPanel(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  console.log(`Admin panel request from user ${userId}`);

  try {
    const admins = await RedisDB.getAdmins();
    if (!admins.includes(userId)) {
      await bot.sendMessage(chatId, "❌ Sizda admin huquqlari yo'q.");
      return;
    }

    const adminKeyboard = {
      inline_keyboard: [
        [
          { text: "📊 Statistika", callback_data: "admin_stats" },
          { text: "📢 Kanallar", callback_data: "admin_channels" },
        ],
        [
          { text: "🎬 Kinolar", callback_data: "admin_movies" },
          { text: "👥 Foydalanuvchilar", callback_data: "admin_users" },
        ],
        [{ text: "⚙️ Sozlamalar", callback_data: "admin_settings" }],
      ],
    };

    await bot.sendMessage(chatId, "🔧 Admin Panel", {
      reply_markup: adminKeyboard,
    });
  } catch (error) {
    console.error(`Admin panel error for user ${userId}:`, error);
  }
}

// Handle regular messages (movie codes)
async function handleRegularMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  console.log(`Regular message from user ${userId}: ${text}`);

  try {
    const joinResult = await joinchat(userId);
    if (!joinResult) {
      console.log(`User ${userId} failed channel check for regular message`);
      return;
    }

    // Try to find movie by code
    const movieData = await RedisDB.getMovie(text);
    if (movieData) {
      const filmName = Buffer.from(movieData.film_name, "base64").toString();
      const reklama = await RedisDB.getAdsText();
      const bot_username = (await bot.getMe()).username;
      const kino_id = await RedisDB.getMovieChannel();
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
            kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`;
          }
        } catch (error) {
          console.error("Kino kanal ma'lumotlarini olishda xatolik:", error);
          kino = "";
          kinoUrl = "";
        }
      }

      const reklamaText = reklama
        .replace("%kino%", kino)
        .replace("%admin%", adminUsername);

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: "↗️ Do'stlarga ulashish",
              url: `https://t.me/share/url/?url=https://t.me/${bot_username}?start=${text}`,
            },
          ],
          [
            {
              text: "🔎 Boshqa kodlar",
              url: kinoUrl || `https://t.me/durov`,
            },
          ],
        ],
      };

      await bot.sendVideo(chatId, movieData.file_id, {
        caption: `<b>${filmName}</b>\n\n${reklamaText}`,
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      console.log(`Movie found and sent to user ${userId}: ${text}`);
    } else {
      await bot.sendMessage(chatId, "❌ Bunday kodli kino topilmadi.");
      console.log(`Movie not found for user ${userId}: ${text}`);
    }
  } catch (error) {
    console.error(`Regular message error for user ${userId}:`, error);
  }
}

// Handle callback queries
async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  console.log(`Callback query from user ${userId}: ${data}`);

  try {
    await bot.answerCallbackQuery(query.id);

    if (data === "check") {
      const joinResult = await joinchat(userId);
      if (joinResult) {
        await bot.editMessageText("✅ Barcha kanallarga obuna bo'ldingiz!", {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
      }
    } else if (data === "random_movie") {
      const movies = await RedisDB.getAllMovies();
      if (movies && movies.length > 0) {
        const randomMovie = movies[Math.floor(Math.random() * movies.length)];
        if (randomMovie) {
          const filmName = Buffer.from(randomMovie.film_name, "base64").toString();
          const reklama = await RedisDB.getAdsText();
          const bot_username = (await bot.getMe()).username;
          const kino_id = await RedisDB.getMovieChannel();
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
                kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`;
              }
            } catch (error) {
              console.error("Kino kanal ma'lumotlarini olishda xatolik:", error);
              kino = "";
              kinoUrl = "";
            }
          }

          const reklamaText = reklama
            .replace("%kino%", kino)
            .replace("%admin%", adminUsername);

          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: "↗️ Do'stlarga ulashish",
                  url: `https://t.me/share/url/?url=https://t.me/${bot_username}?start=${randomMovie.id}`,
                },
              ],
              [
                {
                  text: "🔎 Boshqa kodlar",
                  url: kinoUrl || `https://t.me/durov`,
                },
              ],
              [{ text: "🎲 Yana tasodifiy", callback_data: "random_movie" }],
            ],
          };

          await bot.editMessageMedia(
            {
              type: "video",
              media: randomMovie.file_id,
              caption: `<b>🎲 Tasodifiy film: ${filmName}</b>\n<b>🆔 Kod: ${randomMovie.id}</b>\n\n${reklamaText}`,
              parse_mode: "HTML",
            },
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              reply_markup: keyboard,
            }
          );
        }
      } else {
        await bot.sendMessage(chatId, "❌ Hozircha kinolar mavjud emas.");
      }
    } else if (data.startsWith("admin_")) {
      // Handle admin callbacks
      await handleAdminCallback(query, data);
    }
  } catch (error) {
    console.error(`Callback query error for user ${userId}:`, error);
  }
}

// Handle admin callbacks
async function handleAdminCallback(query, data) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  const admins = await RedisDB.getAdmins();
  if (!admins.includes(userId)) {
    await bot.sendMessage(chatId, "❌ Sizda admin huquqlari yo'q.");
    return;
  }

  if (data === "admin_stats") {
    const userCount = await RedisDB.getUserCount();
    const movieCount = await RedisDB.getMovieCount();
    const channelCount = (await RedisDB.getMandatoryChannels()).length;

    const statsMessage = `📊 Bot Statistikasi:\n\n👥 Foydalanuvchilar: ${userCount}\n🎬 Kinolar: ${movieCount}\n📢 Kanallar: ${channelCount}`;

    await bot.editMessageText(statsMessage, {
      chat_id: chatId,
      message_id: query.message.message_id,
    });
  }
  // Add more admin handlers as needed
}

// Handle chat join request
async function handleChatJoinRequest(joinRequest) {
  const chatId = joinRequest.chat.id;
  const userId = joinRequest.from.id;

  console.log(`Chat join request from user ${userId} to chat ${chatId}`);

  try {
    await RedisDB.addChannelRequest(chatId, userId);
  } catch (error) {
    console.error(`Chat join request error:`, error);
  }
}

// Handle chat member update
async function handleChatMember(chatMember) {
  console.log(`Chat member update:`, chatMember);
  // Handle member updates if needed
}

// Main handler function
export default async function handler(req, res) {
  console.log(`Request received: ${req.method} ${req.url}`);
  
  try {
    // Initialize Redis connection
    await initRedis();

    if (req.method === "POST") {
      // Handle webhook
      const update = req.body;
      console.log("Webhook update received:", JSON.stringify(update, null, 2));
      
      try {
        // Use direct handler instead of bot.processUpdate
        await handleWebhookUpdate(update);
        console.log("Update processed successfully");
      } catch (processError) {
        console.error("Update processing error:", processError);
        // Xatolikka qaramay 200 qaytarish
      }
      
      res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
    } else if (req.method === "GET") {
      // Health check
      const status = {
        status: "Bot is running",
        timestamp: new Date().toISOString(),
        redis_connected: isRedisConnected,
        bot_token_exists: !!API_KEY,
        webhook_url: WEBHOOK_URL
      };
      
      console.log("Health check:", status);
      res.status(200).json(status);
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Handler global error:", error);
    // Xatolikka qaramay ham 200 qaytarish (Telegram webhook uchun)
    res.status(200).json({ 
      ok: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}