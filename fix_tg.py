with open('modules/telegram.js','r') as f:
    lines = f.readlines()

# Найти строку 268 (0-indexed 267)
for i, line in enumerate(lines):
    if 'Привет' in line and 'чтобы я мог' in line.lower():
        print(f"Found at {i+1}: {line.rstrip()[:60]}")
        # Строка должна заканчиваться на "': {'"
        # Восстанавливаем корректный блок
        lines[i] = "    await tgSendMessage(chatId, 'Привет! 👋\\nЧтобы я мог тебе помогать, привяжи номер телефона:\\n\\n<code>+7XXXXXXXXXX</code>\\n\\nИли нажми кнопку ниже.', {\n"
        # Вставляем reply_markup
        lines[i+1] = "      reply_markup: JSON.stringify({ keyboard: [[{ text: '📱 Отправить номер', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true })\n"
        lines[i+2] = "    });\n"
        lines[i+3] = "    return;\n"
        break

with open('modules/telegram.js','w') as f:
    f.writelines(lines)
print('fixed')
