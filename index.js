require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');
const fs = require('fs').promises;
const axios = require('axios');

// Configuration - Using environment variable for OWNER_IDS
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || '1398413061169352949';
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',') : ['YOUR_DISCORD_USER_ID'];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const LOG_CHANNEL_ID = '1404675690007105596'; // Log channel ID

// Create a new client instance
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

// Check if user has permission to use commands
function hasPermission(member) {
    // Check if user is owner
    if (OWNER_IDS.includes(member.id)) return true;
    
    // Check if user has the specific mod role
    if (member.roles.cache.has(MOD_ROLE_ID)) return true;
    
    return false;
}

// Data file path
const DATA_FILE = './memberData.json';
const STRIKES_FILE = './strikes.json';

// Load member data from file
async function loadMemberData(guildId) {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const allData = JSON.parse(data);
        return allData[guildId] || [];
    } catch (error) {
        return [];
    }
}

// Save member data to file
async function saveMemberData(guildId, data) {
    try {
        let allData = {};
        try {
            const fileData = await fs.readFile(DATA_FILE, 'utf8');
            allData = JSON.parse(fileData);
        } catch (error) {
            // File doesn't exist or is invalid, start fresh
        }
        
        allData[guildId] = data;
        await fs.writeFile(DATA_FILE, JSON.stringify(allData, null, 2));
    } catch (error) {
        console.error('Error saving member data:', error);
    }
}

// Load strikes data
async function loadStrikes() {
    try {
        const data = await fs.readFile(STRIKES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Save strikes data
async function saveStrikes(strikes) {
    try {
        await fs.writeFile(STRIKES_FILE, JSON.stringify(strikes, null, 2));
    } catch (error) {
        console.error('Error saving strikes:', error);
    }
}

// Record member count with proper online counting
async function recordMemberCount(guild) {
    const now = new Date();
    
    // Properly count online members
    const onlineMembers = guild.members.cache.filter(member => {
        return member.presence && 
               (member.presence.status === 'online' || 
                member.presence.status === 'idle' || 
                member.presence.status === 'dnd');
    }).size;
    
    const dataPoint = {
        timestamp: now.toISOString(),
        totalMembers: guild.memberCount,
        humanMembers: guild.members.cache.filter(m => !m.user.bot).size,
        botMembers: guild.members.cache.filter(m => m.user.bot).size,
        onlineMembers: onlineMembers
    };

    const memberData = await loadMemberData(guild.id);
    memberData.push(dataPoint);
    
    // Keep only last 30 days of data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const filteredData = memberData.filter(point => 
        new Date(point.timestamp) > thirtyDaysAgo
    );
    
    await saveMemberData(guild.id, filteredData);
    return filteredData;
}

// Log deleted messages
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
                { name: 'Content', value: message.content.length > 1024 ? message.content.substring(0, 1021) + '...' : message.content || '*No content*', inline: false }
            )
            .setTimestamp();
            
        if (actionBy) {
            embed.addFields({ name: 'Action By', value: `<@${actionBy.id}> (${actionBy.tag})`, inline: false });
        }
            
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error logging deleted message:', error);
    }
}

// Log moderation actions
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
            
        if (duration) {
            embed.addFields({ name: 'Duration', value: `${duration} minutes`, inline: true });
        }
            
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error logging moderation action:', error);
    }
}

// Log bulk moderation actions (for unmute all)
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

// Auto-moderation patterns
const scamLinks = [
    'discord.gift', 'discordapp.com/gifts', 'discord.com/gifts', 'bit.ly', 'tinyurl.com',
    'free-nitro', 'nitro-free', 'free discord nitro', 'claim nitro',
    'steamcomminuty', 'steamcommunlty', 'robuxfree',
    'paypal', 'cashapp', 'venmo', 'zelle', 'westernunion', 'moneygram'
];

const scamKeywords = [
    'free nitro', 'nitro for free', 'claim nitro',
    'steam wallet', 'free robux', 'robux generator', 'paypal money',
    'cash app hack', 'get free money', 'make money fast', 'easy money'
];

const nsfwWords = [
    'nigga', 'nigger', 'faggot', 'kys', 'kill yourself', 'suicide',
    'porn', 'xxx', 'sex', 'rape', 'pedo', 'pedophile'
];

// Check if message contains scam content
function containsScamContent(content) {
    const lowerContent = content.toLowerCase();
    
    // Check for scam links
    for (const link of scamLinks) {
        if (lowerContent.includes(link)) return true;
    }
    
    // Check for scam keywords
    for (const keyword of scamKeywords) {
        if (lowerContent.includes(keyword)) return true;
    }
    
    return false;
}

// Check if message contains NSFW content
function containsNSFWContent(content) {
    const lowerContent = content.toLowerCase();
    
    for (const word of nsfwWords) {
        if (lowerContent.includes(word)) return true;
    }
    
    return false;
}

// Check message with Gemini AI
async function checkWithGemini(content) {
    if (!GEMINI_API_KEY) return { isViolation: false, reason: '' };
    
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [{
                        text: `Analyze this message for violations. Respond ONLY with "VIOLATION: [reason]" if it violates Discord terms or "OK" if it's fine:\n\n"${content}"`
                    }]
                }]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        
        const result = response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'OK';
        
        if (result.startsWith('VIOLATION:')) {
            return {
                isViolation: true,
                reason: result.replace('VIOLATION:', '').trim()
            };
        }
        
        return { isViolation: false, reason: '' };
    } catch (error) {
        console.error('Gemini API error:', error.message);
        return { isViolation: false, reason: '' };
    }
}

