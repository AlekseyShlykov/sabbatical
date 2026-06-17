#!/usr/bin/env node
/** Build assets/twine/en.json — same passage names as ru.json, English text. */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { LINK_EN_EXTRA, TEXT_EN_EXTRA } from "./en-story-extra.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ru = JSON.parse(readFileSync(join(root, "assets/twine/ru.json"), "utf8"));

const LINK_EN = {
  'Привет, Майк! Приятно познакомиться': "Hi, Mike! Nice to meet you",
  "Ничего себе, целый остров!": "Wow — a whole island!",
  'Покричать "Привет, есть кто дома?"': 'Shout "Hello, anyone home?"',
  "Постучать в дверь": "Knock on the door",
  "Извините, не знал есть ли кто дома": "Sorry — I wasn't sure anyone was home",
  "Ну... я подумал что так будет проще": "Well… I thought that would be easier",
  "Что за шутка?": "What joke?",
  "Спасибо, я пожалуй пойду": "Thanks — I'd better go",
  "Вернуться на карту": "Back to the map",
  "Немного прогуляться": "Take a short walk",
  "Я и сам не знаю": "I'm not sure myself",
  "Написать книгу": "Write a book",
  "Спасибо, но мне пора!": "Thanks — I should go!",
  "Вы были врачом?": "Were you a doctor?",
  "Да, понимаю, я сюда приехал за этим же": "Yes — that's why I came too",
  "Просто отдохнуть": "Just to rest",
  "Я сначала хотел написать научную книгу, но в душе думаю о романе":
    "I wanted to write a scholarly book, but I'm secretly thinking about a novel",
  "Это будет научная книга о моей теории": "It will be a scholarly book about my theory",
  "Полюбоваться видом": "Admire the view",
  "Почти, я приехал написать книгу, но она научная":
    "Almost — I came to write a book, but it's scholarly",
  "Да, я собираюсь написать роман": "Yes — I'm going to write a novel",
  "Нет, это описание моей теории": "No — it's an account of my theory",
  "Это было немного грубо": "That was a bit rude",
  "Хорошо": "All right",
  "Как только напишу": "As soon as I've written it",
  "Это очень личное, я пока не готов": "It's very personal — I'm not ready yet",
  "Да, взял все необходимое чтобы через год уплыть отсюда с написанной книгой":
    "Yes — I brought everything I need to sail away in a year with a finished book",
  "И это вам известно?": "And you know that?",
  "Обязательно": "Absolutely",
  "Я бы хотел больше уединения": "I'd prefer more privacy",
  "Давайте": "Let's go",
  "Это жутковато": "That's a bit unsettling",
  "То что мне нужно, отдохну от телефона": "That's what I need — a break from the phone",
  "Понятно": "I see",
  "Ну мне казалось это невежливым": "I thought it would be impolite to ask",
  "Просто не было возможности": "I simply never had the chance",
  "Звучит таинственно": "Sounds mysterious",
  "До встречи": "See you",
  "Да, Майк уже рассказал мне о ней": "Yes — Mike already told me about it",
  "10 лет?": "Ten years?",
  "Да, я планирую написать книгу": "Yes — I'm planning to write a book",
  "Хочу написать научную книгу": "I want to write a scholarly book",
  "Давно хочу написать роман": "I've wanted to write a novel for a long time",
  "Интересно": "Interesting",
  "А что вам нужно?": "What do you need?",
  "Отдохнуть немного": "Rest a little",
  "Сесть и писать книгу": "Sit down and write",
  "Пойду исследовать остров": "I'll explore the island",
  "Научная книга": "Scholarly book",
  "Роман": "Novel",
  "Спасибо, но я хочу прогуляться": "Thanks — I'd rather take a walk",
  "Да, с радостью": "Yes, gladly",
  "Да, ты прав": "Yes, you're right",
  "Ну формально я был еще в баре": "Well, technically I was at the bar too",
  "Спасибо, буду иметь в виду!": "Thanks — I'll keep that in mind!",
  "Как ты тут оказался?": "How did you end up here?",
  "Расскажи мне об острове": "Tell me about the island",
  "Мистер Красный всем тут владеет?": "Does Mister Red own everything here?",
  "Оранжевый? Тот кто раньше жил в моем доме?":
    "Mister Orange? The one who lived in my house before?",
  "Но как тогда здесь оказался я? Ведь я не на пенсии.":
    "But how did I end up here? I'm not retired.",
  "А не знаешь почему?": "Do you know why?",
  "Да, это странно": "Yes, that's odd",
  "Я только начал": "I've only just started",
  "Спасибо, хорошо": "Thanks, it's going well",
  "Расскажите больше о себе": "Tell me more about yourself",
  "Как вам этот остров?": "How do you like this island?",
  "Как вы здесь оказались?": "How did you end up here?",
  "Спасибо, я лучше пойду погуляю": "Thanks — I'd rather go for a walk",
  ...LINK_EN_EXTRA,
};

