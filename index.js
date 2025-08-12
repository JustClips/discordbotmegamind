require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');
const fs = require('fs').promises;
const axios = require('axios');

// Configuration
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || '1398413061169352949';
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',') : ['YOUR_DISCORD_USER_ID'];
const LOG_CHANNEL_ID = '1404675690007105596';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Client setup
const client = new Client({
    intents: [
        
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const allData = JSON.parse(data);
        return allData[guildId] || [];
    } catch {
        return [];
    }
}

async function saveMemberData(guildId, data) {
    try {
        let allData = {};
        try {
            const fileData = await fs.readFile(DATA_FILE, 'utf8');
            allData = JSON.parse(fileData);
        } catch {}
        allData[guildId] = data;
        await fs.writeFile(DATA_FILE, JSON.stringify(allData, null, 2));
    } catch (error) {
        console.error('Error saving member data:', error);
    }
}

// Load/save strikes
async function loadStrikes() {
    try {
        const data = await fs.readFile(STRIKES_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

async function saveStrikes(strikes) {
    try {
        await fs.writeFile(STRIKES_FILE, JSON.stringify(strikes, null, 2));
    } catch (error) {
        console.error('Error saving strikes:', error);
    }
}

// Record member count
async function recordMemberCount(guild) {
    const now = new Date();
    const onlineMembers = guild.members.cache.filter(member => 
        member.presence && ['online', 'idle', 'dnd'].includes(member.presence.status)
    ).size;

    const dataPoint = {
        timestamp: now.toISOString(),
        totalMembers: guild.memberCount,
        humanMembers: guild.members.cache.filter(m => !m.user.bot).size,
        botMembers: guild.members.cache.filter(m => m.user.bot).size,
        onlineMembers
    };

    const memberData = await loadMemberData(guild.id);
    memberData.push(dataPoint);

    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
    const filteredData = memberData.filter(point => new Date(point.timestamp) > thirtyDaysAgo);

    await saveMemberData(guild.id, filteredData);
    return filteredData;
}

// Logging functions
async function logDeletedMessage(message, reason, actionBy = null) {
    try {
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle('🚨 Message Deleted')
            .setColor(0xED4245)
            .addFields(
                { name: 'User', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
                { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: 'Content', value: message.content?.substring(0, 1021) + '...' || '*No content*', inline: false }
            )
            .setTimestamp();

        if (actionBy) embed.addFields({ name: 'Action By', value: `<@${actionBy.id}> (${actionBy.tag})`, inline: false });

        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error logging deleted message:', error);
    }
}

async function logModerationAction(action, user, moderator, reason, duration = null) {
    try {
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🔨 ${action}`)
            .setColor(action.includes('Mute') ? 0xFEE75C : 0x57F287)
            .addFields(
                { name: 'User', value: `<@${user.id}> (${user.tag})`, inline: true },
                { name: 'Moderator', value: `<@${moderator.id}> (${moderator.tag})`, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();

        if (duration) embed.addFields({ name: 'Duration', value: `${duration} minutes`, inline: true });

        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error logging moderation action:', error);
    }
}

async function logBulkModerationAction(action, moderator, reason, count) {
    try {
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🔨 ${action}`)
            .setColor(0x57F287)
            .addFields(
                { name: 'Moderator', value: `<@${moderator.id}> (${moderator.tag})`, inline: true },
                { name: 'Reason', value: reason, inline: true },
                { name: 'Users Affected', value: count.toString(), inline: true }
            )
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error logging bulk moderation action:', error);
    }
}

// Text normalization
function normalizeText(text) {
    let normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const unicodeMap = {
        'а': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j',
        'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o', 'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't',
        'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y', 'ｚ': 'z',
        'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E', 'Ｆ': 'F', 'Ｇ': 'G', 'Ｈ': 'H', 'Ｉ': 'I', 'Ｊ': 'J',
        'Ｋ': 'K', 'Ｌ': 'L', 'Ｍ': 'M', 'Ｎ': 'N', 'Ｏ': 'O', 'Ｐ': 'P', 'Ｑ': 'Q', 'Ｒ': 'R', 'Ｓ': 'S', 'Ｔ': 'T',
        'Ｕ': 'U', 'Ｖ': 'V', 'Ｗ': 'W', 'Ｘ': 'X', 'Ｙ': 'Y', 'Ｚ': 'Z',
        '⓪': '0', '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9',
        '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
        '！': '!', '＠': '@', '＃': '#', '＄': '$', '％': '%', '＾': '^', '＆': '&', '＊': '*', '（': '(', '）': ')',
        '＿': '_', '＋': '+', '－': '-', '＝': '=', '｛': '{', '｝': '}', '｜': '|', '＼': '\\', '：': ':', '；': ';',
        '＂': '"', '＇': "'", '＜': '<', '＞': '>', '，': ',', '．': '.', '？': '?', '／': '/', '～': '~', '｀': '`',
        '【': '[', '】': ']', '〖': '[', '〗': ']', '『': '"', '』': '"', '「': '"', '」': '"',
        '¡': 'i', '¢': 'c', '£': 'l', '¤': 'o', '¥': 'y', '¦': 'i', '§': 's', '¨': '"', '©': 'c', 'ª': 'a',
        '«': '"', '¬': '-', '®': 'r', '¯': '-', '°': 'o', '±': '+', '²': '2', '³': '3', '´': "'", 'µ': 'u',
        '¶': 'p', '·': '.', '¸': ',', '¹': '1', 'º': 'o', '»': '"', '¼': '1/4', '½': '1/2', '¾': '3/4', '¿': '?'
    };

    Object.keys(unicodeMap).forEach(key => {
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        normalized = normalized.replace(new RegExp(escapedKey, 'g'), unicodeMap[key]);
    });

    normalized = normalized.replace(/\s+/g, ' ').trim()
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/(.)\1{3,}/g, '$1$1$1')
        .replace(/([!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])\1{2,}/g, '$1$1');

    return normalized;
}

// Scam and NSFW detection
const scamLinks = [
    'discord.gift', 'discordapp.com/gifts', 'discord.com/gifts', 'bit.ly', 'tinyurl.com',
    'free-nitro', 'nitro-free', 'free discord nitro', 'claim nitro',
    'steamcomminuty', 'steamcommunlty', 'robuxfree',
    'paypal', 'cashapp', 'venmo', 'zelle', 'westernunion', 'moneygram',
    'grabify', 'iplogger', '2no.co', 'yip.su', 'youramonkey.com',
    'bluemediafiles.com', 'shorturl.at', 'tiny.cc'
];

const scamKeywords = [
    'free nitro', 'nitro for free', 'claim nitro', 'nitro generator',
    'steam wallet', 'free robux', 'robux generator', 'paypal money',
    'cash app hack', 'get free money', 'make money fast', 'easy money',
    'click for reward', 'you won', 'congratulations you won',
    'verify account', 'suspicious activity', 'limited time offer',
    'gift card', 'redeem code', 'special offer'
];

const nsfwWords = [
    'nigga', 'nigger', 'faggot', 'kys', 'kill yourself', 'suicide',
    'porn', 'xxx', 'sex', 'rape', 'pedo', 'pedophile', 'cum', 'dick', 'cock',
    'pussy', 'asshole', 'bitch', 'whore', 'slut', 'cunt', 'retard', 'idiot',
    'stupid', 'dumb', 'moron', 'wanker', 'masturbate', 'orgy', 'gangbang',
    'n1gga', 'n1gger', 'f4gg0t', 'k.y.s', 'k!ll your$elf', 'p3d0', 'p3dophile'
];

function containsScamContent(content) {
    const normalized = normalizeText(content);
    return scamLinks.some(link => normalized.includes(link)) ||
           scamKeywords.some(keyword => normalized.includes(keyword));
}

function containsNSFWContent(content) {
    const normalized = normalizeText(content);
    return nsfwWords.some(word => normalized.includes(word));
}

// System prompt for moderation
const moderationSystemPrompt = `You are AutoModAI — a human-like, context-aware Discord moderation assistant. Analyze a single message (and optional nearby context) and decide whether it violates server rules. Be rigorous about intent and obfuscation (unicode lookalikes, zero-width, repeated chars, homograph attacks, link shorteners). Use context to detect sarcasm, quoted text, roleplay, and friendly banter.
OUTPUT RULES (MANDATORY)
- Respond with exactly one JSON object and nothing else (no explanation outside JSON).
- JSON schema:
  {
    "action": "allow" | "warn" | "delete" | "timeout" | "ban" | "review",
    "category": "spam" | "scam" | "harassment" | "hate_speech" | "nsfw" | "dox" | "self_harm" | "illegal" | "other",
    "severity": "low" | "medium" | "high",
    "confidence": 0.00-1.00,
    "explanation": "short human explanation (<=200 chars)",
    "evidence": ["normalized fragments or matched tokens", ...],
    "suggested_duration_minutes": null | integer
  }
DECISION GUIDELINES
- Use full context if provided. If intent is ambiguous, return "review" (not "ban").
- Do NOT base decisions only on keywords — assess intent, target, role relationships, and surrounding conversation.
- If obfuscation detected, include the normalized text snippet(s) in "evidence".
- If the content contains links or invites flagged as scams, set category "scam" and provide the link fragment in "evidence".
- For harassment/hate/sex content set the correct category and a severity based on explicitness and target (targeted slur=high).
- Confidence should reflect certainty: low (<0.6) when ambiguous, high (>0.85) when clear attack/scam.
- Suggested durations: if action is "timeout" provide an integer; otherwise null.
FORMAT & STYLE
- Keep "explanation" short & human-like (e.g., "Targeted slur against an individual — removed to protect members.").
- Provide only the JSON object, nothing else.
EXAMPLES
Input: "u r dumb and should die"
Output: {"action":"delete","category":"harassment","severity":"high","confidence":0.95,"explanation":"Direct death wish toward user","evidence":["u r dumb","should die"],"suggested_duration_minutes":60}
Input: "check this out: bit[.]ly/abc (free nitro)"
Output: {"action":"delete","category":"scam","severity":"high","confidence":0.9,"explanation":"Malicious nitro/scam link","evidence":["bit.ly/abc","free nitro"],"suggested_duration_minutes":null}`;

// AI moderation with OpenAI
async function checkWithOpenAI(content) {
    if (!OPENAI_API_KEY) return { action: 'allow' };

    try {
        const processedContent = normalizeText(content);
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-5',
                messages: [
                    { role: 'system', content: moderationSystemPrompt },
                    { role: 'user', content: processedContent }
                ],
                response_format: { type: "json_object" },
                temperature: 0.0,
                max_tokens: 300
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                }
            }
        );

        const result = JSON.parse(response.data.choices[0].message.content);
        return result;
    } catch (error) {
        console.error('OpenAI API error:', error.message);
        return { action: 'allow' };
    }
}

