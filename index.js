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
  TextInputStyle,
  ModalBuilder,
  TextInputBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

/* -------------------------------------------------
   CONFIGURATION
   ------------------------------------------------- */
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || 'YOUR_MOD_ROLE_ID';
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',').map(id => id.trim()) : [];
const LOG_CHANNEL_ID = '1404675690007105596';
const WELCOME_CHANNEL_ID = '1364387827386683484';
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || null;          // may be null → no category
const TICKET_LOGS_CHANNEL_ID = process.env.TICKET_LOGS_CHANNEL_ID || 'YOUR_TICKET_LOGS_CHANNEL_ID';
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID || 'YOUR_SUPPORT_ROLE_ID';
const PREMIUM_CHANNEL_ID = '1403870367524585482';
const PREMIUM_CATEGORY_ID = process.env.PREMIUM_CATEGORY_ID || null;        // may be null → no category
const PREMIUM_PRICE = 10;

/* NEW CONSTANTS ------------------------------------------------- */
const PHISHING_LOG_CHANNEL_ID = process.env.PHISHING_LOG_CHANNEL_ID || LOG_CHANNEL_ID;
const MEDIA_PARTNER_LOG_CHANNEL_ID = process.env.MEDIA_PARTNER_LOG_CHANNEL_ID || LOG_CHANNEL_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || MOD_ROLE_ID;   // role that gets pinged on a new media‑partner application

/* -------------------------------------------------
   CLIENT & GLOBAL MAPS
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

const warnings = new Map();
const userStrikes = new Map();
const giveaways = new Map();
const muteCooldowns = new Map();
const tickets = new Map();
const ticketTranscripts = new Map();

const MUTE_COOLDOWN = 60000;

/* -------------------------------------------------
   BANNED WORD PATTERNS (profanity / TOS)
   ------------------------------------------------- */
const BANNED_PATTERNS = [
  /(?:n[i1!|]gg[ae3r]?)|(?:f[a4@]gg[o0]t?)|(?:ch[i1!|]nk?)|(?:k[i1!|]ke?)|(?:r[e3]t[a4@]rd?)|(?:c[o0]ck)|(?:p[e3]n[i1!|]s)|(?:v[a4@]g[i1!|]n[a4@])|(?:wh[o0]r[e3])|(?:sl[uo0]t)|(?:b[i1!|]tch)|(?:c[uo0]nt)|(?:sh[i1!|]t)|(?:f[uo0]ck)|(?:d[i1!|]ck)|(?:p[o0]rn)|(?:s[e3]x)|(?:n[a4@]ked)|(?:b[o0][o0]bs?)|(?:t[i1!|]ts?)|(?:p[uo0]ssy)|(?:cum)|(?:j[i1!|]zz)|(?:orgy)|(?:g[a4@]ngb[a4@]ng)|(?:p[e3]d[o0])|(?:b[e3][a4@]st[i1!|]al[i1!|]ty)|(?:z[o0][o0]ph[i1!|]l[i1!|]a)|(?:l[o0][o0]t[a4@])|(?:r[a4@]p[e3])|(?:m[o0]l[e3]st[e3])|(?:p[e3]d[e3][s5])|(?:s[a4@]d[i1!|]sm)|(?:m[a4@]st[e3]rb[a4@]t[e3])|(?:b[e3][a4@]n[a4@]n[a4@])|(?:w[a4@]nker)|(?:w[a4@]nk[e3]r)|(?:b[o0][o0]ger)|(?:t[uo0]rd)|(?:sc[uo0]t)|(?:tw[a4@]t)|(?:n[a4@]z[i1!|])|(?:sp[i1!|]c)|(?:g[o0][o0]k)|(?:g[e3]rm[a4@]n)|(?:j[e3]w)|(?:h[o0][o0]k[e3]r)|(?:r[a4@]c[i1!|]st)|(?:n[a4@]z[i1!|])|(?:f[a4@]sc[i1!|]st)|(?:tr[a4@]nn[yi])|(?:dyk[e3])|(?:tr[a4@]ny)|(?:s[h]{2}[i1!|]t[e3])|(?:f[uo0][ck]{2})|(?:b[i1!|]tch[e3]s)|(?:c[o0]cks[uo0]ck[e3]r)|(?:m[o0]th[e3]rf[uo0]ck[e3]r)|(?:f[a4@]gg[o0]t[s5])|(?:n[i1!|]gg[e3]r[s5])|(?:r[e3]t[a4@]rd[e3]d)|(?:c[o0]cks[uo0]ck[i1!|]ng)|(?:m[o0]th[e3]rf[uo0]ck[i1!|]ng)|(?:f[uo0]ck[i1!|]ng)|(?:sh[i1!|]tt[i1!|]ng)|(?:b[i1!|]tch[i1!|]ng)|(?:c[uo0]nt[i1!|]ng)|(?:n[i1!|]gg[e3]r[i1!|]ng)|(?:f[a4@]gg[o0]t[i1!|]ng)|(?:r[e3]t[a4@]rd[i1!|]ng)/gi,
  /(?:discord\.gg\/[a-zA-Z0-9]+)|(?:bit\.ly\/[a-zA-Z0-9]+)|(?:tinyurl\.com\/[a-zA-Z0-9]+)/gi,
  /(?:suicid[e3])|(?:kil+ing myself)|(?:end my lif[e3])|(?:want to di[e3])|(?:no on[e3] car[e3]s)|(?:no purpos[e3])|(?:worthl[e3]ss)/gi,
  /(?:h[e3]il hitl[e3]r)|(?:nazi)|(?:swastika)|(?:kkk)|(?:white pow[e3]r)|(?:rac[e3] war)|(?:genocid[e3])|(?:ethnic cl[e3]ansing)/gi
];

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

