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
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping
    ]
});

// Data files
const DATA_FILE = './memberData.json';
const STRIKES_FILE = './strikes.json';

// Permission check
function hasPermission(member) {
    if (OWNER_IDS.includes(member.id)) return true;
    if (member.roles.cache.has(MOD_ROLE_ID)) return true;
    return false;
}

// Load/save member data
async function loadMemberData(guildId) {
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

// AI moderation with OpenAI
async function checkWithOpenAI(content) {
    if (!OPENAI_API_KEY) return { isViolation: false, reason: '' };

    try {
        const processedContent = normalizeText(content);
        const prompt = `You are Discord AutoMod AI - an advanced content moderation system for Discord servers. Your job is to analyze text messages for violations and respond with strict enforcement.
CONTEXT:
- This is a Discord text chat server with multiple users
- Messages are conversations between community members
- You must enforce Discord Terms of Service strictly
- Bypass attempts are common and must be detected
ANALYSIS FRAMEWORK:
1. First, identify if this is clearly normal conversation
2. Then check for any suspicious patterns or red flags
3. Finally, determine if it violates any rules
VIOLATION CATEGORIES (Flag ANY of these):
1. Scams/Fraud:
   - Phishing links, fake giveaways, nitro scams
   - Financial scams, fake job offers
   - Malware/virus distribution
2. Harassment:
   - Targeted attacks, doxxing, threats
   - Bullying, repeated harassment
   - Discrimination, hate speech
3. NSFW Content:
   - Explicit sexual content
   - Violence, self-harm promotion
   - Gore, illegal activities
4. Spam:
   - Repetitive messages, link spam
   - Mention spam, emoji spam
   - Server promotion without permission
5. Bypass Attempts (CRITICAL):
   - Unicode obfuscation, character substitution
   - Zero-width characters, invisible text
   - Leetspeak, mixed language obfuscation
   - Repeated characters to break filters
MESSAGE TO ANALYZE:
"${processedContent}"
RESPONSE FORMAT:
ONLY respond with:
"VIOLATION: [specific violation type] - [brief reason]" if it violates rules
"OK" if completely acceptable
BEHAVIOR GUIDELINES:
- Be extremely strict - if there's ANY doubt, flag it
- Prioritize community safety over false positives
- Consider context but flag suspicious content
- Treat bypass attempts as serious violations
EXAMPLES:
- "Free nitro here discord.gift/abc123" -> VIOLATION: Scam - Nitro phishing link
- "N1gg@ get out" -> VIOLATION: Hate speech - Racial slur with bypass
- "kys idiot" -> VIOLATION: Harassment - Encouraging self-harm
- "Check my stream at twitch.tv/..." -> VIOLATION: Spam - Unauthorized promotion
- "h3ll0 fr13nd$" -> VIOLATION: Bypass - Obfuscated greeting`;

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-5',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.0,
                max_tokens: 150
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                }
            }
        );

        const result = response.data.choices[0].message.content.trim();

        if (result.startsWith('VIOLATION:')) {
            return { isViolation: true, reason: result.replace('VIOLATION:', '').trim() };
        }

        return { isViolation: false, reason: '' };
    } catch (error) {
        console.error('OpenAI API error:', error.message);
        return { isViolation: false, reason: '' };
    }
}

async function checkWithAI(content) {
    return await checkWithOpenAI(content);
}

// Auto-moderation
async function autoModerate(message) {
    if (message.author.bot || hasPermission(message.member)) return false;

    const content = message.content;

    if (message.mentions.users.size > 5 || message.mentions.roles.size > 3) {
        return await handleViolation(message, 'Mention spam detected', 10);
    }

    const links = content.match(/https?:\/\/[^\s]+/g) || [];
    if (links.length > 3) {
        return await handleViolation(message, 'Link spam detected', 15);
    }

    if (containsScamContent(content)) {
        return await handleViolation(message, 'Scam content detected', 30);
    }

    if (containsNSFWContent(content)) {
        return await handleViolation(message, 'Inappropriate content detected', 20);
    }

    if (OPENAI_API_KEY) {
        const aiResult = await checkWithAI(content);
        if (aiResult.isViolation) {
            return await handleViolation(message, `AI detected: ${aiResult.reason}`, 25);
        }
    }

    return false;
}

