require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, ChannelType, TextInputStyle, ModalBuilder, TextInputBuilder, StringSelectMenuBuilder } = require('discord.js');

// Configuration
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || 'YOUR_MOD_ROLE_ID';
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',').map(id => id.trim()) : [];
const LOG_CHANNEL_ID = '1404675690007105596';
const WELCOME_CHANNEL_ID = '1364387827386683484';
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || 'YOUR_TICKET_CATEGORY_ID';
const TICKET_LOGS_CHANNEL_ID = process.env.TICKET_LOGS_CHANNEL_ID || 'YOUR_TICKET_LOGS_CHANNEL_ID';
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID || 'YOUR_SUPPORT_ROLE_ID';
const PREMIUM_CHANNEL_ID = '1403870367524585482';
const PREMIUM_CATEGORY_ID = '1407184066205319189';
const PREMIUM_PRICE = 10; // USD

// Create new client instance
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

// Data stores
const warnings = new Map();
const userStrikes = new Map();
const giveaways = new Map();
const muteCooldowns = new Map(); // userId -> timestamp
const tickets = new Map(); // ticketId -> { userId, channelId, status, timestamp, claimedBy }
const ticketTranscripts = new Map(); // channelId -> [messages]

// Cooldown duration (1 minute)
const MUTE_COOLDOWN = 60000;

// Auto-moderation settings
const BANNED_PATTERNS = [
/(?:n[i1!|]gg[ae3r]?)|(?:f[a4@]gg[o0]t?)|(?:ch[i1!|]nk?)|(?:k[i1!|]ke?)|(?:r[e3]t[a4@]rd?)|(?:c[o0]ck)|(?:p[e3]n[i1!|]s)|(?:v[a4@]g[i1!|]n[a4@])|(?:wh[o0]r[e3])|(?:sl[uo0]t)|(?:b[i1!|]tch)|(?:c[uo0]nt)|(?:sh[i1!|]t)|(?:f[uo0]ck)|(?:d[i1!|]ck)|(?:p[o0]rn)|(?:s[e3]x)|(?:n[a4@]ked)|(?:b[o0][o0]bs?)|(?:t[i1!|]ts?)|(?:p[uo0]ssy)|(?:cum)|(?:j[i1!|]zz)|(?:orgy)|(?:g[a4@]ngb[a4@]ng)|(?:p[e3]d[o0])|(?:b[e3][a4@]st[i1!|]al[i1!|]ty)|(?:z[o0][o0]ph[i1!|]l[i1!|]a)|(?:l[o0][o0]t[a4@])|(?:r[a4@]p[e3])|(?:m[o0]l[e3]st[e3])|(?:p[e3]d[e3][s5])|(?:s[a4@]d[i1!|]sm)|(?:m[a4@]st[e3]rb[a4@]t[e3])|(?:b[e3][a4@]n[a4@]n[a4@])|(?:w[a4@]nker)|(?:w[a4@]nk[e3]r)|(?:b[o0][o0]ger)|(?:t[uo0]rd)|(?:sc[uo0]t)|(?:tw[a4@]t)|(?:n[a4@]z[i1!|])|(?:sp[i1!|]c)|(?:g[o0][o0]k)|(?:g[e3]rm[a4@]n)|(?:j[e3]w)|(?:h[o0][o0]k[e3]r)|(?:r[a4@]c[i1!|]st)|(?:n[a4@]z[i1!|])|(?:f[a4@]sc[i1!|]st)|(?:tr[a4@]nn[yi])|(?:dyk[e3])|(?:tr[a4@]ny)|(?:s[h]{2}[i1!|]t[e3])|(?:f[uo0][ck]{2})|(?:b[i1!|]tch[e3]s)|(?:c[o0]cks[uo0]ck[e3]r)|(?:m[o0]th[e3]rf[uo0]ck[e3]r)|(?:f[a4@]gg[o0]t[s5])|(?:n[i1!|]gg[e3]r[s5])|(?:r[e3]t[a4@]rd[e3]d)|(?:c[o0]cks[uo0]ck[i1!|]ng)|(?:m[o0]th[e3]rf[uo0]ck[i1!|]ng)|(?:f[uo0]ck[i1!|]ng)|(?:sh[i1!|]tt[i1!|]ng)|(?:b[i1!|]tch[i1!|]ng)|(?:c[uo0]nt[i1!|]ng)|(?:n[i1!|]gg[e3]r[i1!|]ng)|(?:f[a4@]gg[o0]t[i1!|]ng)|(?:r[e3]t[a4@]rd[i1!|]ng)/gi,
/(?:discord.gg\/[a-zA-Z0-9]+)|(?:bit.ly\/[a-zA-Z0-9]+)|(?:tinyurl.com\/[a-zA-Z0-9]+)/gi,
/(?:suicid[e3])|(?:kil+ing myself)|(?:end my lif[e3])|(?:want to di[e3])|(?:no on[e3] car[e3]s)|(?:no purpos[e3])|(?:worthl[e3]ss)/gi,
/(?:h[e3]il hitl[e3]r)|(?:nazi)|(?:swastika)|(?:kkk)|(?:white pow[e3]r)|(?:rac[e3] war)|(?:genocid[e3])|(?:ethnic cl[e3]ansing)/gi
];

// Utility functions
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
if (days > 0) timeString += `${days}d `;
if (hours > 0) timeString += `${hours}h `;
if (minutes > 0) timeString += `${minutes}m `;
if (secs > 0) timeString += `${secs}s`;

return timeString.trim() || '0s';
}

function calculateWinChance(participants, winners) {
if (participants === 0) return '0%';
if (participants <= winners) return '100%';
const chance = (winners / participants) * 100;
return `${chance.toFixed(1)}%`;
}

