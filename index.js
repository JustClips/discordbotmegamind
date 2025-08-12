require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');
const fs = require('fs').promises;
const OpenAI = require('openai');

// Configuration - Using environment variable for OWNER_IDS
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || '1398413061169352949';
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',') : ['YOUR_DISCORD_USER_ID'];
const LOG_CHANNEL_ID = '1404675690007105596'; // Log channel ID
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize OpenAI client
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

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
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.GuildVoiceStates
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
const CONVERSATION_FILE = './conversationContext.json';
const KNOWLEDGE_FILE = './knowledgeBase.json';

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

// Load conversation context
async function loadConversationContext() {
    try {
        const data = await fs.readFile(CONVERSATION_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Save conversation context
async function saveConversationContext(context) {
    try {
        await fs.writeFile(CONVERSATION_FILE, JSON.stringify(context, null, 2));
    } catch (error) {
        console.error('Error saving conversation context:', error);
    }
}

// Add message to conversation context
async function addToConversationContext(channelId, userId, username, message, isBot = false) {
    try {
        const context = await loadConversationContext();
        
        if (!context[channelId]) {
            context[channelId] = [];
        }
        
        // Add new message
        context[channelId].push({
            userId: userId,
            username: username,
            content: message,
            timestamp: new Date().toISOString(),
            isBot: isBot
        });
        
        // Keep only last 50 messages per channel
        if (context[channelId].length > 50) {
            context[channelId] = context[channelId].slice(-50);
        }
        
        await saveConversationContext(context);
        return context[channelId];
    } catch (error) {
        console.error('Error adding to conversation context:', error);
        return [];
    }
}

// Get conversation context for a channel
async function getConversationContext(channelId) {
    try {
        const context = await loadConversationContext();
        return context[channelId] || [];
    } catch (error) {
        return [];
    }
}

// Load knowledge base
async function loadKnowledgeBase() {
    try {
        const data = await fs.readFile(KNOWLEDGE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {
            facts: {},
            rules: {},
            learned: {}
        };
    }
}

// Save knowledge base
async function saveKnowledgeBase(knowledge) {
    try {
        await fs.writeFile(KNOWLEDGE_FILE, JSON.stringify(knowledge, null, 2));
    } catch (error) {
        console.error('Error saving knowledge base:', error);
    }
}

// Learn from conversations
async function learnFromConversation(message) {
    try {
        const knowledge = await loadKnowledgeBase();
        const content = message.content.toLowerCase();
        
        // Learn server-specific information
        if (content.includes('server') && content.includes('rule')) {
            // Extract potential rules
            const ruleMatch = content.match(/rule\s*\d*\s*[:\-]?\s*(.+)/i);
            if (ruleMatch) {
                const ruleText = ruleMatch[1].trim();
                knowledge.learned[`rule_${Date.now()}`] = {
                    type: 'rule',
                    content: ruleText,
                    learnedFrom: message.author.id,
                    timestamp: new Date().toISOString()
                };
            }
        }
        
        // Learn about roles and permissions
        if (content.includes('role') && (content.includes('mod') || content.includes('admin'))) {
            const roleMatch = content.match(/role\s*[:\-]?\s*(.+)/i);
            if (roleMatch) {
                const roleText = roleMatch[1].trim();
                knowledge.learned[`role_${Date.now()}`] = {
                    type: 'role_info',
                    content: roleText,
                    learnedFrom: message.author.id,
                    timestamp: new Date().toISOString()
                };
            }
        }
        
        // Learn about channels
        if (content.includes('channel') && (content.includes('#') || content.includes('chat'))) {
            const channelMatch = content.match(/channel\s*[:\-]?\s*(.+)/i);
            if (channelMatch) {
                const channelText = channelMatch[1].trim();
                knowledge.learned[`channel_${Date.now()}`] = {
                    type: 'channel_info',
                    content: channelText,
                    learnedFrom: message.author.id,
                    timestamp: new Date().toISOString()
                };
            }
        }
        
        await saveKnowledgeBase(knowledge);
    } catch (error) {
        console.error('Error learning from conversation:', error);
    }
}

// Get AI response for conversation (using cheaper model)
async function getAIResponse(conversationContext, userName, guildName) {
    if (!openai) {
        return "AI functionality is not configured. Please set OPENAI_API_KEY.";
    }

    try {
        // Format conversation context for OpenAI
        const messages = [
            {
                role: "system",
                content: `You are AutoModAI, a helpful Discord bot and server moderator. 
                You assist with server rules, answer questions, and help keep the server safe.
                Be friendly, concise, and helpful.
                Current server: ${guildName || 'Unknown'}
                
                You can help with moderation commands like:
                - Muting/unmuting users
                - Locking/unlocking channels
                - Setting slowmode
                - Giving/removing roles
                - Moving users between voice channels
                - Warning users
                - Purging messages`
            }
        ];

        // Add recent conversation context
        conversationContext.messages.slice(-10).forEach(msg => {
            if (msg.isBot) {
                messages.push({ role: "assistant", content: msg.content });
            } else {
                messages.push({ role: "user", content: `${msg.username}: ${msg.content}` });
            }
        });

        // Add current user's message
        messages.push({ 
            role: "user", 
            content: `${userName}: ${conversationContext.currentMessage}` 
        });

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // Using cheaper model
            messages: messages,
            max_tokens: 200,
            temperature: 0.7
        });

        return completion.choices[0].message.content.trim();
    } catch (error) {
        console.error('OpenAI API error:', error);
        return "Sorry, I'm having trouble thinking right now. Please try again later!";
    }
}

// Get AI moderation decision (using cheaper model)
async function getAIModerationDecision(messageContent, contextMessages = [], authorName) {
    if (!openai) {
        return null;
    }

    try {
        // Build context string
        let contextString = "";
        if (contextMessages.length > 0) {
            contextString = "Recent conversation context:\n";
            contextMessages.slice(-5).forEach(msg => {
                contextString += `${msg.username}: ${msg.content}\n`;
            });
        }

        const prompt = `You are AutoModAI — a human-like, context-aware Discord moderation assistant. Analyze a single message (and optional nearby context) and decide whether it violates server rules. Be rigorous about intent and obfuscation (unicode lookalikes, zero-width, repeated chars, homograph attacks, link shorteners). Use context to detect sarcasm, quoted text, roleplay, and friendly banter.

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

Message to analyze: "${messageContent}"
${contextString}
Author: ${authorName}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // Using cheaper model
            messages: [{ role: "user", content: prompt }],
            max_tokens: 250,
            temperature: 0.1
        });

        const response = completion.choices[0].message.content.trim();
        
        // Try to parse the JSON response
        try {
            // Extract JSON from response if it contains other text
            const jsonMatch = response.match(/\{.*\}/s);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return JSON.parse(response);
        } catch (parseError) {
            console.error('Failed to parse AI moderation response:', response);
            return null;
        }
    } catch (error) {
        console.error('AI moderation error:', error);
        return null;
    }
}

// Get AI command interpretation (using cheapest model)
async function getAICommand(messageContent, guild, author) {
    if (!openai) {
        return null;
    }

    try {
        // Get all roles, channels, and voice channels for context
        const roles = guild.roles.cache.map(role => `${role.name} (ID: ${role.id})`).join('\n');
        const textChannels = guild.channels.cache.filter(c => c.type === 0).map(c => `${c.name} (ID: ${c.id})`).join('\n');
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).map(c => `${c.name} (ID: ${c.id})`).join('\n');
        
        const prompt = `You are AutoModAI, a Discord moderation assistant. Interpret natural language commands and convert them to specific moderation actions.

Available information:
- Server: ${guild.name}
- Your permissions: You can mute, unmute, lock, unlock, set slowmode, give roles, move users, warn, and purge messages
- Roles available:
${roles}
- Text channels:
${textChannels}
- Voice channels:
${voiceChannels}

User message: "${messageContent}"
User: ${author.username} (${author.id})
User permissions: ${hasPermission({ id: author.id, roles: { cache: new Map() } }) ? 'Moderator' : 'Regular user'}

Respond with a JSON object containing ONLY:
{
  "action": "mute" | "unmute" | "lock" | "unlock" | "slowmode" | "giverole" | "removerole" | "move" | "warn" | "purge" | "none",
  "target_user": "user mention or ID" | null,
  "target_role": "role name or ID" | null,
  "target_channel": "channel name or ID" | null,
  "duration": integer (minutes for mute) | integer (seconds for slowmode) | null,
  "amount": integer (for purge) | null,
  "reason": "reason for action" | null,
  "confidence": 0.00-1.00
}

Examples:
- "mute @user 20min" -> {"action":"mute","target_user":"<@123456789>","duration":20,"reason":"No reason provided","confidence":0.95}
- "please lock this channel" -> {"action":"lock","reason":"Channel locked","confidence":0.90}
- "slowmode 5 seconds" -> {"action":"slowmode","duration":5,"confidence":0.85}
- "move @user to General" -> {"action":"move","target_user":"<@123456789>","target_channel":"General","confidence":0.90}

If the command is unclear or you can't determine the action, set action to "none" and confidence to 0.00.
Only include relevant fields for the specific action.
For giverole/removerole, include target_role.
For move, include target_channel (voice channel).
For purge, include amount.
For slowmode, duration is in seconds.
For mute, duration is in minutes.

Respond with ONLY the JSON object, nothing else.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // Using cheapest model
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
            temperature: 0.3
        });

        const response = completion.choices[0].message.content.trim();
        
        // Try to parse the JSON response
        try {
            // Extract JSON from response if it contains other text
            const jsonMatch = response.match(/\{.*\}/s);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return JSON.parse(response);
        } catch (parseError) {
            console.error('Failed to parse AI command response:', response);
            return null;
        }
    } catch (error) {
        console.error('AI command interpretation error:', error);
        return null;
    }
}