/* NEW – log phishing / scam attempts */
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
   AUTOMOD – TOC / PHISHING DETECTION
   ------------------------------------------------- */
function detectToSContent(content) {
  const lower = content.toLowerCase();

  // ---- 1️⃣  PROFANITY / TOS WORDS (original list) ----
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(lower)) return { detected: true, pattern: pattern.toString() };
  }

  // ---- 2️⃣  URL EXTRACTION ----
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const urls = content.match(urlRegex) ?? [];

  // ---- 3️⃣  PHISHING / SCAM PATTERNS ----
  const PHISH_PATTERNS = [
    /discord(?:app)?\.com\/(?:invite|gifts?)\/[a-z0-9-]+/i,
    /(?:bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|buff\.ly)\/[^\s]+/i,
    /free\s*nitro|free\s*discord\s*gift|nitro\s*gift/i,
    /paypal\.me\/[^\s]+|paypal\.com\/[^\s]*gift|giftcard\.com|giftcards\.com|gift\.co\/[^\s]+/i,
    /steamcommunity\.com\/tradeoffer\/[^\s]+|steamgifts\.com|g2a\.com\/[^\s]+/i,
    /(?:gift|code|voucher)[\s-]?(?:free|promo|claim)[\s-]?(?:discord|nitro|steam|paypal)/i,
    /login\.?[\w-]*\.(?:com|net|org)\/[^\s]*\b(verify|account|security)\b/i,
    /click\.?[\w-]*\.(?:com|net|org)\/[^\s]+/i,
  ];

  for (const pattern of PHISH_PATTERNS) {
    if (pattern.test(lower)) return { detected: true, pattern: pattern.toString() };
  }

  // ---- 4️⃣  SHORTENER QUICK DETECTION ----
  const shortenerMap = {
    'bit.ly': true,
    'tinyurl.com': true,
    'goo.gl': true,
    't.co': true,
    'ow.ly': true,
    'is.gd': true,
    'buff.ly': true,
  };
  for (const url of urls) {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      if (shortenerMap[hostname]) {
        return { detected: true, pattern: `shortener:${hostname}` };
      }
    } catch (_) {}
  }

  // ---- 5️⃣  NO PROBLEM FOUND ----
  return { detected: false, pattern: null };
}

/* -------------------------------------------------
   TICKET HELPERS
   ------------------------------------------------- */
async function closeTicket(interaction, ticketData) {
  if (ticketData.status === 'closed')
    return interaction.reply({ content: '❌ This ticket is already closed!', ephemeral: true });
  ticketData.status = 'closed';
  tickets.set(interaction.channel.id, ticketData);
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
      tickets.delete(interaction.channel.id);
      ticketTranscripts.delete(interaction.channel.id);
    } catch {}
  }, 10000);
}