// Auto-moderation
async function autoModerate(message) {
    if (message.author.bot || hasPermission(message.member)) return false;

    const content = message.content;

    let isLocalViolation = false;
    let localReason = '';
    let localDuration = 0;

    if (message.mentions.users.size > 5 || message.mentions.roles.size > 3) {
        isLocalViolation = true;
        localReason = 'Mention spam detected';
        localDuration = 10;
    } else if ((content.match(/https?:\/\/[^\s]+/g) || []).length > 3) {
        isLocalViolation = true;
        localReason = 'Link spam detected';
        localDuration = 15;
    } else if (containsScamContent(content)) {
        isLocalViolation = true;
        localReason = 'Scam content detected';
        localDuration = 30;
    } else if (containsNSFWContent(content)) {
        isLocalViolation = true;
        localReason = 'Inappropriate content detected';
        localDuration = 20;
    }

    if (isLocalViolation) {
        return await handleViolation(message, localReason, localDuration);
    }

    if (OPENAI_API_KEY) {
        const aiResult = await checkWithOpenAI(content);
        if (aiResult.action !== 'allow') {
            return await handleAIViolation(message, aiResult);
        }
    }

    return false;
}

async function handleAIViolation(message, result) {
    try {
        const { action, category, severity, explanation, evidence, suggested_duration_minutes, confidence } = result;
        const reason = `${category} (${severity}, conf: ${confidence.toFixed(2)}) - ${explanation} Evidence: ${evidence.join(', ')}`;

        await message.delete().catch(() => {});

        if (action === 'warn') {
            try {
                await message.author.send({ embeds: [new EmbedBuilder()
                    .setTitle('⚠️ Warning')
                    .setDescription(`Warning in **${message.guild.name}**\n**Reason:** ${reason}`)
                    .setColor(0xFEE75C)
                    .setTimestamp()
                ] });
            } catch {}
            await logDeletedMessage(message, `AI Warn - ${reason}`);
            const warningMsg = await message.channel.send(`⚠️ <@${message.author.id}> Warning: ${explanation}`);
            setTimeout(() => warningMsg.delete().catch(() => {}), 60000);
            return true;
        } else if (action === 'delete') {
            await logDeletedMessage(message, `AI Delete - ${reason}`);
            return true;
        } else if (action === 'timeout') {
            const duration = suggested_duration_minutes || 60;
            await muteUser(message.member, duration, reason);
            await logModerationAction('AI Timeout', message.author, client.user, reason, duration);
            const muteMsg = await message.channel.send(`🔇 <@${message.author.id}> timed out for ${duration} min. Reason: ${explanation}`);
            setTimeout(() => muteMsg.delete().catch(() => {}), 60000);
            return true;
        } else if (action === 'ban') {
            await message.member.ban({ reason });
            await logModerationAction('AI Ban', message.author, client.user, reason);
            await message.channel.send(`🚫 <@${message.author.id}> banned. Reason: ${explanation}`);
            return true;
        } else if (action === 'review') {
            const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('🕵️ Message for Review')
                    .setColor(0xFEE75C)
                    .addFields(
                        { name: 'User', value: `<@${message.author.id}>`, inline: true },
                        { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                        { name: 'Content', value: message.content || '*No content*', inline: false },
                        { name: 'AI Analysis', value: reason, inline: false }
                    );
                await logChannel.send({ embeds: [embed], content: '@here Needs review' });
            }
            return true;
        }
    } catch (error) {
        console.error('AI violation handling error:', error);
        return false;
    }
}

