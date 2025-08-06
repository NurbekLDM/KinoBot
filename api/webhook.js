require("dotenv").config()
const express = require("express")
const { Telegraf, Markup } = require("telegraf")
const redis = require("redis")
const fs = require("fs-extra")
const path = require("path")
const moment = require("moment")
const rimraf = require("rimraf")
const { v4: uuidv4 } = require("uuid")

// Telegram Bot konfiguratsiyasi
const API_KEY = process.env.BOT_TOKEN
const bot = new Telegraf(API_KEY)

// Bot ma'lumotlari
const idbot = 7359677611
const nurbek = Number.parseInt(process.env.OWNER_ID)
const owners = [nurbek]
const adminUsername = "Nurbek_2255"

// Redis client
let redisClient

// Express server
const app = express()
app.use(express.json())

// Redis ulanishi
async function initRedis() {
  try {
    console.log("Redis ulanish konfiguratsiyasi:")
    console.log("Host:", process.env.REDIS_HOST)
    console.log("Password mavjud:", !!process.env.REDIS_PASSWORD)

    redisClient = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        reconnectDelay: 5000,
        connectTimeout: 10000,
      },
      password: process.env.REDIS_PASSWORD,
    })

    redisClient.on("error", (err) => {
      console.error("Redis xatolik:", err)
    })

    redisClient.on("connect", () => {
      console.log("Redis serverga ulandi")
    })

    redisClient.on("ready", () => {
      console.log("Redis tayyor")
    })

    redisClient.on("reconnecting", () => {
      console.log("Redis qayta ulanmoqda...")
    })

    console.log("Redis ulanishga harakat qilmoqda...")
    await redisClient.connect()
    console.log("Redis muvaffaqiyatli ulandi!")

    await initDefaultData()
  } catch (error) {
    console.error("Redis ulanishida xatolik:", error)
    console.error("Xatolik detallar:", error.message)
    process.exit(1)
  }
}

// Default ma'lumotlarni o'rnatish
async function initDefaultData() {
  try {
    const settingsExists = await redisClient.exists("settings")
    if (!settingsExists) {
      await redisClient.hSet("settings", {
        kino: "0",
        kino2: "0",
        movie_channel: "",
        ads_text: "🎬 Kinolarni bepul tomosha qiling!\n\n📢 Kanalimiz: %kino%\n👨‍💼 Admin: @%admin%",
      })
    }

    const textsExists = await redisClient.exists("texts:start")
    if (!textsExists) {
      await redisClient.set(
        "texts:start",
        "8J+RiyBBc3NhbG9tdSBhbGF5a3VtIHtuYW1lfSAgYm90aW1pemdhIHh1c2gga2VsaWJzaXouCgrinI3wn4+7IEtpbm8ga29kaW5pIHl1Ym9yaW5nLg==",
      )
    }

    console.log("Default ma'lumotlar o'rnatildi")
  } catch (error) {
    console.error("Default ma'lumotlarni o'rnatishda xatolik:", error)
  }
}

// Redis yordamchi funksiyalari
class RedisDB {
  // Foydalanuvchi CRUD operatsiyalari
  static async getUser(userId) {
    try {
      const userData = await redisClient.hGetAll(`user:${userId}`)
      return Object.keys(userData).length > 0 ? userData : null
    } catch (error) {
      console.error("Foydalanuvchini olishda xatolik:", error)
      return null
    }
  }

  static async createUser(userId, data = {}) {
    try {
      const currentTime = moment().format("DD.MM.YYYY | HH:mm")
      const userData = {
        id: userId.toString(),
        step: data.step || "0",
        ban: data.ban || "0",
        lastmsg: data.lastmsg || "start",
        sana: currentTime,
        ...data,
      }
      await redisClient.hSet(`user:${userId}`, userData)
      await redisClient.sAdd("users:all", userId.toString())
      return userData
    } catch (error) {
      console.error("Foydalanuvchi yaratishda xatolik:", error)
      return null
    }
  }

  static async updateUser(userId, updates) {
    try {
      const currentTime = moment().format("DD.MM.YYYY | HH:mm")
      await redisClient.hSet(`user:${userId}`, {
        ...updates,
        sana: currentTime,
      })
    } catch (error) {
      console.error("Foydalanuvchini yangilashda xatolik:", error)
    }
  }

  static async getAllUsers() {
    try {
      const userIds = await redisClient.sMembers("users:all")
      const users = []
      for (const userId of userIds) {
        const userData = await this.getUser(userId)
        if (userData) {
          users.push(userData)
        }
      }
      return users
    } catch (error) {
      console.error("Barcha foydalanuvchilarni olishda xatolik:", error)
      return []
    }
  }

  // Kino CRUD operatsiyalari
  static async addMovie(movieData) {
    try {
      const currentId = (await redisClient.hGet("settings", "kino")) || "0"
      const newId = (Number.parseInt(currentId) + 1).toString()

      const movie = {
        id: newId,
        file_name: movieData.file_name,
        file_id: movieData.file_id,
        film_name: movieData.film_name,
        film_date: moment().format("DD.MM.YYYY"),
        created_at: new Date().toISOString(),
      }

      await redisClient.hSet(`movie:${newId}`, movie)
      await redisClient.sAdd("movies:all", newId)
      await redisClient.hSet("settings", "kino", newId)

      return movie
    } catch (error) {
      console.error("Kino qo'shishda xatolik:", error)
      return null
    }
  }