async function sendTranscript(interaction, ticketData) {
  const transcript = ticketTranscripts.get(interaction.channel.id) || [];
  if (!transcript.length)
    return interaction.reply({ content: '❌ No transcript available for this ticket', ephemeral: true });
  let text = `# Ticket Transcript\n**Channel:** ${interaction.channel.name}\n**User:** <@${ticketData.userId}>\n**Created:** <t:${Math.floor(ticketData.timestamp / 1000)}:F>\n\n`;
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
   PREMIUM AD (unchanged – kept for reference)
   ------------------------------------------------- */
async function sendPremiumAd(interaction) {
  if (interaction.channel.id !== PREMIUM_CHANNEL_ID && !OWNER_IDS.includes(interaction.user.id))
    return interaction.reply({ content: '❌ This command can only be used in the premium channel!', ephemeral: true });
  const embed = new EmbedBuilder()
    .setTitle('💎 Epsillon Hub Premium')
    .setColor('#FFD700')
    .addFields(
      { name: '💰 Price', value: '$10 One-Time Payment\nLifetime Access', inline: true },
      { name: '🔒 Security', value: 'Lifetime Updates & Support', inline: true }
    )
    .setFooter({ text: 'Premium Quality Solution' })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('purchase_premium')
      .setLabel('Purchase Now')
      .setStyle(ButtonStyle.Success)
      .setEmoji('💳')
  );
  await interaction.reply({
    content: 'To purchase the lifetime version of the script Epsillon Hub read the content below.',
    embeds: [embed],
    components: [row]
  });
}

/* -------------------------------------------------
   COMMAND DEFINITIONS (no .toJSON() here)
   ------------------------------------------------- */
const commands = [
  // --- MODERATION -------------------------------------------------
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
    .addSubcommand(s =>
      s
        .setName('add')
        .setDescription('Add a role to a user')
        .addUserOption(o => o.setName('user').setDescription('User to add role to').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role to add').setRequired(true))
    )
    .addSubcommand(s =>
      s
        .setName('remove')
        .setDescription('Remove a role from a user')
        .addUserOption(o => o.setName('user').setDescription('User to remove role from').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true))
    )
    .addSubcommand(s =>
      s
        .setName('info')
        .setDescription('Get information about a role')
        .addRoleOption(o => o.setName('role').setDescription('Role to get info for').setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Give a role to a user')
    .addUserOption(o => o.setName('user').setDescription('User to give role to').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to give').setRequired(true)),
  new SlashCommandBuilder().setName('membercount').setDescription('Show current member count'),
  new SlashCommandBuilder().setName('onlinecount').setDescription('Show online member count'),

  // --- GIVEAWAY -------------------------------------------------
  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways')
    .addSubcommand(s =>
      s
        .setName('create')
        .setDescription('Create a new giveaway')
        .addStringOption(o => o.setName('prize').setDescription('Prize to giveaway').setRequired(true))
        .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(1440))
        .addIntegerOption(o => o.setName('winners').setDescription('Number of winners (default: 1)').setRequired(false).setMinValue(1).setMaxValue(100))
    ),

  // --- TICKETS -------------------------------------------------
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage tickets')
    .addSubcommand(s => s.setName('create').setDescription('Create a new ticket'))
    .addSubcommand(s => s.setName('close').setDescription('Close current ticket'))
    .addSubcommand(s =>
      s
        .setName('add')
        .setDescription('Add a user to ticket')
        .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true))
    )
    .addSubcommand(s =>
      s
        .setName('remove')
        .setDescription('Remove a user from ticket')
        .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true))
    )
    .addSubcommand(s => s.setName('claim').setDescription('Claim a ticket'))
    .addSubcommand(s => s.setName('unclaim').setDescription('Unclaim a ticket'))
    .addSubcommand(s => s.setName('transcript').setDescription('Get ticket transcript')),

  // --- PREMIUM AD -------------------------------------------------
  new SlashCommandBuilder().setName('premium').setDescription('Display premium script advertisement'),

  // --- NEW: MEDIA PARTNER PANEL -------------------------------------------------
  new SlashCommandBuilder()
    .setName('media-partner')
    .setDescription('Create the Eps1llon Hub Media Partnership panel')
    .addChannelOption(o =>
      o
        .setName('target')
        .setDescription('Channel where the panel should be posted')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    ),

  // --- NEW: RESELLER PARTNER PANEL -------------------------------------------------
  new SlashCommandBuilder()
    .setName('reseller-partner')
    .setDescription('Create the Eps1llon Hub Reseller Partnership panel')
    .addChannelOption(o =>
      o
        .setName('target')
        .setDescription('Channel where the panel should be posted')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
];

