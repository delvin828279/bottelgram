/**
 * 🤖 ربات تلگرام هوش مصنوعی
 * با استفاده از Google Gemini API و Deno Deploy
 *
 * راهنمای نصب:
 * 1. توکن ربات تلگرام از @BotFather بگیر
 * 2. API Key رایگان از https://aistudio.google.com بگیر
 * 3. در Deno Deploy این Environment Variables رو ست کن:
 *    - TELEGRAM_BOT_TOKEN
 *    - GEMINI_API_KEY
 * 4. Webhook رو ست کن:
 *    https://api.telegram.org/bot<TOKEN>/setWebhook?url=<DENO_URL>/webhook
 */

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
// تاریخچه مکالمه هر کاربر
const conversationHistory = new Map<number, Array<{ role: string; parts: Array<{ text: string }> }>>();
const MAX_HISTORY = 20;

// ارسال پیام به تلگرام
async function sendMessage(chatId: number, text: string, replyToMessageId?: number) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown",
  };
  if (replyToMessageId) {
    body.reply_to_message_id = replyToMessageId;
  }

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // اگه Markdown ارور داد، بدون فرمت بفرست
  if (!res.ok) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text }),
    });
  }
}

// نمایش "در حال تایپ..."
async function sendTyping(chatId: number) {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

// ارتباط با Gemini API
async function askGemini(chatId: number, userMessage: string, userName: string): Promise<string> {
  if (!conversationHistory.has(chatId)) {
    conversationHistory.set(chatId, []);
  }
  const history = conversationHistory.get(chatId)!;

  // پیام کاربر را اضافه کن
  history.push({ role: "user", parts: [{ text: userMessage }] });

  // محدود کردن تاریخچه
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  try {
    const response = await fetch(GEMINI_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: `تو یک دستیار هوشمند فارسی‌زبان هستی که در تلگرام به کاربران کمک می‌کنی.
نام کاربر: ${userName}
- به فارسی پاسخ بده مگر اینکه کاربر به زبان دیگری بنویسد
- پاسخ‌هات رو مختصر، مفید و دوستانه نگه دار
- از ایموجی‌های مناسب استفاده کن`
          }]
        },
        contents: history,
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.9,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Gemini API Error:", error);
      return "متأسفم، در ارتباط با هوش مصنوعی مشکلی پیش آمد. لطفاً دوباره امتحان کن. 🙏";
    }

    const data = await response.json();
    const assistantMessage = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!assistantMessage) {
      return "پاسخی دریافت نشد. لطفاً دوباره امتحان کن. ⚠️";
    }

    // پاسخ رو به تاریخچه اضافه کن
    history.push({ role: "model", parts: [{ text: assistantMessage }] });

    return assistantMessage;
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "خطایی رخ داد. لطفاً دوباره امتحان کن. ⚠️";
  }
}

// پردازش آپدیت‌های تلگرام
async function handleUpdate(update: Record<string, unknown>) {
  const message = update.message as Record<string, unknown> | undefined;
  if (!message) return;

  const chatId = (message.chat as Record<string, unknown>)?.id as number;
  const messageId = message.message_id as number;
  const text = message.text as string | undefined;
  const from = message.from as Record<string, unknown> | undefined;
  const userName = (from?.first_name as string) || "کاربر";

  if (!text || !chatId) return;

  // دستورات خاص
  if (text === "/start") {
    await sendMessage(
      chatId,
      `سلام ${userName}! 👋\n\nمن یک دستیار هوشمند هستم که با Gemini AI ساخته شدم.\n\nهر سوالی داری بپرس! 🤖✨\n\n/help - راهنما\n/clear - پاک کردن تاریخچه`
    );
    return;
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
      `📌 *راهنمای ربات*\n\n` +
      `• پیامت رو بفرست، من جواب می‌دم!\n` +
      `• تاریخچه مکالمه رو نگه می‌دارم\n` +
      `• /clear برای شروع مکالمه جدید\n` +
      `• فارسی و انگلیسی پشتیبانی می‌شه\n\n` +
      `_Powered by Google Gemini_ 🧠`
    );
    return;
  }

  if (text === "/clear") {
    conversationHistory.delete(chatId);
    await sendMessage(chatId, "تاریخچه مکالمه پاک شد! 🗑️ بریم از اول شروع کنیم.");
    return;
  }

  // نمایش "در حال تایپ..."
  await sendTyping(chatId);

  // ارسال به Gemini و دریافت پاسخ
  const aiResponse = await askGemini(chatId, text, userName);

  // ارسال پاسخ به کاربر
  await sendMessage(chatId, aiResponse, messageId);
}

// سرور اصلی
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/" || url.pathname === "/health") {
    return new Response(
      JSON.stringify({ status: "ok", message: "Telegram Gemini Bot is running! 🤖" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (req.method === "POST" && url.pathname === "/webhook") {
    try {
      const update = await req.json();
      await handleUpdate(update);
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("Error", { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