// Auto-moderation function with strike system
async function autoModerate(message) {
    // Skip bot messages and users with permissions
    if (message.author.bot || hasPermission(message.member)) return false;
    
    const content = message.content;
    
    // Check for spam (too many mentions)
    if (message.mentions.users.size > 5 || message.mentions.roles.size > 3) {
        return await handleViolation(message, 'Mention spam detected', 10);
    }
    
    // Check for link spam
    const links = content.match(/https?:\/\/[^\s]+/g) || [];
    if (links.length > 3) {
        return await handleViolation(message, 'Link spam detected', 15);
    }
    
    // Check for scam content
    if (containsScamContent(content)) {
        return await handleViolation(message, 'Scam content detected', 30);
    }
    
    // Check for NSFW content
    if (containsNSFWContent(content)) {
        return await handleViolation(message, 'Inappropriate content detected', 20);
    }
    
    // Check with Gemini AI if enabled
    if (GEMINI_API_KEY) {
        const geminiResult = await checkWithGemini(content);
        if (geminiResult.isViolation) {
            return await handleViolation(message, `AI detected violation: ${geminiResult.reason}`, 25);
        }
    }
    
    return false;
}

// Handle violations with strike system
async function handleViolation(message, reason, muteDuration) {
    try {
        const strikes = await loadStrikes();
        const userId = message.author.id;
        const guildId = message.guild.id;
        const userKey = `${guildId}-${userId}`;
        
        // Initialize strikes for user if not exists
        if (!strikes[userKey]) {
            strikes[userKey] = 0;
        }
        
        strikes[userKey] += 1;
        await saveStrikes(strikes);
        
        // First strike - warning
        if (strikes[userKey] === 1) {
            // Send DM warning
            try {
                await message.author.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('⚠️ Warning')
                        .setDescription(`You've received a warning in **${message.guild.name}**\n**Reason:** ${reason}\n\nPlease follow the server rules to avoid further action.`)
                        .setColor(0xFEE75C)
                        .setTimestamp()
                    ]
                });
            } catch (error) {
                console.log('Could not send DM to user');
            }
            
            // Delete message
            await message.delete().catch(() => {});
            await logDeletedMessage(message, `1st Strike - ${reason}`);
            
            // Show temporary warning message
            const warningMsg = await message.channel.send({
                content: `⚠️ <@${message.author.id}> Your message was removed. This is your first warning.\n**Reason:** ${reason}`
            });
            
            // Delete warning after 1 minute
            setTimeout(() => {
                warningMsg.delete().catch(() => {});
            }, 60000);
            
            return true;
        }
        
        // Second strike - delete and warn again
        if (strikes[userKey] === 2) {
            // Send DM warning
            try {
                await message.author.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('⚠️ Final Warning')
                        .setDescription(`This is your **final warning** in **${message.guild.name}**\n**Reason:** ${reason}\n\nFurther violations will result in a mute.`)
                        .setColor(0xED4245)
                        .setTimestamp()
                    ]
                });
            } catch (error) {
                console.log('Could not send DM to user');
            }
            
            // Delete message
            await message.delete().catch(() => {});
            await logDeletedMessage(message, `2nd Strike - ${reason}`);
            
            // Show temporary warning message
            const warningMsg = await message.channel.send({
                content: `⚠️ <@${message.author.id}> This is your **final warning**. Further violations will result in a mute.\n**Reason:** ${reason}`
            });
            
            // Delete warning after 1 minute
            setTimeout(() => {
                warningMsg.delete().catch(() => {});
            }, 60000);
            
            return true;
        }
        
        // Third strike and beyond - mute user
        await muteUser(message.member, muteDuration, reason);
        await message.delete().catch(() => {});
        await logDeletedMessage(message, `Strike ${strikes[userKey]} - Muted for ${muteDuration} minutes - ${reason}`);
        await logModerationAction('Mute (Auto)', message.author, client.user, reason, muteDuration);
        
        // Show temporary mute message
        const muteMsg = await message.channel.send({
            content: `🔇 <@${message.author.id}> has been muted for ${muteDuration} minutes.\n**Reason:** ${reason}`
        });
        
        // Delete mute message after 1 minute
        setTimeout(() => {
            muteMsg.delete().catch(() => {});
        }, 60000);
        
        return true;
    } catch (error) {
        console.error('Violation handling error:', error);
        return false;
    }
}

// Mute user function
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

// Command definitions
const commands = [
    // Mute command
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to mute')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in minutes (default: 10)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for mute')
                .setRequired(false)),

    // Unmute command
    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to unmute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for unmute')
                .setRequired(false)),

    // Unmute all command
    new SlashCommandBuilder()
        .setName('unmuteall')
        .setDescription('Unmute all muted users in the server')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for unmute all')
                .setRequired(false)),

    // Purge all messages (up to 250)
    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from channel (up to 250)')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-250)')
                .setRequired(true)),

    // Purge human messages only
    new SlashCommandBuilder()
        .setName('purgehumans')
        .setDescription('Delete messages from humans only (up to 250)')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to check (1-250)')
                .setRequired(true)),

    // Purge bot messages only
    new SlashCommandBuilder()
        .setName('purgebots')
        .setDescription('Delete messages from bots only (up to 250)')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to check (1-250)')
                .setRequired(true)),

    // Lock channel command with duration and reason
    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock the current channel temporarily')
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in minutes (0 = permanent)')
                .setRequired(false)
                .setMinValue(0))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for locking the channel')
                .setRequired(false)),

    // Unlock channel command
    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock the current channel'),

    // Slowmode command
    new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode for the current channel')
        .addIntegerOption(option =>
            option.setName('seconds')
                .setDescription('Seconds between messages (0 to disable)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600)),

    // Warn command
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to warn')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for warning')
                .setRequired(true)),

    // Clear user messages command
    new SlashCommandBuilder()
        .setName('clearuser')
        .setDescription('Delete messages from a specific user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose messages to delete')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to check (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)),

    // Nickname command
    new SlashCommandBuilder()
        .setName('nick')
        .setDescription('Change a user\'s nickname')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to change nickname for')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('nickname')
                .setDescription('New nickname (leave empty to reset)')
                .setRequired(false)),

    // Channel topic command
    new SlashCommandBuilder()
        .setName('topic')
        .setDescription('Set the channel topic')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('New channel topic')
                .setRequired(true)),

    // Announce command
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Make an announcement')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Announcement message')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send announcement to')
                .setRequired(false)),

    // Member count command
    new SlashCommandBuilder()
        .setName('membercount')
        .setDescription('Show current server member count'),

    // Member analytics command
    new SlashCommandBuilder()
        .setName('memberanalytics')
        .setDescription('Show detailed server member analytics and growth graph')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Store for temporary locks