async function logAction(guild, action, user, moderator, reason, duration = null, additionalInfo = null) {
const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
if (!logChannel) return;

const embed = new EmbedBuilder()
    .setTitle('🛡️ Moderation Log')
    .setColor(action === 'warn' || action === 'strike' ? '#FFA500' : 
              action === 'mute' ? '#FF0000' : 
              action === 'kick' ? '#8B0000' : 
              action === 'role' ? '#0000FF' : '#00FF00')
    .setDescription(`${moderator.tag} (${moderator.id}) ${action}ed ${user.tag} (${user.id})`)
    .addFields(
        { name: 'Action', value: action.charAt(0).toUpperCase() + action.slice(1), inline: true },
        { name: 'Target', value: `<@${user.id}>`, inline: true },
        { name: 'Moderator', value: `<@${moderator.id}>`, inline: true },
        { name: 'Reason', value: reason, inline: false }
    )
    .setTimestamp();

if (duration) {
    embed.addFields({ name: 'Duration', value: formatTime(duration), inline: true });
}

if (additionalInfo) {
    embed.addFields({ name: 'Details', value: additionalInfo, inline: false });
}

await logChannel.send({ embeds: [embed] });
}

// AutoMod detection
function detectToSContent(content) {
const lowerContent = content.toLowerCase();

for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(lowerContent)) {
        return { detected: true, pattern: pattern.toString() };
    }
}

// Check for bypass attempts
const substitutions = {
    'a': ['4', '@'],
    'e': ['3'],
    'i': ['1', '!'],
    'o': ['0'],
    's': ['5', '$'],
    't': ['7'],
    'u': ['v']
};

for (const pattern of BANNED_PATTERNS) {
    let testContent = lowerContent;
    for (const [original, subs] of Object.entries(substitutions)) {
        for (const sub of subs) {
            testContent = testContent.replace(new RegExp(sub, 'g'), original);
        }
    }
    if (pattern.test(testContent)) {
        return { detected: true, pattern: pattern.toString() };
    }
}

return { detected: false, pattern: null };
}

// Ticket system functions
async function closeTicket(interaction, ticketData) {
  if (ticketData.status === 'closed') {
    return await interaction.reply({
      content: '❌ This ticket is already closed!',
      ephemeral: true
    });
  }

  ticketData.status = 'closed';
  tickets.set(interaction.channel.id, ticketData);

  // Send confirmation
  const confirmEmbed = new EmbedBuilder()
    .setTitle('🔒 Ticket Closed')
    .setDescription('This ticket will be deleted in 10 seconds')
    .setColor('#ff0000')
    .setTimestamp();

  await interaction.reply({ embeds: [confirmEmbed] });

  // Log closure
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

  // Wait 10 seconds then delete channel
  setTimeout(async () => {
    try {
      await interaction.channel.delete();
      tickets.delete(interaction.channel.id);
      ticketTranscripts.delete(interaction.channel.id);
    } catch (error) {
      console.error('Error deleting ticket channel:', error);
    }
  }, 10000);
}

async function sendTranscript(interaction, ticketData) {
  const transcript = ticketTranscripts.get(interaction.channel.id) || [];
  if (transcript.length === 0) {
    return await interaction.reply({
      content: '❌ No transcript available for this ticket',
      ephemeral: true
    });
  }

  let transcriptText = `# Ticket Transcript\n**Channel:** ${interaction.channel.name}\n**User:** <@${ticketData.userId}>\n**Created:** <t:${Math.floor(ticketData.timestamp/1000)}:F>\n\n`;
  
  transcript.forEach(msg => {
    transcriptText += `[${new Date(msg.timestamp).toLocaleString()}] ${msg.author}: ${msg.content}\n`;
  });

  const buffer = Buffer.from(transcriptText, 'utf-8');
  const attachment = {
    attachment: buffer,
    name: `transcript-${interaction.channel.name}.txt`
  };

  await interaction.reply({
    content: '📝 Here is the ticket transcript:',
    files: [attachment],
    ephemeral: true
  });
}

// Premium advertisement function
async function sendPremiumAd(interaction) {
  if (interaction.channel.id !== PREMIUM_CHANNEL_ID && !OWNER_IDS.includes(interaction.user.id)) {
    return await interaction.reply({
      content: '❌ This command can only be used in the premium channel!',
      ephemeral: true
    });
  }

  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('💎 Epsillon Hub Premium')
    .setDescription('**The Ultimate Discord Bot Solution**')
    .setColor('#FFD700')
    .addFields(
      {
        name: '💰 Price',
        value: `$${PREMIUM_PRICE} One-Time Payment\nLifetime Access`,
        inline: true
      },
      {
        name: '🔒 Security',
        value: 'Lifetime Updates & Support',
        inline: true
      }
    )
    .setFooter({ text: 'Premium Quality Solution' })
    .setTimestamp();

  // Create button
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('purchase_premium')
        .setLabel('Purchase Now')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💳')
    );

  await interaction.reply({
    content: '🔥 **Introducing Epsillon Hub Premium!** 🔥',
    embeds: [embed],
    components: [row]
  });
}

// Command definitions
const commands = [
new SlashCommandBuilder()
.setName('mute')
.setDescription('Mute a user')
.addUserOption(option => option.setName('user').setDescription('User to mute').setRequired(true))
.addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(false))
.addStringOption(option => option.setName('reason').setDescription('Reason for mute').setRequired(false)),

new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user')
    .addUserOption(option => option.setName('user').setDescription('User to unmute').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for unmute').setRequired(false)),

new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(option => option.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true)),

new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a user')
    .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false)),

new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear all warnings for a user')
    .addUserOption(option => option.setName('user').setDescription('User to clear warnings for').setRequired(true)),

new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete messages')
    .addIntegerOption(option => option.setName('amount').setDescription('Number of messages (1-500)').setRequired(true).setMinValue(1).setMaxValue(500))
    .addUserOption(option => option.setName('user').setDescription('Only delete messages from this user').setRequired(false)),

new SlashCommandBuilder()
    .setName('purgebots')
    .setDescription('Delete messages from bots only'),

new SlashCommandBuilder()
    .setName('purgehumans')
    .setDescription('Delete messages from humans only'),

new SlashCommandBuilder()
    .setName('purgeall')
    .setDescription('Delete all messages in channel'),

new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel')
    .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes (0 = permanent)').setRequired(false))
    .addStringOption(option => option.setName('reason').setDescription('Reason for locking').setRequired(false)),

new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel'),

