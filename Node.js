const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const db = require('quick.db');

const bot = new Telegraf('8036872050:AAG3mWJoaQR3DBd1scgNlyR4KgEH1p7GP9s');
const ADMIN_ID = '7708626625';

// تأكيد هوية الأدمن
function isAdmin(ctx) {
  return ctx.from.id.toString() === ADMIN_ID;
}

// حفظ التذكيرات في قاعدة بيانات بسيطة
function addReminder(chatId, message, time, isDaily) {
  const reminders = db.get('reminders') || [];
  reminders.push({ chatId, message, time, isDaily });
  db.set('reminders', reminders);
  
  // جدولة التذكير
  scheduleReminder(chatId, message, time, isDaily);
}

// جدولة التذكير
function scheduleReminder(chatId, message, time, isDaily) {
  const [hours, minutes] = time.split(':');
  
  if (isDaily) {
    cron.schedule(`${minutes} ${hours} * * *`, () => {
      bot.telegram.sendMessage(chatId, `⏰ تذكير: ${message}`);
    });
  } else {
    const now = new Date();
    const reminderDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes
    );
    
    if (reminderDate > now) {
      setTimeout(() => {
        bot.telegram.sendMessage(chatId, `⏰ تذكير: ${message}`);
      }, reminderDate - now);
    }
  }
}

// بدء البوت
bot.start((ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('عذرًا، لست الأدمن.');
  }
  
  ctx.reply('مرحبًا بالأدمن!', Markup.inlineKeyboard([
    [Markup.button.callback('إضافة رسالة', 'add_message')],
    [Markup.button.callback('حذف رسالة', 'delete_message')]
  ]));
});

// معالجة الأزرار الشفافة
bot.action('add_message', (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح لك بهذا الإجراء');
  
  ctx.reply('أرسل لي الرسالة التي تريد جدولتها:');
  ctx.session = { step: 'awaiting_message' };
});

bot.on('text', (ctx) => {
  if (!isAdmin(ctx)) return;
  
  if (ctx.session.step === 'awaiting_message') {
    ctx.session.message = ctx.message.text;
    ctx.session.step = 'awaiting_time';
    ctx.reply('الرجاء إرسال الوقت بالتنسيق HH:MM');
  } else if (ctx.session.step === 'awaiting_time') {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(ctx.message.text)) {
      return ctx.reply('تنسيق الوقت غير صحيح. الرجاء إرسال الوقت بالتنسيق HH:MM');
    }
    
    ctx.session.time = ctx.message.text;
    ctx.session.step = 'awaiting_ampm';
    ctx.reply('هل هذا الوقت صباحًا أم مساءً؟', Markup.inlineKeyboard([
      [Markup.button.callback('صباحًا (AM)', 'set_am')],
      [Markup.button.callback('مساءً (PM)', 'set_pm')]
    ]));
  }
});

bot.action(['set_am', 'set_pm'], (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح لك بهذا الإجراء');
  
  ctx.session.ampm = ctx.callbackQuery.data === 'set_am' ? 'AM' : 'PM';
  ctx.session.step = 'awaiting_frequency';
  
  ctx.reply('هل تريد إرسال هذه الرسالة:', Markup.inlineKeyboard([
    [Markup.button.callback('يوميًا', 'set_daily')],
    [Markup.button.callback('مرة واحدة فقط', 'set_once')]
  ]));
});

bot.action(['set_daily', 'set_once'], (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح لك بهذا الإجراء');
  
  const isDaily = ctx.callbackQuery.data === 'set_daily';
  const { message, time, ampm } = ctx.session;
  
  // تحويل الوقت إلى 24 ساعة
  let [hours, minutes] = time.split(':');
  hours = parseInt(hours);
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  
  const formattedTime = `${hours}:${minutes}`;
  
  addReminder(ctx.chat.id, message, formattedTime, isDaily);
  ctx.reply(`تم جدولة الرسالة بنجاح! سيتم إرسالها ${isDaily ? 'يوميًا' : 'مرة واحدة'} في الساعة ${time} ${ampm}`);
  delete ctx.session;
});

// حذف الروابط في المجموعات
bot.on('message', (ctx) => {
  if (ctx.chat.type === 'supergroup' || ctx.chat.type === 'group') {
    if (ctx.message.text && ctx.message.text.match(/https?:\/\/[^\s]+/)) {
      ctx.deleteMessage();
      ctx.reply(`@${ctx.from.username}، يمنع نشر الروابط في هذه المجموعة.`);
    }
  }
});

// تشغيل البوت
bot.launch();

// للحفاظ على تشغيل البوت 24/7
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