async function handleViolation(message, reason, muteDuration) {
    // Existing handleViolation for local checks
    try {
        const strikes = await loadStrikes();
        const userKey = `${message.guild.id}-${message.author.id}`;

        if (!strikes[userKey]) strikes[userKey] = 0;
        strikes[userKey] += 1;
        await saveStrikes(strikes);

        await message.delete().catch(() => {});

        if (strikes[userKey] === 1) {
            try {
                await message.author.send({ embeds: [new EmbedBuilder()
                    .setTitle('⚠️ Warning')
                    .setDescription(`You've received a warning in **${message.guild.name}**\n**Reason:** ${reason}\n\nPlease follow the server rules to avoid further action.`)
                    .setColor(0xFEE75C)
                    .setTimestamp()
                ] });
            } catch {}
            await logDeletedMessage(message, `1st Strike - ${reason}`);

            const warningMsg = await message.channel.send(`⚠️ <@${message.author.id}> Your message was removed. This is your first warning.\n**Reason:** ${reason}`);
            setTimeout(() => warningMsg.delete().catch(() => {}), 60000);
            return true;
        }

        if (strikes[userKey] === 2) {
            try {
                await message.author.send({ embeds: [new EmbedBuilder()
                    .setTitle('⚠️ Final Warning')
                    .setDescription(`This is your **final warning** in **${message.guild.name}**\n**Reason:** ${reason}\n\nFurther violations will result in a mute.`)
                    .setColor(0xED4245)
                    .setTimestamp()
                ] });
            } catch {}
            await logDeletedMessage(message, `2nd Strike - ${reason}`);

            const warningMsg = await message.channel.send(`⚠️ <@${message.author.id}> This is your **final warning**. Further violations will result in a mute.\n**Reason:** ${reason}`);
            setTimeout(() => warningMsg.delete().catch(() => {}), 60000);
            return true;
        }

        await muteUser(message.member, muteDuration, reason);
        await logDeletedMessage(message, `Strike ${strikes[userKey]} - Muted for ${muteDuration} minutes - ${reason}`);
        await logModerationAction('Mute (Auto)', message.author, client.user, reason, muteDuration);

        const muteMsg = await message.channel.send(`🔇 <@${message.author.id}> has been muted for ${muteDuration} minutes.\n**Reason:** ${reason}`);
        setTimeout(() => muteMsg.delete().catch(() => {}), 60000);
        return true;
    } catch (error) {
        console.error('Violation handling error:', error);
        return false;
    }
}