// Execute AI-interpreted command
async function executeAICommand(command, message) {
    try {
        const guild = message.guild;
        const member = message.member;
        
        // Check permissions for the action
        if (!hasPermission(member) && command.action !== 'none') {
            return await message.reply('❌ You don\'t have permission to use moderation commands!');
        }
        
        switch (command.action) {
            case 'mute':
                if (command.target_user) {
                    const userMention = command.target_user.match(/<@!?(\d+)>/);
                    const userId = userMention ? userMention[1] : command.target_user;
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (user) {
                        const targetMember = await guild.members.fetch(user.id).catch(() => null);
                        if (targetMember && targetMember.moderatable) {
                            const duration = command.duration || 10;
                            const reason = command.reason || 'No reason provided';
                            await targetMember.timeout(duration * 60 * 1000, reason);
                            return await message.reply(`✅ Muted <@${user.id}> for ${duration} minutes. Reason: ${reason}`);
                        }
                    }
                }
                break;
                
            case 'unmute':
                if (command.target_user) {
                    const userMention = command.target_user.match(/<@!?(\d+)>/);
                    const userId = userMention ? userMention[1] : command.target_user;
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (user) {
                        const targetMember = await guild.members.fetch(user.id).catch(() => null);
                        if (targetMember && targetMember.isCommunicationDisabled()) {
                            await targetMember.timeout(null);
                            return await message.reply(`✅ Unmuted <@${user.id}>`);
                        }
                    }
                }
                break;
                
            case 'lock':
                const reason = command.reason || 'Channel locked';
                await message.channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: false
                });
                return await message.reply(`🔒 Channel locked. Reason: ${reason}`);
                
            case 'unlock':
                await message.channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: null
                });
                return await message.reply('🔓 Channel unlocked');
                
            case 'slowmode':
                if (command.duration !== undefined) {
                    await message.channel.setRateLimitPerUser(command.duration);
                    if (command.duration === 0) {
                        return await message.reply('⏱️ Slowmode disabled');
                    } else {
                        return await message.reply(`⏱️ Slowmode set to ${command.duration} seconds`);
                    }
                }
                break;
                
            case 'giverole':
                if (command.target_user && command.target_role) {
                    const userMention = command.target_user.match(/<@!?(\d+)>/);
                    const userId = userMention ? userMention[1] : command.target_user;
                    const user = await client.users.fetch(userId).catch(() => null);
                    const role = message.mentions.roles.first() || guild.roles.cache.get(command.target_role) || guild.roles.cache.find(r => r.name.toLowerCase() === command.target_role.toLowerCase());
                    
                    if (user && role) {
                        const targetMember = await guild.members.fetch(user.id).catch(() => null);
                        if (targetMember) {
                            const reason = command.reason || 'Role assigned';
                            await targetMember.roles.add(role, reason);
                            return await message.reply(`✅ Gave <@&${role.id}> to <@${user.id}>. Reason: ${reason}`);
                        }
                    }
                }
                break;
                
            case 'removerole':
                if (command.target_user && command.target_role) {
                    const userMention = command.target_user.match(/<@!?(\d+)>/);
                    const userId = userMention ? userMention[1] : command.target_user;
                    const user = await client.users.fetch(userId).catch(() => null);
                    const role = message.mentions.roles.first() || guild.roles.cache.get(command.target_role) || guild.roles.cache.find(r => r.name.toLowerCase() === command.target_role.toLowerCase());
                    
                    if (user && role) {
                        const targetMember = await guild.members.fetch(user.id).catch(() => null);
                        if (targetMember) {
                            const reason = command.reason || 'Role removed';
                            await targetMember.roles.remove(role, reason);
                            return await message.reply(`✅ Removed <@&${role.id}> from <@${user.id}>. Reason: ${reason}`);
                        }
                    }
                }
                break;
                
            case 'move':
                if (command.target_user && command.target_channel) {
                    const userMention = command.target_user.match(/<@!?(\d+)>/);
                    const userId = userMention ? userMention[1] : command.target_user;
                    const user = await client.users.fetch(userId).catch(() => null);
                    const channel = guild.channels.cache.get(command.target_channel) || guild.channels.cache.find(c => c.name.toLowerCase() === command.target_channel.toLowerCase() && c.type === 2);
                    
                    if (user && channel && channel.type === 2) {
                        const targetMember = await guild.members.fetch(user.id).catch(() => null);
                        if (targetMember && targetMember.voice.channel) {
                            await targetMember.voice.setChannel(channel);
                            return await message.reply(`✅ Moved <@${user.id}> to <#${channel.id}>`);
                        }
                    }
                }
                break;
                
            case 'warn':
                if (command.target_user) {
                    const userMention = command.target_user.match(/<@!?(\d+)>/);
                    const userId = userMention ? userMention[1] : command.target_user;
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (user) {
                        const reason = command.reason || 'No reason provided';
                        return await message.reply(`⚠️ Warned <@${user.id}>. Reason: ${reason}`);
                    }
                }
                break;
                
            case 'purge':
                if (command.amount && command.amount > 0 && command.amount <= 100) {
                    const fetched = await message.channel.messages.fetch({ limit: command.amount });
                    await message.channel.bulkDelete(fetched, true);
                    return await message.reply(`✅ Purged ${fetched.size} messages`);
                }
                break;
        }
        
        // If we get here, the command wasn't executed
        return await message.reply('❌ Sorry, I couldn\'t understand or execute that command.');
    } catch (error) {
        console.error('AI command execution error:', error);
        return await message.reply('❌ There was an error executing that command.');
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

// Enhanced scam detection patterns
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

// Enhanced NSFW words with variations
const nsfwWords = [
    'nigga', 'nigger', 'faggot', 'kys', 'kill yourself', 'suicide',
    'porn', 'xxx', 'sex', 'rape', 'pedo', 'pedophile', 'cum', 'dick', 'cock',
    'pussy', 'asshole', 'bitch', 'whore', 'slut', 'cunt', 'retard', 'idiot',
    'stupid', 'dumb', 'moron', 'wanker', 'masturbate', 'orgy', 'gangbang'
];

// Check if message contains scam content
function containsScamContent(content) {
    const normalizedContent = content.toLowerCase();
    
    // Check for scam links
    for (const link of scamLinks) {
        if (normalizedContent.includes(link)) return true;
    }
    
    // Check for scam keywords
    for (const keyword of scamKeywords) {
        if (normalizedContent.includes(keyword)) return true;
    }
    
    return false;
}

// Check if message contains NSFW content
function containsNSFWContent(content) {
    const normalizedContent = content.toLowerCase();
    
    for (const word of nsfwWords) {
        if (normalizedContent.includes(word)) return true;
    }
    
    return false;
}

// Auto-moderation function with strike system
async function autoModerate(message) {
    // Skip bot messages and users with permissions
    if (message.author.bot || hasPermission(message.member)) return false;
    
    const content = message.content;
    
    // Add message to conversation context
    await addToConversationContext(message.channel.id, message.author.id, message.author.username, content);
    
    // Learn from the conversation
    await learnFromConversation(message);
    
    // Get conversation context for AI analysis
    const context = await getConversationContext(message.channel.id);
    
    // Get AI moderation decision
    const aiDecision = await getAIModerationDecision(content, context, message.author.username);
    
    // If AI provides a decision and it's not "allow", handle it
    if (aiDecision && aiDecision.action !== "allow") {
        return await handleAIModerationViolation(message, aiDecision);
    }
    
    // Fallback to traditional moderation if AI doesn't provide decision
    // Check for spam (too many mentions)
    if (message.mentions.users.size > 5 || message.mentions.roles.size > 3) {
        return await handleViolation(message, 'Mention spam detected', 10, 'spam');
    }
    
    // Check for link spam
    const links = content.match(/https?:\/\/[^\s]+/g) || [];
    if (links.length > 3) {
        return await handleViolation(message, 'Link spam detected', 15, 'spam');
    }
    
    // Check for scam content
    if (containsScamContent(content)) {
        return await handleViolation(message, 'Scam content detected', 30, 'scam');
    }
    
    // Check for NSFW content
    if (containsNSFWContent(content)) {
        return await handleViolation(message, 'Inappropriate content detected', 20, 'nsfw');
    }
    
    return false;
}

// Handle AI moderation violations
async function handleAIModerationViolation(message, decision) {
    try {
        const strikes = await loadStrikes();
        const userId = message.author.id;
        const guildId = message.guild.id;
        const userKey = `${guildId}-${userId}`;
        
        // Initialize strikes for user if not exists
        if (!strikes[userKey]) {
            strikes[userKey] = 0;
        }
        
        let actionTaken = false;
        
        // Handle based on AI decision action
        switch (decision.action) {
            case "delete":
                await message.delete().catch(() => {});
                await logDeletedMessage(message, `[AI] ${decision.category} - ${decision.explanation}`);
                actionTaken = true;
                break;
                
            case "warn":
                strikes[userKey] += 1;
                await saveStrikes(strikes);
                await message.delete().catch(() => {});
                await logDeletedMessage(message, `[AI] Warning ${strikes[userKey]} [${decision.category}] - ${decision.explanation}`);
                actionTaken = true;
                break;
                
            case "timeout":
                strikes[userKey] += 1;
                await saveStrikes(strikes);
                await muteUser(message.member, decision.suggested_duration_minutes || 10, decision.explanation);
                await message.delete().catch(() => {});
                await logDeletedMessage(message, `[AI] Strike ${strikes[userKey]} [${decision.category}] - Muted for ${decision.suggested_duration_minutes || 10} minutes - ${decision.explanation}`);
                await logModerationAction('Mute (Auto)', message.author, client.user, decision.explanation, decision.suggested_duration_minutes || 10);
                actionTaken = true;
                break;
                
            case "ban":
                // Note: We're not actually banning, just treating as severe timeout
                strikes[userKey] += 2; // Double strike for ban-level offense
                await saveStrikes(strikes);
                await muteUser(message.member, decision.suggested_duration_minutes || 60, decision.explanation);
                await message.delete().catch(() => {});
                await logDeletedMessage(message, `[AI] Strike ${strikes[userKey]} [${decision.category}] - BAN LEVEL OFFENSE - Muted for ${decision.suggested_duration_minutes || 60} minutes - ${decision.explanation}`);
                await logModerationAction('Mute (Auto - Ban Level)', message.author, client.user, decision.explanation, decision.suggested_duration_minutes || 60);
                actionTaken = true;
                break;
                
            case "review":
                // Log for manual review but don't take action
                console.log(`[AI REVIEW] Message needs manual review: ${message.content}`);
                break;
        }
        
        // Show temporary notification message if action was taken
        if (actionTaken) {
            let notificationMsg;
            switch (decision.action) {
                case "warn":
                    notificationMsg = await message.channel.send({
                        content: `⚠️ <@${message.author.id}> ${decision.explanation}\nThis is warning #${strikes[userKey]}.`
                    });
                    break;
                case "timeout":
                    notificationMsg = await message.channel.send({
                        content: `🔇 <@${message.author.id}> has been muted for ${decision.suggested_duration_minutes || 10} minutes.\n**Reason:** ${decision.explanation}`
                    });
                    break;
                case "ban":
                    notificationMsg = await message.channel.send({
                        content: `🚨 <@${message.author.id}> committed a severe violation.\n**Reason:** ${decision.explanation}\nThey have been muted for ${decision.suggested_duration_minutes || 60} minutes.`
                    });
                    break;
            }
            
            // Delete notification after 1 minute
            if (notificationMsg) {
                setTimeout(() => {
                    notificationMsg.delete().catch(() => {});
                }, 60000);
            }
        }
        
        return actionTaken;
    } catch (error) {
        console.error('AI Violation handling error:', error);
        return false;
    }
}

// Handle violations with strike system (traditional)
async function handleViolation(message, reason, muteDuration, category) {
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
                        .setDescription(`Hey ${message.author.username}! You've received a warning in **${message.guild.name}**\n**Reason:** ${reason}\n**Category:** ${category.toUpperCase()}\n\nPlease follow the server rules to avoid further action. If you have questions, feel free to ask me!`)
                        .setColor(0xFEE75C)
                        .setTimestamp()
                    ]
                });
            } catch (error) {
                console.log('Could not send DM to user');
            }
            
            // Delete message
            await message.delete().catch(() => {});
            await logDeletedMessage(message, `1st Strike [${category}] - ${reason}`);
            
            // Show temporary warning message
            const warningMsg = await message.channel.send({
                content: `⚠️ <@${message.author.id}> Hey, your message was removed. This is your first warning.\n**Reason:** ${reason}\nIf you're unsure about the rules, just ask me!`
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
                        .setDescription(`This is your **final warning** in **${message.guild.name}**\n**Reason:** ${reason}\n**Category:** ${category.toUpperCase()}\n\nFurther violations will result in a mute. If you think this was a mistake, talk to a moderator.`)
                        .setColor(0xED4245)
                        .setTimestamp()
                    ]
                });
            } catch (error) {
                console.log('Could not send DM to user');
            }
            
            // Delete message
            await message.delete().catch(() => {});
            await logDeletedMessage(message, `2nd Strike [${category}] - ${reason}`);
            
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
        await logDeletedMessage(message, `Strike ${strikes[userKey]} [${category}] - Muted for ${muteDuration} minutes - ${reason}`);
        await logModerationAction('Mute (Auto)', message.author, client.user, reason, muteDuration);
        
        // Show temporary mute message
        const muteMsg = await message.channel.send({
            content: `🔇 <@${message.author.id}> has been muted for ${muteDuration} minutes.\n**Reason:** ${reason}\nIf you think this was unfair, contact a human moderator.`
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
        .setDescription('Show detailed server member analytics and growth graph'),

    // Give role command
    new SlashCommandBuilder()
        .setName('giverole')
        .setDescription('Give a role to a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to give the role to')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to give')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for giving the role')
                .setRequired(false)),

    // Move user command
    new SlashCommandBuilder()
        .setName('move')
        .setDescription('Move a user to a voice channel')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to move')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Voice channel to move to')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for move')
                .setRequired(false))
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
    // Ignore bot messages and DMs (except for direct communication)
    if (message.author.bot && message.channel.type !== 'DM') return;
    
    const prefix = '!';
    
    // Handle direct messages
    if (message.channel.type === 'DM') {
        // Don't respond to bots
        if (message.author.bot) return;
        
        // Handle learning commands
        if (message.content.toLowerCase().startsWith('!learn')) {
            const knowledge = await loadKnowledgeBase();
            const learnedCount = Object.keys(knowledge.learned).length;
            return message.reply(`I've learned ${learnedCount} things so far! I remember rules, roles, and other server info.`);
        }
        
        // Handle ping command
        if (message.content.toLowerCase() === '!ping') {
            return message.reply('Pong! I\'m here and ready to help!');
        }
        
        // Handle help command
        if (message.content.toLowerCase() === '!help') {
            return message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('🤖 AutoModAI Help')
                    .setDescription('I\'m here to help moderate and assist in your server!')
                    .addFields(
                        { name: '💬 Direct Message Commands', value: '`!help` - Show this help\n`!learn` - See what I\'ve learned\n`!ping` - Test if I\'m responsive' },
                        { name: '🛡️ Moderation', value: 'I automatically moderate messages for spam, scams, and inappropriate content.' },
                        { name: '🧠 Learning', value: 'I learn from conversations and remember server rules, roles, and channels.' },
                        { name: '🗣️ Natural Language Commands', value: 'You can tell me to do things like "mute @user for 20 minutes" or "lock this channel"' }
                    )
                    .setColor(0x5865F2)
                ]
            });
        }
        
        // Add to conversation context
        const context = await addToConversationContext(
            `dm_${message.author.id}`, 
            message.author.id, 
            message.author.username, 
            message.content
        );
        
        // Get AI response for DMs
        if (openai) {
            try {
                const aiResponse = await getAIResponse({
                    messages: context,
                    currentMessage: message.content,
                    guildName: 'Direct Message'
                }, message.author.username, 'Direct Message');
                
                return message.reply(aiResponse);
            } catch (error) {
                console.error('DM AI response error:', error);
                return message.reply('Hey there! I\'m AutoModAI, your friendly server moderator. I can help with rules, answer questions, and keep the server safe. Just ask!');
            }
        } else {
            return message.reply('Hey there! I\'m AutoModAI, your friendly server moderator. I can help with rules, answer questions, and keep the server safe. Just ask!');
        }
    }
    
    // Handle prefix commands in guilds
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
                        .setDescription(`Hey ${user.username}! You've been muted in **${message.guild.name}** for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** <@${message.author.id}>`)
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
                            .setDescription(`Great news ${user.username}! You've been unmuted in **${message.guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${message.author.id}>`)
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
                        .setDescription(`Hey ${user.username}! You've been warned in **${message.guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${message.author.id}>`)
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
        
        else if (command === 'giverole') {
            const user = message.mentions.users.first();
            if (!user) return message.reply('❌ Please mention a user to give the role to!');
            
            const member = message.guild.members.cache.get(user.id);
            if (!member) return message.reply('❌ User not found!');
            
            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
            if (!role) return message.reply('❌ Please mention a valid role!');
            
            const reason = args.slice(2).join(' ') || 'No reason provided';
            
            // Check if bot can manage roles
            if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return message.reply('❌ I don\'t have permission to manage roles!');
            }
            
            // Check if role is higher than bot's highest role
            if (role.position >= message.guild.members.me.roles.highest.position) {
                return message.reply('❌ I cannot assign this role because it is higher than or equal to my highest role!');
            }
            
            try {
                await member.roles.add(role, reason);
                const reply = await message.reply(`✅ Role <@&${role.id}> has been given to <@${user.id}>.\n**Reason:** ${reason}`);
                
                // Log action
                await logModerationAction('Role Added', user, message.author, `Added role: ${role.name}`, null);
                
                // Send DM to user
                try {
                    await user.send({
                        embeds: [new EmbedBuilder()
                            .setTitle('🎉 Role Assigned')
                            .setDescription(`Congrats ${user.username}! You've been given the role **${role.name}** in **${message.guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${message.author.id}>`)
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
                console.error('Give role error:', error);
                message.reply('❌ Failed to give role.');
            }
        }
        
        else if (command === 'move') {
            const user = message.mentions.users.first();
            if (!user) return message.reply('❌ Please mention a user to move!');
            
            const member = message.guild.members.cache.get(user.id);
            if (!member) return message.reply('❌ User not found!');
            
            if (!member.voice.channel) {
                return message.reply('❌ User is not in a voice channel!');
            }
            
            const channel = message.guild.channels.cache.find(c => 
                c.type === 2 && 
                (c.name.toLowerCase().includes(args[1]?.toLowerCase()) || c.id === args[1])
            );
            
            if (!channel) return message.reply('❌ Please specify a valid voice channel!');
            
            const reason = args.slice(2).join(' ') || 'No reason provided';
            
            try {
                await member.voice.setChannel(channel);
                const reply = await message.reply(`✅ Moved <@${user.id}> to <#${channel.id}>.\n**Reason:** ${reason}`);
                
                // Log action
                await logModerationAction('User Moved', user, message.author, `Moved to: ${channel.name}`, null);
                
                // Delete reply after 1 minute
                setTimeout(() => {
                    reply.delete().catch(() => {});
                }, 60000);
            } catch (error) {
                console.error('Move user error:', error);
                message.reply('❌ Failed to move user.');
            }
        }
        
    } catch (error) {
        console.error('Command error:', error);
        message.reply('❌ There was an error while executing this command!');
    }
});