  static async getMovie(movieId) {
    try {
      const movieData = await redisClient.hGetAll(`movie:${movieId}`)
      return Object.keys(movieData).length > 0 ? movieData : null
    } catch (error) {
      console.error("Kinoni olishda xatolik:", error)
      return null
    }
  }

  static async deleteMovie(movieId) {
    try {
      const exists = await redisClient.exists(`movie:${movieId}`)
      if (exists) {
        await redisClient.del(`movie:${movieId}`)
        await redisClient.sRem("movies:all", movieId)
        const deletedCount = (await redisClient.hGet("settings", "kino2")) || "0"
        await redisClient.hSet("settings", "kino2", (Number.parseInt(deletedCount) + 1).toString())
        return true
      }
      return false
    } catch (error) {
      console.error("Kinoni o'chirishda xatolik:", error)
      return false
    }
  }

  static async getAllMovies() {
    try {
      const movieIds = await redisClient.sMembers("movies:all")
      const movies = []
      for (const movieId of movieIds) {
        const movieData = await this.getMovie(movieId)
        if (movieData) {
          movies.push(movieData)
        }
      }
      return movies.sort((a, b) => Number.parseInt(a.id) - Number.parseInt(b.id))
    } catch (error) {
      console.error("Barcha kinolarni olishda xatolik:", error)
      return []
    }
  }

  static async getMovieCount() {
    try {
      return await redisClient.sCard("movies:all")
    } catch (error) {
      return 0
    }
  }

  // Settings operatsiyalari
  static async getSetting(key) {
    try {
      return await redisClient.hGet("settings", key)
    } catch (error) {
      return null
    }
  }

  static async setSetting(key, value) {
    try {
      await redisClient.hSet("settings", key, value.toString())
    } catch (error) {
      console.error("Sozlamani o'rnatishda xatolik:", error)
    }
  }

  // Kino kanali operatsiyalari
  static async setMovieChannel(channelId) {
    try {
      await redisClient.hSet("settings", "movie_channel", channelId.toString())
      console.log(`Kino kanali o'rnatildi: ${channelId}`)
    } catch (error) {
      console.error("Kino kanalini o'rnatishda xatolik:", error)
      throw error
    }
  }

  static async getMovieChannel() {
    try {
      return await redisClient.hGet("settings", "movie_channel")
    } catch (error) {
      console.error("Kino kanalini olishda xatolik:", error)
      return null
    }
  }

  // Reklama matni operatsiyalari
  static async setAdsText(text) {
    try {
      await redisClient.hSet("settings", "ads_text", text)
      console.log("Reklama matni o'rnatildi")
    } catch (error) {
      console.error("Reklama matnini o'rnatishda xatolik:", error)
      throw error
    }
  }

  static async getAdsText() {
    try {
      const adsText = await redisClient.hGet("settings", "ads_text")
      return adsText || "🎬 Kinolarni bepul tomosha qiling!\n\n📢 Kanalimiz: %kino%\n👨‍💼 Admin: @%admin%"
    } catch (error) {
      console.error("Reklama matnini olishda xatolik:", error)
      return "🎬 Kinolarni bepul tomosha qiling!\n\n📢 Kanalimiz: %kino%\n👨‍💼 Admin: @%admin%"
    }
  }

  // Admin operatsiyalari
  static async addAdmin(adminId) {
    try {
      await redisClient.sAdd("admins:all", adminId.toString())
    } catch (error) {
      console.error("Admin qo'shishda xatolik:", error)
    }
  }

  static async removeAdmin(adminId) {
    try {
      await redisClient.sRem("admins:all", adminId.toString())
    } catch (error) {
      console.error("Adminni o'chirishda xatolik:", error)
    }
  }

  static async getAdmins() {
    try {
      const adminIds = await redisClient.sMembers("admins:all")
      return [...owners, ...adminIds.map((id) => Number.parseInt(id))]
    } catch (error) {
      return owners
    }
  }

  // Kanal operatsiyalari
  static async addChannel(channelId, channelUrl) {
    try {
      await redisClient.sAdd("channels:mandatory", channelId.toString())
      if (channelUrl) {
        await redisClient.hSet("channels:urls", channelId.toString(), channelUrl)
      }
      console.log(`Majburiy kanal qo'shildi: ${channelId}, URL: ${channelUrl}`)
    } catch (error) {
      console.error("Kanal qo'shishda xatolik:", error)
      throw error
    }
  }

  static async removeChannel(channelId) {
    try {
      await redisClient.sRem("channels:mandatory", channelId.toString())
      await redisClient.hDel("channels:urls", channelId.toString())
      await redisClient.del(`channel:requests:${channelId}`)
      console.log(`Majburiy kanal o'chirildi: ${channelId}`)
    } catch (error) {
      console.error("Kanalni o'chirishda xatolik:", error)
      throw error
    }
  }

  static async getMandatoryChannels() {
    try {
      return await redisClient.sMembers("channels:mandatory")
    } catch (error) {
      console.error("Majburiy kanallarni olishda xatolik:", error)
      return []
    }
  }

  static async getChannelUrl(channelId) {
    try {
      return await redisClient.hGet("channels:urls", channelId.toString())
    } catch (error) {
      return null
    }
  }

  static async addChannelRequest(channelId, userId) {
    try {
      await redisClient.sAdd(`channel:requests:${channelId}`, userId.toString())
    } catch (error) {
      console.error("Kanal so'rovini qo'shishda xatolik:", error)
    }
  }