async function muteUser(member, durationMinutes, reason) {
    try {
        const muteDuration = durationMinutes * 60 * 1000;
        await member.timeout(muteDuration, reason);
        return true;
    } catch (error) {
        console.error('Auto-mute error:', error);
        return false;
    }
}

// Conversation history
const conversationHistory = new Map();

// System prompt for conversation
const conversationSystemPrompt = `You are AutoModAI — a human-like, context-aware Discord moderation assistant. You can chat with users, answer questions, help with moderation, and engage in natural conversation. Be helpful, friendly, and witty. Detect roleplay, sarcasm, and context to respond appropriately.`;

// Get AI response for conversation
async function getAIResponse(content, channelId) {
    if (!OPENAI_API_KEY) return "Sorry, I can't respond right now.";

    try {
        let history = conversationHistory.get(channelId) || [];
        history.push({ role: 'user', content });

        if (history.length > 10) history = history.slice(-10);

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-5',
                messages: [
                    { role: 'system', content: conversationSystemPrompt },
                    ...history
                ],
                temperature: 0.7,
                max_tokens: 300
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                }
            }
        );

        const aiMsg = response.data.choices[0].message.content.trim();
        history.push({ role: 'assistant', content: aiMsg });
        conversationHistory.set(channelId, history);

        return aiMsg;
    } catch (error) {
        console.error('OpenAI conversation error:', error.message);
        return "Sorry, something went wrong.";
    }
}