// Handle auto-moderation and bot mentions
client.on(Events.MessageCreate, async message => {
    // Ignore bot messages (except in DMs for direct communication)
    if (message.author.bot && message.channel.type !== 'DM') return;
    
    // Handle DMs for conversation
    if (message.channel.type === 'DM') {
        // Already handled in the prefix commands section
        return;
    }
    
    // Handle guild messages
    if (!message.guild) return;
    
    // Handle bot mentions
    if (message.mentions.has(client.user)) {
        // Remove bot mention from content
        let cleanContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        
        // If only the mention was sent, respond with a greeting
        if (!cleanContent) {
            cleanContent = "Hello! How can I help you today?";
        }
        
        // Add to conversation context
        const context = await addToConversationContext(
            message.channel.id, 
            message.author.id, 
            message.author.username, 
            message.content
        );
        
        // Get AI response if API key is configured
        if (openai) {
            try {
                const aiResponse = await getAIResponse({
                    messages: context,
                    currentMessage: cleanContent,
                    guildName: message.guild?.name
                }, message.author.username, message.guild?.name);
                
                await message.reply(aiResponse);
                
                // Add bot response to context
                await addToConversationContext(
                    message.channel.id, 
                    client.user.id, 
                    client.user.username, 
                    aiResponse, 
                    true
                );
            } catch (error) {
                console.error('AI response error:', error);
                // Fallback to simple response
                const responses = [
                    "I'm here to help! What can I do for you?",
                    "Hello there! How can I assist you today?",
                    "Hi! I'm listening. What do you need help with?"
                ];
                const response = responses[Math.floor(Math.random() * responses.length)];
                await message.reply(response);
                await addToConversationContext(
                    message.channel.id, 
                    client.user.id, 
                    client.user.username, 
                    response, 
                    true
                );
            }
        } else {
            // Fallback to simple responses if no API key
            const responses = [
                "I'm here to help! What can I do for you?",
                "Hello there! How can I assist you today?",
                "Hi! I'm listening. What do you need help with?"
            ];
            const response = responses[Math.floor(Math.random() * responses.length)];
            await message.reply(response);
            await addToConversationContext(
                message.channel.id, 
                client.user.id, 
                client.user.username, 
                response, 
                true
            );
        }
        
        return;
    }
    
    // Handle natural language commands (messages that seem like commands but don't start with !)
    if (!message.content.startsWith('!') && 
        (message.content.toLowerCase().includes('mute') || 
         message.content.toLowerCase().includes('lock') || 
         message.content.toLowerCase().includes('slowmode') || 
         message.content.toLowerCase().includes('role') || 
         message.content.toLowerCase().includes('move') || 
         message.content.toLowerCase().includes('warn') || 
         message.content.toLowerCase().includes('purge') ||
         message.content.toLowerCase().includes('unlock') ||
         message.content.toLowerCase().includes('unmute'))) {
        
        // Only process if user has permissions
        if (hasPermission(message.member)) {
            // Get AI command interpretation
            const aiCommand = await getAICommand(message.content, message.guild, message.author);
            
            if (aiCommand && aiCommand.action !== 'none' && aiCommand.confidence > 0.7) {
                // Execute the interpreted command
                await executeAICommand(aiCommand, message);
                return;
            }
        }
    }
    
    // Skip messages from users with permissions for moderation
    if (!hasPermission(message.member)) {
        // Auto-moderate the message
        const wasModerated = await autoModerate(message);
    } else {
        // For users with permissions, still learn from their messages
        await addToConversationContext(message.channel.id, message.author.id, message.author.username, message.content);
        await learnFromConversation(message);
    }
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
                        .setDescription(`Hey ${user.username}! You've been muted in **${interaction.guild.name}** for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`)
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
                            .setDescription(`Great news ${user.username}! You've been unmuted in **${interaction.guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`)
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
                        .setDescription(`Hey ${user.username}! You've been warned in **${interaction.guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`)
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

        // Give role command
        else if (commandName === 'giverole') {
            const user = options.getUser('user');
            const role = options.getRole('role');
            const reason = options.getString('reason') || 'No reason provided';
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Check if bot can manage roles
            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return await interaction.reply({
                    content: '❌ I don\'t have permission to manage roles!',
                    ephemeral: true
                });
            }
            
            // Check if role is higher than bot's highest role
            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                return await interaction.reply({
                    content: '❌ I cannot assign this role because it is higher than or equal to my highest role!',
                    ephemeral: true
                });
            }
            
            try {
                await targetMember.roles.add(role, reason);
                await interaction.reply({
                    content: `✅ Role <@&${role.id}> has been given to <@${user.id}>.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
                });
                
                // Log action
                await logModerationAction('Role Added', user, member.user, `Added role: ${role.name}`, null);
                
                // Send DM to user
                try {
                    await user.send({
                        embeds: [new EmbedBuilder()
                            .setTitle('🎉 Role Assigned')
                            .setDescription(`Congrats ${user.username}! You've been given the role **${role.name}** in **${interaction.guild.name}**.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`)
                            .setColor(0x57F287)
                            .setTimestamp()
                        ]
                    });
                } catch (error) {
                    console.log('Could not send DM to user');
                }
            } catch (error) {
                console.error('Give role error:', error);
                await interaction.reply({
                    content: '❌ Failed to give role.',
                    ephemeral: true
                });
            }
        }

        // Move user command
        else if (commandName === 'move') {
            const user = options.getUser('user');
            const channel = options.getChannel('channel');
            const reason = options.getString('reason') || 'No reason provided';
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            if (!targetMember.voice.channel) {
                return await interaction.reply({
                    content: '❌ User is not in a voice channel!',
                    ephemeral: true
                });
            }

            if (channel.type !== 2) { // 2 = Voice channel
                return await interaction.reply({
                    content: '❌ Please select a voice channel!',
                    ephemeral: true
                });
            }

            try {
                await targetMember.voice.setChannel(channel);
                await interaction.reply({
                    content: `✅ Moved <@${user.id}> to <#${channel.id}>.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
                });
                
                // Log action
                await logModerationAction('User Moved', user, member.user, `Moved to: ${channel.name}`, null);
            } catch (error) {
                console.error('Move user error:', error);
                await interaction.reply({
                    content: '❌ Failed to move user. I might not have permission.',
                    ephemeral: true
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