  static async isUserRequested(channelId, userId) {
    try {
      return await redisClient.sIsMember(`channel:requests:${channelId}`, userId.toString())
    } catch (error) {
      return false
    }
  }

  // Zayavka kanallari operatsiyalari
  static async addJoinRequestChannel(channelId, channelUrl) {
    try {
      await redisClient.sAdd("channels:join_request", channelId.toString())
      if (channelUrl) {
        await redisClient.hSet("channels:join_urls", channelId.toString(), channelUrl)
      }
      console.log(`Zayavka kanali qo'shildi: ${channelId}, URL: ${channelUrl}`)
    } catch (error) {
      console.error("Zayavka kanalini qo'shishda xatolik:", error)
      throw error
    }
  }

  static async removeJoinRequestChannel(channelId) {
    try {
      await redisClient.sRem("channels:join_request", channelId.toString())
      await redisClient.hDel("channels:join_urls", channelId.toString())
      await redisClient.del(`channel:requests:${channelId}`)
      console.log(`Zayavka kanali o'chirildi: ${channelId}`)
    } catch (error) {
      console.error("Zayavka kanalini o'chirishda xatolik:", error)
      throw error
    }
  }

  static async getJoinRequestChannels() {
    try {
      return await redisClient.sMembers("channels:join_request")
    } catch (error) {
      console.error("Zayavka kanallarini olishda xatolik:", error)
      return []
    }
  }

  static async getJoinRequestChannelUrl(channelId) {
    try {
      return await redisClient.hGet("channels:join_urls", channelId.toString())
    } catch (error) {
      return null
    }
  }

  // Matn operatsiyalari
  static async getText(textKey) {
    try {
      return await redisClient.get(`texts:${textKey}`)
    } catch (error) {
      return null
    }
  }

  static async setText(textKey, textValue) {
    try {
      await redisClient.set(`texts:${textKey}`, textValue)
    } catch (error) {
      console.error("Matnni o'rnatishda xatolik:", error)
    }
  }
}

// Papka yaratish
async function createDirectories() {
  const tempPath = process.env.NODE_ENV === "production" ? path.join("/tmp", "temp") : path.join(__dirname, "temp")

  await fs.ensureDir(tempPath)
  console.log(`Temp directory ready at: ${tempPath}`)
  return tempPath
}

// Papkani o'chirish funksiyasi
async function deleteFolder(folderPath) {
  try {
    await rimraf.rimraf(folderPath)
    return true
  } catch (error) {
    console.error("Papka o'chirishda xatolik:", error)
    return false
  }
}

// Foydalanuvchi ismini olish
async function getName(id) {
  try {
    const chat = await bot.telegram.getChat(id)
    return chat.first_name || chat.title || "User"
  } catch (error) {
    return "User"
  }
}

// Kanal admin tekshirish
async function getAdmin(chatId) {
  try {
    await bot.telegram.getChatAdministrators(chatId)
    return true
  } catch (error) {
    return false
  }
}

// Majburiy obuna tekshirish
async function joinchat(userId) {
  try {
    const mandatoryChannels = await RedisDB.getMandatoryChannels()
    const joinRequestChannels = await RedisDB.getJoinRequestChannels()
    const allChannels = [...mandatoryChannels, ...joinRequestChannels]

    if (allChannels.length === 0) return true

    let uns = false
    const inlineKeyboard = []

    // Majburiy kanallarni tekshirish
    for (const channelId of mandatoryChannels) {
      try {
        const url = await RedisDB.getChannelUrl(channelId)
        const chat = await bot.telegram.getChat(channelId)
        const chatMember = await bot.telegram.getChatMember(channelId, userId)

        let status = chatMember.status
        if (status === "left") {
          const isRequested = await RedisDB.isUserRequested(channelId, userId)
          if (isRequested) {
            status = "member"
          }
        }

        if (["creator", "administrator", "member"].includes(status)) {
          inlineKeyboard.push([
            {
              text: `✅ ${chat.title}`,
              url: url || `https://t.me/${chat.username || "durov"}`,
            },
          ])
        } else {
          inlineKeyboard.push([
            {
              text: `❌ ${chat.title}`,
              url: url || `https://t.me/${chat.username || "durov"}`,
            },
          ])
          uns = true
        }
      } catch (error) {
        console.error("Majburiy kanal tekshirishda xatolik:", error)
        uns = true
      }
    }

    // Zayavka kanallarni tekshirish
    for (const channelId of joinRequestChannels) {
      try {
        const url = await RedisDB.getJoinRequestChannelUrl(channelId)
        const chat = await bot.telegram.getChat(channelId)
        const chatMember = await bot.telegram.getChatMember(channelId, userId)

        let status = chatMember.status
        if (status === "left") {
          const isRequested = await RedisDB.isUserRequested(channelId, userId)
          if (isRequested) {
            status = "member"
          }
        }

        if (["creator", "administrator", "member"].includes(status)) {
          inlineKeyboard.push([
            {
              text: `✅ ${chat.title}`,
              url: url || `https://t.me/${chat.username || "durov"}`,
            },
          ])
        } else {
          inlineKeyboard.push([
            {
              text: `❌ ${chat.title} (Zayavka yuborish)`,
              url: url || `https://t.me/${chat.username || "durov"}`,
            },
          ])
          uns = true
        }
      } catch (error) {
        console.error("Zayavka kanal tekshirishda xatolik:", error)
        uns = true
      }
    }

    if (uns) {
      inlineKeyboard.push([
        {
          text: "✅ Tekshirish",
          callback_data: "check",
        },
      ])

      await bot.telegram.sendMessage(
        userId,
        "❌ <b>Botdan to'liq foydalanish uchun quyidagi kanallarimizga obuna bo'ling!</b>",
        {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: inlineKeyboard },
        },
      )
      return false
    }

    return true
  } catch (error) {
    console.error("Joinchat funksiyasida xatolik:", error)
    return true
  }
}

