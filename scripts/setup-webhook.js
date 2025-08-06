import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

async function setupWebhook() {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `${WEBHOOK_URL}/api/webhook`,
        allowed_updates: ['message', 'callback_query', 'chat_join_request', 'chat_member']
      })
    });

    const result = await response.json();
    console.log('Webhook setup result:', result);

    if (result.ok) {
      console.log('✅ Webhook muvaffaqiyatli o\'rnatildi!');
    } else {
      console.error('❌ Webhook o\'rnatishda xatolik:', result.description);
    }
  } catch (error) {
    console.error('❌ Webhook o\'rnatishda xatolik:', error);
  }
}

setupWebhook();