new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode for channel')
    .addIntegerOption(option => option.setName('seconds').setDescription('Seconds between messages').setRequired(true).setMinValue(0).setMaxValue(21600)),

new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage roles')
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Add a role to a user')
            .addUserOption(option => option.setName('user').setDescription('User to add role to').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('Role to add').setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Remove a role from a user')
            .addUserOption(option => option.setName('user').setDescription('User to remove role from').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('Role to remove').setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('info')
            .setDescription('Get information about a role')
            .addRoleOption(option => option.setName('role').setDescription('Role to get info for').setRequired(true))),

new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Give a role to a user')
    .addUserOption(option => option.setName('user').setDescription('User to give role to').setRequired(true))
    .addRoleOption(option => option.setName('role').setDescription('Role to give').setRequired(true)),

new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Show current member count'),

new SlashCommandBuilder()
    .setName('onlinecount')
    .setDescription('Show online member count'),

new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage giveaways')
    .addSubcommand(subcommand =>
        subcommand
            .setName('create')
            .setDescription('Create a new giveaway')
            .addStringOption(option => option.setName('prize').setDescription('Prize to giveaway').setRequired(true))
            .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(1440))
            .addIntegerOption(option => option.setName('winners').setDescription('Number of winners (default: 1)').setRequired(false).setMinValue(1).setMaxValue(100))),