// Keyboard yaratish
function createKeyboard(buttons) {
  return Markup.keyboard(buttons).resize()
}

// Admin paneli
const panel = createKeyboard([
  [{ text: "📊 Statistika" }],
  [{ text: "🎬 Kino qo'shish" }, { text: "🗑️ Kino o'chirish" }],
  [{ text: "👨‍💼 Adminlar" }, { text: "💬 Kanallar" }],
  [{ text: "🔴 Blocklash" }, { text: "🟢 Blockdan olish" }],
  [{ text: "✍️ Post xabar" }, { text: "📬 Forward xabar" }],
  [{ text: "⬇️ Panelni Yopish" }],
])

const cancel = createKeyboard([[{ text: "◀️ Orqaga" }]])

const kanallar_p = createKeyboard([
  [{ text: "🔷 Majburiy kanal qo'shish" }, { text: "🔶 Majburiy kanal o'chirish" }],
  [{ text: "📝 Zayavka kanal qo'shish" }, { text: "🗑️ Zayavka kanal o'chirish" }],
  [{ text: "💡 Kino kodlari kanali" }, { text: "📈 Reklama matni" }],
  [{ text: "🟩 Majburiy kanallar ro'yxati" }, { text: "📋 Zayavka kanallari ro'yxati" }],
  [{ text: "◀️ Orqaga" }],
])

const removeKey = Markup.removeKeyboard()

// /start komandasi
bot.start(async (ctx) => {
  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const name = ctx.from.first_name

  if (ctx.chat.type !== "private") return

  let user = await RedisDB.getUser(userId)
  if (user && user.ban === "1") return

  if (!user) {
    user = await RedisDB.createUser(userId)
  } else {
    await RedisDB.updateUser(userId, { lastmsg: "start", step: "0" })
  }

  if (!(await joinchat(userId))) return

  try {
    const kino_id = await RedisDB.getMovieChannel()
    let kino = ""
    let kinoUrl = ""

    if (kino_id) {
      try {
        const chat = await bot.telegram.getChat(kino_id)
        if (chat.username) {
          kino = chat.username
          kinoUrl = `https://t.me/${kino}`
        } else {
          kino = chat.title || "Kino Kanali"
          kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`
        }
      } catch (error) {
        console.error("Kino kanal ma'lumotlarini olishda xatolik:", error)
        kino = ""
        kinoUrl = ""
      }
    }

    const startTextBase64 = await RedisDB.getText("start")
    const startText = startTextBase64 ? Buffer.from(startTextBase64, "base64").toString() : "Salom!"
    const currentTime = moment().format("DD.MM.YYYY | HH:mm")

    const message = startText
      .replace("{name}", `<a href="tg://user?id=${userId}">${name}</a>`)
      .replace("{time}", currentTime)

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url("🔎 Kodlarni qidirish", kinoUrl || `https://t.me/durov`)],
      [Markup.button.callback("🎲 Tasodifiy kino", "random_movie")],
    ])

    await ctx.replyWithHTML(message, keyboard)
  } catch (error) {
    console.error("/start komandasi xatolik:", error)
  }
})

// /dev komandasi
bot.command("dev", async (ctx) => {
  const chatId = ctx.chat.id
  const userId = ctx.from.id

  if (!(await joinchat(userId))) return

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url("👨‍💻 Bot dasturchisi", "https://t.me/alimov_ak")],
    [Markup.button.url("🔁 Boshqa botlar", "https://t.me/alimov_ak")],
  ])

  await ctx.replyWithHTML(
    "👨‍💻 <b>Botimiz dasturchisi: @alimov_ak</b>\n\n<i>🤖 Sizga ham shu kabi botlar kerak bo'lsa bizga buyurtma berishingiz mumkin. Sifatli botlar tuzib beramiz.</i>\n\n<b>📊 Na'munalar:</b> @alimov_ak",
    keyboard,
  )
})