const temporaryLocks = new Map();

// Store for warnings (in production, use a database)
const warnings = new Map();

// Store for command cooldowns
const commandCooldowns = new Map();

// Register commands
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    
    // Clear any existing temporary locks on startup
    temporaryLocks.clear();
    
    try {
        console.log('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// Record member count when bot starts and every 6 hours
client.on(Events.ClientReady, async () => {
    // Record for all guilds
    client.guilds.cache.forEach(async guild => {
        await recordMemberCount(guild);
    });
    
    // Set up interval to record every 6 hours
    setInterval(async () => {
        client.guilds.cache.forEach(async guild => {
            await recordMemberCount(guild);
        });
    }, 6 * 60 * 60 * 1000); // 6 hours
});

// Handle traditional prefix commands
client.on(Events.MessageCreate, async message => {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;
    
    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;
    
    // Check permissions
    if (!hasPermission(message.member)) {
        return message.reply('❌ You don\'t have permission to use this command!');
    }
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // Command cooldown (3 seconds)
    const cooldownKey = `${message.author.id}-${command}`;
    const lastCommand = commandCooldowns.get(cooldownKey);
    const now = Date.now();
    
    if (lastCommand && now - lastCommand < 3000) {
        return message.reply('⏰ Please wait before using this command again!');
    }
    
    commandCooldowns.set(cooldownKey, now);
    setTimeout(() => commandCooldowns.delete(cooldownKey), 3000);
    
    try {
        if (command === 'mute') {
            const user = message.mentions.users.first();
            if (!user) return message.reply('❌ Please mention a user to mute!');
            
            const member = message.guild.members.cache.get(user.id);
            if (!member) return message.reply('❌ User not found!');
            
            const duration = args[1] ? parseInt(args[1]) : 10;
            const reason = args.slice(2).join(' ') || 'No reason provided';
            
            if (isNaN(duration)) return message.reply('❌ Please provide a valid duration in minutes!');
            
            // Check if user can be muted
            if (!member.moderatable) {
                return message.reply('❌ I cannot mute this user! Make sure my role is higher than theirs.');
            }
            
            // Check if trying to mute owner or user with higher role
            if (OWNER_IDS.includes(member.id)) {
                return message.reply('❌ You cannot mute the bot owner!');
            }
            
            const muteDuration = duration * 60 * 1000;
            await member.timeout(muteDuration, reason);
            
            const reply = await message.reply(`✅ <@${user.id}> has been muted for ${duration} minutes.\n**Reason:** ${reason}`);
            
            // Log action
            await logModerationAction('Mute', user, message.author, reason, duration);
            
            // Send DM to user
            try {
                await user.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🔇 You Have Been Muted')
                        .setDescription(`You have been muted in **${message.guild.name}** for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** <@${message.author.id}>`)
                        .setColor(0xED4245)
                        .setTimestamp()
                    ]
                });
            } catch (error) {
                console.log('Could not send DM to user');
            }
            
            // Delete reply after 1 minute
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 60000);
        }
        
        else if (command === 'unmute') {
            const user = message.mentions.users.first();
            if (!user) return message.reply('❌ Please mention a user to unmute!');
            
            const member = message.guild.members.cache.get(user.id);
            if (!member) return message.reply('❌ User not found!');
            
            const reason = args.join(' ') || 'No reason provided';
            
            // Check if user is currently muted
            if (!member.isCommunicationDisabled()) {
                return message.reply('❌ This user is not currently muted!');
            }
            
            try {
                await member.timeout(null);
                const reply = await message.reply(`✅ <@${user.id}> has been unmuted.\n**Reason:** ${reason}`);
                
                // Log action
                await logModerationAction('Unmute', user, message.author, reason);
                
                // Send DM to user
                try {
                    await user.send({
                        embeds: [new EmbedBuilder()
                            .setTitle('🔊 You Have Been Unmuted')
                            .setDescription(`You have been unmuted in **${message.guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${message.author.id}>`)
                            .setColor(0x57F287)
                            .setTimestamp()
                        ]
                    });
                } catch (error) {
                    console.log('Could not send DM to user');
                }
                
                // Delete reply after 1 minute
                setTimeout(() => {
                    reply.delete().catch(() => {});
                }, 60000);
            } catch (error) {
                console.error('Unmute error:', error);
                message.reply('❌ Failed to unmute the user.');
            }
        }
        
        else if (command === 'unmuteall') {
            try {
                const reason = args.join(' ') || 'No reason provided';
                let unmutedCount = 0;
                
                // Get all members and unmute those who are timed out
                const members = await message.guild.members.fetch();
                for (const [id, member] of members) {
                    if (member.isCommunicationDisabled()) {
                        try {
                            await member.timeout(null);
                            unmutedCount++;
                        } catch (error) {
                            // Ignore errors for individual users
                        }
                    }
                }
                
                const reply = await message.reply(`✅ Unmuted ${unmutedCount} user(s).\n**Reason:** ${reason}`);
                
                // Log action
                await logBulkModerationAction('Unmute All', message.author, reason, unmutedCount);
                
                // Delete reply after 1 minute
                setTimeout(() => {
                    reply.delete().catch(() => {});
                }, 60000);
            } catch (error) {
                console.error('Unmute all error:', error);
                message.reply('❌ Failed to unmute all users.');
            }
        }
        
        else if (command === 'purge') {
            const amount = parseInt(args[0]);
            if (!amount || amount < 1 || amount > 100) {
                return message.reply('❌ Please provide a number between 1 and 100!');
            }
            
            try {
                await message.delete(); // Delete the command message
                const fetched = await message.channel.messages.fetch({ limit: amount });
                await message.channel.bulkDelete(fetched, true);
                
                // Log action
                await logDeletedMessage({
                    author: message.author,
                    channel: message.channel,
                    content: `!purge ${amount}`
                }, `Purged ${fetched.size} messages`, message.author);
                
                const confirmMsg = await message.channel.send(`✅ Successfully deleted ${fetched.size} messages!`);
                setTimeout(() => confirmMsg.delete().catch(() => {}), 60000);
            } catch (error) {
                console.error('Purge error:', error);
                message.reply('❌ Failed to delete messages.');
            }
        }
        
        else if (command === 'lock') {
            const duration = args[0] ? parseInt(args[0]) : 0;
            const reason = args.slice(1).join(' ') || 'No reason provided';
            
            try {
                // Update channel permissions to deny SEND_MESSAGES for @everyone
                await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    SendMessages: false
                });
                
                // Allow owners to still send messages
                for (const ownerId of OWNER_IDS) {
                    await message.channel.permissionOverwrites.create(ownerId, {
                        SendMessages: true
                    });
                }
                
                const reply = await message.reply(`🔒 Channel has been locked\n**Reason:** ${reason}`);
                
                // Log action
                await logModerationAction('Lock Channel', message.guild, message.author, reason);
                
                if (duration > 0) {
                    // Schedule automatic unlock
                    setTimeout(async () => {
                        try {
                            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                                SendMessages: null
                            });
                            
                            // Remove owner-specific permissions
                            for (const ownerId of OWNER_IDS) {
                                const ownerOverwrite = message.channel.permissionOverwrites.cache.get(ownerId);
                                if (ownerOverwrite) {
                                    await ownerOverwrite.delete();
                                }
                            }
                            
                            await message.channel.send(`🔓 Channel has been automatically unlocked after ${duration} minutes`);
                        } catch (error) {
                            console.error('Auto-unlock error:', error);
                        }
                    }, duration * 60 * 1000);
                }
                
                // Delete reply after 1 minute
                setTimeout(() => {
                    reply.delete().catch(() => {});
                }, 60000);
            } catch (error) {
                console.error('Lock error:', error);
                message.reply('❌ Failed to lock the channel.');
            }
        }
        
        else if (command === 'unlock') {
            try {
                await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    SendMessages: null
                });
                
                // Remove owner-specific permissions
                for (const ownerId of OWNER_IDS) {
                    const ownerOverwrite = message.channel.permissionOverwrites.cache.get(ownerId);
                    if (ownerOverwrite) {
                        await ownerOverwrite.delete();
                    }
                }
                
                const reply = await message.reply('🔓 Channel has been unlocked');
                
                // Log action
                await logModerationAction('Unlock Channel', message.guild, message.author, 'Channel unlocked');
                
                // Delete reply after 1 minute
                setTimeout(() => {
                    reply.delete().catch(() => {});
                }, 60000);
            } catch (error) {
                console.error('Unlock error:', error);
                message.reply('❌ Failed to unlock the channel.');
            }
        }
        
        else if (command === 'warn') {
            const user = message.mentions.users.first();
            if (!user) return message.reply('❌ Please mention a user to warn!');
            
            const member = message.guild.members.cache.get(user.id);
            if (!member) return message.reply('❌ User not found!');
            
            const reason = args.join(' ') || 'No reason provided';
            if (!reason) return message.reply('❌ Please provide a reason for the warning!');
            
            // Store warning
            if (!warnings.has(user.id)) {
                warnings.set(user.id, []);
            }
            const userWarnings = warnings.get(user.id);
            userWarnings.push({
                reason: reason,
                moderator: message.author.tag,
                timestamp: new Date()
            });
            
            const reply = await message.reply(`⚠️ <@${user.id}> has been warned.\n**Reason:** ${reason}`);
            
            // Log action
            await logModerationAction('Warn', user, message.author, reason);
            
            // Send DM to user
            try {
                await user.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('⚠️ You Have Been Warned')
                        .setDescription(`You have been warned in **${message.guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${message.author.id}>`)
                        .setColor(0xFEE75C)
                        .setTimestamp()
                    ]
                });
            } catch (error) {
                console.log('Could not send DM to user');
            }
            
            // Delete reply after 1 minute
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 60000);
        }
        
        else if (command === 'nick') {
            const user = message.mentions.users.first();
            if (!user) return message.reply('❌ Please mention a user to change nickname for!');
            
            const member = message.guild.members.cache.get(user.id);
            if (!member) return message.reply('❌ User not found!');
            
            const nickname = args.join(' ') || '';
            
            try {
                await member.setNickname(nickname);
                if (nickname) {
                    const reply = await message.reply(`✅ Changed nickname of <@${user.id}> to ${nickname}`);
                    
                    // Log action
                    await logModerationAction('Nickname Change', user, message.author, `Changed to: ${nickname}`);
                    
                    // Delete reply after 1 minute
                    setTimeout(() => {
                        reply.delete().catch(() => {});
                    }, 60000);
                } else {
                    const reply = await message.reply(`✅ Reset nickname of <@${user.id}>`);
                    
                    // Log action
                    await logModerationAction('Nickname Reset', user, message.author, 'Nickname reset');
                    
                    // Delete reply after 1 minute
                    setTimeout(() => {
                        reply.delete().catch(() => {});
                    }, 60000);
                }
            } catch (error) {
                console.error('Nickname error:', error);
                message.reply('❌ Failed to change nickname.');
            }
        }
        
        else if (command === 'slowmode') {
            const seconds = parseInt(args[0]);
            if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
                return message.reply('❌ Please provide a valid number of seconds (0-21600)!');
            }
            
            try {
                await message.channel.setRateLimitPerUser(seconds);
                if (seconds === 0) {
                    const reply = await message.reply('⏱️ Slowmode has been disabled');
                    
                    // Log action
                    await logModerationAction('Slowmode Disabled', message.guild, message.author, 'Slowmode disabled');
                    
                    // Delete reply after 1 minute
                    setTimeout(() => {
                        reply.delete().catch(() => {});
                    }, 60000);
                } else {
                    const reply = await message.reply(`⏱️ Slowmode has been set to ${seconds} seconds`);
                    
                    // Log action
                    await logModerationAction('Slowmode Set', message.guild, message.author, `Set to ${seconds} seconds`);
                    
                    // Delete reply after 1 minute
                    setTimeout(() => {
                        reply.delete().catch(() => {});
                    }, 60000);
                }
            } catch (error) {
                console.error('Slowmode error:', error);
                message.reply('❌ Failed to set slowmode.');
            }
        }
        
    } catch (error) {
        console.error('Command error:', error);
        message.reply('❌ There was an error while executing this command!');
    }
});

