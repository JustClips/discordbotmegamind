require('dotenv').config();

const {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  MessageMentions
} = require('discord.js');

// Add TextInputBuilder import
const { TextInputBuilder } = require('@discordjs/builders');

/* -------------------------------------------------
   DATABASE CONNECTION
   ------------------------------------------------- */
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'discord_bot',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let db;

async function connectDatabase() {
  try {
    const mysql = require('mysql2/promise');
    db = await mysql.createConnection(dbConfig);
    console.log('Connected to MySQL database');
    
    // Create tables if they don't exist
    await createTables();
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
}

async function createTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS warnings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      reason TEXT NOT NULL,
      moderator VARCHAR(255) NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS strikes (
      user_id VARCHAR(255) PRIMARY KEY,
      count INT DEFAULT 0
    )`,
    
    `CREATE TABLE IF NOT EXISTS tickets (
      channel_id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      claimed_by VARCHAR(255) NULL
    )`,
    
    `CREATE TABLE IF NOT EXISTS mute_cooldowns (
      user_id VARCHAR(255) PRIMARY KEY,
      last_mute TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS giveaways (
      message_id VARCHAR(255) PRIMARY KEY,
      channel_id VARCHAR(255) NOT NULL,
      guild_id VARCHAR(255) NOT NULL,
      prize VARCHAR(255) NOT NULL,
      winners INT NOT NULL,
      end_time TIMESTAMP NOT NULL,
      participants JSON,
      host VARCHAR(255) NOT NULL
    )`,
    
    // Premium Keys Table
    `CREATE TABLE IF NOT EXISTS premium_keys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      script_key VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL,
      is_active BOOLEAN DEFAULT TRUE,
      INDEX idx_user_id (user_id),
      INDEX idx_script_key (script_key)
    )`,
    
    // Reseller Keys Table
    `CREATE TABLE IF NOT EXISTS reseller_keys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reseller_id VARCHAR(255) NOT NULL,
      reseller_username VARCHAR(255) NOT NULL,
      script_key VARCHAR(255) UNIQUE NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      used_by VARCHAR(255) NULL,
      used_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reseller_id (reseller_id),
      INDEX idx_script_key (script_key),
      INDEX idx_is_used (is_used)
    )`,
    
    // Reseller Stock Table
    `CREATE TABLE IF NOT EXISTS reseller_stock (
      reseller_id VARCHAR(255) PRIMARY KEY,
      username VARCHAR(255) NOT NULL,
      stock_count INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    
    // Media Applications Table
    `CREATE TABLE IF NOT EXISTS media_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      platform VARCHAR(255) NOT NULL,
      profile_link TEXT NOT NULL,
      application_channel_id VARCHAR(255),
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      reviewed_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP NULL
    )`,
    
    // Reseller Applications Table
    `CREATE TABLE IF NOT EXISTS reseller_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      payment_methods TEXT NOT NULL,
      availability VARCHAR(255) NOT NULL,
      experience TEXT,
      application_channel_id VARCHAR(255),
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      reviewed_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP NULL
    )`,
    
    // AI Conversation History Table
    `CREATE TABLE IF NOT EXISTS ai_conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      response TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_timestamp (timestamp)
    )`
  ];
  
  for (const query of tables) {
    await db.execute(query);
  }
  console.log('Database tables initialized');
}

/* -------------------------------------------------
   DATABASE HELPER FUNCTIONS
   ------------------------------------------------- */
async function getUserWarnings(userId) {
  const [rows] = await db.execute('SELECT * FROM warnings WHERE user_id = ? ORDER BY timestamp DESC', [userId]);
  return rows;
}

async function addUserWarning(userId, reason, moderator) {
  const [result] = await db.execute(
    'INSERT INTO warnings (user_id, reason, moderator) VALUES (?, ?, ?)',
    [userId, reason, moderator]
  );
  return result;
}

async function clearUserWarnings(userId) {
  const [result] = await db.execute('DELETE FROM warnings WHERE user_id = ?', [userId]);
  return result;
}

async function getUserStrikes(userId) {
  const [rows] = await db.execute('SELECT count FROM strikes WHERE user_id = ?', [userId]);
  return rows.length > 0 ? rows[0].count : 0;
}

async function updateUserStrikes(userId, count) {
  const [result] = await db.execute(
    'INSERT INTO strikes (user_id, count) VALUES (?, ?) ON DUPLICATE KEY UPDATE count = ?',
    [userId, count, count]
  );
  return result;
}

async function getLastMuteTime(userId) {
  const [rows] = await db.execute('SELECT last_mute FROM mute_cooldowns WHERE user_id = ?', [userId]);
  return rows.length > 0 ? new Date(rows[0].last_mute) : null;
}

async function updateLastMuteTime(userId) {
  const [result] = await db.execute(
    'INSERT INTO mute_cooldowns (user_id) VALUES (?) ON DUPLICATE KEY UPDATE last_mute = CURRENT_TIMESTAMP',
    [userId]
  );
  return result;
}

async function saveTicket(ticketData) {
  const [result] = await db.execute(
    'INSERT INTO tickets (channel_id, user_id, status, claimed_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = ?, claimed_by = ?',
    [ticketData.channelId, ticketData.userId, ticketData.status, ticketData.claimedBy, ticketData.status, ticketData.claimedBy]
  );
  return result;
}

async function getTicketByChannel(channelId) {
  const [rows] = await db.execute('SELECT * FROM tickets WHERE channel_id = ?', [channelId]);
  return rows.length > 0 ? rows[0] : null;
}

async function updateTicket(channelId, updateData) {
  const fields = Object.keys(updateData);
  const values = Object.values(updateData);
  const setClause = fields.map(field => `${field} = ?`).join(', ');
  values.push(channelId);
  
  const [result] = await db.execute(
    `UPDATE tickets SET ${setClause} WHERE channel_id = ?`,
    values
  );
  return result;
}

async function deleteTicket(channelId) {
  const [result] = await db.execute('DELETE FROM tickets WHERE channel_id = ?', [channelId]);
  return result;
}

async function saveGiveaway(giveawayData) {
  const [result] = await db.execute(
    'INSERT INTO giveaways (message_id, channel_id, guild_id, prize, winners, end_time, participants, host) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      giveawayData.messageId,
      giveawayData.channelId,
      giveawayData.guildId,
      giveawayData.prize,
      giveawayData.winners,
      giveawayData.endTime,
      JSON.stringify(giveawayData.participants || []),
      giveawayData.host
    ]
  );
  return result;
}

async function getGiveaway(messageId) {
  const [rows] = await db.execute('SELECT * FROM giveaways WHERE message_id = ?', [messageId]);
  if (rows.length > 0) {
    try {
      rows[0].participants = JSON.parse(rows[0].participants || '[]');
    } catch (e) {
      rows[0].participants = [];
    }
  }
  return rows.length > 0 ? rows[0] : null;
}

async function updateGiveaway(messageId, updateData) {
  const fields = Object.keys(updateData);
  const values = Object.values(updateData);
  const setClause = fields.map(field => {
    if (field === 'participants') {
      return `${field} = ?`;
    }
    return `${field} = ?`;
  }).join(', ');
  
  if (updateData.participants) {
    const participantsIndex = fields.indexOf('participants');
    if (participantsIndex !== -1) {
      values[participantsIndex] = JSON.stringify(values[participantsIndex] || []);
    }
  }
  
  values.push(messageId);
  
  const [result] = await db.execute(
    `UPDATE giveaways SET ${setClause} WHERE message_id = ?`,
    values
  );
  return result;
}

async function deleteGiveaway(messageId) {
  const [result] = await db.execute('DELETE FROM giveaways WHERE message_id = ?', [messageId]);
  return result;
}

async function getAllActiveGiveaways() {
  const [rows] = await db.execute('SELECT * FROM giveaways WHERE end_time > NOW()');
  return rows.map(row => {
    try {
      row.participants = JSON.parse(row.participants || '[]');
    } catch (e) {
      row.participants = [];
    }
    return row;
  });
}

// Premium Key Functions
function generateScriptKey() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const keyLength = 24;
  
  for (let i = 0; i < keyLength; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  // Add dashes for better readability
  return result.match(/.{1,6}/g).join('-');
}

async function savePremiumKey(userData) {
  const [result] = await db.execute(
    'INSERT INTO premium_keys (user_id, username, script_key, expires_at) VALUES (?, ?, ?, ?)',
    [userData.userId, userData.username, userData.scriptKey, userData.expiresAt]
  );
  return result;
}