/* -------------------------------------------------
   REST (register commands) – convert to JSON here
   ------------------------------------------------- */
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

/* -------------------------------------------------
   CLIENT READY
   ------------------------------------------------- */
client.once(Events.ClientReady, async () => {
  console.log(`Ready as ${client.user.tag}`);
  try {
    // Register slash commands
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands.map(c => c.toJSON())
    });

    // Ensure the premium ad is present (unchanged)
    const premiumChannel = client.channels.cache.get(PREMIUM_CHANNEL_ID);
    if (premiumChannel) {
      const messages = await premiumChannel.messages.fetch({ limit: 5 });
      const exists = messages.find(m => m.embeds[0]?.title === '💎 Epsillon Hub Premium' && m.author.id === client.user.id);
      if (!exists) {
        const embed = new EmbedBuilder()
          .setTitle('💎 Epsillon Hub Premium')
          .setColor('#FFD700')
          .addFields(
            { name: '💰 Price', value: '$10 One-Time Payment\nLifetime Access', inline: true },
            { name: '🔒 Security', value: 'Lifetime Updates & Support', inline: true }
          )
          .setFooter({ text: 'Premium Quality Solution' })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('purchase_premium')
            .setLabel('Purchase Now')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💳')
        );
        await premiumChannel.send({
          content: 'To purchase the lifetime version of the script Epsillon Hub read the content below.',
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
   INTERACTION CREATE (commands, buttons, modals)
   ------------------------------------------------- */
client.on(Events.InteractionCreate, async interaction => {
  /* ---------- SLASH COMMANDS ---------- */
  if (interaction.isChatInputCommand()) {
    const { commandName, options, member, channel, guild } = interaction;
    const modCommands = [
      'mute',
      'unmute',
      'warn',
      'warnings',
      'clearwarns',
      'purge',
      'purgebots',
      'purgehumans',
      'purgeall',
      'lock',
      'unlock',
      'slowmode',
      'role',
      'giverole'
    ];
    if (modCommands.includes(commandName) && !hasPermission(member)) {
      return interaction.reply({ content: '❌ You don\'t have permission to use this command!', ephemeral: true });
    }

    try {
      /* ----- MODERATION COMMANDS (unchanged) ----- */
      if (commandName === 'mute') {
        const user = options.getUser('user');
        const duration = options.getInteger('duration') || 10;
        const reason = options.getString('reason') || 'No reason provided';
        const now = Date.now();
        const last = muteCooldowns.get(member.id) || 0;
        if (now - last < MUTE_COOLDOWN) {
          const left = Math.ceil((MUTE_COOLDOWN - (now - last)) / 1000);
          return interaction.reply({ content: `❌ Please wait ${left} seconds before muting again!`, ephemeral: true });
        }
        const target = await guild.members.fetch(user.id);
        if (!target.moderatable) return interaction.reply({ content: '❌ Cannot mute this user!', ephemeral: true });
        if (OWNER_IDS.includes(target.id)) return interaction.reply({ content: '❌ Cannot mute bot owner!', ephemeral: true });
        await target.timeout(duration * 60 * 1000, reason);
        muteCooldowns.set(member.id, now);
        await interaction.reply({ content: `✅ <@${user.id}> muted for ${duration} minutes.\n**Reason:** ${reason}` });
        await logAction(guild, 'mute', user, member.user, reason, duration * 60);
      } else if (commandName === 'unmute') {
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'No reason provided';
        const target = await guild.members.fetch(user.id);
        if (!target.isCommunicationDisabled()) return interaction.reply({ content: '❌ User is not muted!', ephemeral: true });
        await target.timeout(null);
        await interaction.reply({ content: `✅ <@${user.id}> unmuted.\n**Reason:** ${reason}` });
        await logAction(guild, 'unmute', user, member.user, reason);
      } else if (commandName === 'warn') {
        const user = options.getUser('user');
        const reason = options.getString('reason');
        if (!warnings.has(user.id)) warnings.set(user.id, []);
        const list = warnings.get(user.id);
        list.push({ reason, moderator: member.user.tag, timestamp: new Date() });
        const strikes = (userStrikes.get(user.id) || 0) + 1;
        userStrikes.set(user.id, strikes);
        let reply = `⚠️ <@${user.id}> warned.\n**Reason:** ${reason}\n**Strikes:** ${strikes}/3`;
        if (strikes >= 3) {
          const target = await guild.members.fetch(user.id);
          if (target && target.moderatable) {
            await target.timeout(30 * 60 * 1000, '3 strikes - auto mute');
            reply += '\n\n🔇 Auto-muted for 30 minutes due to 3 strikes!';
            await logAction(guild, 'mute', user, client.user, 'Auto-mute after 3 strikes', 30 * 60);
          }
          userStrikes.set(user.id, 0);
        }
        await interaction.reply({ content: reply });
        await logAction(guild, 'warn', user, member.user, reason);
      } else if (commandName === 'warnings') {
        const user = options.getUser('user') || interaction.user;
        const list = warnings.get(user.id);
        if (!list || !list.length) return interaction.reply({ content: `<@${user.id}> has no warnings.`, ephemeral: true });
        let text = `**Warnings for <@${user.id}>**\n`;
        list.forEach((w, i) => {
          text += `**${i + 1}.** ${w.reason} - ${w.moderator} (${w.timestamp.toLocaleString()})\n`;
        });
        await interaction.reply({ content: text });
      } else if (commandName === 'clearwarns') {
        const user = options.getUser('user');
        warnings.delete(user.id);
        userStrikes.delete(user.id);
        await interaction.reply({ content: `✅ Cleared warnings for <@${user.id}>` });
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
        await interaction.reply({ content: `🔒 <#${channel.id}> locked${duration ? ` for ${duration} minutes` : ''}.\n**Reason:** ${reason}` });
        await logAction(guild, 'lock', { id: 'channel', tag: channel.name }, member.user, reason, duration * 60);
      } else if (commandName === 'unlock') {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        for (const id of OWNER_IDS) {
          const ow = channel.permissionOverwrites.cache.get(id);
          if (ow) await ow.delete();
        }
        await interaction.reply({ content: `🔓 <#${channel.id}> unlocked.` });
        await logAction(guild, 'unlock', { id: 'channel', tag: channel.name }, member.user, 'Channel unlocked');
      } else if (commandName === 'slowmode') {
        const seconds = options.getInteger('seconds');
        await channel.setRateLimitPerUser(seconds);
        await interaction.reply({ content: seconds ? `⏱️ Slowmode set to ${seconds}s` : '⏱️ Slowmode disabled' });
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
          await interaction.reply({ content: `✅ Added <@&${role.id}> to <@${user.id}>` });
          await logAction(guild, 'role_add', user, member.user, `Added ${role.name}`);
        } else if (sub === 'remove') {
          const user = options.getUser('user');
          const role = options.getRole('role');
          const target = await guild.members.fetch(user.id);
          if (!canManageRoles(member, role)) return interaction.reply({ content: '❌ Cannot manage this role!', ephemeral: true });
          if (!canManageMember(member, target)) return interaction.reply({ content: '❌ Cannot manage this user!', ephemeral: true });
          await target.roles.remove(role);
          await interaction.reply({ content: `✅ Removed <@&${role.id}> from <@${user.id}>` });
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
          await interaction.reply({ embeds: [embed] });
        }
      } else if (commandName === 'giverole') {
        const user = options.getUser('user');
        const role = options.getRole('role');
        const target = await guild.members.fetch(user.id);
        if (!canManageRoles(member, role)) return interaction.reply({ content: '❌ Cannot manage this role!', ephemeral: true });
        if (!canManageMember(member, target)) return interaction.reply({ content: '❌ Cannot manage this user!', ephemeral: true });
        await target.roles.add(role);
        await interaction.reply({ content: `✅ Added <@&${role.id}> to <@${user.id}>` });
        await logAction(guild, 'giverole', user, member.user, `Gave ${role.name}`);
      } else if (commandName === 'membercount') {
        const total = guild.memberCount;
        const online = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
        await interaction.reply({ content: `👥 Total: ${total}\n🟢 Online: ${online}\n🔴 Offline: ${total - online}` });
      } else if (commandName === 'onlinecount') {
        const online = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
        await interaction.reply({ content: `🟢 Online members: ${online}` });
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
          giveaways.set(msg.id, {
            messageId: msg.id,
            channelId: channel.id,
            guildId: guild.id,
            prize,
            winners,
            endTime: end,
            participants: new Set(),
            host: member.id
          });
          const interval = setInterval(async () => {
            const now = Date.now();
            const left = Math.max(0, Math.floor((end - now) / 1000));
            if (left <= 0) {
              clearInterval(interval);
              const data = giveaways.get(msg.id);
              if (!data) return;
              const participants = Array.from(data.participants);
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
                  { name: '👤 Total Entries', value: data.participants.size.toString() },
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
              giveaways.delete(msg.id);
              return;
            }
            const data = giveaways.get(msg.id);
            const entryCount = data.participants.size;
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
        const data = tickets.get(interaction.channel.id);
        if (sub === 'create') {
          // Handled by button – nothing needed here
        } else if (sub === 'close') {
          if (!data) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          await closeTicket(interaction, data);
        } else if (sub === 'add') {
          if (!data) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          const user = interaction.options.getUser('user');
          await interaction.channel.permissionOverwrites.create(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
          await interaction.reply({ content: `✅ <@${user.id}> added to ticket` });
        } else if (sub === 'remove') {
          if (!data) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          const user = interaction.options.getUser('user');
          await interaction.channel.permissionOverwrites.delete(user.id);
          await interaction.reply({ content: `✅ <@${user.id}> removed from ticket` });
        } else if (sub === 'claim') {
          if (!data) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID) && !OWNER_IDS.includes(interaction.user.id))
            return interaction.reply({ content: '❌ You do not have permission to claim tickets!', ephemeral: true });
          if (data.claimedBy) return interaction.reply({ content: `❌ Already claimed by <@${data.claimedBy}>`, ephemeral: true });
          data.claimedBy = interaction.user.id;
          tickets.set(interaction.channel.id, data);
          await interaction.reply({ content: `✅ Ticket claimed by <@${interaction.user.id}>` });
          await interaction.channel.setName(`claimed-${interaction.user.username}`);
        } else if (sub === 'unclaim') {
          if (!data) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          if (data.claimedBy !== interaction.user.id && !OWNER_IDS.includes(interaction.user.id))
            return interaction.reply({ content: '❌ You can only unclaim tickets you claimed!', ephemeral: true });
          data.claimedBy = null;
          tickets.set(interaction.channel.id, data);
          await interaction.reply({ content: '✅ Ticket unclaimed' });
          await interaction.channel.setName(interaction.channel.name.replace(/^claimed-/, `ticket-`));
        } else if (sub === 'transcript') {
          if (!data) return interaction.reply({ content: '❌ This command can only be used in ticket channels!', ephemeral: true });
          await sendTranscript(interaction, data);
        }
      } else if (commandName === 'premium') {
        await sendPremiumAd(interaction);
      } else if (commandName === 'media-partner') {
        /* ---------- NEW COMMAND ---------- */
        if (!hasPermission(member)) {
          return interaction.reply({ content: '❌ You don’t have permission to create the media‑partner panel.', ephemeral: true });
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
            .setStyle(ButtonStyle.Primary)          // <-- make sure a style is set
            .setEmoji('📝')
        );

        await targetChannel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Media‑partner panel posted in <#${targetChannel.id}>`, ephemeral: true });
      } else if (commandName === 'reseller-partner') {
        /* ---------- NEW RESELLER COMMAND ---------- */
        if (!hasPermission(member)) {
          return interaction.reply({ content: '❌ You don’t have permission to create the reseller‑partner panel.', ephemeral: true });
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
      if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Command error.', ephemeral: true });
    }

  /* ---------- BUTTON INTERACTIONS ---------- */
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
      const data = giveaways.get(interaction.message.id);
      if (!data) return interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
      if (data.participants.has(interaction.user.id)) return interaction.reply({ content: '❌ Already entered.', ephemeral: true });
      data.participants.add(interaction.user.id);
      giveaways.set(interaction.message.id, data);
      await interaction.reply({ content: '🎉 Joined giveaway!', ephemeral: true });
    } else if (interaction.customId === 'purchase_premium') {
      /* ----- PREMIUM PURCHASE (unchanged) ----- */
      try {
        const category = interaction.guild.channels.cache.get(PREMIUM_CATEGORY_ID);
        const channelOptions = {
          name: `lifetime-purchase-${interaction.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            ...OWNER_IDS.map(id => ({
              id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            })),
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
          ]
        };
        if (category) channelOptions.parent = category.id;   // only set parent if the category exists
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
        await ticket.send({ content: `<@${interaction.user.id}> ${OWNER_IDS.map(i => `<@${i}>`).join(' ')}`, embeds: [panel], components: [row] });
        const info = new EmbedBuilder()
          .setTitle('💎 Epsillon Hub Premium Purchase')
          .setDescription(`Price: $${PREMIUM_PRICE} (Lifetime)\nSupported payments: CashApp, Crypto, Gift Cards`)
          .setColor('#FFD700')
          .setTimestamp();
        await ticket.send({ embeds: [info] });
        tickets.set(ticket.id, { userId: interaction.user.id, channelId: ticket.id, status: 'open', timestamp: Date.now(), claimedBy: null });
        ticketTranscripts.set(ticket.id, []);
        await interaction.reply({ content: `✅ Purchase ticket created: <#${ticket.id}>`, ephemeral: true });
        const log = interaction.guild.channels.cache.get(TICKET_LOGS_CHANNEL_ID);
        if (log) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🛒 Premium Purchase Ticket Created')
            .addFields(
              { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Channel', value: `<#${ticket.id}>`, inline: true },
              { name: 'Price', value: `$${PREMIUM_PRICE} Lifetime`, inline: true }
            )
            .setColor('#FFD700')
            .setTimestamp();
          await log.send({ embeds: [logEmbed] });
        }
      } catch (e) {
        console.error(e);
        await interaction.reply({ content: '❌ Failed to create purchase ticket.', ephemeral: true });
      }
    } else if (interaction.customId === 'close_purchase_ticket') {
      const data = tickets.get(interaction.channel.id);
      if (!data) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
      await closeTicket(interaction, data);
    } else if (interaction.customId === 'ticket_claim') {
      const data = tickets.get(interaction.channel.id);
      if (!data) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
      if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID) && !OWNER_IDS.includes(interaction.user.id))
        return interaction.reply({ content: '❌ No permission to claim.', ephemeral: true });
      if (data.claimedBy) return interaction.reply({ content: `❌ Already claimed by <@${data.claimedBy}>`, ephemeral: true });
      data.claimedBy = interaction.user.id;
      tickets.set(interaction.channel.id, data);
      await interaction.reply({ content: `✅ Ticket claimed by <@${interaction.user.id}>` });
      await interaction.channel.setName(`claimed-${interaction.user.username}`);
    } else if (interaction.customId === 'ticket_close') {
      const data = tickets.get(interaction.channel.id);
      if (!data) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
      await closeTicket(interaction, data);
    } else if (interaction.customId === 'ticket_transcript') {
      const data = tickets.get(interaction.channel.id);
      if (!data) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
      await sendTranscript(interaction, data);
    } else if (interaction.customId === 'media_apply') {
      /* ---------- NEW MEDIA‑PARTNER APPLICATION MODAL ---------- */
      const modal = new ModalBuilder()
        .setCustomId('media_application')
        .setTitle('Media Partnership Application');

      const platform = new TextInputBuilder()
        .setCustomId('media_platform')
        .setLabel('Platform(s) (TikTok, YouTube, Live Streamer, Both)')
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
      /* ---------- NEW RESELLER APPLICATION MODAL ---------- */
      const modal = new ModalBuilder()
        .setCustomId('reseller_application')
        .setTitle('Reseller Partnership Application');

      const payment = new TextInputBuilder()
        .setCustomId('reseller_payment')
        .setLabel('Payment methods you can accept')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('PayPal, crypto, bank transfer, etc.')
        .setRequired(true)
        .setMaxLength(100);

      const availability = new TextInputBuilder()
        .setCustomId('reseller_availability')
        .setLabel('Are you always online / ready to sell when needed?')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Yes / No – typical response time')
        .setRequired(true)
        .setMaxLength(100);

      const experience = new TextInputBuilder()
        .setCustomId('reseller_experience')
        .setLabel('Past reseller experience or store link (if any)')
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
  }

  /* ---------- MODAL SUBMITS ---------- */
  else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'ticket_modal') {
      await interaction.deferReply({ ephemeral: true });
      const subject = interaction.fields.getTextInputValue('ticket_subject');
      const description = interaction.fields.getTextInputValue('ticket_description');
      const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);
      const channelOptions = {
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
          { id: SUPPORT_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
        ]
      };
      if (category) channelOptions.parent = category.id;   // only set parent if the category exists
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
      await ticket.send({ content: `<@${interaction.user.id}> <@&${SUPPORT_ROLE_ID}>`, embeds: [panel], components: [row] });

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

      tickets.set(ticket.id, { userId: interaction.user.id, channelId: ticket.id, status: 'open', timestamp: Date.now(), claimedBy: null });
      ticketTranscripts.set(ticket.id, []);
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
      await interaction.deferReply({ ephemeral: true });
      const platform = interaction.fields.getTextInputValue('media_platform');
      const link = interaction.fields.getTextInputValue('media_link');

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

      await interaction.editReply({ content: '✅ Your application has been sent! Our staff will review it shortly.', ephemeral: true });
    } else if (interaction.customId === 'reseller_application') {
      await interaction.deferReply({ ephemeral: true });
      const payment = interaction.fields.getTextInputValue('reseller_payment');
      const availability = interaction.fields.getTextInputValue('reseller_availability');
      const experience = interaction.fields.getTextInputValue('reseller_experience');

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

      await interaction.editReply({ content: '✅ Your reseller application has been sent! Our staff will review it shortly.', ephemeral: true });
    }
  }
});

/* -------------------------------------------------
   MESSAGE CREATE (auto‑mod + ticket transcript)
   ------------------------------------------------- */
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (message.content.length < 2) return;
  if (hasPermission(message.member)) return;

  // Ticket transcript collection
  if (tickets.has(message.channel.id)) {
    const arr = ticketTranscripts.get(message.channel.id) || [];
    arr.push({ author: message.author.tag, content: message.content, timestamp: message.createdTimestamp });
    ticketTranscripts.set(message.channel.id, arr);
  }

  // Auto‑mod detection
  const result = detectToSContent(message.content);
  if (result.detected) {
    try {
      const deleted = message.content;
      await message.delete();
      await message.author.send(`❌ Your message was removed for violating Discord's Terms of Service.\n**Content:** ${deleted.substring(0, 1000)}`);
      const strikes = (userStrikes.get(message.author.id) || 0) + 1;
      userStrikes.set(message.author.id, strikes);
      if (strikes >= 3) {
        const target = await message.guild.members.fetch(message.author.id);
        if (target && target.moderatable) {
          await target.timeout(30 * 60 * 1000, '3 strikes - auto mute');
          await message.channel.send(`🔇 <@${message.author.id}> auto‑muted for 30 minutes.`);
          await logAction(message.guild, 'mute', message.author, client.user, 'Auto‑mute after 3 strikes', 30 * 60, `Deleted: ${deleted.substring(0, 500)}`);
        }
        userStrikes.set(message.author.id, 0);
      } else {
        await message.channel.send(`⚠️ <@${message.author.id}> message removed. Strikes: ${strikes}/3`);
      }
      await logAction(message.guild, 'automod', message.author, client.user, 'ToS violation', null, `Deleted: ${deleted.substring(0, 500)}`);
      await logPhishing(message.guild, message.author, deleted, result.pattern);
    } catch (_) {}
  }
});

/* -------------------------------------------------
   GUILD MEMBER LOGS (join/leave)
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
client.login(process.env.DISCORD_TOKEN);