// Handle auto-moderation
client.on(Events.MessageCreate, async message => {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;
    
    // Skip messages from users with permissions
    if (hasPermission(message.member)) return;
    
    // Auto-moderate the message
    const wasModerated = await autoModerate(message);
    
    // Note: Warning messages are handled in autoModerate function
});

// Handle interactions (slash commands)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, channel } = interaction;

    // Check permissions
    if (!hasPermission(member)) {
        return await interaction.reply({
            content: '❌ You don\'t have permission to use this command! You need the Moderator role or be the bot owner.',
            ephemeral: true
        });
    }

    try {
        // Mute command
        if (commandName === 'mute') {
            const user = options.getUser('user');
            const duration = options.getInteger('duration') || 10;
            const reason = options.getString('reason') || 'No reason provided';
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Check if user can be muted
            if (!targetMember.moderatable) {
                return await interaction.reply({
                    content: '❌ I cannot mute this user! Make sure my role is higher than theirs.',
                    ephemeral: true
                });
            }

            // Check if trying to mute owner or user with higher role
            if (OWNER_IDS.includes(targetMember.id)) {
                return await interaction.reply({
                    content: '❌ You cannot mute the bot owner!',
                    ephemeral: true
                });
            }

            const muteDuration = duration * 60 * 1000; // Convert to milliseconds
            
            await targetMember.timeout(muteDuration, reason);
            
            await interaction.reply({
                content: `✅ <@${user.id}> has been muted for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
            });

            // Log action
            await logModerationAction('Mute', user, member.user, reason, duration);
            
            // Send DM to user with moderator info
            try {
                await user.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🔇 You Have Been Muted')
                        .setDescription(`You have been muted in **${interaction.guild.name}** for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`)
                        .setColor(0xED4245)
                        .setTimestamp()
                    ]
                });
            } catch (error) {
                console.log('Could not send DM to user');
            }
        }

        // Unmute command
        else if (commandName === 'unmute') {
            const user = options.getUser('user');
            const reason = options.getString('reason') || 'No reason provided';
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Check if user is currently muted
            if (!targetMember.isCommunicationDisabled()) {
                return await interaction.reply({
                    content: '❌ This user is not currently muted!',
                    ephemeral: true
                });
            }

            try {
                // Remove timeout
                await targetMember.timeout(null);
                
                await interaction.reply({
                    content: `✅ <@${user.id}> has been unmuted.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
                });

                // Log action
                await logModerationAction('Unmute', user, member.user, reason);
                
                // Send DM to user with moderator info
                try {
                    await user.send({
                        embeds: [new EmbedBuilder()
                            .setTitle('🔊 You Have Been Unmuted')
                            .setDescription(`You have been unmuted in **${interaction.guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`)
                            .setColor(0x57F287)
                            .setTimestamp()
                        ]
                    });
                } catch (error) {
                    console.log('Could not send DM to user');
                }
            } catch (error) {
                console.error('Unmute error:', error);
                await interaction.reply({
                    content: '❌ Failed to unmute the user. They might not be muted or I don\'t have permission.',
                    ephemeral: true
                });
            }
        }

        // Unmute all command
        else if (commandName === 'unmuteall') {
            await interaction.deferReply();
            
            try {
                const reason = options.getString('reason') || 'No reason provided';
                let unmutedCount = 0;
                
                // Get all members and unmute those who are timed out
                const members = await interaction.guild.members.fetch();
                for (const [id, member] of members) {
                    if (member.isCommunicationDisabled()) {
                        try {
                            await member.timeout(null);
                            unmutedCount++;
                        } catch (error) {
                            // Ignore errors for individual users
                        }
                    }
                }
                
                await interaction.editReply({
                    content: `✅ Unmuted ${unmutedCount} user(s).\n**Reason:** ${reason}`
                });

                // Log action
                await logBulkModerationAction('Unmute All', member.user, reason, unmutedCount);
                
                // Delete the success message after 1 minute
                setTimeout(async () => {
                    try {
                        const reply = await interaction.fetchReply();
                        if (reply.deletable) {
                            await reply.delete();
                        }
                    } catch (error) {
                        console.error('Error deleting unmuteall reply:', error);
                    }
                }, 60000);
            } catch (error) {
                console.error('Unmute all error:', error);
                await interaction.editReply({
                    content: '❌ Failed to unmute all users.',
                    ephemeral: true
                });
            }
        }

        // Purge all messages (up to 250)
        else if (commandName === 'purge') {
            let amount = options.getInteger('amount');

            if (amount < 1 || amount > 250) {
                return await interaction.reply({
                    content: '❌ You need to input a number between 1 and 250!',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                let deletedCount = 0;
                let remaining = amount;

                // Discord only allows bulk delete of up to 100 messages at a time
                while (remaining > 0) {
                    const batchSize = Math.min(remaining, 100);
                    const fetched = await channel.messages.fetch({ limit: batchSize });
                    
                    if (fetched.size === 0) break; // No more messages to delete
                    
                    await channel.bulkDelete(fetched, true);
                    deletedCount += fetched.size;
                    remaining -= batchSize;

                    // Small delay to avoid rate limits
                    if (remaining > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${deletedCount} messages!`,
                    ephemeral: true
                });

                // Log action
                await logDeletedMessage({
                    author: member.user,
                    channel: channel,
                    content: `/purge ${amount}`
                }, `Purged ${deletedCount} messages`, member.user);

                // Delete the success message after 1 minute
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 60000);
            } catch (error) {
                console.error('Purge error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete messages. I might not have permission to manage messages in this channel or some messages are too old.',
                    ephemeral: true
                });
            }
        }

        // Purge human messages only
        else if (commandName === 'purgehumans') {
            let amount = options.getInteger('amount');

            if (amount < 1 || amount > 250) {
                return await interaction.reply({
                    content: '❌ You need to input a number between 1 and 250!',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                let deletedCount = 0;
                let remaining = amount;
                let checkedCount = 0;

                // Process in batches
                while (remaining > 0 && checkedCount < 1000) { // Safety limit
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

                    // Small delay to avoid rate limits
                    if (remaining > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${deletedCount} human messages!`,
                    ephemeral: true
                });

                // Log action
                await logDeletedMessage({
                    author: member.user,
                    channel: channel,
                    content: `/purgehumans ${amount}`
                }, `Purged ${deletedCount} human messages`, member.user);

                // Delete the success message after 1 minute
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 60000);
            } catch (error) {
                console.error('Purge humans error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete human messages. I might not have permission to manage messages in this channel or some messages are too old.',
                    ephemeral: true
                });
            }
        }

        // Purge bot messages only
        else if (commandName === 'purgebots') {
            let amount = options.getInteger('amount');

            if (amount < 1 || amount > 250) {
                return await interaction.reply({
                    content: '❌ You need to input a number between 1 and 250!',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                let deletedCount = 0;
                let remaining = amount;
                let checkedCount = 0;

                // Process in batches
                while (remaining > 0 && checkedCount < 1000) { // Safety limit
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

                    // Small delay to avoid rate limits
                    if (remaining > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${deletedCount} bot messages!`,
                    ephemeral: true
                });

                // Log action
                await logDeletedMessage({
                    author: member.user,
                    channel: channel,
                    content: `/purgebots ${amount}`
                }, `Purged ${deletedCount} bot messages`, member.user);

                // Delete the success message after 1 minute
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 60000);
            } catch (error) {
                console.error('Purge bots error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete bot messages. I might not have permission to manage messages in this channel or some messages are too old.',
                    ephemeral: true
                });
            }
        }

        // Lock channel command with duration and reason
        else if (commandName === 'lock') {
            const duration = options.getInteger('duration') || 0; // 0 = permanent
            const reason = options.getString('reason') || 'No reason provided';

            try {
                // Update channel permissions to deny SEND_MESSAGES for @everyone
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: false
                });

                // Allow owners to still send messages
                for (const ownerId of OWNER_IDS) {
                    await channel.permissionOverwrites.create(ownerId, {
                        SendMessages: true
                    });
                }

                // If duration is specified, schedule unlock
                if (duration > 0) {
                    const unlockTime = Date.now() + (duration * 60 * 1000);
                    
                    await interaction.reply({
                        content: `🔒 <#${channel.id}> has been locked by <@${member.user.id}> for ${duration} minutes\n**Reason:** ${reason}`
                    });

                    // Log action
                    await logModerationAction('Lock Channel', interaction.guild, member.user, reason);

                    // Schedule automatic unlock
                    setTimeout(async () => {
                        try {
                            // Remove the temporary lock record
                            temporaryLocks.delete(channel.id);
                            
                            // Unlock the channel
                            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                                SendMessages: null // Remove the overwrite
                            });
                            
                            // Remove owner-specific permissions
                            for (const ownerId of OWNER_IDS) {
                                const ownerOverwrite = channel.permissionOverwrites.cache.get(ownerId);
                                if (ownerOverwrite) {
                                    await ownerOverwrite.delete();
                                }
                            }
                            
                            // Send unlock notification
                            await channel.send({
                                content: `🔓 <#${channel.id}> has been automatically unlocked after ${duration} minutes`
                            });
                            
                            console.log(`${channel.name} automatically unlocked after ${duration} minutes`);
                        } catch (error) {
                            console.error('Auto-unlock error:', error);
                        }
                    }, duration * 60 * 1000);

                    // Store the temporary lock
                    temporaryLocks.set(channel.id, {
                        unlockTime: unlockTime,
                        moderator: member.user.tag,
                        reason: reason
                    });
                } else {
                    // Permanent lock
                    await interaction.reply({
                        content: `🔒 <#${channel.id}> has been permanently locked by <@${member.user.id}>\n**Reason:** ${reason}`
                    });
                    
                    // Log action
                    await logModerationAction('Lock Channel (Permanent)', interaction.guild, member.user, reason);
                }

                // Log to console
                console.log(`${channel.name} locked by ${member.user.tag} for ${duration} minutes - Reason: ${reason}`);
            } catch (error) {
                console.error('Lock error:', error);
                await interaction.reply({
                    content: '❌ Failed to lock the channel. I might not have permission to manage channel permissions.',
                    ephemeral: true
                });
            }
        }

        // Unlock channel command
        else if (commandName === 'unlock') {
            try {
                // Check if channel was temporarily locked
                const tempLock = temporaryLocks.get(channel.id);
                
                // Update channel permissions to allow SEND_MESSAGES for @everyone
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: null // Remove the overwrite
                });

                // Remove owner-specific permissions
                for (const ownerId of OWNER_IDS) {
                    const ownerOverwrite = channel.permissionOverwrites.cache.get(ownerId);
                    if (ownerOverwrite) {
                        await ownerOverwrite.delete();
                    }
                }

                // Remove from temporary locks
                temporaryLocks.delete(channel.id);

                if (tempLock) {
                    await interaction.reply({
                        content: `🔓 <#${channel.id}> has been unlocked by <@${member.user.id}>\nIt was originally locked by ${tempLock.moderator} for reason: ${tempLock.reason}`
                    });
                } else {
                    await interaction.reply({
                        content: `🔓 <#${channel.id}> has been unlocked by <@${member.user.id}>`
                    });
                }
                
                // Log action
                await logModerationAction('Unlock Channel', interaction.guild, member.user, 'Channel unlocked');

                // Log to console
                console.log(`${channel.name} unlocked by ${member.user.tag}`);
            } catch (error) {
                console.error('Unlock error:', error);
                await interaction.reply({
                    content: '❌ Failed to unlock the channel. I might not have permission to manage channel permissions.',
                    ephemeral: true
                });
            }
        }

        // Slowmode command
        else if (commandName === 'slowmode') {
            const seconds = options.getInteger('seconds');

            try {
                await channel.setRateLimitPerUser(seconds);
                
                if (seconds === 0) {
                    await interaction.reply({
                        content: `⏱️ Slowmode has been disabled in <#${channel.id}> by <@${member.user.id}>`
                    });
                    
                    // Log action
                    await logModerationAction('Slowmode Disabled', interaction.guild, member.user, 'Slowmode disabled');
                } else {
                    await interaction.reply({
                        content: `⏱️ Slowmode has been set to ${seconds} seconds in <#${channel.id}> by <@${member.user.id}>`
                    });
                    
                    // Log action
                    await logModerationAction('Slowmode Set', interaction.guild, member.user, `Set to ${seconds} seconds`);
                }

                // Log to console
                console.log(`Slowmode set to ${seconds} seconds in ${channel.name} by ${member.user.tag}`);
            } catch (error) {
                console.error('Slowmode error:', error);
                await interaction.reply({
                    content: '❌ Failed to set slowmode. I might not have permission to manage channel settings.',
                    ephemeral: true
                });
            }
        }

        // Warn command
        else if (commandName === 'warn') {
            const user = options.getUser('user');
            const reason = options.getString('reason');
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Store warning (in production, use a database)
            if (!warnings.has(user.id)) {
                warnings.set(user.id, []);
            }
            const userWarnings = warnings.get(user.id);
            userWarnings.push({
                reason: reason,
                moderator: member.user.tag,
                timestamp: new Date()
            });

            await interaction.reply({
                content: `⚠️ <@${user.id}> has been warned.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
            });

            // Log action
            await logModerationAction('Warn', user, member.user, reason);
            
            // Send DM to user
            try {
                await user.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('⚠️ You Have Been Warned')
                        .setDescription(`You have been warned in **${interaction.guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`)
                        .setColor(0xFEE75C)
                        .setTimestamp()
                    ]
                });
            } catch (error) {
                console.log('Could not send DM to user');
            }
        }

        // Clear user messages command
        else if (commandName === 'clearuser') {
            const user = options.getUser('user');
            const amount = options.getInteger('amount');

            await interaction.deferReply({ ephemeral: true });

            try {
                let deletedCount = 0;
                let remaining = amount;
                let checkedCount = 0;

                // Process in batches
                while (remaining > 0 && checkedCount < 1000) { // Safety limit
                    const batchSize = Math.min(remaining, 100);
                    const fetched = await channel.messages.fetch({ limit: batchSize });
                    
                    if (fetched.size === 0) break;
                    
                    const userMessages = fetched.filter(msg => msg.author.id === user.id);
                    if (userMessages.size > 0) {
                        await channel.bulkDelete(userMessages, true);
                        deletedCount += userMessages.size;
                    }
                    
                    checkedCount += fetched.size;
                    remaining -= batchSize;

                    // Small delay to avoid rate limits
                    if (remaining > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${deletedCount} messages from <@${user.id}>!`,
                    ephemeral: true
                });

                // Log action
                await logDeletedMessage({
                    author: member.user,
                    channel: channel,
                    content: `/clearuser ${user.id} ${amount}`
                }, `Cleared ${deletedCount} messages from user`, member.user);

                // Delete the success message after 1 minute
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 60000);
            } catch (error) {
                console.error('Clear user error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete user messages. I might not have permission to manage messages in this channel or some messages are too old.',
                    ephemeral: true
                });
            }
        }

        // Nickname command
        else if (commandName === 'nick') {
            const user = options.getUser('user');
            const nickname = options.getString('nickname') || '';
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            try {
                await targetMember.setNickname(nickname);
                if (nickname) {
                    await interaction.reply({
                        content: `✅ Changed nickname of <@${user.id}> to ${nickname}`
                    });
                    
                    // Log action
                    await logModerationAction('Nickname Change', user, member.user, `Changed to: ${nickname}`);
                } else {
                    await interaction.reply({
                        content: `✅ Reset nickname of <@${user.id}>`
                    });
                    
                    // Log action
                    await logModerationAction('Nickname Reset', user, member.user, 'Nickname reset');
                }
            } catch (error) {
                console.error('Nickname error:', error);
                await interaction.reply({
                    content: '❌ Failed to change nickname. I might not have permission or the user has a higher role.',
                    ephemeral: true
                });
            }
        }

        // Channel topic command
        else if (commandName === 'topic') {
            const text = options.getString('text');

            try {
                await channel.setTopic(text);
                await interaction.reply({
                    content: `✅ Channel topic updated to: ${text}`
                });
                
                // Log action
                await logModerationAction('Channel Topic Change', interaction.guild, member.user, `Set to: ${text}`);
            } catch (error) {
                console.error('Topic error:', error);
                await interaction.reply({
                    content: '❌ Failed to update channel topic. I might not have permission.',
                    ephemeral: true
                });
            }
        }

        // Announce command
        else if (commandName === 'announce') {
            const message = options.getString('message');
            const targetChannel = options.getChannel('channel') || channel;

            try {
                await targetChannel.send({
                    content: `📢 **Announcement**\n\n${message}\n\n*Posted by <@${member.user.id}>*`
                });
                await interaction.reply({
                    content: `✅ Announcement posted in <#${targetChannel.id}>`,
                    ephemeral: true
                });
                
                // Log action
                await logModerationAction('Announcement', interaction.guild, member.user, `Posted in #${targetChannel.name}: ${message.substring(0, 100)}...`);
            } catch (error) {
                console.error('Announce error:', error);
                await interaction.reply({
                    content: '❌ Failed to post announcement. I might not have permission to send messages in that channel.',
                    ephemeral: true
                });
            }
        }

        // Member count command - now as embed
        else if (commandName === 'membercount') {
            // Get current online members properly
            const onlineMembers = interaction.guild.members.cache.filter(member => {
                return member.presence && 
                       (member.presence.status === 'online' || 
                        member.presence.status === 'idle' || 
                        member.presence.status === 'dnd');
            }).size;
            
            const totalMembers = interaction.guild.memberCount;

            const embed = new EmbedBuilder()
                .setTitle('📊 Server Member Count')
                .setColor(0x5865F2)
                .addFields(
                    { name: 'Total Members', value: totalMembers.toString(), inline: true },
                    { name: 'Online Members', value: onlineMembers.toString(), inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        // Member analytics command - high quality chart
        else if (commandName === 'memberanalytics') {
            await interaction.deferReply();

            try {
                // Record current data
                const memberData = await recordMemberCount(interaction.guild);
                
                if (memberData.length < 2) {
                    return await interaction.editReply({
                        content: '📊 **Server Analytics**\n\n⚠️ Not enough data collected yet. Please check back later for analytics.'
                    });
                }

                // Calculate statistics
                const currentData = memberData[memberData.length - 1];
                const previousData = memberData[Math.max(0, memberData.length - 2)];
                
                const growth24h = currentData.totalMembers - previousData.totalMembers;
                const growthRate = previousData.totalMembers > 0 ? 
                    ((growth24h / previousData.totalMembers) * 100).toFixed(2) : '0.00';
                
                // Calculate 7-day growth
                const sevenDaysAgoIndex = Math.max(0, memberData.length - 7);
                const sevenDaysAgoData = memberData[sevenDaysAgoIndex];
                const growth7d = currentData.totalMembers - sevenDaysAgoData.totalMembers;
                
                // Prepare chart data (last 30 data points or 30 days)
                const chartData = memberData.slice(-30); // Last 30 data points
                const labels = chartData.map(point => {
                    const date = new Date(point.timestamp);
                    return `${date.getMonth()+1}/${date.getDate()}`;
                });
                
                const totalMembersData = chartData.map(point => point.totalMembers);
                const humanMembersData = chartData.map(point => point.humanMembers);
                const onlineMembersData = chartData.map(point => point.onlineMembers);

                // Create high quality line chart
                const chart = new QuickChart();
                chart.setConfig({
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Total Members',
                                data: totalMembersData,
                                borderColor: '#5865F2',
                                backgroundColor: 'rgba(88, 101, 242, 0.1)',
                                fill: false,
                                tension: 0.4,
                                pointRadius: 4,
                                pointBackgroundColor: '#5865F2',
                                borderWidth: 3
                            },
                            {
                                label: 'Humans',
                                data: humanMembersData,
                                borderColor: '#3BA55D',
                                backgroundColor: 'rgba(59, 165, 93, 0.1)',
                                fill: false,
                                tension: 0.4,
                                pointRadius: 3,
                                pointBackgroundColor: '#3BA55D',
                                borderWidth: 2
                            },
                            {
                                label: 'Online Members',
                                data: onlineMembersData,
                                borderColor: '#ED4245',
                                backgroundColor: 'rgba(237, 66, 69, 0.1)',
                                fill: false,
                                tension: 0.4,
                                pointRadius: 3,
                                pointBackgroundColor: '#ED4245',
                                borderWidth: 2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: `${interaction.guild.name} - Member Growth`,
                                font: {
                                    size: 16,
                                    weight: 'bold'
                                },
                                color: '#ffffff'
                            },
                            legend: {
                                position: 'top',
                                labels: {
                                    color: '#ffffff',
                                    font: {
                                        size: 12
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.1)'
                                },
                                ticks: {
                                    color: '#ffffff'
                                }
                            },
                            x: {
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.1)'
                                },
                                ticks: {
                                    color: '#ffffff'
                                }
                            }
                        }
                    }
                });
                
                // Set high quality chart
                chart.setWidth(800);
                chart.setHeight(400);
                chart.setBackgroundColor('#2C2F33');

                const chartUrl = await chart.getShortUrl();
                const attachment = new AttachmentBuilder(chartUrl, { name: 'member-analytics.png' });

                // Create statistics text
                const statsText = `📊 **Server Analytics**\n\n` +
                    `👥 **Current Members:** ${currentData.totalMembers.toLocaleString()}\n` +
                    `🧑 Humans: ${currentData.humanMembers.toLocaleString()}\n` +
                    `🟢 Online: ${currentData.onlineMembers.toLocaleString()}\n` +
                    `🤖 Bots: ${currentData.botMembers.toLocaleString()}\n\n` +
                    `📈 **Recent Growth:**\n` +
                    `24h: ${growth24h >= 0 ? '+' : ''}${growth24h} members (${growth24h >= 0 ? '+' : ''}${growthRate}%)\n` +
                    `7d: ${growth7d >= 0 ? '+' : ''}${growth7d} members\n\n` +
                    `📅 Data points: ${memberData.length}`;

                await interaction.editReply({
                    content: statsText,
                    files: [attachment]
                });
            } catch (error) {
                console.error('Analytics error:', error);
                await interaction.editReply({
                    content: '❌ Failed to generate member analytics.'
                });
            }
        }

    } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error while executing this command!',
                ephemeral: true
            });
        } else if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ There was an error while executing this command!',
                ephemeral: true
            });
        }
    }
});

// Handle member updates for better online tracking
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    // Only record if presence status changed
    if (oldMember.presence?.status !== newMember.presence?.status) {
        // Debounce updates to avoid too many writes
        clearTimeout(client.presenceUpdateTimeout);
        client.presenceUpdateTimeout = setTimeout(async () => {
            await recordMemberCount(newMember.guild);
        }, 30000); // 30 second debounce
    }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
