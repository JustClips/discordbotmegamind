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

// Check if user is owner (for kick/ban commands)
function isOwner(userId) {
    return OWNER_IDS.includes(userId);
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

// Get AI response for conversation
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
                - Purging messages
                
                For kick/ban commands, only owners can use them.`
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
            model: "gpt-3.5-turbo",
            messages: messages,
            max_tokens: 300,
            temperature: 0.7
        });

        return completion.choices[0].message.content.trim();
    } catch (error) {
        console.error('OpenAI API error:', error);
        return "Sorry, I'm having trouble thinking right now. Please try again later!";
    }
}

// Get AI moderation decision
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
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 300,
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

// Get AI command interpretation
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
- Kick/Ban: Only owners can perform these actions
- Roles available:
${roles}
- Text channels:
${textChannels}
- Voice channels:
${voiceChannels}

User message: "${messageContent}"
User: ${author.username} (${author.id})
User permissions: ${hasPermission({ id: author.id, roles: { cache: new Map() } }) ? 'Moderator' : 'Regular user'}
Is owner: ${isOwner(author.id) ? 'Yes' : 'No'}

Respond with a JSON object containing:
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

If the command is unclear or you can't determine the action, set action to "none" and confidence to 0.00.
Only include relevant fields for the specific action.
For giverole/removerole, include target_role.
For move, include target_channel (voice channel).
For purge, include amount.
For slowmode, duration is in seconds.
For mute, duration is in minutes.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 250,
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
                    const user = message.mentions.users.first() || await client.users.fetch(command.target_user).catch(() => null);
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
                    const user = message.mentions.users.first() || await client.users.fetch(command.target_user).catch(() => null);
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
                    const user = message.mentions.users.first() || await client.users.fetch(command.target_user).catch(() => null);
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
                    const user = message.mentions.users.first() || await client.users.fetch(command.target_user).catch(() => null);
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
                    const user = message.mentions.users.first() || await client.users.fetch(command.target_user).catch(() => null);
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
                    const user = message.mentions.users.first() || await client.users.fetch(command.target_user).catch(() => null);
                    if (user) {
                        const reason = command.reason || 'No reason provided';
                        // Store warning (in production, use a database)
                        // For now, just send a warning message
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
                decision.explanation}`);
                await logModerationAction('Mute (Auto)', message.author, client.user, decision.explanation, decision.suggested_duration_minutes || 10);
                actionTaken = true;
                break;
                
            case "ban":
                // Note: We're not actually banning, just treating as severe timeout
                strikes[userKey] += 2; // Double strike for ban-level offense
                await saveStrikes(strikes);
                await muteUser(message.member, decision.suggested_duration_minutes || 60, decision.explanation);
                await message.delete().catch(() => {});
                await logDeletedMessage(message, `[AI] Strike ${strikes[userKey]} [${decision.category}] - BAN LEVEL OFFENSE - Muted for ${decision.suggested_duration_minutes || 