const TEXT_EN = {
  start:
    "//location dock, background barout2\n//show mrred\nmrred: Hello, and welcome to our island! I'm Mike, and this is my island. I mean it belongs to me, and I personally greet everyone who rents a house from me!\n",
  "Привет, Майк! Приятно познакомиться":
    "mrred: Let me tell you a bit about our island. I'll bring you up to speed.\nmrred: This is a place for people who want peace and quiet. You can enjoy your retirement, relax, or write a book. I heard you're planning to write one.\n",
  "Ничего себе, целый остров!":
    "mrred: Yes — I bought it many, many years ago with money from my old business. Now I'm retired; I just enjoy my old age and the company of wonderful people I rent to. They're friends more than tenants. I hope we'll become friends too.\n",
  Обязательно:
    "mrred: Just go easy with that wish! This is an island for people who want peace and quiet. We don't pry into each other's affairs. You can enjoy your retirement, relax, or write a book. I heard you're planning to write one.\n",
  "Я бы хотел больше уединения":
    "mrred: Who wouldn't! This is an island for people who want peace and quiet. You can enjoy your retirement, relax, or write a book. I heard you're planning to write one.\n",
  "Да, взял все необходимое чтобы через год уплыть отсюда с написанной книгой":
    "mrred: Excellent! Let me show you your house.\n",
  "И это вам известно?":
    "mrred: No secret — my agent looked into you before renting the house! You're fifty-six, a professor at an elite university, going through something like a creative crisis, and you need time alone.\n\nmrred: This place is perfect for that. Let me show you your house.\n",
  Давайте: "//after «let's go»: tutorial map — only the orange house\n",
  "orange house inside":
    "//background orange house inside\n//show mrred\nmrred: Here is your house. Food is delivered once a week, on Mondays. If you get tired of the standard meals, come to me at the bar and say what to order. You can just leave a note. You won't be able to call — there's no mobile signal on the island.\n",
  "Да, Майк уже рассказал мне о ней":
    "mrblue: You mean Mister Red?\nmrblue: All right, relax — I know it's hard to get used to; I'm not fully used to it myself, though I've lived here more than ten years.\n",
  "10 лет?":
    "mrblue: Yes — hard to believe! I moved here when I turned sixty-seven. I decided to live for myself, and this place has everything I need.\n",
  "Интересно":
    "mrblue: Well, don't be too curious. People don't like that here. Talking about science and books is always welcome. But I wouldn't try to bring up the past.\n",
  "А что вам нужно?":
    "mrblue: Sorry for being blunt, but that's none of your business. People don't like that here. Talking about science and books is always welcome. But I wouldn't try to bring up the past.\n",
  "Да, я планирую написать книгу":
    "mrblue: Really? What kind of book? Scholarly? Or an adventure novel?\n",
  "Хочу написать научную книгу":
    "mrblue: Great — you'll have people to discuss it with, especially Miss Green; she loves books here. If you meet her, she'll surely ask to read the first chapters.\n",
  "Давно хочу написать роман":
    "mrblue: Well, scholarly books matter — someone reads them. I think you'll find people to talk to; especially Mister Black loves science here. If you meet him, he'll probably offer to review your book.\n",
  "Это жутковато":
    "//background orange house inside\nmrred: They've been offering to put up a tower for ages, but I refuse. I like the atmosphere of my youth. If you need anything — just come and tell me.\nmrred: It helps with privacy too.\n",
  "То что мне нужно, отдохну от телефона":
    "//background orange house inside\nmrred: Yes — they've been offering to put up a tower for ages, but I refuse. I like the atmosphere of my youth. If you need anything — just come and tell me.\nmrred: It helps with privacy. And we value that here.\n",
  Понятно:
    "mrred: You're polite! I like that.\nmrred: Through our whole conversation you never asked why I have a red streak in my hair.\n",
  "Ну мне казалось это невежливым":
    "mrred: I'll tell you anyway — it matters.\nmrred: Every house on the island has its own colour — roof, walls, furniture. Besides privacy, we all value respect for personal matters. So instead of surnames we use colours. As you see, I'm Mister Red.\nmrred: Many people underline it with their hair or clothes. You're free to do as you like — just try to respect others' space and don't pry.\n",
  "Просто не было возможности":
    "mrred: I'll tell you anyway — it matters.\nmrred: Every house on the island has its own colour — roof, walls, furniture. Besides privacy, we all value respect for personal matters. So instead of surnames we use colours. As you see, I'm Mister Red.\nmrred: Many people underline it with their hair or clothes. You're free to do as you like — just try to respect others' space and don't pry.\n",
  Хорошо:
    "mrred: Good. There's no mystery here — everyone is older, and everyone has a past. You don't always need to dig it up.\n\nmrred: All right, settle in, look around your home, walk the island, write your book, or drop in on someone — make yourself at home. I must go!\n//hide mrred\n",
  "Звучит таинственно":
    "mrred: There's no mystery — everyone is older, and everyone has a past. You don't always need to dig it up.\n\nmrred: All right, settle in, look around your home, walk the island, write your book, or drop in on someone — make yourself at home. I must go!\n//hide mrred\n",
  "До встречи": "//mode select: story or free exploration\n",
  "orange house":
    "//background orange house inside\nThis is my home. I live here.\n",
  "Отдохнуть немного":
    "//shows the house view again\n//new day\nI had a wonderful rest. What next?\n",
  "Сесть и писать книгу":
    "//writing progress bar (see design notes in source)\nTime to dive into the book. What shall I work on today?\n",
  "Пойду исследовать остров": "//island map opens\n",
  "Научная книга":
    "//adds 1% to scholarly book progress\nI think it's time for a break!\n",
  "Роман":
    "//adds 1% to novel progress\nI think it's time for a break!\n",
  "Blue house":
    "You're at the blue house. You can knock or call out to see if anyone is home.\n",
  'Покричать "Привет, есть кто дома?"':
    "//appears mrblue\nmrblue: Hello! Why shout? You could have knocked.\n",
  "Постучать в дверь":
    "//appears mrblue\nmrblue: Hello, neighbour! Nice to meet you! I'm John, but everyone calls me Mister Blue. Have you heard our little island joke?\n",
  "Извините, не знал есть ли кто дома":
    "mrblue: All right, forget it. Nice to meet you, neighbour! I'm John, but everyone calls me Mister Blue. Have you heard our little island joke?\n",
  "Ну... я подумал что так будет проще":
    "mrblue: All right, forget it. Nice to meet you, neighbour! I'm John, but everyone calls me Mister Blue. Have you heard our little island joke?\n",
  "Что за шутка?":
    "mrblue: We're a small community here — we don't love strangers much, and we value everyone minding their own business.\nmrblue: We started calling each other by the colours our houses are painted. It began as a joke, then it stuck.\nmrblue: By the way, we rented you this place because you're a redhead. Okay, only partly true. We really do like scientists here, especially professors and writers. And you're both a professor and a writer!\n",
  "Спасибо, я пожалуй пойду": "//return to map\n",
  "Black house":
    "The black house stands quiet. You can knock or call out to see if anyone is home.\n",
  black2: "No one answers — it seems no one is home.\n",
  "purple house":
    "The purple house on the hill. You can knock or call out to see if anyone is home.\n",
  "White house":
    "The white house behind the fence. You can knock or call out to see if anyone is home.\n",
  purple2: "No one answers — it seems no one is home.\n",
  white2: "No one answers — it seems no one is home.\n",
  "Green house":
    "The green house in the garden. You can knock or call out to see if anyone is home.\n",
  "Yellow house":
    "The yellow house by the water. You can knock or call out to see if anyone is home.\n",
  green2: "No one answers — it seems no one is home.\n",
  yellow2: "No one answers — it seems no one is home.\n",
  "Red house":
    "The red house on the rise. You can knock or call out to see if anyone is home.\n",
  red2: "No one answers — it seems no one is home.\n",
  Beach: "A beautiful, very secluded beach.\n",
  "Немного прогуляться":
    "//you meet msgreen\nmsgreen: Hello, newcomer! I'm Monica, but you can call me Miss Green. As you see, I've taken my colour — I even dress to match.\nmsgreen: Lucky it suits me. After decades in a white coat, it's not easy to switch. But enough about me. What brought you here?\n",
  "Я и сам не знаю":
    "msgreen: Yes — sometimes lost souls end up here, with nowhere else to go. And it seems like a pretty good place. I see you're already ginger and living in the orange house. I think you'll fit into our little community, if you want.\n",
  "Написать книгу":
    "msgreen: Really? What's it about? A novel? A scholarly book? You look more like a lecturer than a belletrist.\n",
  "Спасибо, но мне пора!": "//return to map\n",
  "Вы были врачом?":
    "msgreen: Yes — all my life, and now I'm retired. I still help out — I treat aches and give advice. After all, this is an island of old folks; people come here when they want quiet.\n",
  "Да, понимаю, я сюда приехал за этим же":
    "msgreen: You'll certainly find peace here. Just don't get caught up in political games. You'd think eight people would be enough — yet grudges always turn up. What do you need the quiet for?\n",
  "Просто отдохнуть":
    "msgreen: Oh, there's more than enough rest here. But enough — that's plenty for a first meeting. We're almost all introverts. We'll see each other again; lovely to meet you!\n",
  "Я сначала хотел написать научную книгу, но в душе думаю о романе":
    "msgreen: I hope I'm among the first eight readers! But enough — that's plenty for a first meeting. We're almost all introverts. We'll see each other again; lovely to meet you!\n",
  "Это будет научная книга о моей теории":
    "msgreen: I hope I'm among the first eight readers! But enough — that's plenty for a first meeting. We're almost all introverts. We'll see each other again; lovely to meet you!\n",
  Forrest: "What a pleasant road! Good for walking!\n",
  Thicket: "A bit eerie. Woods, but very dark. You don't expect that on this island.\n",
  Lighthouse: "A wonderful view of the ocean and the whole island!\n",
  Bar: "//in the bar mrred, msyellow, mrpurple\n\nmrred: Sorry — we'd be glad to talk, but a little later; we have private business and would rather not be interrupted.\n",
  "Полюбоваться видом":
    "You stand and gaze into the distance.\n//appears mswhite\nmswhite: (muttering) Why is there no quiet place anywhere!\nmswhite: Hello — let's get acquainted! I think I heard you're a writer?\n",
  "Почти, я приехал написать книгу, но она научная":
    "mswhite: Oh? How interesting — I'm not a big fan of thick science books. I hope you're not writing a dictionary?\n",
  "Да, я собираюсь написать роман":
    "mswhite: Interesting! I'm intrigued. But wait — don't tell me. Just promise you'll let me read at least the first chapter!\n",
  "Нет, это описание моей теории":
    "mswhite: (sighing) How interesting! But forgive me — you should go. I wanted to be alone, and since I've lived here longer than you, I'd be grateful if you left.\n",
  "Это было немного грубо":
    "mswhite: Perhaps you're in the wrong place at the wrong time. Let's talk later.\n",
  lighthouse2:
    "mswhite: Oh — forgive me, you should go. I wanted to be alone, and since I've lived here longer than you, I'd be grateful if you left.\n",
  "Вернуться на карту": "//return to world map\n",
  story_return_map: "//return to map\n",
  "Day2.1. Blue.":
    "//background houseblueout\n//show mrblue\nmrblue: Hello, Mister Orange! How are you? Off for a walk? Care to come in?\n",
  "Спасибо, но я хочу прогуляться":
    "mrblue: The weather really is perfect for a walk! Enjoy your stroll!\n\n//return to map\n",
  "Да, с радостью":
    "//background houseblueinside\nmrblue: I'll bet this is the first house you've been inside — apart from your own, of course.\n",
  "Да, ты прав":
    "mrblue: Yes — we don't much like guests here; we usually meet at the bar on the pier. So if you want to chat or hear the latest news, that's the best place. Especially busy in the mornings.\n",
  "Ну формально я был еще в баре":
    "mrblue: Yes — the bar is always open. We don't much like guests here; we usually meet at the bar on the pier. So if you want to chat or hear the latest news, that's the best place. Especially busy in the mornings.\n",
  question:
    "mrblue: Maybe you have some questions? I can answer some of them.\n",
  question2: "mrblue: Maybe you'd like to know something else?\n",
  "Как ты тут оказался?":
    "mrblue: As I said, I sailed here ten years ago. Red, Purple, and Orange were already living here.\n\nmrblue: Circumstances meant I needed a quiet place. I had enough money, and someone introduced me to Red. He was just thinking of creating this little community for people who want a peaceful retirement.\n\nmrblue: Literally a week later I was on this island. And here we are, ten years on.\n\nmrblue: (thoughtfully) Yes — time flies here. Before you know it, a year or two will have passed.\n",
  "Расскажи мне об острове":
    "mrblue: Well, it's a retirees' dream island. If you have enough money, you can live out your days here in comfort and joy. And none of the residents are simple folk — everyone has their quirks, their skeletons in the closet.\n\nmrblue: (laughs) Though who doesn't, by retirement age?\n",
  "Мистер Красный всем тут владеет?":
    "mrblue: Something like that. I'm not entirely sure how everything works here. But yes — this island belongs to him. And he built all the houses we live in. Well, not him personally — his companies.\n\nmrblue: Except for Miss White's house — she insisted on a design of her own. And strangely, Red agreed.\n",
  "А не знаешь почему?":
    "mrblue: Even someone as talkative as me knows where the line is — and which questions not to ask.\n",
  "Оранжевый? Тот кто раньше жил в моем доме?":
    "mrblue: We were neighbours, so we became friends. He was the oldest among us and kept his beard ginger to the end. The nickname Mister Orange suited him perfectly.\n\nmrblue: He loved to tell stories — but only about the distant past. Gradually his mind grew weaker, until he died this year. I miss him.\n\nmrblue: But forgive me — I got carried away with memories. Would you like to know anything else?\n",
  "Но как тогда здесь оказался я? Ведь я не на пенсии.":
    "mrblue: You know, I ask myself the same question. Mister Red doesn't invite random people here. I think it's best to ask him — though I suspect he won't answer.\n",
  "Day 2. Green":
    "//background housegreeninside\n//show msgreen\n\nmsgreen: Hello — how's the book coming along?\n",
  questions2green:
    "msgreen: I still hope I'll get to read it.\n\nmsgreen: I'm sure you're curious about many things. We already know each other, and straight answers are a luxury on this island. But I can afford them. So ask away — don't be shy.\n",
  "Спасибо, я лучше пойду погуляю": "//return to map\n",
  ...TEXT_EN_EXTRA,
};

function translateLine(line) {
  if (line.startsWith("//")) {
    return line
      .replace(/^\/\/локация причал, фон - barout2/i, "//location dock, background barout2")
      .replace(/^\/\/показать /i, "//show ")
      .replace(/^\/\/появляется /i, "//appears ")
      .replace(/^\/\/в баре /i, "//in the bar ")
      .replace(/^\/\/вы встречаете /i, "//you meet ")
      .replace(/^\/\/фон /i, "//background ")
      .replace(/^\/\/возвраща/i, "//return")
      .replace(/^\/\/вернуться/i, "//return");
  }
  return line;
}

const passages = ru.passages.map((p) => {
  const text = (TEXT_EN[p.name] || p.text)
    .split("\n")
    .map((l) => translateLine(l))
    .join("\n");
  const links = p.links.map((l) => ({
    name: LINK_EN[l.name] || l.name,
    link: l.link,
  }));
  return { name: p.name, text, links };
});

writeFileSync(join(root, "assets/twine/en.json"), JSON.stringify({ passages }, null, 2) + "\n");
console.log("Wrote en.json,", passages.length, "passages");
