/**
 * 🤖 ربات تلگرام هوش مصنوعی
 * با استفاده از Claude API و Deno Deploy
 *
 * راهنمای نصب:
 * 1. یک ربات در تلگرام بسازید (@BotFather) و توکن بگیرید
 * 2. یک API Key از https://console.anthropic.com بگیرید
 * 3. در deno.com/deploy پروژه جدید بسازید
 * 4. این فایل را آپلود کنید
 * 5. Environment Variables را تنظیم کنید:
 *    - TELEGRAM_BOT_TOKEN
 *    - ANTHROPIC_API_KEY
 * 6. Webhook را ست کنید:
 *    https://api.telegram.org/bot<TOKEN>/setWebhook?url=<DENO_DEPLOY_URL>
 */

const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// نگه‌داری تاریخچه مکالمه هر کاربر (در حافظه)
const conversationHistory = new Map<number, Array<{ role: string; content: string }>>();
const MAX_HISTORY = 20; // حداکثر تعداد پیام در تاریخچه

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

  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// نمایش وضعیت "در حال تایپ..."
async function sendTyping(chatId: number) {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

// ارتباط با Claude API
async function askClaude(
  chatId: number,
  userMessage: string,
  userName: string
): Promise<string> {
  // تاریخچه مکالمه را بگیر یا بساز
  if (!conversationHistory.has(chatId)) {
    conversationHistory.set(chatId, []);
  }
  const history = conversationHistory.get(chatId)!;

  // پیام جدید را اضافه کن
  history.push({ role: "user", content: userMessage });

  // اگر تاریخچه خیلی بلند شد، ابتدای آن را حذف کن
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: `تو یک دستیار هوشمند فارسی‌زبان هستی که در تلگرام به کاربران کمک می‌کنی.
نام کاربر: ${userName}
- به فارسی پاسخ بده مگر اینکه کاربر به زبان دیگری بنویسد
- پاسخ‌هات رو مختصر، مفید و دوستانه نگه دار
- از ایموجی‌های مناسب استفاده کن`,
        messages: history,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Claude API Error:", error);
      return "متأسفم، در ارتباط با هوش مصنوعی مشکلی پیش آمد. لطفاً دوباره امتحان کن. 🙏";
    }

    const data = await response.json();
    const assistantMessage = data.content[0].text;

    // پاسخ Claude را به تاریخچه اضافه کن
    history.push({ role: "assistant", content: assistantMessage });

    return assistantMessage;
  } catch (error) {
    console.error("Error calling Claude:", error);
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
      `سلام ${userName}! 👋\n\nمن یک دستیار هوشمند هستم که با Claude AI ساخته شدم.\n\nمی‌تونی هر سوالی داری بپرسی یا باهام گفتگو کنی! 🤖✨\n\n/help - راهنما\n/clear - پاک کردن تاریخچه مکالمه`
    );
    return;
  }

  if (text === "/help") {
    await sendMessage(
      chatId,
      `📌 *راهنمای ربات*\n\n` +
      `• فقط پیامت رو بفرست، من جواب می‌دم!\n` +
      `• تاریخچه مکالمه رو نگه می‌دارم تا بهتر بفهمم\n` +
      `• /clear برای شروع مکالمه جدید\n` +
      `• به فارسی و انگلیسی پاسخ می‌دم\n\n` +
      `_Powered by Claude AI_ 🧠`
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

  // ارسال به Claude و دریافت پاسخ
  const aiResponse = await askClaude(chatId, text, userName);

  // ارسال پاسخ به کاربر
  await sendMessage(chatId, aiResponse, messageId);
}

// سرور اصلی Deno
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // بررسی سلامت سرور
  if (url.pathname === "/" || url.pathname === "/health") {
    return new Response(
      JSON.stringify({ status: "ok", message: "Telegram AI Bot is running! 🤖" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // دریافت آپدیت از تلگرام
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