async function handleViolation(message, reason, muteDuration) {
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

// Slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a user')
        .addUserOption(option => option.setName('user').setDescription('The user to mute').setRequired(true))
        .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes (default: 10)').setRequired(false))
        .addStringOption(option => option.setName('reason').setDescription('Reason for mute').setRequired(false)),
    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a user')
        .addUserOption(option => option.setName('user').setDescription('The user to unmute').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for unmute').setRequired(false)),
    new SlashCommandBuilder()
        .setName('unmuteall')
        .setDescription('Unmute all muted users in the server')
        .addStringOption(option => option.setName('reason').setDescription('Reason for unmute all').setRequired(false)),
    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from channel (up to 250)')
        .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to delete (1-250)').setRequired(true)),
    new SlashCommandBuilder()
        .setName('purgehumans')
        .setDescription('Delete messages from humans only (up to 250)')
        .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to check (1-250)').setRequired(true)),
    new SlashCommandBuilder()
        .setName('purgebots')
        .setDescription('Delete messages from bots only (up to 250)')
        .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to check (1-250)').setRequired(true)),
    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock the current channel temporarily')
        .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes (0 = permanent)').setRequired(false).setMinValue(0))
        .addStringOption(option => option.setName('reason').setDescription('Reason for locking the channel').setRequired(false)),
    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock the current channel'),
    new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode for the current channel')
        .addIntegerOption(option => option.setName('seconds').setDescription('Seconds between messages (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600)),
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option => option.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true)),
    new SlashCommandBuilder()
        .setName('clearuser')
        .setDescription('Delete messages from a specific user')
        .addUserOption(option => option.setName('user').setDescription('The user whose messages to delete').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to check (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
    new SlashCommandBuilder()
        .setName('nick')
        .setDescription('Change a user\'s nickname')
        .addUserOption(option => option.setName('user').setDescription('The user to change nickname for').setRequired(true))
        .addStringOption(option => option.setName('nickname').setDescription('New nickname (leave empty to reset)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('topic')
        .setDescription('Set the channel topic')
        .addStringOption(option => option.setName('text').setDescription('New channel topic').setRequired(true)),
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Make an announcement')
        .addStringOption(option => option.setName('message').setDescription('Announcement message').setRequired(true))
        .addChannelOption(option => option.setName('channel').setDescription('Channel to send announcement to').setRequired(false)),
    new SlashCommandBuilder()
        .setName('membercount')
        .setDescription('Show current server member count'),
    new SlashCommandBuilder()
        .setName('memberanalytics')
        .setDescription('Show detailed server member analytics and growth graph')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Temporary locks, warnings, cooldowns
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

// Periodic member count
client.on(Events.ClientReady, () => {
    client.guilds.cache.forEach(guild => recordMemberCount(guild));
    setInterval(() => client.guilds.cache.forEach(guild => recordMemberCount(guild)), 6 * 60 * 60 * 1000);
});

// Message create for auto-mod
client.on(Events.MessageCreate, message => {
    if (message.author.bot || !message.guild || hasPermission(message.member)) return;
    autoModerate(message);
});

// Interaction create for slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!hasPermission(interaction.member)) return interaction.reply({ content: '❌ No permission!', ephemeral: true });

    const { commandName, options, member, channel, guild } = interaction;

    try {
        if (commandName === 'mute') {
            const user = options.getUser('user');
            const duration = options.getInteger('duration') || 10;
            const reason = options.getString('reason') || 'No reason provided';
            const targetMember = await guild.members.fetch(user.id);
            if (!targetMember.moderatable || OWNER_IDS.includes(targetMember.id)) return interaction.reply({ content: '❌ Cannot mute this user!', ephemeral: true });
            await targetMember.timeout(duration * 60 * 1000, reason);
            await interaction.reply(`✅ <@${user.id}> has been muted for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`);
            await logModerationAction('Mute', user, member.user, reason, duration);
            try {
                await user.send({ embeds: [new EmbedBuilder()
                    .setTitle('🔇 You Have Been Muted')
                    .setDescription(`You have been muted in **${guild.name}** for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`)
                    .setColor(0xED4245)
                    .setTimestamp()
                ] });
            } catch {}
        } else if (commandName === 'unmute') {
            const user = options.getUser('user');
            const reason = options.getString('reason') || 'No reason provided';
            const targetMember = await guild.members.fetch(user.id);
            if (!targetMember.isCommunicationDisabled()) return interaction.reply({ content: '❌ This user is not currently muted!', ephemeral: true });
            await targetMember.timeout(null);
            await interaction.reply(`✅ <@${user.id}> has been unmuted.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`);
            await logModerationAction('Unmute', user, member.user, reason);
            try {
                await user.send({ embeds: [new EmbedBuilder()
                    .setTitle('🔊 You Have Been Unmuted')
                    .setDescription(`You have been unmuted in **${guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`)
                    .setColor(0x57F287)
                    .setTimestamp()
                ] });
            } catch {}
        } else if (commandName === 'unmuteall') {
            await interaction.deferReply();
            const reason = options.getString('reason') || 'No reason provided';
            let unmutedCount = 0;
            const members = await guild.members.fetch();
            for (const [, m] of members) {
                if (m.isCommunicationDisabled()) {
                    await m.timeout(null).catch(() => {});
                    unmutedCount++;
                }
            }
            await interaction.editReply(`✅ Unmuted ${unmutedCount} user(s).\n**Reason:** ${reason}`);
            await logBulkModerationAction('Unmute All', member.user, reason, unmutedCount);
            setTimeout(async () => {
                try {
                    const reply = await interaction.fetchReply();
                    await reply.delete();
                } catch {}
            }, 60000);
        } else if (commandName === 'purge') {
            const amount = options.getInteger('amount');
            if (amount < 1 || amount > 250) return interaction.reply({ content: '❌ Number between 1 and 250!', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            let deletedCount = 0;
            let remaining = amount;
            while (remaining > 0) {
                const batchSize = Math.min(remaining, 100);
                const fetched = await channel.messages.fetch({ limit: batchSize });
                if (fetched.size === 0) break;
                await channel.bulkDelete(fetched, true);
                deletedCount += fetched.size;
                remaining -= batchSize;
                if (remaining > 0) await new Promise(resolve => setTimeout(resolve, 1000));
            }
            await interaction.editReply(`✅ Successfully deleted ${deletedCount} messages!`);
            await logDeletedMessage({ author: member.user, channel, content: `/purge ${amount}` }, `Purged ${deletedCount} messages`, member.user);
            setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
        } else if (commandName === 'purgehumans') {
            const amount = options.getInteger('amount');
            if (amount < 1 || amount > 250) return interaction.reply({ content: '❌ Number between 1 and 250!', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            let deletedCount = 0;
            let remaining = amount;
            let checkedCount = 0;
            while (remaining > 0 && checkedCount < 1000) {
                const batchSize = Math.min(remaining, 100);
                const fetched = await channel.messages.fetch({ limit: batchSize });
                if (fetched.size === 0) break;
                const humanMessages = fetched.filter(msg => !msg.author.bot);
                if (humanMessages.size > 0) {
                    await channel.bulkDelete(humanMessages, true);
                    deletedCount += humanMessages.size;
                }
                checkedCount += fetched.size;
                remaining -= batchSize;
                if (remaining > 0) await new Promise(resolve => setTimeout(resolve, 1000));
            }
            await interaction.editReply(`✅ Successfully deleted ${deletedCount} human messages!`);
            await logDeletedMessage({ author: member.user, channel, content: `/purgehumans ${amount}` }, `Purged ${deletedCount} human messages`, member.user);
            setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
        } else if (commandName === 'purgebots') {
            const amount = options.getInteger('amount');
            if (amount < 1 || amount > 250) return interaction.reply({ content: '❌ Number between 1 and 250!', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            let deletedCount = 0;
            let remaining = amount;
            let checkedCount = 0;
            while (remaining > 0 && checkedCount < 1000) {
                const batchSize = Math.min(remaining, 100);
                const fetched = await channel.messages.fetch({ limit: batchSize });
                if (fetched.size === 0) break;
                const botMessages = fetched.filter(msg => msg.author.bot);
                if (botMessages.size > 0) {
                    await channel.bulkDelete(botMessages, true);
                    deletedCount += botMessages.size;
                }
                checkedCount += fetched.size;
                remaining -= batchSize;
                if (remaining > 0) await new Promise(resolve => setTimeout(resolve, 1000));
            }
            await interaction.editReply(`✅ Successfully deleted ${deletedCount} bot messages!`);
            await logDeletedMessage({ author: member.user, channel, content: `/purgebots ${amount}` }, `Purged ${deletedCount} bot messages`, member.user);
            setTimeout(() => interaction.deleteReply().catch(() => {}), 60000);
        } else if (commandName === 'lock') {
            const duration = options.getInteger('duration') || 0;
            const reason = options.getString('reason') || 'No reason provided';
            await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
            for (const ownerId of OWNER_IDS) {
                await channel.permissionOverwrites.create(ownerId, { SendMessages: true });
            }
            await interaction.reply(`🔒 Channel locked.\n**Reason:** ${reason}`);
            await logModerationAction('Lock Channel', guild, member.user, reason);
            if (duration > 0) {
                setTimeout(async () => {
                    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
                    for (const ownerId of OWNER_IDS) {
                        const overwrite = channel.permissionOverwrites.cache.get(ownerId);
                        if (overwrite) await overwrite.delete();
                    }
                    await channel.send(`🔓 Channel automatically unlocked after ${duration} minutes`);
                }, duration * 60 * 1000);
            }
        } else if (commandName === 'unlock') {
            await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
            for (const ownerId of OWNER_IDS) {
                const overwrite = channel.permissionOverwrites.cache.get(ownerId);
                if (overwrite) await overwrite.delete();
            }
            await interaction.reply('🔓 Channel unlocked');
            await logModerationAction('Unlock Channel', guild, member.user, 'Channel unlocked');
        } else if (commandName === 'slowmode') {
            const seconds = options.getInteger('seconds');
            await channel.setRateLimitPerUser(seconds);
            await interaction.reply(`⏱️ Slowmode set to ${seconds} seconds`);
            await logModerationAction('Slowmode Set', guild, member.user, `Set to ${seconds} seconds`);
        } else if (commandName === 'warn') {
            const user = options.getUser('user');
            const reason = options.getString('reason');
            if (!warnings.has(user.id)) warnings.set(user.id, []);
            warnings.get(user.id).push({ reason, moderator: member.user.tag, timestamp: new Date() });
            await interaction.reply(`⚠️ <@${user.id}> warned.\n**Reason:** ${reason}`);
            await logModerationAction('Warn', user, member.user, reason);
            try {
                await user.send({ embeds: [new EmbedBuilder()
                    .setTitle('⚠️ Warned')
                    .setDescription(`Warned in ${guild.name}.\nReason: ${reason}`)
                    .setColor(0xFEE75C)
                ] });
            } catch {}
        } else if (commandName === 'clearuser') {
            const user = options.getUser('user');
            const amount = options.getInteger('amount');
            await interaction.deferReply({ ephemeral: true });
            let deletedCount = 0;
            let remaining = amount;
            while (remaining > 0) {
                const batch = Math.min(remaining, 100);
                const msgs = await channel.messages.fetch({ limit: batch });
                if (msgs.size === 0) break;
                const userMsgs = msgs.filter(msg => msg.author.id === user.id);
                if (userMsgs.size > 0) {
                    await channel.bulkDelete(userMsgs, true);
                    deletedCount += userMsgs.size;
                }
                remaining -= batch;
                if (remaining > 0) await new Promise(r => setTimeout(r, 1000));
            }
            await interaction.editReply(`✅ Deleted ${deletedCount} messages from <@${user.id}>!`);
            await logDeletedMessage({ author: member.user, channel, content: `/clearuser ${user.id} ${amount}` }, `Cleared ${deletedCount} messages from user`, member.user);
        } else if (commandName === 'nick') {
            const user = options.getUser('user');
            const nickname = options.getString('nickname') || '';
            const target = await guild.members.fetch(user.id);
            await target.setNickname(nickname);
            await interaction.reply(`✅ Nickname for <@${user.id}> set to ${nickname || 'reset'}`);
            await logModerationAction('Nickname Change', user, member.user, `Set to: ${nickname || 'reset'}`);
        } else if (commandName === 'topic') {
            const text = options.getString('text');
            await channel.setTopic(text);
            await interaction.reply(`✅ Topic set to: ${text}`);
            await logModerationAction('Topic Change', guild, member.user, `Set to: ${text}`);
        } else if (commandName === 'announce') {
            const messageText = options.getString('message');
            const targetChannel = options.getChannel('channel') || channel;
            await targetChannel.send(`📢 **Announcement**\n\n${messageText}\n\n*Posted by <@${member.user.id}>*`);
            await interaction.reply(`✅ Announcement posted in <#${targetChannel.id}>`, { ephemeral: true });
            await logModerationAction('Announcement', guild, member.user, messageText.substring(0, 50) + '...');
        } else if (commandName === 'membercount') {
            const online = guild.members.cache.filter(m => m.presence && ['online', 'idle', 'dnd'].includes(m.presence.status)).size;
            const embed = new EmbedBuilder().setTitle('📊 Member Count').setColor(0x5865F2)
                .addFields(
                    { name: 'Total Members', value: guild.memberCount.toString(), inline: true },
                    { name: 'Online Members', value: online.toString(), inline: true }
                ).setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } else if (commandName === 'memberanalytics') {
            await interaction.deferReply();
            const memberData = await recordMemberCount(guild);
            if (memberData.length < 2) return await interaction.editReply('⚠️ Not enough data collected yet.');
            const currentData = memberData[memberData.length - 1];
            const previousData = memberData[memberData.length - 2];
            const growth24h = currentData.totalMembers - previousData.totalMembers;
            const growthRate = previousData.totalMembers > 0 ? ((growth24h / previousData.totalMembers) * 100).toFixed(2) : '0.00';
            const sevenDaysAgoIndex = Math.max(0, memberData.length - 7);
            const growth7d = currentData.totalMembers - memberData[sevenDaysAgoIndex].totalMembers;
            const chartData = memberData.slice(-30);
            const labels = chartData.map(point => new Date(point.timestamp).toLocaleDateString());
            const totalMembersData = chartData.map(point => point.totalMembers);
            const humanMembersData = chartData.map(point => point.humanMembers);
            const onlineMembersData = chartData.map(point => point.onlineMembers);
            const chart = new QuickChart();
            chart.setConfig({
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Total Members', data: totalMembersData, borderColor: '#5865F2', backgroundColor: 'rgba(88, 101, 242, 0.1)', fill: false, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#5865F2', borderWidth: 3 },
                        { label: 'Humans', data: humanMembersData, borderColor: '#3BA55D', backgroundColor: 'rgba(59, 165, 93, 0.1)', fill: false, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#3BA55D', borderWidth: 2 },
                        { label: 'Online Members', data: onlineMembersData, borderColor: '#ED4245', backgroundColor: 'rgba(237, 66, 69, 0.1)', fill: false, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#ED4245', borderWidth: 2 }
                    ]
                },
                options: {
                    plugins: {
                        title: { display: true, text: `${guild.name} - Member Growth`, font: { size: 16, weight: 'bold' }, color: '#ffffff' },
                        legend: { position: 'top', labels: { color: '#ffffff', font: { size: 12 } } }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#ffffff' } },
                        x: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#ffffff' } }
                    }
                }
            });
            chart.setWidth(800).setHeight(400).setBackgroundColor('#2C2F33');
            const chartUrl = await chart.getShortUrl();
            const attachment = new AttachmentBuilder(await axios.get(chartUrl, { responseType: 'arraybuffer' }).then(res => res.data), { name: 'member-analytics.png' });
            const statsText = `📊 **Server Analytics**\n\n` +
                `👥 **Current Members:** ${currentData.totalMembers.toLocaleString()}\n` +
                `🧑 Humans: ${currentData.humanMembers.toLocaleString()}\n` +
                `🟢 Online: ${currentData.onlineMembers.toLocaleString()}\n` +
                `🤖 Bots: ${currentData.botMembers.toLocaleString()}\n\n` +
                `📈 **Recent Growth:**\n` +
                `24h: ${growth24h >= 0 ? '+' : ''}${growth24h} members (${growthRate}%)\n` +
                `7d: ${growth7d >= 0 ? '+' : ''}${growth7d} members\n\n` +
                `📅 Data points: ${memberData.length}`;
            await interaction.editReply({ content: statsText, files: [attachment] });
        }
    } catch (error) {
        console.error('Interaction error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Error executing command!', ephemeral: true });
        } else {
            await interaction.editReply({ content: '❌ Error executing command!', ephemeral: true });
        }
    }
});

// Guild member update for presence changes
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    if (oldMember.presence?.status !== newMember.presence?.status) {
        clearTimeout(client.presenceUpdateTimeout);
        client.presenceUpdateTimeout = setTimeout(() => recordMemberCount(newMember.guild), 30000);
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