async function getUserPremiumKey(userId) {
  const [rows] = await db.execute('SELECT * FROM premium_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]);
  return rows.length > 0 ? rows[0] : null;
}

// Reseller Key Functions
function generateResellerKey() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const keyLength = 20;
  
  for (let i = 0; i < keyLength; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  // Add dashes for better readability
  return result.match(/.{1,5}/g).join('-');
}

async function createResellerStock(resellerId, username) {
  const [result] = await db.execute(
    'INSERT INTO reseller_stock (reseller_id, username, stock_count) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE username = ?',
    [resellerId, username, username]
  );
  return result;
}

async function getResellerStock(resellerId) {
  const [rows] = await db.execute('SELECT * FROM reseller_stock WHERE reseller_id = ?', [resellerId]);
  return rows.length > 0 ? rows[0] : null;
}

async function updateResellerStock(resellerId, newCount) {
  const [result] = await db.execute(
    'UPDATE reseller_stock SET stock_count = ? WHERE reseller_id = ?',
    [newCount, resellerId]
  );
  return result;
}

async function addResellerStock(resellerId, username, count) {
  await createResellerStock(resellerId, username);
  const [result] = await db.execute(
    'UPDATE reseller_stock SET stock_count = stock_count + ? WHERE reseller_id = ?',
    [count, resellerId]
  );
  return result;
}

async function generateResellerKeyDB(resellerId, username) {
  const scriptKey = generateResellerKey();
  const [result] = await db.execute(
    'INSERT INTO reseller_keys (reseller_id, reseller_username, script_key) VALUES (?, ?, ?)',
    [resellerId, username, scriptKey]
  );
  return { key: scriptKey, result };
}

async function getResellerKeys(resellerId) {
  const [rows] = await db.execute(
    'SELECT * FROM reseller_keys WHERE reseller_id = ? AND is_used = FALSE ORDER BY created_at DESC',
    [resellerId]
  );
  return rows;
}

async function giftResellerKeyDB(resellerId, recipientId, recipientUsername) {
  // Get an unused key from reseller
  const [keys] = await db.execute(
    'SELECT * FROM reseller_keys WHERE reseller_id = ? AND is_used = FALSE LIMIT 1',
    [resellerId]
  );
  
  if (keys.length === 0) {
    return { success: false, message: 'No keys available in your stock' };
  }
  
  const keyData = keys[0];
  
  // Mark key as used
  await db.execute(
    'UPDATE reseller_keys SET is_used = TRUE, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?',
    [recipientId, keyData.id]
  );
  
  // Decrease reseller stock
  await db.execute(
    'UPDATE reseller_stock SET stock_count = stock_count - 1 WHERE reseller_id = ?',
    [resellerId]
  );
  
  return { 
    success: true, 
    key: keyData.script_key,
    recipientId,
    recipientUsername
  };
}

// Media Application Functions
async function saveMediaApplication(appData) {
  const [result] = await db.execute(
    'INSERT INTO media_applications (user_id, username, platform, profile_link, application_channel_id) VALUES (?, ?, ?, ?, ?)',
    [appData.userId, appData.username, appData.platform, appData.profileLink, appData.appChannelId]
  );
  return result;
}

async function saveResellerApplication(appData) {
  const [result] = await db.execute(
    'INSERT INTO reseller_applications (user_id, username, payment_methods, availability, experience, application_channel_id) VALUES (?, ?, ?, ?, ?, ?)',
    [appData.userId, appData.username, appData.paymentMethods, appData.availability, appData.experience, appData.appChannelId]
  );
  return result;
}

// AI Conversation Functions
async function saveAIConversation(userId, message, response = null) {
  try {
    const [result] = await db.execute(
      'INSERT INTO ai_conversations (user_id, message, response) VALUES (?, ?, ?)',
      [userId, message, response]
    );
    return result;
  } catch (error) {
    console.error('Database error saving conversation:', error);
    return null;
  }
}

async function getAIConversationHistory(userId, limit = 10) {
  try {
    const [rows] = await db.execute(
      'SELECT message, response FROM ai_conversations WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?',
      [userId, limit]
    );
    return rows.reverse(); // Return in chronological order
  } catch (error) {
    console.error('Database error fetching conversation history:', error);
    return [];
  }
}

/* -------------------------------------------------
   CONFIGURATION
   ------------------------------------------------- */
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || 'YOUR_MOD_ROLE_ID';
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',').map(id => id.trim()) : [];
const LOG_CHANNEL_ID = '1404675690007105596';
const WELCOME_CHANNEL_ID = '1364387827386683484';
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null;
const TICKET_LOGS_CHANNEL_ID = process.env.TICKET_LOGS_CHANNEL_ID || 'YOUR_TICKET_LOGS_CHANNEL_ID';
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID || 'YOUR_SUPPORT_ROLE_ID';
const PREMIUM_CHANNEL_ID = '1403870367524585482';
const PREMIUM_CATEGORY_ID = process.env.PREMIUM_CATEGORY_ID || null;
const APPLICATION_CATEGORY_ID = '1407184066205319189';
const PREMIUM_PRICE_LIFETIME = 10;
const PREMIUM_ROLE_ID = '1405035087703183492'; // Role that can generate keys
const RESSELLER_ROLE_ID = '1409618882041352322'; // Reseller role

/* NEW CONSTANTS ------------------------------------------------- */
const PHISHING_LOG_CHANNEL_ID = process.env.PHISHING_LOG_CHANNEL_ID || '1410400306445025360';
const MEDIA_PARTNER_LOG_CHANNEL_ID = process.env.MEDIA_PARTNER_LOG_CHANNEL_ID || LOG_CHANNEL_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || MOD_ROLE_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY';
const AUTO_MOD_IGNORE_ROLE = '1409618882041352322'; // Role to ignore in auto-mod
const BOT_USER_ID = '834413279920128042'; // Your bot's user ID

// Additional roles that can access tickets (excluding 1396656209821564928)
const ADDITIONAL_TICKET_ROLES = ['1409618882041352322'];

/* -------------------------------------------------
   CLIENT & GLOBAL MAPS (now using database)
   ------------------------------------------------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions
  ]
});

const ticketTranscripts = new Map(); // Still in memory for performance
const activeGiveaways = new Map(); // Still in memory for active giveaways

const MUTE_COOLDOWN = 60000;

/* -------------------------------------------------
   GEMINI AI CHAT & MODERATION
   ------------------------------------------------- */
async function chatWithAI(message, userId, guild) {
  try {
    const axios = require('axios');
    
    // Get conversation history
    const history = await getAIConversationHistory(userId, 5);
    
    // Build conversation context
    let conversationHistory = '';
    history.forEach(entry => {
      conversationHistory += `User: ${entry.message}\nAI: ${entry.response}\n`;
    });
    
    const prompt = `
You are Eps1llon Hub Assistant, a helpful AI bot for the Eps1llon Hub Discord server.

Your purpose is to assist users with questions about:

- Premium script features and pricing

- Ticket system usage

- Partnership opportunities (media/reseller)

- Server rules and moderation

- General server information



Conversation History:

${conversationHistory}



Current Message: ${message}



Guidelines:

1. Be helpful and friendly

2. Provide accurate information about Eps1llon Hub

3. If you don't know something, suggest asking staff

4. Never provide premium keys or sensitive information

5. Keep responses concise but informative

6. Do not repeat yourself

7. Do not engage in arguments or inappropriate topics



Respond directly with your answer without any prefixes.

`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const result = response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'I\'m not sure how to help with that.';
    
    // Save conversation to database
    await saveAIConversation(userId, message, result);
    
    return result.trim();
  } catch (error) {
    console.error('Gemini API Error:', error.response?.status, error.message);
    return 'Sorry, I encountered an error processing your request.';
  }
}

// Fixed Gemini Moderation API endpoint
async function checkContentWithAI(content, userId) {
  try {
    const axios = require('axios');
    const prompt = `
You are a Discord moderation AI. Analyze the following message and determine if it violates Discord's Terms of Service.



Focus on these categories:

1. Hate speech or discrimination

2. Harassment or bullying

3. Illegal activities

4. Sexual content involving minors

5. Violent content

6. Spam or phishing

7. Self-harm or suicide promotion



Message: "${content}"



Respond ONLY with one of these exact formats:

- SAFE: [reason]

- DELETE: [category] - [brief explanation]



Example responses:

- SAFE: No violations detected

- DELETE: Hate speech - Contains racial slurs

- DELETE: Harassment - Threatens violence against users

`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const result = response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'SAFE: No response';
    
    if (result.startsWith('DELETE:')) {
      const parts = result.substring(8).split(' - ');
      const category = parts[0];
      const explanation = parts.slice(1).join(' - ') || 'Violation detected';
      return { 
        detected: true, 
        category: category, 
        explanation: explanation,
        pattern: `AI flagged: ${category}`
      };
    }
    
    return { detected: false, category: null, explanation: null, pattern: null };
  } catch (error) {
    console.error('Gemini Moderation API Error:', error.response?.status, error.message);
    return { detected: false, category: null, explanation: null, pattern: null };
  }
}