// /help komandasi
bot.command("help", async (ctx) => {
  const chatId = ctx.chat.id
  const userId = ctx.from.id

  if (!(await joinchat(userId))) return

  const kino_id = await RedisDB.getMovieChannel()
  let kino = ""
  let kinoUrl = ""

  if (kino_id) {
    try {
      const chat = await bot.telegram.getChat(kino_id)
      if (chat.username) {
        kino = chat.username
        kinoUrl = `https://t.me/${kino}`
      } else {
        kino = chat.title || "Kino Kanali"
        kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`
      }
    } catch (error) {
      console.error("Kino kanal ma'lumotlarini olishda xatolik:", error)
      kino = ""
      kinoUrl = ""
    }
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url("🔎 Kino kodlarini qidirish", kinoUrl || `https://t.me/durov`)],
  ])

  await ctx.replyWithHTML(
    "<b>📊 Botimiz buyruqlari:</b>\n/start - Botni yangilash ♻️\n/rand - Tasodifiy film 🍿\n/dev - Bot dasturchisi 👨‍💻\n/help - Bot buyruqlari 🔁\n\n<b>🤖 Ushbu bot orqali kinolarni osongina qidirib topishingiz va yuklab olishingiz mumkin. Kinoni yuklash uchun kino kodini yuborishingiz kerak. Barcha kino kodlari pastdagi kanalda jamlangan.</b>",
    keyboard,
  )
})

// /rand komandasi
bot.command("rand", async (ctx) => {
  const chatId = ctx.chat.id
  const userId = ctx.from.id

  if (ctx.chat.type !== "private") return

  const user = await RedisDB.getUser(userId)
  if (user && user.ban === "1") return

  if (!(await joinchat(userId))) return

  try {
    const movieCount = await RedisDB.getMovieCount()
    if (movieCount === 0) {
      await ctx.replyWithHTML("<b>📛 Hozircha kinolar mavjud emas!</b>")
      return
    }

    const randomId = Math.floor(Math.random() * movieCount) + 1
    const movie = await RedisDB.getMovie(randomId.toString())

    if (movie) {
      const filmName = Buffer.from(movie.film_name, "base64").toString()
      const reklama = await RedisDB.getAdsText()
      const bot_username = (await bot.telegram.getMe()).username

      const kino_id = await RedisDB.getMovieChannel()
      let kino = ""
      let kinoUrl = ""

      if (kino_id) {
        try {
          const chat = await bot.telegram.getChat(kino_id)
          if (chat.username) {
            kino = chat.username
            kinoUrl = `https://t.me/${kino}`
          } else {
            kino = chat.title || "Kino Kanali"
            kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`
          }
        } catch (error) {
          console.error("Kino kanal ma'lumotlarini olishda xatolik:", error)
          kino = ""
          kinoUrl = ""
        }
      }

      const reklamaText = reklama.replace("%kino%", kino).replace("%admin%", adminUsername)

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.url(
            "↗️ Do'stlarga ulashish",
            `https://t.me/share/url/?url=https://t.me/${bot_username}?start=${randomId}`,
          ),
        ],
        [Markup.button.url("🔎 Boshqa kodlar", kinoUrl || `https://t.me/durov`)],
        [Markup.button.callback("🎲 Yana tasodifiy", "random_movie")],
      ])

      await ctx.replyWithVideo(movie.file_id, {
        caption: `<b>🎲 Tasodifiy film: ${filmName}</b>\n<b>🆔 Kod: ${randomId}</b>\n\n${reklamaText}`,
        parse_mode: "HTML",
        ...keyboard,
      })
    } else {
      await ctx.replyWithHTML("<b>📛 Tasodifiy kino topilmadi!</b>")
    }
  } catch (error) {
    console.error("Tasodifiy kino olishda xatolik:", error)
    await ctx.reply("⚠️ Tasodifiy kino olishda xatolik yuz berdi!")
  }
})

// Admin panel
bot.command(["panel", "a", "admin", "p"], async (ctx) => {
  const chatId = ctx.chat.id
  const userId = ctx.from.id

  const admins = await RedisDB.getAdmins()
  if (!admins.includes(userId)) return

  await ctx.replyWithHTML("<b>👨🏻‍💻 Boshqaruv paneliga xush kelibsiz.</b>\n\n<i>Nimani o'zgartiramiz?</i>", panel)

  await RedisDB.updateUser(userId, { lastmsg: "panel", step: "0" })
})

