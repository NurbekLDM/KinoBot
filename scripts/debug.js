import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

async function debugBot() {
  console.log('🐛 Bot Debug Ma\'lumotlari');
  console.log('========================');
  
  // Environment variables
  console.log('📋 Environment Variables:');
  console.log('BOT_TOKEN:', BOT_TOKEN ? 'Set ✅' : 'Not set ❌');
  console.log('WEBHOOK_URL:', WEBHOOK_URL ? WEBHOOK_URL : 'Not set ❌');
  console.log('REDIS_HOST:', process.env.REDIS_HOST ? 'Set ✅' : 'Not set ❌');
  console.log('REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? 'Set ✅' : 'Not set ❌');
  console.log('OWNER_ID:', process.env.OWNER_ID ? process.env.OWNER_ID : 'Not set ❌');
  console.log('');
  
  if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN mavjud emas!');
    return;
  }
  
  try {
    // Bot ma'lumotlari
    console.log('🤖 Bot Ma\'lumotlari:');
    const botResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const botResult = await botResponse.json();
    
    if (botResult.ok) {
      console.log('✅ Bot ismi:', botResult.result.first_name);
      console.log('✅ Bot username:', '@' + botResult.result.username);
      console.log('✅ Bot ID:', botResult.result.id);
    } else {
      console.error('❌ Bot token noto\'g\'ri:', botResult.description);
      return;
    }
    console.log('');
    
    // Webhook ma'lumotlari
    console.log('📡 Webhook Ma\'lumotlari:');
    const webhookResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const webhookResult = await webhookResponse.json();
    
    if (webhookResult.ok) {
      const info = webhookResult.result;
      console.log('✅ Webhook URL:', info.url || 'Not set ❌');
      console.log('✅ Has custom certificate:', info.has_custom_certificate ? 'Yes' : 'No');
      console.log('✅ Pending update count:', info.pending_update_count);
      console.log('✅ Last error date:', info.last_error_date ? new Date(info.last_error_date * 1000) : 'None');
      console.log('✅ Last error message:', info.last_error_message || 'None');
      console.log('✅ Max connections:', info.max_connections);
      console.log('✅ Allowed updates:', info.allowed_updates?.join(', ') || 'All');
    }
    console.log('');
    
    // Test webhook
    if (WEBHOOK_URL) {
      console.log('🧪 Webhook Test:');
      try {
        const testResponse = await fetch(`${WEBHOOK_URL}/api/webhook`, {
          method: 'GET',
          timeout: 10000
        });
        const testResult = await testResponse.json();
        console.log('✅ Webhook javob:', testResult);
      } catch (error) {
        console.error('❌ Webhook test failed:', error.message);
      }
    }
    console.log('');
    
    // Updates olish (polling)
    console.log('📨 Oxirgi Updatelar:');
    const updatesResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=5`);
    const updatesResult = await updatesResponse.json();
    
    if (updatesResult.ok) {
      if (updatesResult.result.length > 0) {
        console.log('✅ Oxirgi updatelar soni:', updatesResult.result.length);
        updatesResult.result.forEach((update, index) => {
          console.log(`Update ${index + 1}:`, {
            update_id: update.update_id,
            message: update.message ? 'Message received' : 'No message',
            callback_query: update.callback_query ? 'Callback received' : 'No callback',
            date: update.message ? new Date(update.message.date * 1000) : 'N/A'
          });
        });
      } else {
        console.log('ℹ️ Hech qanday update mavjud emas');
      }
    }
    console.log('');
    
    // Test message yuborish
    const testChatId = process.env.OWNER_ID;
    if (testChatId) {
      console.log('📤 Test xabar yuborish:');
      try {
        const testMsgResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: testChatId,
            text: `🧪 Debug test - ${new Date().toISOString()}\n\n✅ Bot ishlayapti!\n📡 Webhook: ${WEBHOOK_URL ? 'O\'rnatilgan' : 'O\'rnatilmagan'}`
          })
        });
        
        const testMsgResult = await testMsgResponse.json();
        if (testMsgResult.ok) {
          console.log('✅ Test xabar yuborildi!');
        } else {
          console.error('❌ Test xabar yuborilmadi:', testMsgResult.description);
        }
      } catch (error) {
        console.error('❌ Test xabar xatolik:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Debug jarayonida xatolik:', error);
  }
}

// Redis test
async function testRedis() {
  console.log('🔴 Redis Test:');
  
  if (!process.env.REDIS_HOST) {
    console.error('❌ Redis host mavjud emas!');
    return;
  }
  
  try {
    const redis = await import('redis');
    const client = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT) || 6379,
        connectTimeout: 10000,
        tls: process.env.REDIS_TLS === 'true'
      },
      password: process.env.REDIS_PASSWORD,
    });
    
    await client.connect();
    console.log('✅ Redis ulanish muvaffaqiyatli!');
    
    // Test key yozish
    await client.set('test_key', 'test_value');
    const value = await client.get('test_key');
    console.log('✅ Redis test:', value === 'test_value' ? 'Muvaffaqiyatli' : 'Xatolik');
    
    await client.del('test_key');
    await client.disconnect();
    
  } catch (error) {
    console.error('❌ Redis test xatolik:', error.message);
  }
}

// Asosiy funksiya
async function main() {
  console.log('🚀 Debug Script Boshlandi\n');
  
  await debugBot();
  await testRedis();
  
  console.log('\n✨ Debug tugallandi!');
  console.log('\n💡 Agar muammolar bo\'lsa:');
  console.log('1. Environment variables to\'g\'ri o\'rnatilganini tekshiring');
  console.log('2. Bot token to\'g\'ri va faolligini tekshiring');
  console.log('3. Webhook URL to\'g\'ri va erisha olishni tekshiring');
  console.log('4. Redis ma\'lumotlari to\'g\'ri ekanligini tekshiring');
}

main();