/* -------------------------------------------------
   HELPER FUNCTIONS
   ------------------------------------------------- */
function hasPermission(member) {
  if (OWNER_IDS.includes(member.id)) return true;
  if (member.roles.cache.has(MOD_ROLE_ID)) return true;
  return false;
}

function canManageRoles(member, targetRole) {
  if (OWNER_IDS.includes(member.id)) return true;
  if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
  return targetRole.position < member.roles.highest.position;
}

function canManageMember(member, targetMember) {
  if (OWNER_IDS.includes(member.id)) return true;
  if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return false;
  return member.roles.highest.position > targetMember.roles.highest.position;
}

function formatTime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  let timeString = '';
  if (days) timeString += `${days}d `;
  if (hours) timeString += `${hours}h `;
  if (minutes) timeString += `${minutes}m `;
  if (secs) timeString += `${secs}s`;
  return timeString.trim() || '0s';
}

function calculateWinChance(participants, winners) {
  if (!participants) return '0%';
  if (participants <= winners) return '100%';
  return `${((winners / participants) * 100).toFixed(1)}%`;
}

/* -------------------------------------------------
   LOGGING
   ------------------------------------------------- */
async function logAction(guild, action, user, moderator, reason, duration = null, additionalInfo = null) {
  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) return;
  const embed = new EmbedBuilder()
    .setTitle('🛡️ Moderation Log')
    .setColor(
      action === 'warn' || action === 'strike'
        ? '#FFA500'
        : action === 'mute'
        ? '#FF0000'
        : action === 'kick'
        ? '#8B0000'
        : action === 'role'
        ? '#0000FF'
        : '#00FF00'
    )
    .setDescription(`${moderator.tag} (${moderator.id}) ${action}ed ${user.tag} (${user.id})`)
    .addFields(
      { name: 'Action', value: action.charAt(0).toUpperCase() + action.slice(1), inline: true },
      { name: 'Target', value: `<@${user.id}>`, inline: true },
      { name: 'Moderator', value: `<@${moderator.id}>`, inline: true },
      { name: 'Reason', value: reason, inline: false }
    )
    .setTimestamp();
  if (duration) embed.addFields({ name: 'Duration', value: formatTime(duration), inline: true });
  if (additionalInfo) embed.addFields({ name: 'Details', value: additionalInfo, inline: false });
  await logChannel.send({ embeds: [embed] });
}

async function logPhishing(guild, user, message, pattern) {
  const channel = guild.channels.cache.get(PHISHING_LOG_CHANNEL_ID);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Phishing / Scam Detected')
    .setColor('#FF4500')
    .addFields(
      { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
      { name: 'Message', value: message.length > 1024 ? `${message.slice(0, 1020)}…` : message, inline: false },
      { name: 'Pattern', value: pattern, inline: false }
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] });
}

/* -------------------------------------------------
   AUTOMOD – GEMINI AI + BASIC DETECTION
   ------------------------------------------------- */
async function detectToSContent(content, userId, member) {
  // Ignore users with the specified role
  if (member.roles.cache.has(AUTO_MOD_IGNORE_ROLE)) {
    return { detected: false, category: null, explanation: null, pattern: null };
  }
  
  const lower = content.toLowerCase();

  // Basic pattern matching for obvious violations
  const basicPatterns = [
    { pattern: /discord\.gg\/[a-zA-Z0-9]+/gi, category: 'Spam/Phishing', reason: 'Discord invite link' },
    { pattern: /(kys|kill yourself)/gi, category: 'Self-harm', reason: 'Self-harm promotion' },
    { pattern: /n[i1!|]gg[ae3r]/gi, category: 'Hate speech', reason: 'Racial slur' },
    { pattern: /f[a4@]gg[o0]t/gi, category: 'Hate speech', reason: 'Homophobic slur' }
  ];

  for (const { pattern, category, reason } of basicPatterns) {
    if (pattern.test(lower)) {
      return { detected: true, category, explanation: reason, pattern: reason };
    }
  }

  // If no basic patterns match, use AI for deeper analysis
  return await checkContentWithAI(content, userId);
}

/* -------------------------------------------------
   TICKET HELPERS
   ------------------------------------------------- */
async function closeTicket(interaction, ticketData) {
  if (ticketData.status === 'closed')
    return interaction.reply({ content: '❌ This ticket is already closed!', ephemeral: true });
  ticketData.status = 'closed';
  await updateTicket(interaction.channel.id, { status: 'closed' });
  const embed = new EmbedBuilder()
    .setTitle('🔒 Ticket Closed')
    .setDescription('This ticket will be deleted in 10 seconds')
    .setColor('#ff0000')
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
  const logChannel = interaction.guild.channels.cache.get(TICKET_LOGS_CHANNEL_ID);
  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setTitle('🔒 Ticket Closed')
      .addFields(
        { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
        { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'User', value: `<@${ticketData.userId}>`, inline: true }
      )
      .setColor('#ff0000')
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] });
  }
  setTimeout(async () => {
    try {
      await interaction.channel.delete();
      await deleteTicket(interaction.channel.id);
      ticketTranscripts.delete(interaction.channel.id);
    } catch {}
  }, 10000);
}

async function sendTranscript(interaction, ticketData) {
  const transcript = ticketTranscripts.get(interaction.channel.id) || [];
  if (!transcript.length)
    return interaction.reply({ content: '❌ No transcript available for this ticket', ephemeral: true });
  let text = `# Ticket Transcript\n**Channel:** ${interaction.channel.name}\n**User:** <@${ticketData.userId}>\n**Created:** <t:${Math.floor(new Date(ticketData.created_at).getTime() / 1000)}:F>\n\n`;
  transcript.forEach(m => {
    text += `[${new Date(m.timestamp).toLocaleString()}] ${m.author}: ${m.content}\n`;
  });
  const buffer = Buffer.from(text, 'utf-8');
  await interaction.reply({
    content: '📝 Here is the ticket transcript:',
    files: [{ attachment: buffer, name: `transcript-${interaction.channel.name}.txt` }],
    ephemeral: true
  });
}

/* -------------------------------------------------
   PREMIUM AD (now lifetime pricing)
   ------------------------------------------------- */
async function sendPremiumAd(interaction) {
  if (interaction.channel.id !== PREMIUM_CHANNEL_ID && !OWNER_IDS.includes(interaction.user.id))
    return interaction.reply({ content: '❌ This command can only be used in the premium channel!', ephemeral: true });
  
  const embed = new EmbedBuilder()
    .setTitle('💎 Eps1llon Hub Premium')
    .setDescription('Unlock the ultimate experience with our premium script.')
    .setColor('#FFD700')
    .addFields(
      { 
        name: '💰 Lifetime Price', 
        value: `$${PREMIUM_PRICE_LIFETIME}`, 
        inline: true 
      },
      { 
        name: '💳 Payment Methods', 
        value: '• GooglePay\n• Apple Pay\n• CashApp\n• Crypto\n• PIX\n• PayPal\n• Venmo\n• Zelle', 
        inline: true 
      },
      { 
        name: '🔒 Premium Benefits', 
        value: '• Lifetime Updates\n• Priority Support\n• Exclusive Features\n• Early Access', 
        inline: true 
      }
    )
    .setFooter({ text: 'Premium Quality Solution • Lifetime Access' })
    .setTimestamp();
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('purchase_premium')
      .setLabel('Purchase Now')
      .setStyle(ButtonStyle.Success)
      .setEmoji('💳')
  );
  
  await interaction.reply({
    content: '## 🌟 Upgrade to Eps1llon Hub Premium',
    embeds: [embed],
    components: [row]
  });
}

/* -------------------------------------------------
   COMMAND DEFINITIONS
   ------------------------------------------------- */