// Callback query ishlovchisi
bot.on("callback_query", async (ctx) => {
  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const data = ctx.callbackQuery.data
  const messageId = ctx.callbackQuery.message.message_id

  try {
    if (data === "check") {
      await ctx.deleteMessage(messageId)

      if (await joinchat(userId)) {
        const kino_id = await RedisDB.getMovieChannel()
        let kino = ""
        let kinoUrl = ""

        if (kino_id) {
          try {
            const chat = await bot.telegram.getChat(kino_id)
            if (chat.username) {
              kino = chat.username
              kinoUrl = `https://t.me/${kino}`
            } else {
              kino = chat.title || "Kino Kanali"
              kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`
            }
          } catch (error) {
            console.error("Kino kanal ma'lumotlarini olishda xatolik:", error)
            kino = ""
            kinoUrl = ""
          }
        }

        const startTextBase64 = await RedisDB.getText("start")
        const startText = startTextBase64 ? Buffer.from(startTextBase64, "base64").toString() : "Salom!"
        const currentTime = moment().format("DD.MM.YYYY | HH:mm")
        const name = ctx.from.first_name

        const message = startText
          .replace("{name}", `<a href="tg://user?id=${userId}">${name}</a>`)
          .replace("{time}", currentTime)

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.url("🔎 Kodlarni qidirish", kinoUrl || `https://t.me/durov`)],
          [Markup.button.callback("🎲 Tasodifiy kino", "random_movie")],
        ])

        await ctx.replyWithHTML(message, keyboard)
        await RedisDB.updateUser(userId, { lastmsg: "start", step: "0" })
      }
    }

    // Admin callback query lar
    const admins = await RedisDB.getAdmins()
    if (!admins.includes(userId) && !data.startsWith("random_movie") && data !== "check") {
      await ctx.answerCbQuery("Ruxsat rad etildi!")
      return
    }

    // Tasodifiy kino callback
    if (data === "random_movie") {
      try {
        const movieCount = await RedisDB.getMovieCount()
        if (movieCount === 0) {
          await ctx.answerCbQuery("Kinolar mavjud emas!")
          return
        }

        const randomId = Math.floor(Math.random() * movieCount) + 1
        const movie = await RedisDB.getMovie(randomId.toString())

        if (movie) {
          const filmName = Buffer.from(movie.film_name, "base64").toString()
          const reklama = await RedisDB.getAdsText()
          const bot_username = (await bot.telegram.getMe()).username

          const kino_id = await RedisDB.getMovieChannel()
          let kino = ""
          let kinoUrl = ""

          if (kino_id) {
            try {
              const chat = await bot.telegram.getChat(kino_id)
              if (chat.username) {
                kino = chat.username
                kinoUrl = `https://t.me/${kino}`
              } else {
                kino = chat.title || "Kino Kanali"
                kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`
              }
            } catch (error) {
              console.error("Kino kanal ma'lumotlarini olishda xatolik:", error)
              kino = ""
              kinoUrl = ""
            }
          }

          const reklamaText = reklama.replace("%kino%", kino).replace("%admin%", adminUsername)

          const keyboard = Markup.inlineKeyboard([
            [
              Markup.button.url(
                "↗️ Do'stlarga ulashish",
                `https://t.me/share/url/?url=https://t.me/${bot_username}?start=${randomId}`,
              ),
            ],
            [Markup.button.url("🔎 Boshqa kodlar", kinoUrl || `https://t.me/durov`)],
            [Markup.button.callback("🎲 Yana tasodifiy", "random_movie")],
          ])

          await ctx.editMessageMedia(
            {
              type: "video",
              media: movie.file_id,
              caption: `<b>🎲 Tasodifiy film: ${filmName}</b>\n<b>🆔 Kod: ${randomId}</b>\n\n${reklamaText}`,
              parse_mode: "HTML",
            },
            keyboard,
          )

          await ctx.answerCbQuery(`🎲 Yangi tasodifiy film: ${filmName}`)
        } else {
          await ctx.answerCbQuery("Tasodifiy kino topilmadi!")
        }
      } catch (error) {
        console.error("Tasodifiy kino callback xatolik:", error)
        await ctx.answerCbQuery("Xatolik yuz berdi!")
      }
    }

    // Kanalga kino yuborish callback
    if (data.startsWith("channel_")) {
      try {
        const tempId = data.replace("channel_", "")
        const filmData = await redisClient.hGetAll(`film:${tempId}`)
        const fileId = filmData.file_id
        const fileName = Buffer.from(filmData.file_name, "base64").toString()
        const caption = Buffer.from(filmData.caption, "base64").toString()

        const movieData = {
          file_name: fileName,
          file_id: fileId,
          film_name: Buffer.from(caption).toString("base64"),
        }

        const movie = await RedisDB.addMovie(movieData)

        if (movie) {
          const kino_id = await RedisDB.getMovieChannel()
          if (kino_id) {
            try {
              const reklama = await RedisDB.getAdsText()
              const bot_username = (await bot.telegram.getMe()).username
              const chat = await bot.telegram.getChat(kino_id)

              let kino = ""
              if (chat.username) {
                kino = chat.username
              } else {
                kino = chat.title || "Kino Kanali"
              }

              const reklamaText = reklama.replace("%kino%", kino).replace("%admin%", adminUsername)

              const keyboard = Markup.inlineKeyboard([
                [Markup.button.url("📥 Kinoni yuklash", `https://t.me/${bot_username}?start=${movie.id}`)],
              ])

              await bot.telegram.sendVideo(kino_id, fileId, {
                caption: `<b>${caption}</b>\n\n<b>🆔 Kod: ${movie.id}</b>\n\n${reklamaText}`,
                parse_mode: "HTML",
                ...keyboard,
              })

              await ctx.editMessageCaption(
                `<b>✅ Kino muvaffaqiyatli qo'shildi va kanalga yuborildi!</b>\n\n🎬 Film: ${caption}\n🆔 Kod: ${movie.id}`,
                { parse_mode: "HTML" },
              )
            } catch (channelError) {
              await ctx.editMessageCaption(
                `<b>✅ Kino bazaga qo'shildi!</b>\n<b>⚠️ Lekin kanalga yuborishda xatolik yuz berdi!</b>\n\n🎬 Film: ${caption}\n🆔 Kod: ${movie.id}`,
                { parse_mode: "HTML" },
              )
            }
          } else {
            await ctx.editMessageCaption(
              `<b>✅ Kino bazaga qo'shildi!</b>\n<b>⚠️ Kino kanal sozlanmagan!</b>\n\n🎬 Film: ${caption}\n🆔 Kod: ${movie.id}`,
              { parse_mode: "HTML" },
            )
          }

          // Temp fayllarni o'chirish
          try {
            await redisClient.del(`film:${tempId}`)
          } catch (cleanupError) {
            console.error("Temp fayllarni o'chirishda xatolik:", cleanupError)
          }

          await ctx.answerCbQuery("✅ Kino qo'shildi!")
        } else {
          await ctx.answerCbQuery("❌ Kinoni qo'shishda xatolik!")
        }
      } catch (error) {
        console.error("Kanalga kino yuborish xatolik:", error)
        await ctx.answerCbQuery("❌ Xatolik yuz berdi!")
      }
    }

    await ctx.answerCbQuery()
  } catch (error) {
    console.error("Callback query ishlov berish xatolik:", error)
    await ctx.answerCbQuery("Xatolik yuz berdi!")
  }
})

