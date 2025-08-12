require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');
const fs = require('fs').promises;
const OpenAI = require('openai');

// Configuration - Using environment variable for OWNER_IDS
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || '1398413061169352949';
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',') : ['YOUR_DISCORD_USER_ID'];
const LOG_CHANNEL_ID = '1404675690007105596'; // Log channel ID

// AI API Keys (OpenAI only now)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Create OpenAI client
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});

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
const CONVERSATION_FILE = './conversationContext.json';
const KNOWLEDGE_FILE = './knowledgeBase.json';

// --- ADD THIS HELPER FUNCTION ---
// Helper function to create a delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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

// --- UPDATED checkWithGemini FUNCTION WITH BETTER ERROR HANDLING ---
async function checkWithGemini(content, channelId, userId, username, isDirectMessage = false) {
    if (!OPENAI_API_KEY) {
        console.warn("checkWithGemini called but OPENAI_API_KEY is missing.");
        return { isViolation: false, reason: '', response: '' };
    }

    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 1500;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Get conversation context
            const conversationContext = await getConversationContext(channelId);

            // Format context for AI
            const formattedContext = conversationContext.map(msg =>
                `${msg.username}: ${msg.content}`
            ).join('\n');

            // Get knowledge base
            const knowledge = await loadKnowledgeBase();

            // Format knowledge for AI
            let knowledgeText = '';
            if (Object.keys(knowledge.learned).length > 0) {
                knowledgeText = '\n\nServer Knowledge:\n';
                Object.values(knowledge.learned).slice(-5).forEach(item => {
                    knowledgeText += `- ${item.content}\n`;
                });
            }

            // Pre-process content to detect bypass attempts
            const processedContent = normalizeText(content);

            let prompt;
            if (isDirectMessage) {
                prompt = `You are AutoModAI, a friendly and knowledgeable Discord moderator bot. You're chatting directly with a user. Be helpful, casual, and informative.

${knowledgeText}

User's message: "${processedContent}"

Recent conversation context:
${formattedContext || 'No recent context'}

Respond naturally like a human moderator would. Keep it casual but helpful. If they're asking about rules, explain them clearly. If they're asking for help, guide them. If they're being inappropriate, politely redirect them.`;
            } else {
                prompt = `You are AutoModAI — a human-like, context-aware Discord moderation assistant. Analyze a single message (and optional nearby context) and decide whether it violates server rules. Be rigorous about intent and obfuscation (unicode lookalikes, zero-width, repeated chars, homograph attacks, link shorteners). Use context to detect sarcasm, quoted text, roleplay, and friendly banter.

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

Message to analyze: "${processedContent}"

Context (recent messages in channel):
${formattedContext || 'No recent context'}${knowledgeText}

Respond ONLY with the JSON object as specified.`;
            }

            // Use OpenAI with correct parameters (using max_completion_tokens, increased limit)
            const response = await openai.chat.completions.create({
                model: "gpt-5",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_completion_tokens: isDirectMessage ? 1000 : 350, // Increased token limit
                response_format: { type: "json_object" }
            });

            const result = response.choices[0]?.message?.content?.trim() || '';

            // Handle empty responses
            if (!result) {
                console.warn("AI returned empty response");
                return { isViolation: false, reason: '', response: '' };
            }

            if (isDirectMessage) {
                return {
                    isViolation: false,
                    response: result
                };
            } else {
                // For moderation, parse JSON response with better error handling
                try {
                    // Extract JSON from response if there's extra text
                    let jsonString = result;
                    const jsonStart = result.indexOf('{');
                    const jsonEnd = result.lastIndexOf('}');
                    
                    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                        jsonString = result.substring(jsonStart, jsonEnd + 1);
                    }
                    
                    const aiResponse = JSON.parse(jsonString);

                    // Validate required fields
                    if (aiResponse.action && aiResponse.category && aiResponse.confidence !== undefined) {
                        if (aiResponse.action !== 'allow' && aiResponse.confidence > 0.7) {
                            return {
                                isViolation: true,
                                reason: aiResponse.explanation,
                                action: aiResponse.action,
                                category: aiResponse.category,
                                severity: aiResponse.severity,
                                confidence: aiResponse.confidence,
                                evidence: aiResponse.evidence,
                                duration: aiResponse.suggested_duration_minutes,
                                response: ''
                            };
                        }
                        return { isViolation: false, reason: '', response: '' };
                    } else {
                        console.error('AI response missing required fields:', aiResponse);
                        console.error('Raw AI response:', result);
                    }
                } catch (parseError) {
                    console.error('AI response parsing error (JSON invalid):', parseError);
                    console.error('Raw AI response that failed to parse:', result);
                }
            }

            return { isViolation: false, reason: '', response: '' };

        } catch (error) {
            console.error(`OpenAI API attempt ${attempt + 1} failed:`);

            if (error.response && error.response.status === 429) {
                if (attempt < MAX_RETRIES) {
                    const retryDelay = BASE_DELAY_MS * Math.pow(2, attempt);
                    console.warn(`Rate limit (429) hit. Retrying in ${retryDelay}ms... (Attempt ${attempt + 1}/${MAX_RETRIES})`);

                    const retryAfterHeader = error.response.headers['retry-after'];
                    let finalDelay = retryDelay;
                    if (retryAfterHeader) {
                        const retryAfterSeconds = parseInt(retryAfterHeader, 10);
                        if (!isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
                             finalDelay = retryAfterSeconds * 1000;
                             console.log(`Using server-suggested Retry-After delay: ${finalDelay}ms`);
                        }
                    }

                    await delay(finalDelay);
                    continue;
                } else {
                    console.error(`OpenAI API error: Max retries (${MAX_RETRIES}) exceeded for rate limit (429).`);
                    if (error.response?.data) {
                        console.error('Rate limit details:', error.response.data);
                    }
                }
            } else {
                console.error('OpenAI API error (non-429):', error.message);
                if (error.response) {
                    console.error('Status:', error.response.status);
                    console.error('Headers:', error.response.headers);
                } else if (error.request) {
                    console.error('No response received (network issue?):', error.request);
                } else {
                    console.error('Error setting up request:', error.message);
                }
            }

            break;
        }
    }

    console.warn("checkWithGemini: Returning default non-violation response after errors/retries.");
    return { isViolation: false, reason: '', response: '' };
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