const commands = [
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes').setRequired(false))
    .addStringOption(o => o.setName('reason').setDescription('Reason for mute').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user')
    .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for unmute').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for warning').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear all warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('User to clear warnings for').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete messages')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1-500)').setRequired(true).setMinValue(1).setMaxValue(500))
    .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user').setRequired(false)),
  
  new SlashCommandBuilder().setName('purgebots').setDescription('Delete messages from bots only'),
  new SlashCommandBuilder().setName('purgehumans').setDescription('Delete messages from humans only'),
  new SlashCommandBuilder().setName('purgeall').setDescription('Delete all messages in channel'),
  
  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel')
    .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes (0 = permanent)').setRequired(false))
    .addStringOption(o => o.setName('reason').setDescription('Reason for locking').setRequired(false)),
  
  new SlashCommandBuilder().setName('unlock').setDescription('Unlock a channel'),
  
  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for channel')
    .addIntegerOption(o => o.setName('seconds').setDescription('Seconds between messages').setRequired(true).setMinValue(0).setMaxValue(21600)),
  
  new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage roles')
    .addSubcommand(s => s.setName('add').setDescription('Add a role to a user')
      .addUserOption(o => o.setName('user').setDescription('User to add role to').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role to add').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a role from a user')
      .addUserOption(o => o.setName('user').setDescription('User to remove role from').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true)))
    .addSubcommand(s => s.setName('info').setDescription('Get information about a role')
      .addRoleOption(o => o.setName('role').setDescription('Role to get info for').setRequired(true))),
  
  new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Give a role to a user')
    .addUserOption(o => o.setName('user').setDescription('User to give role to').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to give').setRequired(true)),
  
  new SlashCommandBuilder().setName('membercount').setDescription('Show current member count'),
  new SlashCommandBuilder().setName('onlinecount').setDescription('Show online member count'),
  
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways')
    .addSubcommand(s => s.setName('create').setDescription('Create a new giveaway')
      .addStringOption(o => o.setName('prize').setDescription('Prize to giveaway').setRequired(true))
      .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(1440))
      .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default: 1)').setRequired(false).setMinValue(1).setMaxValue(100))),
  
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage tickets')
    .addSubcommand(s => s.setName('create').setDescription('Create a new ticket'))
    .addSubcommand(s => s.setName('close').setDescription('Close current ticket'))
    .addSubcommand(s => s.setName('add').setDescription('Add a user to ticket')
      .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a user from ticket')
      .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(s => s.setName('claim').setDescription('Claim a ticket'))
    .addSubcommand(s => s.setName('unclaim').setDescription('Unclaim a ticket'))
    .addSubcommand(s => s.setName('transcript').setDescription('Get ticket transcript')),
  
  new SlashCommandBuilder().setName('premium').setDescription('Display premium script advertisement'),
  
  new SlashCommandBuilder()
    .setName('media-partner')
    .setDescription('Create the Eps1llon Hub Media Partnership panel')
    .addChannelOption(o => o.setName('target').setDescription('Channel where the panel should be posted')
      .setRequired(false).addChannelTypes(ChannelType.GuildText)),
  
  new SlashCommandBuilder()
    .setName('reseller-partner')
    .setDescription('Create the Eps1llon Hub Reseller Partnership panel')
    .addChannelOption(o => o.setName('target').setDescription('Channel where the panel should be posted')
      .setRequired(false).addChannelTypes(ChannelType.GuildText))
];

/* -------------------------------------------------
   REST (register commands)
   ------------------------------------------------- */
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

/* -------------------------------------------------
   CLIENT READY
   ------------------------------------------------- */
client.once(Events.ClientReady, async () => {
  console.log(`Ready as ${client.user.tag}`);
  
  // Load active giveaways from database
  try {
    const activeGiveawaysDB = await getAllActiveGiveaways();
    activeGiveawaysDB.forEach(giveaway => {
      activeGiveaways.set(giveaway.message_id, giveaway);
    });
    console.log(`Loaded ${activeGiveaways.size} active giveaways from database`);
  } catch (error) {
    console.error('Error loading giveaways from database:', error);
  }
  
  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands.map(c => c.toJSON())
    });

    // Ensure the premium ad is present
    const premiumChannel = client.channels.cache.get(PREMIUM_CHANNEL_ID);
    if (premiumChannel) {
      const messages = await premiumChannel.messages.fetch({ limit: 5 });
      const exists = messages.find(m => m.embeds[0]?.title === '💎 Eps1llon Hub Premium' && m.author.id === client.user.id);
      if (!exists) {
        const embed = new EmbedBuilder()
          .setTitle('💎 Eps1llon Hub Premium')
          .setDescription('Unlock the ultimate experience with our premium script.')
          .setColor('#FFD700')
          .addFields(
            { 
              name: '💰 Lifetime Price', 
              value: `$${PREMIUM_PRICE_LIFETIME}`, 
              inline: true 
            },
            { 
              name: '💳 Payment Methods', 
              value: '• GooglePay\n• Apple Pay\n• CashApp\n• Crypto\n• PIX\n• PayPal\n• Venmo\n• Zelle', 
              inline: true 
            },
            { 
              name: '🔒 Premium Benefits', 
              value: '• Lifetime Updates\n• Priority Support\n• Exclusive Features\n• Early Access', 
              inline: true 
            }
          )
          .setFooter({ text: 'Premium Quality Solution • Lifetime Access' })
          .setTimestamp();
        
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('purchase_premium')
            .setLabel('Purchase Now')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💳')
        );
        
        await premiumChannel.send({
          content: '## 🌟 Upgrade to Eps1llon Hub Premium',
          embeds: [embed],
          components: [row]
        });
      }
    }
  } catch (e) {
    console.error(e);
  }
});

