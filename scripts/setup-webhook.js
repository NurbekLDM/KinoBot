// scripts/setup-webhook-improved.js
import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://bugunfilm.vercel.app';

async function checkBot() {
  try {
    console.log('🤖 Bot ma\'lumotlarini tekshirish...');
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Bot:', result.result);
      return true;
    } else {
      console.error('❌ Bot token xato:', result.description);
      return false;
    }
  } catch (error) {
    console.error('❌ Bot tekshirish xatolik:', error);
    return false;
  }
}

async function deleteWebhook() {
  try {
    console.log('🗑️ Eski webhook o\'chirish...');
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`, {
      method: 'POST'
    });
    
    const result = await response.json();
    console.log('Delete result:', result);
    return result.ok;
  } catch (error) {
    console.error('❌ Webhook o\'chirishda xatolik:', error);
    return false;
  }
}

async function setWebhook() {
  try {
    const webhookUrl = `${WEBHOOK_URL}/api/webhook`;
    console.log('📡 Yangi webhook o\'rnatish:', webhookUrl);
    
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: [
          'message', 
          'callback_query', 
          'chat_join_request', 
          'chat_member',
          'edited_message',
          'inline_query',
          'chosen_inline_result'
        ],
        drop_pending_updates: true,
        max_connections: 40,
        secret_token: process.env.WEBHOOK_SECRET // Optional security token
      })
    });

    const result = await response.json();
    console.log('✅ Webhook o\'rnatish natijasi:', result);
    
    if (result.ok) {
      console.log('🎉 Webhook muvaffaqiyatli o\'rnatildi!');
      return true;
    } else {
      console.error('❌ Webhook o\'rnatishda xatolik:', result.description);
      return false;
    }
  } catch (error) {
    console.error('❌ Webhook o\'rnatish xatolik:', error);
    return false;
  }
}

async function getWebhookInfo() {
  try {
    console.log('ℹ️ Webhook ma\'lumotlarini olish...');
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const result = await response.json();
    
    if (result.ok) {
      const info = result.result;
      console.log('📊 Webhook ma\'lumotlari:');
      console.log('  URL:', info.url || 'Yo\'q');
      console.log('  Kutilayotgan updatelar:', info.pending_update_count);
      console.log('  Oxirgi xatolik sanasi:', info.last_error_date ? 
        new Date(info.last_error_date * 1000).toISOString() : 'Yo\'q');
      console.log('  Oxirgi xatolik:', info.last_error_message || 'Yo\'q');
      console.log('  Max ulanishlar:', info.max_connections);
      console.log('  Sertifikat:', info.has_custom_certificate ? 'Bor' : 'Yo\'q');
      console.log('  IP manzil:', info.ip_address || 'Noma\'lum');
      
      // Webhook xatoliklarini tekshirish
      if (info.last_error_message) {
        console.log('⚠️ Oxirgi xatolik:', info.last_error_message);
        
        // Keng tarqalgan xatoliklar uchun yechimlar
        if (info.last_error_message.includes('Wrong response')) {
          console.log('💡 Yechim: Webhook javob formati noto\'g\'ri. API response tekshiring.');
        }
        if (info.last_error_message.includes('SSL')) {
          console.log('💡 Yechim: SSL sertifikat muammosi. HTTPS ishlatganingizga ishonch hosil qiling.');
        }
        if (info.last_error_message.includes('timeout')) {
          console.log('💡 Yechim: Webhook timeout. Javob tezligini oshiring.');
        }
      }
      
      return info;
    } else {
      console.error('❌ Webhook ma\'lumotlarini olishda xatolik:', result.description);
      return null;
    }
  } catch (error) {
    console.error('❌ Webhook info xatolik:', error);
    return null;
  }
}

async function testWebhook() {
  try {
    const webhookUrl = `${WEBHOOK_URL}/api/webhook`;
    console.log('🧪 Webhook test qilish:', webhookUrl);
    
    // GET request test
    const getResponse = await fetch(webhookUrl, {
      method: 'GET',
      timeout: 10000
    });
    
    console.log('GET Response status:', getResponse.status);
    const getResult = await getResponse.json();
    console.log('GET Response:', getResult);
    
    // Test POST request
    const testUpdate = {
      update_id: 999999,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: process.env.OWNER_ID || 123456789, type: 'private' },
        from: { id: process.env.OWNER_ID || 123456789, first_name: 'Test' },
        text: '/start'
      }
    };
    
    const postResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUpdate),
      timeout: 10000
    });
    
    console.log('POST Response status:', postResponse.status);
    const postResult = await postResponse.json();
    console.log('POST Response:', postResult);
    
  } catch (error) {
    console.error('❌ Webhook test xatolik:', error);
    
    // Network xatoliklarini tekshirish
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Webhook server ishlamayapti yoki URL noto\'g\'ri');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('💡 Webhook timeout - server javob bermayapti');
    }
  }
}

async function sendTestMessage() {
  const testChatId = process.env.OWNER_ID;
  if (!testChatId) {
    console.log('ℹ️ OWNER_ID o\'rnatilmagan, test xabar yuborilmaydi');
    return;
  }
  
  try {
    console.log('📤 Test xabar yuborish...');
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: testChatId,
        text: `🧪 Webhook test - ${new Date().toISOString()}\n\n✅ Bot ishlayapti!\n📡 Webhook URL: ${WEBHOOK_URL}/api/webhook\n\n/start buyrug'ini sinab ko'ring!`,
        parse_mode: 'HTML'
      })
    });
    
    const result = await response.json();
    if (result.ok) {
      console.log('✅ Test xabar yuborildi!');
    } else {
      console.error('❌ Test xabar yuborilmadi:', result.description);
    }
  } catch (error) {
    console.error('❌ Test xabar xatolik:', error);
  }
}

async function main() {
  console.log('🚀 Webhook setup script boshlandi\n');
  console.log('BOT_TOKEN:', BOT_TOKEN ? 'Mavjud ✅' : 'Yo\'q ❌');
  console.log('WEBHOOK_URL:', WEBHOOK_URL);
  console.log('');
  
  if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN environment variable o\'rnatilmagan!');
    return;
  }
  
  // 1. Bot tekshirish
  const botOk = await checkBot();
  if (!botOk) return;
  
  console.log('');
  
  // 2. Eski webhook o'chirish
  await deleteWebhook();
  
  console.log('');
  
  // 3. Yangi webhook o'rnatish
  const webhookSet = await setWebhook();
  
  console.log('');
  
  // 4. Webhook ma'lumotlarini tekshirish
  await getWebhookInfo();
  
  console.log('');
  
  // 5. Webhook test qilish
  await testWebhook();
  
  console.log('');
  
  // 6. Test xabar yuborish
  await sendTestMessage();
  
  console.log('\n✨ Setup tugallandi!');
  console.log('\n💡 Keyingi qadamlar:');
  console.log('1. Botga /start xabarini yuboring');
  console.log('2. Agar ishlamasa, Vercel loglarini tekshiring');
  console.log('3. Webhook ma\'lumotlarida xatoliklar borligini tekshiring');
}

main();