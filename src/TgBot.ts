import {InlineKeyboard, MediaSourceTo, Telegram} from "puregram";
import assert from "node:assert";
import * as fs from "node:fs";
import path from "node:path";

const TgBot = Telegram.fromToken(process.env.TG_BOT_TOKEN!);
const WebAppUrl = process.env.WEB_APP_URL;
assert(WebAppUrl)

function getAvatarPath(fileId: string): string {
    const avatarsDir = path.join(__dirname, 'avatars');
    if (!fs.existsSync(avatarsDir)) {
        fs.mkdirSync(avatarsDir);
    }
    return path.join(avatarsDir, fileId);
}

export async function getUserPhoto(user_id: number): Promise<string | null> {
    return TgBot.api.getUserProfilePhotos({user_id, limit: 1}).then(async (res) => {
        if (res.photos.length > 0) {
            const fileId = res.photos[0][0].file_id;
            const avatarPath = getAvatarPath(fileId);
            if (!fs.existsSync(avatarPath)) {
                await TgBot.downloadFile(fileId, MediaSourceTo.path(avatarPath));
            }
            return fileId;
        } else {
            return null;
        }
    }).catch(() => null);
}

const rules = (
    "Привет, я создан, чтобы помочь незнакомым людям узнать друг о друге.\n" +
    "Игра состоит из 5 этапов.\n" +
    "\n" +
    "<b>Этап 1. Напишите короткий факт о себе.</b>\n" +
    "Не стоит писать о том, что Вы рассказываете о себе людям в первую очередь.\n" +
    "Лучше писать то, что может раскрыть для других Ваши интересы или показать неочевидные стороны личности. Возможно, Вы найдете сообщников.\n" +
    "Например, \"Увлекаюсь дайвингом\", \"Играю на трёх музыкальных инструментах\", \"КМС по шахматам\"\n" +
    "\n" +
    "<b>Этап 2. Знакомство.</b>\n" +
    "В этот круг каждый по очереди рассказывает о себе: где учился, чем занимается.\n" +
    "Вы пока не видите, что написали о себе другие игроки, поэтому слушайте внимательно, и, может, в их рассказе найдете подсказки.\n" +
    "Не спешите рассказывать всё о себе, оставьте что-нибудь на следующий этап.\n" +
    "Но только не раскрывайте свой факт!\n" +
    "\n" +
    "<b>Этап 3. Вопросы???</b>\n" +
    "Вы, как и остальные игроки, должны задать один вопрос одному человеку на Ваш выбор. Таких круга будет 4.\n" +
    "Не стоит задавать вопросы, которые напрямую относятся к какому-то из фактов. Задавайте более отвлеченные вопросы и отмечайте кандидатов на факты, нажав на факт из списка.\n" +
    "Если Вы услышали вопрос, который может раскрыть чей-то факт, лучше все дружно укажите на это и попросите сменить вопрос.\n" +
    "Внимательно слушайте, что спрашивают другие, потому что у Вас будет всего 4 вопроса.\n" +
    "\n" +
    "<b>Этап 4. Ответы.</b>\n" +
    "Соотнесите факты с игроками. Для этого просто оставьте по одному кандидату у каждого факта.\n" +
    "\n" +
    "<b>Этап 5. Всё.</b>\n" +
    "Ознакомьтесь с результатами."
)


TgBot.updates.on("message", context => {
    if (context.text?.startsWith("/start")) {
        context.send(rules, {parse_mode: "HTML", reply_markup: InlineKeyboard.keyboard([[
            InlineKeyboard.webAppButton({text: "Играть", url: WebAppUrl})
        ]])})
    }
})

export default TgBot;