/* -------------------------------------------------
   INTERACTION CREATE
   ------------------------------------------------- */
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, options, member, channel, guild } = interaction;
    const modCommands = [
      'mute', 'unmute', 'warn', 'warnings', 'clearwarns', 'purge', 'purgebots', 
      'purgehumans', 'purgeall', 'lock', 'unlock', 'slowmode', 'role', 'giverole'
    ];
    
    if (modCommands.includes(commandName) && !hasPermission(member)) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command!', ephemeral: true });
    }

    try {
      if (commandName === 'mute') {
        const user = options.getUser('user');
        const duration = options.getInteger('duration') || 10;
        const reason = options.getString('reason') || 'No reason provided';
        const now = Date.now();
        const last = await getLastMuteTime(member.id);
        if (last && (now - new Date(last).getTime()) < MUTE_COOLDOWN) {
          const left = Math.ceil((MUTE_COOLDOWN - (now - new Date(last).getTime())) / 1000);
          return interaction.reply({ content: `❌ Please wait ${left} seconds before muting again!`, ephemeral: true });
        }
        const target = await guild.members.fetch(user.id);
        if (!target.moderatable) return interaction.reply({ content: '❌ Cannot mute this user!', ephemeral: true });
        if (OWNER_IDS.includes(target.id)) return interaction.reply({ content: '❌ Cannot mute bot owner!', ephemeral: true });
        await target.timeout(duration * 60 * 1000, reason);
        await updateLastMuteTime(member.id);
        await interaction.reply({ content: `✅ <@${user.id}> muted for ${duration} minutes.\n**Reason:** ${reason}`, ephemeral: true });
        await logAction(guild, 'mute', user, member.user, reason, duration * 60);
      } else if (commandName === 'unmute') {
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        const target = await guild.members.fetch(user.id);
        if (!target.isCommunicationDisabled()) return interaction.reply({ content: '❌ User is not muted!', ephemeral: true });
        await target.timeout(null);
        await interaction.reply({ content: `✅ <@${user.id}> unmuted.\n**Reason:** ${reason}`, ephemeral: true });
        await logAction(guild, 'unmute', user, member.user, reason);
      } else if (commandName === 'warn') {
        const user = options.getUser('user');
        const reason = options.getString('reason');
        await addUserWarning(user.id, reason, member.user.tag);
        const strikes = (await getUserStrikes(user.id)) + 1;
        await updateUserStrikes(user.id, strikes);
        let reply = `⚠️ <@${user.id}> warned.\n**Reason:** ${reason}\n**Strikes:** ${strikes}/3`;
        if (strikes >= 3) {
          const target = await guild.members.fetch(user.id);
          if (target && target.moderatable) {
            await target.timeout(30 * 60 * 1000, '3 strikes - auto mute');
            reply += '\n\n🔇 Auto-muted for 30 minutes due to 3 strikes!';
            await logAction(guild, 'mute', user, client.user, 'Auto-mute after 3 strikes', 30 * 60);
          }
          await updateUserStrikes(user.id, 0);
        }
        await interaction.reply({ content: reply, ephemeral: true });
        await logAction(guild, 'warn', user, member.user, reason);
      } else if (commandName === 'warnings') {
        const user = options.getUser('user') || interaction.user;
        const list = await getUserWarnings(user.id);
        if (!list || !list.length) return interaction.reply({ content: `<@${user.id}> has no warnings.`, ephemeral: true });
        let text = `**Warnings for <@${user.id}>**\n`;
        list.forEach((w, i) => {
          text += `**${i + 1}.** ${w.reason} - ${w.moderator} (${new Date(w.timestamp).toLocaleString()})\n`;
        });
        await interaction.reply({ content: text, ephemeral: true });
      } else if (commandName === 'clearwarns') {
        const user = options.getUser('user');
        await clearUserWarnings(user.id);
        await updateUserStrikes(user.id, 0);
        await interaction.reply({ content: `✅ Cleared warnings for <@${user.id}>`, ephemeral: true });
        await logAction(guild, 'clearwarns', user, member.user, 'Cleared all warnings');
      } else if (commandName === 'purge') {
        const amount = options.getInteger('amount');
        const user = options.getUser('user');
        await interaction.deferReply({ ephemeral: true });
        let deleted = 0;
        let remaining = amount;
        while (remaining > 0) {
          const batch = Math.min(remaining, 100);
          const fetched = await channel.messages.fetch({ limit: batch });
          if (!fetched.size) break;
          const toDelete = user ? fetched.filter(m => m.author.id === user.id) : fetched;
          if (toDelete.size) {
            await channel.bulkDelete(toDelete, true);
            deleted += toDelete.size;
          }
          remaining -= batch;
          if (remaining > 0) await new Promise(r => setTimeout(r, 1000));
        }
        await interaction.editReply({ content: `✅ Deleted ${deleted} messages.` });
        await logAction(guild, 'purge', { id: 'system', tag: 'System' }, member.user, `Purged ${deleted} messages`, amount);
      } else if (commandName === 'purgebots') {
        await interaction.deferReply({ ephemeral: true });
        const msgs = await channel.messages.fetch({ limit: 100 });
        const bots = msgs.filter(m => m.author.bot);
        if (!bots.size) return interaction.editReply({ content: 'No bot messages found.' });
        await channel.bulkDelete(bots, true);
        await interaction.editReply({ content: `✅ Deleted ${bots.size} bot messages.` });
        await logAction(guild, 'purge', { id: 'system', tag: 'System' }, member.user, `Purged ${bots.size} bot messages`);
      } else if (commandName === 'purgehumans') {
        await interaction.deferReply({ ephemeral: true });
        const msgs = await channel.messages.fetch({ limit: 100 });
        const humans = msgs.filter(m => !m.author.bot);
        if (!humans.size) return interaction.editReply({ content: 'No human messages found.' });
        await channel.bulkDelete(humans, true);
        await interaction.editReply({ content: `✅ Deleted ${humans.size} human messages.` });
        await logAction(guild, 'purge', { id: 'system', tag: 'System' }, member.user, `Purged ${humans.size} human messages`);
      } else if (commandName === 'purgeall') {
        await interaction.deferReply({ ephemeral: true });
        const msgs = await channel.messages.fetch({ limit: 100 });
        if (!msgs.size) return interaction.editReply({ content: 'No messages found.' });
        await channel.bulkDelete(msgs, true);
        await interaction.editReply({ content: `✅ Deleted ${msgs.size} messages.` });
        await logAction(guild, 'purge', { id: 'system', tag: 'System' }, member.user, 'Purged all messages');
      } else if (commandName === 'lock') {
        const duration = options.getInteger('duration') || 0;
        const reason = options.getString('reason') || 'No reason provided';
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        for (const id of OWNER_IDS) await channel.permissionOverwrites.edit(id, { SendMessages: true });
        if (duration > 0) {
          setTimeout(async () => {
            await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
            for (const id of OWNER_IDS) {
              const ow = channel.permissionOverwrites.cache.get(id);
              if (ow) await ow.delete();
            }
            await channel.send(`🔓 <#${channel.id}> automatically unlocked`);
          }, duration * 60 * 1000);
        }
        await interaction.reply({ content: `🔒 <#${channel.id}> locked${duration ? ` for ${duration} minutes` : ''}.\n**Reason:** ${reason}`, ephemeral: true });
        await logAction(guild, 'lock', { id: 'channel', tag: channel.name }, member.user, reason, duration * 60);
      } else if (commandName === 'unlock') {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        for (const id of OWNER_IDS) {
          const ow = channel.permissionOverwrites.cache.get(id);
          if (ow) await ow.delete();
        }
        await interaction.reply({ content: `🔓 <#${channel.id}> unlocked.`, ephemeral: true });
        await logAction(guild, 'unlock', { id: 'channel', tag: channel.name }, member.user, 'Channel unlocked');
      } else if (commandName === 'slowmode') {
        const seconds = options.getInteger('seconds');
        await channel.setRateLimitPerUser(seconds);
        await interaction.reply({ content: seconds ? `⏱️ Slowmode set to ${seconds}s` : '⏱️ Slowmode disabled', ephemeral: true });
        await logAction(guild, 'slowmode', { id: 'channel', tag: channel.name }, member.user, `Set to ${seconds}s`, seconds);
      } else if (commandName === 'role') {
        const sub = options.getSubcommand();
        if (sub === 'add') {
          const user = options.getUser('user');
          const role = options.getRole('role');
          const target = await guild.members.fetch(user.id);
          if (!canManageRoles(member, role)) return interaction.reply({ content: '❌ Cannot manage this role!', ephemeral: true });
          if (!canManageMember(member, target)) return interaction.reply({ content: '❌ Cannot manage this user!', ephemeral: true });
          await target.roles.add(role);
          await interaction.reply({ content: `✅ Added <@&${role.id}> to <@${user.id}>`, ephemeral: true });
          await logAction(guild, 'role_add', user, member.user, `Added ${role.name}`);
        } else if (sub === 'remove') {
          const user = options.getUser('user');
          const role = options.getRole('role');
          const target = await guild.members.fetch(user.id);
          if (!canManageRoles(member, role)) return interaction.reply({ content: '❌ Cannot manage this role!', ephemeral: true });
          if (!canManageMember(member, target)) return interaction.reply({ content: '❌ Cannot manage this user!', ephemeral: true });
          await target.roles.remove(role);
          await interaction.reply({ content: `✅ Removed <@&${role.id}> from <@${user.id}>`, ephemeral: true });
          await logAction(guild, 'role_remove', user, member.user, `Removed ${role.name}`);
        } else if (sub === 'info') {
          const role = options.getRole('role');
          const embed = new EmbedBuilder()
            .setTitle(`Role: ${role.name}`)
            .setColor(role.color)
            .addFields(
              { name: 'ID', value: role.id, inline: true },
              { name: 'Color', value: role.hexColor, inline: true },
              { name: 'Members', value: role.members.size.toString(), inline: true },
              { name: 'Position', value: role.position.toString(), inline: true },
              { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
              { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true }
            )
            .setTimestamp();
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      } else if (commandName === 'giverole') {
        const user = options.getUser('user');
        const role = options.getRole('role');
        const target = await guild.members.fetch(user.id);
        if (!canManageRoles(member, role)) return interaction.reply({ content: '❌ Cannot manage this role!', ephemeral: true });
        if (!canManageMember(member, target)) return interaction.reply({ content: '❌ Cannot manage this user!', ephemeral: true });
        await target.roles.add(role);
        await interaction.reply({ content: `✅ Added <@&${role.id}> to <@${user.id}>`, ephemeral: true });
        await logAction(guild, 'giverole', user, member.user, `Gave ${role.name}`);
      } else if (commandName === 'membercount') {
        const total = guild.memberCount;
        const online = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
        await interaction.reply({ content: `👥 Total: ${total}\n🟢 Online: ${online}\n🔴 Offline: ${total - online}`, ephemeral: true });
      } else if (commandName === 'onlinecount') {
        const online = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
        await interaction.reply({ content: `🟢 Online members: ${online}`, ephemeral: true });
      } else if (commandName === 'giveaway') {
        const sub = options.getSubcommand();
        if (sub === 'create') {
          const prize = options.getString('prize');
          const duration = options.getInteger('duration');
          const winners = options.getInteger('winners') || 1;
          const end = Date.now() + duration * 60 * 1000;
          const embed = new EmbedBuilder()
            .setTitle(`🎉 ${prize.toUpperCase()} 🎉`)
            .addFields(
              { name: '⏰ Ends In', value: formatTime(duration * 60), inline: true },
              { name: '🏆 Winners', value: winners.toString(), inline: true },
              { name: '👤 Entries', value: '0 participants', inline: true },
              { name: '🎯 Chance', value: '0%', inline: true },
              { name: '👑 Host', value: `<@${member.id}>`, inline: true }
            )
            .setColor('#FFD700')
            .setTimestamp(end);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`join_giveaway_${Date.now()}`)
              .setLabel('🎉 Join Giveaway')
              .setStyle(ButtonStyle.Primary)
          );
          const msg = await channel.send({ embeds: [embed], components: [row] });
          
          const giveawayData = {
            messageId: msg.id,
            channelId: channel.id,
            guildId: guild.id,
            prize,
            winners,
            endTime: new Date(end),
            participants: [],
            host: member.id
          };
          
          await saveGiveaway(giveawayData);
          activeGiveaways.set(msg.id, giveawayData);
          
          const interval = setInterval(async () => {
            const now = Date.now();
            const left = Math.max(0, Math.floor((end - now) / 1000));
            if (left <= 0) {
              clearInterval(interval);
              const data = activeGiveaways.get(msg.id);
              if (!data) return;
              const participants = [...data.participants];
              const winList = [];
              if (participants.length >= data.winners) {
                for (let i = 0; i < data.winners; i++) {
                  const idx = Math.floor(Math.random() * participants.length);
                  winList.push(participants[idx]);
                  participants.splice(idx, 1);
                }
              }
              const final = new EmbedBuilder()
                .setTitle(`🎉 ${data.prize.toUpperCase()} - ENDED 🎉`)
                .addFields(
                  { name: '🏆 Winners', value: winList.length ? winList.map(i => `<@${i}>`).join(', ') : 'No participants' },
                  { name: '👤 Total Entries', value: data.participants.length.toString() },
                  { name: '👑 Hosted by', value: `<@${data.host}>` }
                )
                .setColor('#00FF00')
                .setTimestamp();
              const disabled = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('giveaway_ended')
                  .setLabel('🎉 Giveaway Ended')
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(true)
              );
              await msg.edit({ embeds: [final], components: [disabled] });
              if (winList.length) await channel.send(`🎉 Congratulations ${winList.map(i => `<@${i}>`).join(', ')}! You won **${data.prize}**!`);
              activeGiveaways.delete(msg.id);
              await deleteGiveaway(msg.id);
              return;
            }
            const data = activeGiveaways.get(msg.id);
            const entryCount = data.participants.length;
            const chance = calculateWinChance(entryCount, data.winners);
            const upd = new EmbedBuilder()
              .setTitle(`🎉 ${prize.toUpperCase()} 🎉`)
              .addFields(
                { name: '⏰ Ends In', value: formatTime(left), inline: true },
                { name: '🏆 Winners', value: winners.toString(), inline: true },
                { name: '👤 Entries', value: `${entryCount} participants`, inline: true },
                { name: '🎯 Chance', value: chance, inline: true },
                { name: '👑 Host', value: `<@${member.id}>`, inline: true }
              )
              .setColor('#FFD700')
              .setTimestamp(end);
            await msg.edit({ embeds: [upd] });
          }, 5000);
          await interaction.reply({ content: `✅ Giveaway created in <#${channel.id}>`, ephemeral: true });
        }
      } else if (commandName === 'ticket') {
        const sub = interaction.options.getSubcommand();
        const ticketData = await getTicketByChannel(interaction.channel.id);
        if (sub === 'create') {
          // Handled by button
        } else if (sub === 'close') {
          if (!ticketData) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          await closeTicket(interaction, ticketData);
        } else if (sub === 'add') {
          if (!ticketData) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          const user = interaction.options.getUser('user');
          await interaction.channel.permissionOverwrites.create(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
          await interaction.reply({ content: `✅ <@${user.id}> added to ticket`, ephemeral: true });
        } else if (sub === 'remove') {
          if (!ticketData) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          const user = interaction.options.getUser('user');
          await interaction.channel.permissionOverwrites.delete(user.id);
          await interaction.reply({ content: `✅ <@${user.id}> removed from ticket`, ephemeral: true });
        } else if (sub === 'claim') {
          if (!ticketData) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID) && !OWNER_IDS.includes(interaction.user.id))
            return interaction.reply({ content: '❌ You do not have permission to claim tickets!', ephemeral: true });
          if (ticketData.claimed_by) return interaction.reply({ content: `❌ Already claimed by <@${ticketData.claimed_by}>`, ephemeral: true });
          ticketData.claimed_by = interaction.user.id;
          await updateTicket(interaction.channel.id, { claimed_by: interaction.user.id });
          await interaction.reply({ content: `✅ Ticket claimed by <@${interaction.user.id}>`, ephemeral: true });
          await interaction.channel.setName(`claimed-${interaction.user.username}`);
        } else if (sub === 'unclaim') {
          if (!ticketData) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          if (ticketData.claimed_by !== interaction.user.id && !OWNER_IDS.includes(interaction.user.id))
            return interaction.reply({ content: '❌ You can only unclaim tickets you claimed!', ephemeral: true });
          await updateTicket(interaction.channel.id, { claimed_by: null });
          await interaction.reply({ content: '✅ Ticket unclaimed', ephemeral: true });
          await interaction.channel.setName(interaction.channel.name.replace(/^claimed-/, `ticket-`));
        } else if (sub === 'transcript') {
          if (!ticketData) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          await sendTranscript(interaction, ticketData);
        }
      } else if (commandName === 'premium') {
        await sendPremiumAd(interaction);
      } else if (commandName === 'media-partner') {
        if (!hasPermission(member)) {
          return interaction.reply({ content: '❌ You don\'t have permission to create the media‑partner panel.', ephemeral: true });
        }
        const targetChannel = options.getChannel('target') ?? channel;

        const embed = new EmbedBuilder()
          .setTitle('📣 Eps1llon Hub – Media Partnership')
          .setDescription(
            '**We are looking for content creators & showcase‑ers!**\n' +
            'If you have a strong following on TikTok, YouTube, Twitch or any other platform, we want to **showcase your videos** that feature the Eps1llon Hub script.\n' +
            'Successful partners receive **paid collaborations** and **FREE lifetime premium scripts** as soon as they become an official creator.'
          )
          .setColor('#8A2BE2')
          .addFields(
            { name: 'What you get', value: '- Direct payment per successful campaign\n- Free lifetime premium script\n- Early‑access to new features', inline: true },
            { name: 'What we need', value: '- Minimum **1000** views per video (or equivalent engagement)\n- Honest review & clear mention of Eps1llon Hub', inline: true }
          )
          .setFooter({ text: 'Ready to join? Click the button below!' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('media_apply')
            .setLabel('Apply Now')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝')
        );

        await targetChannel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Media‑partner panel posted in <#${targetChannel.id}>`, ephemeral: true });
      } else if (commandName === 'reseller-partner') {
        if (!hasPermission(member)) {
          return interaction.reply({ content: '❌ You don\'t have permission to create the reseller‑partner panel.', ephemeral: true });
        }
        const targetChannel = options.getChannel('target') ?? channel;

        const embed = new EmbedBuilder()
          .setTitle('📣 Eps1llon Hub – Reseller Partnership')
          .setDescription(
            '**We are looking for resellers outside of the United States** (e.g., Dubai, Brazil, etc.).\n' +
            'If you can sell our premium script to customers in your region and handle payments, we want to work with you.'
          )
          .setColor('#FF8C00')
          .addFields(
            { name: 'What you get', value: '- Commission per sale\n- Access to premium scripts & updates\n- Direct support from the dev team', inline: true },
            { name: 'What we need', value: '- Ability to accept payments (PayPal, crypto, bank transfer, etc.)\n- Availability to sell when needed\n- Past reseller experience or a store link (if any)', inline: true }
          )
          .setFooter({ text: 'Ready to join? Click the button below!' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('reseller_apply')
            .setLabel('Apply Now')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝')
        );

        await targetChannel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Reseller‑partner panel posted in <#${targetChannel.id}>`, ephemeral: true });
      }
    } catch (e) {
      console.error(e);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Command error.', ephemeral: true });
      }
    }
  } else if (interaction.isButton()) {
    if (interaction.customId === 'create_ticket') {
      const modal = new ModalBuilder()
        .setCustomId('ticket_modal')
        .setTitle('🎫 Create Ticket');
      const subject = new TextInputBuilder()
        .setCustomId('ticket_subject')
        .setLabel('Subject')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Briefly describe your issue')
        .setRequired(true)
        .setMaxLength(100);
      const description = new TextInputBuilder()
        .setCustomId('ticket_description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Provide detailed information')
        .setRequired(true)
        .setMaxLength(1800);
      modal.addComponents(
        new ActionRowBuilder().addComponents(subject),
        new ActionRowBuilder().addComponents(description)
      );
      await interaction.showModal(modal);
    } else if (interaction.customId.startsWith('join_giveaway')) {
      const data = activeGiveaways.get(interaction.message.id);
      if (!data) return interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
      if (data.participants.includes(interaction.user.id)) return interaction.reply({ content: '❌ Already entered.', ephemeral: true });
      data.participants.push(interaction.user.id);
      activeGiveaways.set(interaction.message.id, data);
      await updateGiveaway(interaction.message.id, { participants: data.participants });
      await interaction.reply({ content: '🎉 Joined giveaway!', ephemeral: true });
    } else if (interaction.customId === 'purchase_premium') {
      try {
        const category = interaction.guild.channels.cache.get(PREMIUM_CATEGORY_ID);
        // Fixed permission overwrites - ensure all IDs are strings
        const permissionOverwrites = [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }
        ];
        
        // Add owner permissions
        for (const ownerId of OWNER_IDS) {
          permissionOverwrites.push({
            id: ownerId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          });
        }
        
        // Add bot permissions
        permissionOverwrites.push({
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels
          ]
        });
        
        // Add additional ticket roles
        for (const roleId of ADDITIONAL_TICKET_ROLES) {
          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          });
        }
        
        const channelOptions = {
          name: `lifetime-purchase-${interaction.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: permissionOverwrites
        };
        
        if (category) channelOptions.parent = category.id;
        const ticket = await interaction.guild.channels.create(channelOptions);

        const panel = new EmbedBuilder()
          .setTitle('🛒 Purchase Ticket')
          .setDescription('Our team will assist you shortly.')
          .setColor('#0099ff');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_purchase_ticket')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒')
        );
        // Fixed ephemeral response
        await ticket.send({ 
          content: `<@${interaction.user.id}> ${OWNER_IDS.map(i => `<@${i}>`).join(' ')} ${ADDITIONAL_TICKET_ROLES.map(i => `<@&${i}>`).join(' ')}`, 
          embeds: [panel], 
          components: [row] 
        });
        const info = new EmbedBuilder()
          .setTitle('💎 Eps1llon Hub Premium Purchase')
          .setDescription(`**Price:** $${PREMIUM_PRICE_LIFETIME} (Lifetime)\n\n**Accepted Payment Methods:**\n• GooglePay\n• Apple Pay\n• CashApp\n• Crypto\n• PIX\n• PayPal\n• Venmo\n• Zelle`)
          .setColor('#FFD700')
          .setTimestamp();
        await ticket.send({ embeds: [info] });
        
        const ticketData = {
          channelId: ticket.id,
          userId: interaction.user.id,
          status: 'open',
          claimedBy: null
        };
        await saveTicket(ticketData);
        ticketTranscripts.set(ticket.id, []);
        // Fixed ephemeral response
        await interaction.reply({ content: `✅ Purchase ticket created: <#${ticket.id}>`, flags: 64 });
        const log = interaction.guild.channels.cache.get(TICKET_LOGS_CHANNEL_ID);
        if (log) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🛒 Premium Purchase Ticket Created')
            .addFields(
              { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Channel', value: `<#${ticket.id}>`, inline: true },
              { name: 'Price', value: `$${PREMIUM_PRICE_LIFETIME} Lifetime`, inline: true }
            )
            .setColor('#FFD700')
            .setTimestamp();
          await log.send({ embeds: [logEmbed] });
        }
      } catch (e) {
        console.error(e);
        // Fixed ephemeral response
        await interaction.reply({ content: '❌ Failed to create purchase ticket.', flags: 64 });
      }
    } else if (interaction.customId === 'close_purchase_ticket') {
      const ticketData = await getTicketByChannel(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Not a ticket channel.', flags: 64 });
      await closeTicket(interaction, ticketData);
    } else if (interaction.customId === 'ticket_claim') {
      const ticketData = await getTicketByChannel(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Not a ticket channel.', flags: 64 });
      if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID) && !OWNER_IDS.includes(interaction.user.id))
        return interaction.reply({ content: '❌ No permission to claim.', flags: 64 });
      if (ticketData.claimed_by) return interaction.reply({ content: `❌ Already claimed by <@${ticketData.claimed_by}>`, flags: 64 });
      ticketData.claimed_by = interaction.user.id;
      await updateTicket(interaction.channel.id, { claimed_by: interaction.user.id });
      await interaction.reply({ content: `✅ Ticket claimed by <@${interaction.user.id}>`, flags: 64 });
      await interaction.channel.setName(`claimed-${interaction.user.username}`);
    } else if (interaction.customId === 'ticket_close') {
      const ticketData = await getTicketByChannel(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Not a ticket channel.', flags: 64 });
      await closeTicket(interaction, ticketData);
    } else if (interaction.customId === 'ticket_transcript') {
      const ticketData = await getTicketByChannel(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: '❌ Not a ticket channel.', flags: 64 });
      await sendTranscript(interaction, ticketData);
    } else if (interaction.customId === 'media_apply') {
      const modal = new ModalBuilder()
        .setCustomId('media_application')
        .setTitle('Media Partnership Application');

      const platform = new TextInputBuilder()
        .setCustomId('media_platform')
        .setLabel('Platform(s) (TikTok, YouTube, etc.)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. TikTok, YouTube')
        .setRequired(true)
        .setMaxLength(50);

      const link = new TextInputBuilder()
        .setCustomId('media_link')
        .setLabel('Channel / Profile Link')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://www.youtube.com/…')
        .setRequired(true)
        .setMaxLength(200);

      modal.addComponents(
        new ActionRowBuilder().addComponents(platform),
        new ActionRowBuilder().addComponents(link)
      );

      await interaction.showModal(modal);
    } else if (interaction.customId === 'reseller_apply') {
      const modal = new ModalBuilder()
        .setCustomId('reseller_application')
        .setTitle('Reseller Partnership Application');

      const payment = new TextInputBuilder()
        .setCustomId('reseller_payment')
        .setLabel('Payment methods you accept')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('PayPal, crypto, bank transfer, etc.')
        .setRequired(true)
        .setMaxLength(100);

      const availability = new TextInputBuilder()
        .setCustomId('reseller_availability')
        .setLabel('Always online / ready to sell?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Yes / No – typical response time')
        .setRequired(true)
        .setMaxLength(100);

      const experience = new TextInputBuilder()
        .setCustomId('reseller_experience')
        .setLabel('Past reseller experience / store link')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('e.g., https://myshop.com …')
        .setRequired(false)
        .setMaxLength(300);

      modal.addComponents(
        new ActionRowBuilder().addComponents(payment),
        new ActionRowBuilder().addComponents(availability),
        new ActionRowBuilder().addComponents(experience)
      );

      await interaction.showModal(modal);
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'ticket_modal') {
      // Fixed ephemeral response
      await interaction.deferReply({ flags: 64 });
      const subject = interaction.fields.getTextInputValue('ticket_subject');
      const description = interaction.fields.getTextInputValue('ticket_description');
      const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);
      
      // Fixed permission overwrites
      const permissionOverwrites = [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels
          ]
        },
        {
          id: SUPPORT_ROLE_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ];
      
      // Add additional ticket roles
      for (const roleId of ADDITIONAL_TICKET_ROLES) {
        permissionOverwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        });
      }
      
      const channelOptions = {
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: permissionOverwrites
      };
      
      if (category) channelOptions.parent = category.id;
      const ticket = await interaction.guild.channels.create(channelOptions);

      const panel = new EmbedBuilder()
        .setTitle('🎫 Ticket Controls')
        .setDescription('Use the buttons below to manage this ticket')
        .setColor('#0099ff');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📝')
      );
      await ticket.send({ 
        content: `<@${interaction.user.id}> <@&${SUPPORT_ROLE_ID}> ${ADDITIONAL_TICKET_ROLES.map(id => `<@&${id}>`).join(' ')}`, 
        embeds: [panel], 
        components: [row] 
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 Ticket: ${subject}`)
        .setDescription(description)
        .addFields(
          { name: 'Created By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Ticket ID', value: ticket.id, inline: true },
          { name: 'Status', value: 'Open', inline: true }
        )
        .setColor('#00ff00')
        .setTimestamp();
      await ticket.send({ embeds: [ticketEmbed] });

      const ticketData = {
        channelId: ticket.id,
        userId: interaction.user.id,
        status: 'open',
        claimedBy: null
      };
      await saveTicket(ticketData);
      ticketTranscripts.set(ticket.id, []);
      // Fixed ephemeral response
      await interaction.editReply({ content: `✅ Ticket created: <#${ticket.id}>` });

      const log = interaction.guild.channels.cache.get(TICKET_LOGS_CHANNEL_ID);
      if (log) {
        const logEmbed = new EmbedBuilder()
          .setTitle('🎫 Ticket Created')
          .addFields(
            { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Channel', value: `<#${ticket.id}>`, inline: true },
            { name: 'Subject', value: subject, inline: false },
            { name: 'Description', value: description.substring(0, 1024), inline: false }
          )
          .setColor('#00ff00')
          .setTimestamp();
        await log.send({ embeds: [logEmbed] });
      }
    } else if (interaction.customId === 'media_application') {
      // Fixed ephemeral response
      await interaction.deferReply({ flags: 64 });
      const platform = interaction.fields.getTextInputValue('media_platform');
      const link = interaction.fields.getTextInputValue('media_link');

      // Fixed permission overwrites
      const permissionOverwrites = [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ];
      
      // Add owner permissions
      for (const ownerId of OWNER_IDS) {
        permissionOverwrites.push({
          id: ownerId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        });
      }
      
      // Add bot permissions
      permissionOverwrites.push({
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      });
      
      const channelOptions = {
        name: `media-${interaction.user.username}`.toLowerCase(),
        type: ChannelType.GuildText,
        permissionOverwrites: permissionOverwrites
      };
      
      const category = interaction.guild.channels.cache.get(APPLICATION_CATEGORY_ID);
      if (category) channelOptions.parent = category.id;
      const appChannel = await interaction.guild.channels.create(channelOptions);

      const embed = new EmbedBuilder()
        .setTitle('🗒️ New Media Partnership Application')
        .setColor('#00CED1')
        .addFields(
          { name: 'Applicant', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
          { name: 'Platform(s)', value: platform, inline: true },
          { name: 'Channel / Profile', value: link, inline: false }
        )
        .setTimestamp();

      const logChannel = interaction.guild.channels.cache.get(MEDIA_PARTNER_LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({
          content: `<@&${STAFF_ROLE_ID}> New media‑partner application received!`,
          embeds: [embed]
        });
      }

      // Save to database
      const appData = {
        userId: interaction.user.id,
        username: interaction.user.tag,
        platform: platform,
        profileLink: link,
        appChannelId: appChannel.id
      };
      await saveMediaApplication(appData);

      await appChannel.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
      // Fixed ephemeral response
      await interaction.editReply({ content: '✅ Your application channel has been created. Staff will review it shortly.' });
    } else if (interaction.customId === 'reseller_application') {
      // Fixed ephemeral response
      await interaction.deferReply({ flags: 64 });
      const payment = interaction.fields.getTextInputValue('reseller_payment');
      const availability = interaction.fields.getTextInputValue('reseller_availability');
      const experience = interaction.fields.getTextInputValue('reseller_experience');

      // Fixed permission overwrites
      const permissionOverwrites = [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ];
      
      // Add owner permissions
      for (const ownerId of OWNER_IDS) {
        permissionOverwrites.push({
          id: ownerId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        });
      }
      
      // Add bot permissions
      permissionOverwrites.push({
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      });
      
      const channelOptions = {
        name: `reseller-${interaction.user.username}`.toLowerCase(),
        type: ChannelType.GuildText,
        permissionOverwrites: permissionOverwrites
      };
      
      const category = interaction.guild.channels.cache.get(APPLICATION_CATEGORY_ID);
      if (category) channelOptions.parent = category.id;
      const appChannel = await interaction.guild.channels.create(channelOptions);

      const embed = new EmbedBuilder()
        .setTitle('🗒️ New Reseller Partnership Application')
        .setColor('#FF8C00')
        .addFields(
          { name: 'Applicant', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
          { name: 'Payment Methods', value: payment, inline: true },
          { name: 'Availability', value: availability, inline: true },
          { name: 'Experience / Store Link', value: experience || '*None provided*', inline: false }
        )
        .setTimestamp();

      const logChannel = interaction.guild.channels.cache.get(MEDIA_PARTNER_LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({
          content: `<@&${STAFF_ROLE_ID}> New reseller‑partner application received!`,
          embeds: [embed]
        });
      }

      // Save to database
      const appData = {
        userId: interaction.user.id,
        username: interaction.user.tag,
        paymentMethods: payment,
        availability: availability,
        experience: experience,
        appChannelId: appChannel.id
      };
      await saveResellerApplication(appData);

      await appChannel.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
      // Fixed ephemeral response
      await interaction.editReply({ content: '✅ Your reseller application channel has been created. Staff will review it shortly.' });
    }
  }
});

/* -------------------------------------------------
   MESSAGE CREATE (AI auto-moderation & chat)
   ------------------------------------------------- */
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (message.content.length < 2) return;
  if (hasPermission(message.member)) return;

  // Ticket transcript collection
  const ticketData = await getTicketByChannel(message.channel.id);
  if (ticketData) {
    const arr = ticketTranscripts.get(message.channel.id) || [];
    arr.push({ author: message.author.tag, content: message.content, timestamp: message.createdTimestamp });
    ticketTranscripts.set(message.channel.id, arr);
  }

  // AI Chat Response
  const isMentioned = message.mentions.has(client.user.id) || 
                     message.content.includes(`<@${BOT_USER_ID}>`) || 
                     message.content.includes(`<@!${BOT_USER_ID}>`);
  
  if (isMentioned) {
    try {
      // Remove bot mention from message
      let cleanMessage = message.content
        .replace(new RegExp(`<@!?${BOT_USER_ID}>`, 'g'), '')
        .trim();
      
      // If message is empty after removing mention, provide default response
      if (!cleanMessage) {
        cleanMessage = "Hello! How can I help you today?";
      }
      
      // Get AI response
      const response = await chatWithAI(cleanMessage, message.author.id, message.guild);
      
      // Send response
      await message.reply(response);
    } catch (error) {
      console.error('AI Chat Error:', error);
      await message.reply("Sorry, I'm having trouble responding right now. Please try again later.");
    }
    return; // Don't process further if it's a chat message
  }

  // AI-powered auto-moderation
  const result = await detectToSContent(message.content, message.author.id, message.member);
  if (result.detected) {
    try {
      const deleted = message.content;
      await message.delete();
      
      // Send DM to user
      await message.author.send(`❌ Your message was removed for violating Discord's Terms of Service.\n**Category:** ${result.category}\n**Content:** ${deleted.substring(0, 1000)}`);
      
      // Apply strikes system
      const strikes = (await getUserStrikes(message.author.id)) + 1;
      await updateUserStrikes(message.author.id, strikes);
      
      if (strikes >= 3) {
        const target = await message.guild.members.fetch(message.author.id);
        if (target && target.moderatable) {
          await target.timeout(30 * 60 * 1000, `Auto-mute after 3 strikes (${result.category})`);
          await message.channel.send(`🔇 <@${message.author.id}> auto-muted for 30 minutes.`);
          await logAction(message.guild, 'mute', message.author, client.user, `Auto-mute after 3 strikes (${result.category})`, 30 * 60, `Deleted: ${deleted.substring(0, 500)}`);
        }
        await updateUserStrikes(message.author.id, 0);
      } else {
        await message.channel.send(`⚠️ <@${message.author.id}> message removed (${result.category}). Strikes: ${strikes}/3`);
      }
      
      // Log the action
      await logAction(message.guild, 'automod', message.author, client.user, result.category, null, `Deleted: ${deleted.substring(0, 500)}`);
      await logPhishing(message.guild, message.author, deleted, result.pattern);
    } catch (_) {}
  }
});