new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage tickets')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new ticket'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close current ticket'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a user to ticket')
        .addUserOption(option => option.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a user from ticket')
        .addUserOption(option => option.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('claim')
        .setDescription('Claim a ticket'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('unclaim')
        .setDescription('Unclaim a ticket'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('transcript')
        .setDescription('Get ticket transcript')),

new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Display premium script advertisement')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once(Events.ClientReady, async () => {
console.log(`🚀 Ready! Logged in as ${client.user.tag}`);

try {
    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
    );
    console.log('✅ Successfully registered application commands.');
    
    // Create ticket panel in welcome channel
    const welcomeChannel = client.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
      const panelEmbed = new EmbedBuilder()
        .setTitle('🎫 Support Ticket')
        .setDescription('Need help? Click the button below to create a support ticket!')
        .setColor('#0099ff')
        .setFooter({ text: 'Support Team' });

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_ticket')
            .setLabel('Create Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫')
        );

      // Check if panel already exists
      const messages = await welcomeChannel.messages.fetch({ limit: 5 });
      const existingPanel = messages.find(msg => 
        msg.embeds.length > 0 && 
        msg.embeds[0].title === '🎫 Support Ticket' &&
        msg.author.id === client.user.id
      );

      if (!existingPanel) {
        await welcomeChannel.send({ embeds: [panelEmbed], components: [row] });
        console.log('✅ Ticket panel created');
      }
    }
    
    // Send premium ad to premium channel
    try {
      const premiumChannel = client.channels.cache.get(PREMIUM_CHANNEL_ID);
      if (premiumChannel) {
        // Check if ad already exists
        const messages = await premiumChannel.messages.fetch({ limit: 5 });
        const existingAd = messages.find(msg => 
          msg.embeds.length > 0 && 
          msg.embeds[0].title === '💎 Epsillon Hub Premium' &&
          msg.author.id === client.user.id
        );

        if (!existingAd) {
          await sendPremiumAd({ 
            channel: premiumChannel, 
            reply: async (response) => {
              await premiumChannel.send(response);
            }
          });
          console.log('✅ Premium advertisement sent');
        }
      }
    } catch (error) {
      console.error('❌ Failed to send premium ad:', error);
    }
} catch (error) {
    console.error('❌ Failed to register commands:', error);
}
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
if (interaction.isChatInputCommand()) {
const { commandName, options, member, channel, guild } = interaction;

    const modCommands = [
        'mute', 'unmute', 'warn', 'warnings', 'clearwarns',
        'purge', 'purgebots', 'purgehumans', 'purgeall',
        'lock', 'unlock', 'slowmode', 'role', 'giverole'
    ];
    
    if (modCommands.includes(commandName) && !hasPermission(member)) {
        return await interaction.reply({
            content: '❌ You don\'t have permission to use this command!',
            ephemeral: true
        });
    }

    try {
        if (commandName === 'mute') {
            const user = options.getUser('user');
            const duration = options.getInteger('duration') || 10;
            const reason = options.getString('reason') || 'No reason provided';
            
            // Check cooldown
            const now = Date.now();
            const lastMute = muteCooldowns.get(member.user.id) || 0;
            if (now - lastMute < MUTE_COOLDOWN) {
                const remaining = Math.ceil((MUTE_COOLDOWN - (now - lastMute)) / 1000);
                return await interaction.reply({
                    content: `❌ Please wait ${remaining} seconds before muting again!`,
                    ephemeral: true
                });
            }

            const targetMember = await guild.members.fetch(user.id);
            if (!targetMember.moderatable) return await interaction.reply({ content: '❌ Cannot mute this user!', ephemeral: true });
            if (OWNER_IDS.includes(targetMember.id)) return await interaction.reply({ content: '❌ Cannot mute bot owner!', ephemeral: true });

            await targetMember.timeout(duration * 60 * 1000, reason);
            muteCooldowns.set(member.user.id, now); // Set cooldown
            
            await interaction.reply({
                content: `✅ <@${user.id}> has been muted for ${duration} minutes.\n**Reason:** ${reason}`
            });
            
            await logAction(guild, 'mute', user, member.user, reason, duration * 60);
        }

        else if (commandName === 'unmute') {
            const user = options.getUser('user');
            const reason = options.getString('reason') || 'No reason provided';
            
            const targetMember = await guild.members.fetch(user.id);
            if (!targetMember.isCommunicationDisabled()) return await interaction.reply({ content: '❌ User is not muted!', ephemeral: true });

            await targetMember.timeout(null);
            await interaction.reply({
                content: `✅ <@${user.id}> has been unmuted.\n**Reason:** ${reason}`
            });
            
            await logAction(guild, 'unmute', user, member.user, reason);
        }

        else if (commandName === 'warn') {
            const user = options.getUser('user');
            const reason = options.getString('reason');
            
            if (!warnings.has(user.id)) warnings.set(user.id, []);
            const userWarnings = warnings.get(user.id);
            userWarnings.push({
                reason: reason,
                moderator: member.user.tag,
                timestamp: new Date()
            });

            // Add strike
            const strikes = userStrikes.get(user.id) || 0;
            userStrikes.set(user.id, strikes + 1);

            let response = `⚠️ <@${user.id}> has been warned.\n**Reason:** ${reason}\n**Strikes:** ${strikes + 1}/3`;

            // Auto-mute after 3 strikes
            if (strikes + 1 >= 3) {
                try {
                    const targetMember = await guild.members.fetch(user.id);
                    if (targetMember && targetMember.moderatable) {
                        await targetMember.timeout(30 * 60 * 1000, '3 strikes - auto mute');
                        response += '\n\n🔇 **Auto-muted for 30 minutes due to 3 strikes!**';
                        await logAction(guild, 'mute', user, client.user, 'Auto-mute after 3 strikes', 30 * 60);
                    }
                } catch (error) {
                    console.error('Failed to auto-mute:', error);
                }
                userStrikes.set(user.id, 0); // Reset strikes
            }

            await interaction.reply({ content: response });
            await logAction(guild, 'warn', user, member.user, reason);
        }

        else if (commandName === 'warnings') {
            const user = options.getUser('user') || interaction.user;
            if (!warnings.has(user.id) || warnings.get(user.id).length === 0) {
                return await interaction.reply({ content: `<@${user.id}> has no warnings.`, ephemeral: true });
            }

            const userWarnings = warnings.get(user.id);
            let warningText = `**Warnings for <@${user.id}>**\n\n`;
            userWarnings.forEach((warning, index) => {
                warningText += `**${index + 1}.** ${warning.reason} - ${warning.moderator} (${warning.timestamp.toLocaleString()})\n`;
            });

            await interaction.reply({ content: warningText });
        }

        else if (commandName === 'clearwarns') {
            const user = options.getUser('user');
            warnings.delete(user.id);
            userStrikes.delete(user.id);
            await interaction.reply({
                content: `✅ Cleared all warnings and strikes for <@${user.id}>`
            });
            
            await logAction(guild, 'clearwarns', user, member.user, 'Cleared all warnings');
        }

        else if (commandName === 'purge') {
            const amount = options.getInteger('amount');
            const user = options.getUser('user');
            
            await interaction.deferReply({ ephemeral: true });
            let deletedCount = 0;
            let remaining = amount;
            
            while (remaining > 0) {
                const batchSize = Math.min(remaining, 100);
                const fetched = await channel.messages.fetch({ limit: batchSize });
                
                if (fetched.size === 0) break;
                
                let messagesToDelete;
                if (user) {
                    messagesToDelete = fetched.filter(msg => msg.author.id === user.id);
                } else {
                    messagesToDelete = fetched;
                }
                
                if (messagesToDelete.size > 0) {
                    await channel.bulkDelete(messagesToDelete, true);
                    deletedCount += messagesToDelete.size;
                }
                
                remaining -= batchSize;
                if (remaining > 0) await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            await interaction.editReply({
                content: `✅ Successfully deleted ${deletedCount} messages!`
            });
            
            await logAction(guild, 'purge', { id: 'system', tag: 'System' }, member.user, `Purged ${deletedCount} messages`, amount);
        }

        else if (commandName === 'purgebots') {
            await interaction.deferReply({ ephemeral: true });
            const messages = await channel.messages.fetch({ limit: 100 });
            const botMessages = messages.filter(m => m.author.bot);
            if (botMessages.size === 0) return await interaction.editReply({ content: 'No bot messages found.' });
            await channel.bulkDelete(botMessages, true);
            await interaction.editReply({ content: `✅ Deleted ${botMessages.size} bot messages.` });
            
            await logAction(guild, 'purge', { id: 'system', tag: 'System' }, member.user, `Purged ${botMessages.size} bot messages`);
        }

        else if (commandName === 'purgehumans') {
            await interaction.deferReply({ ephemeral: true });
            const messages = await channel.messages.fetch({ limit: 100 });
            const humanMessages = messages.filter(m => !m.author.bot);
            if (humanMessages.size === 0) return await interaction.editReply({ content: 'No human messages found.' });
            await channel.bulkDelete(humanMessages, true);
            await interaction.editReply({ content: `✅ Deleted ${humanMessages.size} human messages.` });
            
            await logAction(guild, 'purge', { id: 'system', tag: 'System' }, member.user, `Purged ${humanMessages.size} human messages`);
        }

        else if (commandName === 'purgeall') {
            await interaction.deferReply({ ephemeral: true });
            const messages = await channel.messages.fetch({ limit: 100 });
            if (messages.size === 0) return await interaction.editReply({ content: 'No messages found.' });
            await channel.bulkDelete(messages, true);
            await interaction.editReply({ content: `✅ Deleted ${messages.size} messages.` });
            
            await logAction(guild, 'purge', { id: 'system', tag: 'System' }, member.user, `Purged all messages`);
        }

        else if (commandName === 'lock') {
            const duration = options.getInteger('duration') || 0;
            const reason = options.getString('reason') || 'No reason provided';

            await channel.permissionOverwrites.create(guild.roles.everyone, { SendMessages: false });
            for (const ownerId of OWNER_IDS) {
                await channel.permissionOverwrites.create(ownerId, { SendMessages: true });
            }

            if (duration > 0) {
                setTimeout(async () => {
                    await channel.permissionOverwrites.create(guild.roles.everyone, { SendMessages: null });
                    for (const ownerId of OWNER_IDS) {
                        const overwrite = channel.permissionOverwrites.cache.get(ownerId);
                        if (overwrite) await overwrite.delete();
                    }
                    await channel.send(`🔓 <#${channel.id}> has been automatically unlocked`);
                }, duration * 60 * 1000);
            }

            await interaction.reply({
                content: `🔒 <#${channel.id}> has been locked${duration > 0 ? ` for ${duration} minutes` : ''} by <@${member.user.id}>\n**Reason:** ${reason}`
            });
            
            await logAction(guild, 'lock', { id: 'channel', tag: channel.name }, member.user, reason, duration * 60);
        }

        else if (commandName === 'unlock') {
            await channel.permissionOverwrites.create(guild.roles.everyone, { SendMessages: null });
            for (const ownerId of OWNER_IDS) {
                const overwrite = channel.permissionOverwrites.cache.get(ownerId);
                if (overwrite) await overwrite.delete();
            }
            await interaction.reply({ content: `🔓 <#${channel.id}> has been unlocked by <@${member.user.id}>` });
            
            await logAction(guild, 'unlock', { id: 'channel', tag: channel.name }, member.user, 'Channel unlocked');
        }

        else if (commandName === 'slowmode') {
            const seconds = options.getInteger('seconds');
            await channel.setRateLimitPerUser(seconds);
            await interaction.reply({
                content: seconds === 0 
                    ? `⏱️ Slowmode disabled in <#${channel.id}>`
                    : `⏱️ Slowmode set to ${seconds} seconds in <#${channel.id}>`
            });
            
            await logAction(guild, 'slowmode', { id: 'channel', tag: channel.name }, member.user, `Slowmode set to ${seconds} seconds`, seconds);
        }

        else if (commandName === 'role') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === 'add') {
                const user = options.getUser('user');
                const role = options.getRole('role');
                
                const targetMember = await guild.members.fetch(user.id);
                if (!canManageRoles(member, role)) return await interaction.reply({ content: '❌ Cannot manage this role!', ephemeral: true });
                if (!canManageMember(member, targetMember)) return await interaction.reply({ content: '❌ Cannot manage this user!', ephemeral: true });
                
                await targetMember.roles.add(role);
                await interaction.reply({ content: `✅ Added <@&${role.id}> to <@${user.id}>` });
                
                await logAction(guild, 'role_add', user, member.user, `Added role ${role.name}`);
            }
            
            else if (subcommand === 'remove') {
                const user = options.getUser('user');
                const role = options.getRole('role');
                
                const targetMember = await guild.members.fetch(user.id);
                if (!canManageRoles(member, role)) return await interaction.reply({ content: '❌ Cannot manage this role!', ephemeral: true });
                if (!canManageMember(member, targetMember)) return await interaction.reply({ content: '❌ Cannot manage this user!', ephemeral: true });
                
                await targetMember.roles.remove(role);
                await interaction.reply({ content: `✅ Removed <@&${role.id}> from <@${user.id}>` });
                
                await logAction(guild, 'role_remove', user, member.user, `Removed role ${role.name}`);
            }
            
            else if (subcommand === 'info') {
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
        }

        else if (commandName === 'giverole') {
            const user = options.getUser('user');
            const role = options.getRole('role');
            
            const targetMember = await guild.members.fetch(user.id);
            if (!canManageRoles(member, role)) return await interaction.reply({ content: '❌ Cannot manage this role!', ephemeral: true });
            if (!canManageMember(member, targetMember)) return await interaction.reply({ content: '❌ Cannot manage this user!', ephemeral: true });
            
            await targetMember.roles.add(role);
            await interaction.reply({ content: `✅ Added <@&${role.id}> to <@${user.id}>` });
            
            await logAction(guild, 'giverole', user, member.user, `Gave role ${role.name}`);
        }

        else if (commandName === 'membercount') {
            const total = guild.memberCount;
            const online = guild.members.cache.filter(member => member.presence?.status !== 'offline').size;
            await interaction.reply({
                content: `👥 **Total Members:** ${total}\n🟢 **Online:** ${online}\n🔴 **Offline:** ${total - online}`
            });
        }

        else if (commandName === 'onlinecount') {
            const online = guild.members.cache.filter(member => member.presence?.status !== 'offline').size;
            await interaction.reply({
                content: `🟢 **Online Members:** ${online}`
            });
        }

        else if (commandName === 'giveaway') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === 'create') {
                const prize = options.getString('prize');
                const duration = options.getInteger('duration');
                const winners = options.getInteger('winners') || 1;
                
                const endTime = Date.now() + (duration * 60 * 1000);
                
                const embed = new EmbedBuilder()
                    .setTitle(`🎉 ${prize.toUpperCase()} 🎉`)
                    .setDescription('')
                    .addFields(
                        { name: '⏰ Ends In', value: formatTime(duration * 60), inline: true },
                        { name: '🏆 Winners', value: winners.toString(), inline: true },
                        { name: '👤 Entries', value: '0 participants', inline: true },
                        { name: '🎯 Chance', value: '0%', inline: true },
                        { name: '👑 Host', value: `<@${member.user.id}>`, inline: true }
                    )
                    .setColor('#FFD700')
                    .setFooter({ text: `Ends at` })
                    .setTimestamp(endTime);

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`join_giveaway_${Date.now()}`)
                            .setLabel('🎉 Join Giveaway')
                            .setStyle(ButtonStyle.Primary)
                    );

                const message = await channel.send({ embeds: [embed], components: [row] });

                const giveawayData = {
                    messageId: message.id,
                    channelId: channel.id,
                    guildId: guild.id,
                    prize,
                    winners,
                    endTime,
                    participants: new Set(),
                    host: member.user.id
                };

                giveaways.set(message.id, giveawayData);

                // Start the timer
                const updateInterval = setInterval(async () => {
                    const now = Date.now();
                    const timeLeft = Math.max(0, Math.floor((endTime - now) / 1000));
                    
                    if (timeLeft <= 0) {
                        clearInterval(updateInterval);
                        
                        // End giveaway
                        const finalData = giveaways.get(message.id);
                        if (!finalData) return;
                        
                        const participants = Array.from(finalData.participants);
                        let winnersList = [];
                        
                        if (participants.length >= finalData.winners) {
                            for (let i = 0; i < finalData.winners; i++) {
                                const randomIndex = Math.floor(Math.random() * participants.length);
                                winnersList.push(participants[randomIndex]);
                                participants.splice(randomIndex, 1);
                            }
                        }
                        
                        const finalEmbed = new EmbedBuilder()
                            .setTitle(`🎉 ${finalData.prize.toUpperCase()} - ENDED 🎉`)
                            .setDescription('')
                            .addFields(
                                { name: '🏆 Winners', value: winnersList.length > 0 ? winnersList.map(id => `<@${id}>`).join(', ') : 'No participants', inline: false },
                                { name: '👤 Total Entries', value: finalData.participants.size.toString(), inline: true },
                                { name: '👑 Hosted by', value: `<@${finalData.host}>`, inline: true }
                            )
                            .setColor('#00FF00')
                            .setFooter({ text: `Ended at` })
                            .setTimestamp();

                        const endedRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('giveaway_ended')
                                    .setLabel('🎉 Giveaway Ended')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true)
                            );

                        await message.edit({ embeds: [finalEmbed], components: [endedRow] });
                        
                        if (winnersList.length > 0) {
                            await channel.send(`🎉 Congratulations ${winnersList.map(id => `<@${id}>`).join(', ')}! You won **${finalData.prize}**!`);
                        }
                        
                        giveaways.delete(message.id);
                        return;
                    }

                    // Update the embed
                    const participants = giveaways.get(message.id)?.participants || new Set();
                    const entryCount = participants.size;
                    const winChance = calculateWinChance(entryCount, winners);
                    
                    const updatedEmbed = new EmbedBuilder()
                        .setTitle(`🎉 ${prize.toUpperCase()} 🎉`)
                        .setDescription('')
                        .addFields(
                            { name: '⏰ Ends In', value: formatTime(timeLeft), inline: true },
                            { name: '🏆 Winners', value: winners.toString(), inline: true },
                            { name: '👤 Entries', value: `${entryCount} participants`, inline: true },
                            { name: '🎯 Chance', value: winChance, inline: true },
                            { name: '👑 Host', value: `<@${member.user.id}>`, inline: true }
                        )
                        .setColor('#FFD700')
                        .setFooter({ text: `Ends at` })
                        .setTimestamp(endTime);

                    await message.edit({ embeds: [updatedEmbed] });
                }, 5000);

                await interaction.reply({ content: `✅ Giveaway created! Check <#${channel.id}> for details.`, ephemeral: true });
            }
        }
        
        else if (commandName === 'ticket') {
            const subcommand = interaction.options.getSubcommand();
            const ticketData = tickets.get(interaction.channel.id);

            switch (subcommand) {
              case 'create':
                // Already handled by button
                break;

              case 'close':
                if (!ticketData) {
                  return await interaction.reply({
                    content: '❌ This command can only be used in ticket channels!',
                    ephemeral: true
                  });
                }
                await closeTicket(interaction, ticketData);
                break;

              case 'add':
                if (!ticketData) {
                  return await interaction.reply({
                    content: '❌ This command can only be used in ticket channels!',
                    ephemeral: true
                  });
                }
                const addUser = interaction.options.getUser('user');
                await interaction.channel.permissionOverwrites.create(addUser.id, {
                  ViewChannel: true,
                  SendMessages: true,
                  ReadMessageHistory: true
                });
                await interaction.reply({
                  content: `✅ <@${addUser.id}> has been added to this ticket`
                });
                break;

              case 'remove':
                if (!ticketData) {
                  return await interaction.reply({
                    content: '❌ This command can only be used in ticket channels!',
                    ephemeral: true
                  });
                }
                const removeUser = interaction.options.getUser('user');
                await interaction.channel.permissionOverwrites.delete(removeUser.id);
                await interaction.reply({
                  content: `✅ <@${removeUser.id}> has been removed from this ticket`
                });
                break;

              case 'claim':
                if (!ticketData) {
                  return await interaction.reply({
                    content: '❌ This command can only be used in ticket channels!',
                    ephemeral: true
                  });
                }
                if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID) && 
                    !OWNER_IDS.includes(interaction.user.id)) {
                  return await interaction.reply({
                    content: '❌ You do not have permission to claim tickets!',
                    ephemeral: true
                  });
                }

                if (ticketData.claimedBy) {
                  return await interaction.reply({
                    content: `❌ This ticket is already claimed by <@${ticketData.claimedBy}>`,
                    ephemeral: true
                  });
                }

                ticketData.claimedBy = interaction.user.id;
                tickets.set(interaction.channel.id, ticketData);
                await interaction.reply({
                  content: `✅ Ticket claimed by <@${interaction.user.id}>`
                });
                await interaction.channel.setName(`claimed-${interaction.user.username}`);
                break;

              case 'unclaim':
                if (!ticketData) {
                  return await interaction.reply({
                    content: '❌ This command can only be used in ticket channels!',
                    ephemeral: true
                  });
                }
                if (ticketData.claimedBy !== interaction.user.id && 
                    !OWNER_IDS.includes(interaction.user.id)) {
                  return await interaction.reply({
                    content: '❌ You can only unclaim tickets you\'ve claimed!',
                    ephemeral: true
                  });
                }

                ticketData.claimedBy = null;
                tickets.set(interaction.channel.id, ticketData);
                await interaction.reply({
                  content: '✅ Ticket unclaimed'
                });
                await interaction.channel.setName(interaction.channel.name.replace(`claimed-${interaction.user.username}`, `ticket-${interaction.user.username}`));
                break;

              case 'transcript':
                if (!ticketData) {
                  return await interaction.reply({
                    content: '❌ This command can only be used in ticket channels!',
                    ephemeral: true
                  });
                }
                await sendTranscript(interaction, ticketData);
                break;
            }
        }
        
        else if (commandName === 'premium') {
            await sendPremiumAd(interaction);
        }

    } catch (error) {
        console.error('Command error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Error executing command.', ephemeral: true });
        } else {
            await interaction.editReply({ content: '❌ Error executing command.', ephemeral: true });
        }
    }
}