// Xabar ishlovchisi
bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const text = ctx.message.text

  if (ctx.chat.type !== "private") return

  const user = await RedisDB.getUser(userId)
  if (user && user.ban === "1") return

  if (!user) {
    await RedisDB.createUser(userId)
  }

  const admins = await RedisDB.getAdmins()
  const isAdmin = admins.includes(userId)

  // Kino kodi qidirish
  if (user && user.lastmsg === "start" && text && !text.startsWith("/")) {
    let searchCode = text

    if (text.startsWith("/start ")) {
      searchCode = text.split(" ")[1]
    }

    if (text === "/rand") {
      const movieCount = await RedisDB.getMovieCount()
      if (movieCount > 0) {
        searchCode = Math.floor(Math.random() * movieCount) + 1
      }
    }

    if (!(await joinchat(userId))) return

    if (!isNaN(searchCode)) {
      try {
        const movie = await RedisDB.getMovie(searchCode)
        if (movie) {
          const filmName = Buffer.from(movie.film_name, "base64").toString()
          const reklama = await RedisDB.getAdsText()
          const bot_username = (await bot.telegram.getMe()).username

          const kino_id = await RedisDB.getMovieChannel()
          let kino = ""
          let kinoUrl = ""

          if (kino_id) {
            try {
              const chat = await bot.telegram.getChat(kino_id)
              if (chat.username) {
                kino = chat.username
                kinoUrl = `https://t.me/${kino}`
              } else {
                kino = chat.title || "Kino Kanali"
                kinoUrl = `https://t.me/c/${Math.abs(kino_id).toString().slice(4)}`
              }
            } catch (error) {
              console.error("Kino kanal ma'lumotlarini olishda xatolik:", error)
              kino = ""
              kinoUrl = ""
            }
          }

          const reklamaText = reklama.replace("%kino%", kino).replace("%admin%", adminUsername)

          const keyboard = Markup.inlineKeyboard([
            [
              Markup.button.url(
                "↗️ Do'stlarga ulashish",
                `https://t.me/share/url/?url=https://t.me/${bot_username}?start=${searchCode}`,
              ),
            ],
            [Markup.button.url("🔎 Boshqa kodlar", kinoUrl || `https://t.me/durov`)],
          ])

          await ctx.replyWithVideo(movie.file_id, {
            caption: `<b>${filmName}</b>\n\n${reklamaText}`,
            parse_mode: "HTML",
            ...keyboard,
          })
        } else {
          await ctx.replyWithHTML(`📛 ${searchCode} <b>kodli kino mavjud emas!</b>`)
        }
      } catch (error) {
        console.error("Kino qidirishda xatolik:", error)
        await ctx.reply("⚠️ Kino qidirishda xatolik yuz berdi!")
      }
    } else {
      await ctx.replyWithHTML("<b>📛 Faqat raqamlardan foydalaning!</b>")
    }
    return
  }

  // Admin komandalarini ishlov berish
  if (isAdmin) {
    await handleAdminCommands(ctx, user)
  }
})

// Video ishlovchisi
bot.on("video", async (ctx) => {
  const userId = ctx.from.id
  const user = await RedisDB.getUser(userId)
  const admins = await RedisDB.getAdmins()

  if (!admins.includes(userId)) return
  if (!user || user.step !== "movie") return

  const tempId = uuidv4()
  await redisClient.hSet(`film:${tempId}`, {
    file_id: ctx.message.video.file_id,
    file_name: Buffer.from(ctx.message.video.file_name || "video").toString("base64"),
  })

  await ctx.replyWithHTML("<b>🎬 Kino ma'lumotini yuboring:</b>", cancel)
  await RedisDB.updateUser(userId, { step: "caption", temp_id: tempId })
})

// Admin komandalarini ishlov berish
async function handleAdminCommands(ctx, user) {
  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const text = ctx.message.text
  const step = user ? user.step : "0"

  switch (text) {
    case "◀️ Orqaga":
      await ctx.replyWithHTML("<b>👨🏻‍💻 Boshqaruv paneliga xush kelibsiz.</b>\n\n<i>Nimani o'zgartiramiz?</i>", panel)
      await RedisDB.updateUser(userId, { lastmsg: "panel", step: "0" })
      break

    case "⬇️ Panelni Yopish":
      await ctx.replyWithHTML(
        "<b>🚪 Panelni tark etdingiz unga /panel yoki /admin xabarini yuborib kirishingiz mumkin.\n\nYangilash /start</b>",
        removeKey,
      )
      await RedisDB.updateUser(userId, { lastmsg: "start", step: "0" })
      break

    case "🎬 Kino qo'shish":
      await ctx.replyWithHTML("<b>🎬 Kinoni yuboring:</b>", cancel)
      await RedisDB.updateUser(userId, { step: "movie" })
      break

    case "🗑️ Kino o'chirish":
      await ctx.replyWithHTML("<b>🗑️ Kino o'chirish uchun menga kino kodini yuboring:</b>", cancel)
      await RedisDB.updateUser(userId, {
        lastmsg: "deleteMovie",
        step: "movie-remove",
      })
      break

    case "📊 Statistika":
      await handleStatistics(ctx)
      break

    case "💬 Kanallar":
      await ctx.replyWithHTML(`<b>🔰 Kanallar bo'limi:\n🆔 Admin: ${userId}</b>`, kanallar_p)
      await RedisDB.updateUser(userId, { lastmsg: "channels" })
      break

    case "👨‍💼 Adminlar":
      await handleAdminPanel(ctx, userId)
      break

    default:
      // Step-based ishlov berish
      await handleStepBasedCommands(ctx, user)
  }
}