/* -------------------------------------------------
   GUILD MEMBER LOGS
   ------------------------------------------------- */
client.on(Events.GuildMemberAdd, async member => {
  const welcome = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (welcome) {
    const embed = new EmbedBuilder()
      .setTitle('👋 Welcome!')
      .setDescription(`Welcome to the server, <@${member.id}>!`)
      .setColor('#00FF00')
      .setTimestamp();
    await welcome.send({ embeds: [embed] });
  }
  const log = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (log) {
    const embed = new EmbedBuilder()
      .setTitle('📥 Member Joined')
      .setDescription(`${member.user.tag} (${member.id})`)
      .addFields({ name: 'Account Created', value: member.user.createdAt.toDateString(), inline: true })
      .setColor('#00FF00')
      .setTimestamp();
    await log.send({ embeds: [embed] });
  }
});

client.on(Events.GuildMemberRemove, async member => {
  const log = member.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (log) {
    const embed = new EmbedBuilder()
      .setTitle('📤 Member Left')
      .setDescription(`${member.user.tag} (${member.id})`)
      .setColor('#FF0000')
      .setTimestamp();
    await log.send({ embeds: [embed] });
  }
});

/* -------------------------------------------------
   MESSAGE DELETE / EDIT LOGS
   ------------------------------------------------- */