// Slash commands definition
const commands = [
    new SlashCommandBuilder().setName('mute').setDescription('Mute a user')
        .addUserOption(opt => opt.setName('user').setDescription('The user to mute').setRequired(true))
        .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes (default: 10)').setRequired(false))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for mute').setRequired(false)),
    new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user')
        .addUserOption(opt => opt.setName('user').setDescription('The user to unmute').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for unmute').setRequired(false)),
    new SlashCommandBuilder().setName('unmuteall').setDescription('Unmute all muted users in the server')
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for unmute all').setRequired(false)),
    new SlashCommandBuilder().setName('purge').setDescription('Delete messages from channel (up to 250)')
        .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to delete (1-250)').setRequired(true)),
    new SlashCommandBuilder().setName('purgehumans').setDescription('Delete messages from humans only (up to 250)')
        .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to check (1-250)').setRequired(true)),
    new SlashCommandBuilder().setName('purgebots').setDescription('Delete messages from bots only (up to 250)')
        .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to check (1-250)').setRequired(true)),
    new SlashCommandBuilder().setName('lock').setDescription('Lock the current channel temporarily')
        .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes (0 = permanent)').setRequired(false).setMinValue(0))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for locking the channel').setRequired(false)),
    new SlashCommandBuilder().setName('unlock').setDescription('Unlock the current channel'),
    new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode for the current channel')
        .addIntegerOption(opt => opt.setName('seconds').setDescription('Seconds between messages (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600)),
    new SlashCommandBuilder().setName('warn').setDescription('Warn a user')
        .addUserOption(opt => opt.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for warning').setRequired(true)),
    new SlashCommandBuilder().setName('clearuser').setDescription('Delete messages from a specific user')
        .addUserOption(opt => opt.setName('user').setDescription('The user whose messages to delete').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages to check (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
    new SlashCommandBuilder().setName('nick').setDescription('Change a user\'s nickname')
        .addUserOption(opt => opt.setName('user').setDescription('The user to change nickname for').setRequired(true))
        .addStringOption(opt => opt.setName('nickname').setDescription('New nickname (leave empty to reset)').setRequired(false)),
    new SlashCommandBuilder().setName('topic').setDescription('Set the channel topic')
        .addStringOption(opt => opt.setName('text').setDescription('New channel topic').setRequired(true)),
    new SlashCommandBuilder().setName('announce').setDescription('Make an announcement')
        .addStringOption(opt => opt.setName('message').setDescription('Announcement message').setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to send announcement to').setRequired(false)),
    new SlashCommandBuilder().setName('membercount').setDescription('Show current server member count'),
    new SlashCommandBuilder().setName('memberanalytics').setDescription('Show detailed server member analytics and growth graph')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Temporary locks and warnings
const temporaryLocks = new Map();
const warnings = new Map();
const commandCooldowns = new Map();

// Ready event
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    temporaryLocks.clear();

    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// Periodic member count recording
client.on(Events.ClientReady, () => {
    client.guilds.cache.forEach(async guild => {
        await recordMemberCount(guild);
    });

    setInterval(async () => {
        client.guilds.cache.forEach(async guild => {
            await recordMemberCount(guild);
        });
    }, 6 * 60 * 60 * 1000);
});

// Handle messages for moderation and conversation
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    // Auto-moderate
    await autoModerate(message);

    // Conversational response
    let isDirected = message.mentions.has(client.user);
    if (message.reference) {
        try {
            const referenced = await message.fetchReference();
            if (referenced.author.id === client.user.id) isDirected = true;
        } catch {}
    }

    if (isDirected) {
        const response = await getAIResponse(message.content, message.channel.id);
        await message.reply(response);
    }
});

// Interaction create for slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!hasPermission(interaction.member)) return interaction.reply({ content: '❌ No permission!', ephemeral: true });

    // Existing slash command handlers (condensed)
    try {
        const { commandName, options } = interaction;
        // Implement as before...
    } catch (error) {
        console.error(error);
        if (!interaction.replied) await interaction.reply({ content: '❌ Error!', ephemeral: true });
    }
});

// Handle member updates for online counting
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    if (oldMember.presence?.status !== newMember.presence?.status) {
        clearTimeout(client.presenceUpdateTimeout);
        client.presenceUpdateTimeout = setTimeout(async () => {
            await recordMemberCount(newMember.guild);
        }, 30000);
    }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