// Handle button interactions
else if (interaction.isButton()) {
    if (interaction.customId === 'create_ticket') {
        // Ticket creation modal
        const modal = new ModalBuilder()
          .setCustomId('ticket_modal')
          .setTitle('🎫 Create Ticket');

        const subjectInput = new TextInputBuilder()
          .setCustomId('ticket_subject')
          .setLabel('Subject')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Briefly describe your issue')
          .setRequired(true)
          .setMaxLength(100);

        const descriptionInput = new TextInputBuilder()
          .setCustomId('ticket_description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Provide detailed information about your issue')
          .setRequired(true)
          .setMaxLength(1800);

        modal.addComponents(
          new ActionRowBuilder().addComponents(subjectInput),
          new ActionRowBuilder().addComponents(descriptionInput)
        );

        await interaction.showModal(modal);
    }
    
    if (interaction.customId.startsWith('join_giveaway')) {
        const giveawayData = giveaways.get(interaction.message.id);
        if (!giveawayData) {
            return await interaction.reply({ content: '❌ This giveaway has ended or doesn\'t exist.', ephemeral: true });
        }

        if (giveawayData.participants.has(interaction.user.id)) {
            return await interaction.reply({ content: '❌ You are already entered in this giveaway!', ephemeral: true });
        }

        giveawayData.participants.add(interaction.user.id);
        giveaways.set(interaction.message.id, giveawayData);

        await interaction.reply({ content: '🎉 You have successfully joined the giveaway!', ephemeral: true });
    }
    
    if (interaction.customId === 'purchase_premium') {
        try {
            const category = interaction.guild.channels.cache.get(PREMIUM_CATEGORY_ID);
            if (!category) {
                return await interaction.reply({
                    content: '❌ Purchase category not found. Please contact an administrator.',
                    ephemeral: true
                });
            }

            // Create purchase ticket channel
            const ticketChannel = await interaction.guild.channels.create({
                name: `lifetime-purchase-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: category.id,
                topic: `Lifetime purchase request from ${interaction.user.tag}`,
                permissionOverwrites: [
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
                    ...OWNER_IDS.map(id => ({
                        id: id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    })),
                    {
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageChannels
                        ]
                    }
                ]
            });

            // Create ticket control panel
            const panelEmbed = new EmbedBuilder()
                .setTitle('🛒 Purchase Ticket')
                .setDescription('This is your private purchase ticket. Our team will assist you shortly.')
                .setColor('#0099ff');

            const panelRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_purchase_ticket')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                );

            await ticketChannel.send({
                content: `<@${interaction.user.id}> ${OWNER_IDS.map(id => `<@${id}>`).join(' ')}`,
                embeds: [panelEmbed],
                components: [panelRow]
            });

            // Send purchase information
            const purchaseEmbed = new EmbedBuilder()
                .setTitle('💎 Epsillon Hub Premium Purchase')
                .setDescription(`Thank you for your interest in Epsillon Hub Premium!\n\n**Price:** $${PREMIUM_PRICE} (Lifetime Access)\n\n**Supported Payment Methods:**\n• CashApp\n• Cryptocurrency\n• Gift Cards\n\nOur team will contact you shortly to process your purchase.`)
                .setColor('#FFD700')
                .setTimestamp();

            await ticketChannel.send({ embeds: [purchaseEmbed] });

            // Store ticket data
            tickets.set(ticketChannel.id, {
                userId: interaction.user.id,
                channelId: ticketChannel.id,
                status: 'open',
                timestamp: Date.now(),
                claimedBy: null
            });

            // Initialize transcript
            ticketTranscripts.set(ticketChannel.id, []);

            await interaction.reply({
                content: `✅ Purchase ticket created! <#${ticketChannel.id}>`,
                ephemeral: true
            });

            // Log ticket creation
            const logChannel = interaction.guild.channels.cache.get(TICKET_LOGS_CHANNEL_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🛒 Premium Purchase Ticket Created')
                    .addFields(
                        { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Channel', value: `<#${ticketChannel.id}>`, inline: true },
                        { name: 'Price', value: `$${PREMIUM_PRICE} Lifetime`, inline: true }
                    )
                    .setColor('#FFD700')
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (error) {
            console.error('Purchase ticket creation error:', error);
            await interaction.reply({
                content: '❌ Failed to create purchase ticket. Please try again.',
                ephemeral: true
            });
        }
    }
    
    if (interaction.customId === 'close_purchase_ticket') {
        const ticketData = tickets.get(interaction.channel.id);
        if (!ticketData) {
            return await interaction.reply({
                content: '❌ This is not a valid ticket channel!',
                ephemeral: true
            });
        }

        await closeTicket(interaction, ticketData);
    }
    
    const ticketData = tickets.get(interaction.channel.id);
    if (ticketData) {
        if (interaction.customId === 'ticket_claim') {
            if (!interaction.member.roles.cache.has(SUPPORT_ROLE_ID) && 
                !OWNER_IDS.includes(interaction.user.id)) {
                return await interaction.reply({
                    content: '❌ You do not have permission to claim tickets!',
                    ephemeral: true
                });
            }

            if (ticketData.claimedBy) {
                return await interaction.reply({
                    content: `❌ This ticket is already claimed by <@${ticketData.claimedBy}>`,
                    ephemeral: true
                });
            }

            ticketData.claimedBy = interaction.user.id;
            tickets.set(interaction.channel.id, ticketData);

            await interaction.reply({
                content: `✅ Ticket claimed by <@${interaction.user.id}>`
            });

            // Update channel name
            await interaction.channel.setName(`claimed-${interaction.user.username}`);
        }

        if (interaction.customId === 'ticket_close') {
            await closeTicket(interaction, ticketData);
        }

        if (interaction.customId === 'ticket_transcript') {
            await sendTranscript(interaction, ticketData);
        }
    }
}

if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
    await interaction.deferReply({ ephemeral: true });
    
    const subject = interaction.fields.getTextInputValue('ticket_subject');
    const description = interaction.fields.getTextInputValue('ticket_description');
    
    try {
      const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);
      if (!category) {
        return await interaction.editReply({
          content: '❌ Ticket category not found. Please contact an administrator.'
        });
      }

      // Create ticket channel
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `Ticket for ${interaction.user.tag} | Subject: ${subject}`,
        permissionOverwrites: [
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
        ]
      });

      // Create ticket control panel
      const panelEmbed = new EmbedBuilder()
        .setTitle('🎫 Ticket Controls')
        .setDescription('Use the buttons below to manage this ticket')
        .setColor('#0099ff');

      const panelRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_claim')
            .setLabel('Claim')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒'),
          new ButtonBuilder()
            .setCustomId('ticket_transcript')
            .setLabel('Transcript')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📝')
        );

      await ticketChannel.send({
        content: `<@${interaction.user.id}> <@&${SUPPORT_ROLE_ID}>`,
        embeds: [panelEmbed],
        components: [panelRow]
      });

      // Send initial ticket message
      const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 Ticket: ${subject}`)
        .setDescription(description)
        .addFields(
          { name: 'Created By', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Ticket ID', value: ticketChannel.id, inline: true },
          { name: 'Status', value: 'Open', inline: true }
        )
        .setColor('#00ff00')
        .setTimestamp();

      await ticketChannel.send({ embeds: [ticketEmbed] });

      // Store ticket data
      tickets.set(ticketChannel.id, {
        userId: interaction.user.id,
        channelId: ticketChannel.id,
        status: 'open',
        timestamp: Date.now(),
        claimedBy: null
      });

      // Initialize transcript
      ticketTranscripts.set(ticketChannel.id, []);

      await interaction.editReply({
        content: `✅ Ticket created! <#${ticketChannel.id}>`
      });

      // Log ticket creation
      const logChannel = interaction.guild.channels.cache.get(TICKET_LOGS_CHANNEL_ID);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('🎫 Ticket Created')
          .addFields(
            { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Channel', value: `<#${ticketChannel.id}>`, inline: true },
            { name: 'Subject', value: subject, inline: false },
            { name: 'Description', value: description.substring(0, 1024), inline: false }
          )
          .setColor('#00ff00')
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (error) {
      console.error('Ticket creation error:', error);
      await interaction.editReply({
        content: '❌ Failed to create ticket. Please try again.'
      });
    }
  }
});

