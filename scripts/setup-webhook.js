import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

async function setupWebhook() {
  if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN environment variable is not set');
    return;
  }

  if (!WEBHOOK_URL) {
    console.error('❌ WEBHOOK_URL environment variable is not set');
    return;
  }

  try {
    console.log('🔧 Setting up webhook...');
    console.log('Bot Token:', BOT_TOKEN.slice(0, 10) + '...');
    console.log('Webhook URL:', WEBHOOK_URL);

    // Avval eski webhookni o'chirish
    console.log('🗑️ Deleting existing webhook...');
    const deleteResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`, {
      method: 'POST'
    });
    
    const deleteResult = await deleteResponse.json();
    console.log('Delete result:', deleteResult);

    // Yangi webhook o'rnatish
    console.log('📡 Setting new webhook...');
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `${WEBHOOK_URL}/api/webhook`,
        allowed_updates: ['message', 'callback_query', 'chat_join_request', 'chat_member'],
        drop_pending_updates: true // Eski updatelarni tashlab yuborish
      })
    });

    const result = await response.json();
    console.log('Webhook setup result:', result);

    if (result.ok) {
      console.log('✅ Webhook muvaffaqiyatli o\'rnatildi!');
      
      // Webhook ma'lumotlarini tekshirish
      console.log('🔍 Checking webhook info...');
      const infoResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
      const infoResult = await infoResponse.json();
      console.log('Webhook info:', infoResult.result);
      
    } else {
      console.error('❌ Webhook o\'rnatishda xatolik:', result.description);
    }
  } catch (error) {
    console.error('❌ Webhook o\'rnatishda xatolik:', error);
  }
}

// Bot ma'lumotlarini tekshirish
async function checkBot() {
  try {
    console.log('🤖 Checking bot info...');
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Bot info:', result.result);
    } else {
      console.error('❌ Bot token noto\'g\'ri:', result.description);
    }
  } catch (error) {
    console.error('❌ Bot tekshirishda xatolik:', error);
  }
}

// Asosiy funksiya
async function main() {
  console.log('🚀 Starting webhook setup process...');
  await checkBot();
  await setupWebhook();
  console.log('✨ Setup process completed!');
}

main();