const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const BOT_TOKEN = "8678652887:AAEEI-WajHTteEm6XzLnwIrY-2d4kRMyCD4";
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const db = new sqlite3.Database('./data.db');

// Tables
db.run("CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, file_id TEXT, batch_id TEXT)");
db.run("CREATE TABLE IF NOT EXISTS tokens (token TEXT, batch_id TEXT)");

let currentBatch = {};

// Get bot username
bot.getMe().then((me) => {
    bot.options.username = me.username;
    console.log("Bot running as @" + me.username);
});

// ================= BATCH START =================
bot.onText(/\/batch/, (msg) => {
    const chatId = msg.chat.id;
    const batchId = uuidv4().slice(0, 6);

    currentBatch[chatId] = batchId;

    bot.sendMessage(chatId, "📦 Batch started! Send multiple videos.");
});

// ================= UPLOAD =================
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const file = msg.video || msg.document;

    if (!file) return;

    // Batch mode
    if (currentBatch[chatId]) {
        const batchId = currentBatch[chatId];

        db.run("INSERT INTO files (file_id, batch_id) VALUES (?, ?)", [file.file_id, batchId]);

        bot.sendMessage(chatId, "✅ Added to batch");
    } else {
        // Single upload → auto batch bana
        const batchId = uuidv4().slice(0, 6);

        db.run("INSERT INTO files (file_id, batch_id) VALUES (?, ?)", [file.file_id, batchId]);

        const token = uuidv4().slice(0, 8);

        db.run("INSERT INTO tokens VALUES (?, ?)", [token, batchId]);

        const link = `https://t.me/${bot.options.username}?start=${token}`;

        bot.sendMessage(chatId, `🎬 Single Link (Permanent):\n${link}`);
    }
});

// ================= BATCH DONE =================
bot.onText(/\/done/, (msg) => {
    const chatId = msg.chat.id;
    const batchId = currentBatch[chatId];

    if (!batchId) {
        bot.sendMessage(chatId, "❌ No active batch!");
        return;
    }

    const token = uuidv4().slice(0, 8);

    db.run("INSERT INTO tokens VALUES (?, ?)", [token, batchId]);

    const link = `https://t.me/${bot.options.username}?start=${token}`;

    bot.sendMessage(chatId, `📦 Batch Link (Permanent):\n${link}`);

    delete currentBatch[chatId];
});

// ================= START (SEND FILES + AUTO DELETE) =================
bot.onText(/\/start (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const token = match[1];

    db.get("SELECT batch_id FROM tokens WHERE token=?", [token], (err, row) => {
        if (!row) {
            bot.sendMessage(chatId, "❌ Invalid link");
            return;
        }

        db.all("SELECT file_id FROM files WHERE batch_id=?", [row.batch_id], (err, files) => {
            if (!files || files.length === 0) {
                bot.sendMessage(chatId, "❌ No files found");
                return;
            }

            bot.sendMessage(chatId, `📥 Sending ${files.length} files...`);

            files.forEach((f, i) => {
                setTimeout(() => {
                    bot.sendVideo(chatId, f.file_id).then((sentMsg) => {

                        // 🗑️ AUTO DELETE AFTER 30 MIN
                        setTimeout(() => {
                            bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {});
                        }, 1800000);

                    });
                }, i * 1000);
            });
        });
    });
});