// AutoMod: Detect Discord ToS violations
client.on(Events.MessageCreate, async message => {
if (message.author.bot) return;
if (message.content.length < 2) return;
if (hasPermission(message.member)) return;

// Store message for transcript
  if (tickets.has(message.channel.id)) {
    const transcript = ticketTranscripts.get(message.channel.id) || [];
    transcript.push({
      author: message.author.tag,
      content: message.content,
      timestamp: message.createdTimestamp
    });
    ticketTranscripts.set(message.channel.id, transcript);
  }

const result = detectToSContent(message.content);
if (result.detected) {
    try {
        const deletedContent = message.content;
        await message.delete();
        await message.author.send(`❌ Your message was removed for violating Discord's Terms of Service.\n**Content:** ${deletedContent.substring(0, 1000)}`);
        
        // Add strike
        const strikes = userStrikes.get(message.author.id) || 0;
        userStrikes.set(message.author.id, strikes + 1);

        // Auto-mute after 3 strikes
        if (strikes + 1 >= 3) {
            try {
                const targetMember = await message.guild.members.fetch(message.author.id);
                if (targetMember && targetMember.moderatable) {
                    await targetMember.timeout(30 * 60 * 1000, '3 strikes - auto mute');
                    await message.channel.send(`🔇 <@${message.author.id}> has been auto-muted for 30 minutes.`);
                    await logAction(message.guild, 'mute', message.author, client.user, 'Auto-mute after 3 strikes', 30 * 60, `Deleted content: ${deletedContent.substring(0, 500)}`);
                }
            } catch (error) {
                console.error('Failed to auto-mute:', error);
            }
            userStrikes.set(message.author.id, 0);
        } else {
            await message.channel.send(`⚠️ <@${message.author.id}> your message was removed. Strikes: ${strikes + 1}/3`);
        }
        
        await logAction(message.guild, 'automod', message.author, client.user, 'ToS violation detected', null, `Deleted content: ${deletedContent.substring(0, 500)}`);
    } catch (error) {
        console.error('AutoMod error:', error);
    }
}
});