// Statistika
async function handleStatistics(ctx) {
  try {
    const allUsers = await RedisDB.getAllUsers()
    const totalUsers = allUsers.length
    const leftUsers = allUsers.filter((user) => user.sana === "tark").length
    const activeUsers = totalUsers - leftUsers
    const movieCount = await RedisDB.getMovieCount()
    const totalMoviesAdded = (await RedisDB.getSetting("kino")) || "0"
    const deletedMovies = (await RedisDB.getSetting("kino2")) || "0"
    const uptime = process.uptime()

    const statsMessage = `💡 <b>Server ishlash vaqti:</b> <code>${Math.floor(
      uptime / 3600,
    )}h ${Math.floor((uptime % 3600) / 60)}m</code>

• <b>Jami a'zolar:</b> ${totalUsers} ta
• <b>Tark etgan a'zolar:</b> ${leftUsers} ta
• <b>Faol a'zolar:</b> ${activeUsers} ta

—————————————

• <b>Faol kinolar:</b> ${movieCount} ta
• <b>O'chirilgan kinolar:</b> ${deletedMovies} ta
• <b>Barcha kinolar:</b> ${totalMoviesAdded} ta`

    await ctx.replyWithHTML(statsMessage)
  } catch (error) {
    console.error("Statistika olishda xatolik:", error)
    await ctx.reply("⚠️ Statistika olishda xatolik yuz berdi!")
  }
}

// Admin panel
async function handleAdminPanel(ctx, userId) {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("➕ Yangi admin qo'shish", "add-admin")],
    [Markup.button.callback("📑 Ro'yxat", "list-admin"), Markup.button.callback("🗑 O'chirish", "remove-admin")],
  ])

  await ctx.replyWithHTML("👇🏻 <b>Quyidagilardan birini tanlang:</b>", keyboard)
  await RedisDB.updateUser(userId, { lastmsg: "admins" })
}

// Step-based komandalarni ishlov berish
async function handleStepBasedCommands(ctx, user) {
  const chatId = ctx.chat.id
  const userId = ctx.from.id
  const text = ctx.message.text
  const step = user ? user.step : "0"

  // Caption qo'shish
  if (step === "caption" && text && text !== "🎬 Kino qo'shish") {
    const tempId = user.temp_id

    // Caption ni redisga yozamiz
    await redisClient.hSet(`film:${tempId}`, {
      caption: Buffer.from(text).toString("base64"),
    })

    // Redisdan malumotlarni o'qib olamiz
    const filmData = await redisClient.hGetAll(`film:${tempId}`)
    const fileId = filmData.file_id
    const reklama = await RedisDB.getAdsText()

    const keyboard = Markup.inlineKeyboard([[Markup.button.callback("🎞️ Kanalga yuborish", `channel_${tempId}`)]])

    await ctx.replyWithVideo(fileId, {
      caption: `<b>${text}</b>\n\n<b>${reklama}</b>`,
      parse_mode: "HTML",
      ...keyboard,
    })

    await RedisDB.updateUser(userId, { step: "0" })
  }

  // Kino o'chirish
  if (step === "movie-remove" && text && text !== "🗑️ Kino o'chirish") {
    const movie = await RedisDB.getMovie(text)
    if (movie) {
      const deleted = await RedisDB.deleteMovie(text)
      if (deleted) {
        await ctx.replyWithHTML(`🗑️ ${text} <b>raqamli kino olib tashlandi!</b>`)
      } else {
        await ctx.reply("⚠️ Kinoni o'chirishda xatolik yuz berdi!")
      }
    } else {
      await ctx.replyWithHTML(`📛 ${text} <b>mavjud emas!</b>\n\n🔄 Qayta urinib ko'ring:`)
      return
    }
    await RedisDB.updateUser(userId, { step: "0" })
  }
}

// Chat join request ishlovchisi
bot.on("chat_join_request", async (ctx) => {
  const chatId = ctx.chatJoinRequest.chat.id
  const userId = ctx.chatJoinRequest.from.id

  try {
    await RedisDB.addChannelRequest(chatId, userId)
  } catch (error) {
    console.error("Chat join request ishlov berish xatolik:", error)
  }
})

// Chat member update ishlovchisi
bot.on("chat_member", async (ctx) => {
  if (ctx.chatMember.new_chat_member && ctx.chatMember.new_chat_member.status === "kicked") {
    await RedisDB.updateUser(ctx.chatMember.from.id, { sana: "tark" })
  }
})

// Server ishga tushirish
async function startServer() {
  await createDirectories()
  await initRedis()

  console.log("Telegram bot ishga tushdi...")

  // Webhook setup
  if (process.env.NODE_ENV === "production") {
    const webhookUrl = `${process.env.WEBHOOK_URL}/webhook`
    await bot.telegram.setWebhook(webhookUrl)
    console.log(`Webhook o'rnatildi: ${webhookUrl}`)

    // Express webhook endpoint
    app.use(bot.webhookCallback("/webhook"))
  } else {
    // Development uchun polling
    bot.launch()
    console.log("Bot polling rejimida ishlamoqda")
  }

  const PORT = process.env.PORT || 3000
  app.listen(PORT, () => {
    console.log(`Server ${PORT} portda ishlamoqda`)
  })
}

// Xatoliklarni ushlash
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error)
})

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error)
})

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Bot to'xtatilmoqda...")
  if (redisClient) {
    await redisClient.quit()
  }
  bot.stop()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.log("Bot to'xtatilmoqda...")
  if (redisClient) {
    await redisClient.quit()
  }
  bot.stop()
  process.exit(0)
})

startServer().catch(console.error)

module.exports = app