// Advanced text normalization to prevent bypasses
function normalizeText(text) {
    // Convert to lowercase and normalize Unicode
    let normalized = text.toLowerCase().normalize('NFD');
    
    // Remove diacritical marks
    normalized = normalized.replace(/[\u0300-\u036f]/g, '');
    
    // Replace Unicode lookalikes with ASCII equivalents
    const unicodeMap = {
        'а': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j',
        'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o', 'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't',
        'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y', 'ｚ': 'z',
        'А': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E', 'Ｆ': 'F', 'Ｇ': 'G', 'Ｈ': 'H', 'Ｉ': 'I', 'Ｊ': 'J',
        'К': 'K', 'Ｌ': 'L', 'Ｍ': 'M', 'Ｎ': 'N', 'Ｏ': 'O', 'Ｐ': 'P', 'Ｑ': 'Q', 'Ｒ': 'R', 'Ｓ': 'S', 'Ｔ': 'T',
        'Ｕ': 'U', 'Ｖ': 'V', 'Ｗ': 'W', 'Ｘ': 'X', 'Ｙ': 'Y', 'Ｚ': 'Z',
        '⓪': '0', '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9',
        '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
        '！': '!', '＠': '@', '＃': '#', '＄': '$', '％': '%', '＾': '^', '＆': '&', '＊': '*', '（': '(', '）': ')',
        '＿': '_', '＋': '+', '－': '-', '＝': '=', '｛': '{', '｝': '}', '｜': '|', '＼': '\\', '：': ':', '；': ';',
        '＂': '"', '＇': "'", '＜': '<', '＞': '>', '，': ',', '．': '.', '？': '?', '／': '/', '～': '~', '｀': '`',
        '【': '[', '】': ']', '〖': '[', '〗': ']', '『': '"', '』': '"', '「': '"', '」': '"'
    };
    
    // Apply Unicode mapping
    Object.keys(unicodeMap).forEach(key => {
        const regex = new RegExp(key, 'g');
        normalized = normalized.replace(regex, unicodeMap[key]);
    });
    
    // Remove extra whitespace and special characters that might be used for obfuscation
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    // Remove zero-width characters
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // Remove repeated characters that might be used to bypass filters
    normalized = normalized.replace(/(.)\1{2,}/g, '$1$1');
    
    return normalized;
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
    const normalizedContent = normalizeText(content);
    
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
    const normalizedContent = normalizeText(content);
    
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
    
    // Check with OpenAI if API key is available
    if (OPENAI_API_KEY) {
        const aiResult = await checkWithGemini(content, message.channel.id, message.author.id, message.author.username);
        if (aiResult.isViolation) {
            const reason = `AI detected violation: ${aiResult.reason}`;
            let duration = 15; // Default duration
            
            // Adjust duration based on severity
            if (aiResult.severity === 'high') duration = 30;
            if (aiResult.severity === 'medium') duration = 20;
            
            // Use AI suggested duration if provided
            if (aiResult.duration) duration = aiResult.duration;
            
            // Add AI response to conversation context
            await addToConversationContext(message.channel.id, client.user.id, client.user.username, `Action: ${aiResult.action}, Category: ${aiResult.category}, Reason: ${aiResult.reason}`, true);
            
            return await handleViolation(
                message, 
                reason, 
                duration, 
                aiResult.category
            );
        }
    }
    
    return false;
}

// Handle violations with strike system
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