// Welcome message
client.on(Events.GuildMemberAdd, async member => {
const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
if (welcomeChannel) {
const embed = new EmbedBuilder()
.setTitle('👋 Welcome!')
.setDescription(`Welcome to the server, <@${member.user.id}>!`)
.setColor('#00FF00')
.setTimestamp();
await welcomeChannel.send({ embeds: [embed] });
}

const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
if (logChannel) {
    const embed = new EmbedBuilder()
        .setTitle('📥 Member Joined')
        .setDescription(`${member.user.tag} (${member.user.id})`)
        .addFields(
            { name: 'Account Created', value: member.user.createdAt.toDateString(), inline: true }
        )
        .setColor('#00FF00')
        .setTimestamp();
    await logChannel.send({ embeds: [embed] });
}
});

// Goodbye message
client.on(Events.GuildMemberRemove, async member => {
const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
if (logChannel) {
const embed = new EmbedBuilder()
.setTitle('📤 Member Left')
.setDescription(`${member.user.tag} (${member.user.id})`)
.setColor('#FF0000')
.setTimestamp();
await logChannel.send({ embeds: [embed] });
}
});

// Message logging
client.on(Events.MessageDelete, async message => {
if (message.author?.bot) return;

const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
if (logChannel && message.content) {
    const embed = new EmbedBuilder()
        .setTitle('🗑️ Message Deleted')
        .setDescription(`**Channel:** <#${message.channel.id}>\n**Author:** ${message.author.tag} (${message.author.id})\n**Content:** ${message.content.substring(0, 1000)}`)
        .setColor('#FFA500')
        .setTimestamp();
    await logChannel.send({ embeds: [embed] });
}
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
if (newMessage.author?.bot) return;
if (oldMessage.content === newMessage.content) return;

const logChannel = newMessage.guild.channels.cache.get(LOG_CHANNEL_ID);
if (logChannel) {
    const embed = new EmbedBuilder()
        .setTitle('✏️ Message Edited')
        .setDescription(`**Channel:** <#${newMessage.channel.id}>\n**Author:** ${newMessage.author.tag} (${newMessage.author.id})\n**Before:** ${oldMessage.content.substring(0, 500)}\n**After:** ${newMessage.content.substring(0, 500)}`)
        .setColor('#0000FF')
        .setTimestamp();
    await logChannel.send({ embeds: [embed] });
}
});

// Login
client.login(process.env.DISCORD_TOKEN);