client.on(Events.MessageDelete, async message => {
  if (message.author?.bot) return;
  const log = message.guild?.channels.cache.get(LOG_CHANNEL_ID);
  if (log && message.content) {
    const embed = new EmbedBuilder()
      .setTitle('🗑️ Message Deleted')
      .setDescription(`**Channel:** <#${message.channel.id}>\n**Author:** ${message.author.tag} (${message.author.id})\n**Content:** ${message.content.substring(0, 1000)}`)
      .setColor('#FFA500')
      .setTimestamp();
    await log.send({ embeds: [embed] });
  }
});

client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  const log = newMsg.guild?.channels.cache.get(LOG_CHANNEL_ID);
  if (log) {
    const embed = new EmbedBuilder()
      .setTitle('✏️ Message Edited')
      .setDescription(`**Channel:** <#${newMsg.channel.id}>\n**Author:** ${newMsg.author.tag} (${newMsg.author.id})`)
      .addFields(
        { name: 'Before', value: oldMsg.content.substring(0, 500) || '*empty*' },
        { name: 'After', value: newMsg.content.substring(0, 500) || '*empty*' }
      )
      .setColor('#0000FF')
      .setTimestamp();
    await log.send({ embeds: [embed] });
  }
});

/* -------------------------------------------------
   LOGIN
   ------------------------------------------------- */
connectDatabase().then(() => {
  client.login(process.env.DISCORD_TOKEN);
});
