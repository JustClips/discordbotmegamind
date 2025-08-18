require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } = require('discord.js');

// Configuration
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || 'YOUR_MOD_ROLE_ID';
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',').map(id => id.trim()) : [];
const LOG_CHANNEL_ID = '1404675690007105596'; // Your log channel ID

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
const warnings = new Map(); // userId -> [warnings]
const userStrikes = new Map(); // userId -> strikeCount
const giveaways = new Map(); // messageId -> giveawayData
const activeGiveaways = new Collection(); // For timer management

// Auto-moderation settings
const BANNED_PATTERNS = [
    // Explicit content
    /(?:n[i1!|]gg[ae3r]?)|(?:f[a4@]gg[o0]t?)|(?:ch[i1!|]nk?)|(?:k[i1!|]ke?)|(?:r[e3]t[a4@]rd?)|(?:c[o0]ck)|(?:p[e3]n[i1!|]s)|(?:v[a4@]g[i1!|]n[a4@])|(?:wh[o0]r[e3])|(?:sl[uo0]t)|(?:b[i1!|]tch)|(?:c[uo0]nt)|(?:sh[i1!|]t)|(?:f[uo0]ck)|(?:d[i1!|]ck)|(?:p[o0]rn)|(?:s[e3]x)|(?:n[a4@]ked)|(?:b[o0][o0]bs?)|(?:t[i1!|]ts?)|(?:p[uo0]ssy)|(?:cum)|(?:j[i1!|]zz)|(?:orgy)|(?:g[a4@]ngb[a4@]ng)|(?:p[e3]d[o0])|(?:b[e3][a4@]st[i1!|]al[i1!|]ty)|(?:z[o0][o0]ph[i1!|]l[i1!|]a)|(?:l[o0][o0]t[a4@])|(?:r[a4@]p[e3])|(?:m[o0]l[e3]st[e3])|(?:p[e3]d[e3][s5])|(?:s[a4@]d[i1!|]sm)|(?:m[a4@]st[e3]rb[a4@]t[e3])|(?:b[e3][a4@]n[a4@]n[a4@])|(?:w[a4@]nker)|(?:w[a4@]nk[e3]r)|(?:b[o0][o0]ger)|(?:t[uo0]rd)|(?:sc[uo0]t)|(?:tw[a4@]t)|(?:n[a4@]z[i1!|])|(?:sp[i1!|]c)|(?:g[o0][o0]k)|(?:g[e3]rm[a4@]n)|(?:j[e3]w)|(?:h[o0][o0]k[e3]r)|(?:r[a4@]c[i1!|]st)|(?:n[a4@]z[i1!|])|(?:f[a4@]sc[i1!|]st)|(?:tr[a4@]nn[yi])|(?:dyk[e3])|(?:tr[a4@]ny)|(?:s[h]{2}[i1!|]t[e3])|(?:f[uo0][ck]{2})|(?:b[i1!|]tch[e3]s)|(?:c[o0]cks[uo0]ck[e3]r)|(?:m[o0]th[e3]rf[uo0]ck[e3]r)|(?:f[a4@]gg[o0]t[s5])|(?:n[i1!|]gg[e3]r[s5])|(?:r[e3]t[a4@]rd[e3]d)|(?:c[o0]cks[uo0]ck[i1!|]ng)|(?:m[o0]th[e3]rf[uo0]ck[i1!|]ng)|(?:f[uo0]ck[i1!|]ng)|(?:sh[i1!|]tt[i1!|]ng)|(?:b[i1!|]tch[i1!|]ng)|(?:c[uo0]nt[i1!|]ng)|(?:n[i1!|]gg[e3]r[i1!|]ng)|(?:f[a4@]gg[o0]t[i1!|]ng)|(?:r[e3]t[a4@]rd[i1!|]ng)/gi,
    
    // Links to malicious sites
    /(?:discord\.gg\/[a-zA-Z0-9]+)|(?:bit\.ly\/[a-zA-Z0-9]+)|(?:tinyurl\.com\/[a-zA-Z0-9]+)/gi,
    
    // Self-harm content
    /(?:suicid[e3])|(?:kil+ing myself)|(?:end my lif[e3])|(?:want to di[e3])|(?:no on[e3] car[e3]s)|(?:no purpos[e3])|(?:worthl[e3]ss)/gi,
    
    // Discrimination
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

async function logAction(guild, action, user, moderator, reason, duration = null) {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('Moderation Log')
        .setColor(action === 'warn' || action === 'strike' ? 'Yellow' : 
                  action === 'mute' ? 'Orange' : 
                  action === 'kick' ? 'Red' : 'Blue')
        .addFields(
            { name: 'Action', value: action.charAt(0).toUpperCase() + action.slice(1), inline: true },
            { name: 'User', value: `<@${user.id}> (${user.tag})`, inline: true },
            { name: 'Moderator', value: `<@${moderator.id}> (${moderator.tag})`, inline: true },
            { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

    if (duration) {
        embed.addFields({ name: 'Duration', value: formatTime(duration), inline: true });
    }

    await logChannel.send({ embeds: [embed] });
}

// AutoMod detection
function detectToSContent(content) {
    const lowerContent = content.toLowerCase();
    
    for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(lowerContent)) {
            return true;
        }
    }
    
    // Check for bypass attempts (character substitution)
    const substitutions = {
        'a': ['4', '@'],
        'e': ['3'],
        'i': ['1', '!'],
        'o': ['0'],
        's': ['5', '$'],
        't': ['7'],
        'u': ['v']
    };
    
    // Simple bypass detection
    for (const pattern of BANNED_PATTERNS) {
        let testContent = lowerContent;
        for (const [original, subs] of Object.entries(substitutions)) {
            for (const sub of subs) {
                testContent = testContent.replace(new RegExp(sub, 'g'), original);
            }
        }
        if (pattern.test(testContent)) {
            return true;
        }
    }
    
    return false;
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
                .addIntegerOption(option => option.setName('winners').setDescription('Number of winners (default: 1)').setRequired(false).setMinValue(1).setMaxValue(100))
                .addStringOption(option => option.setName('description').setDescription('Giveaway description').setRequired(false)))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }

    // Resume active giveaways
    console.log('Checking for active giveaways...');
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, channel, guild } = interaction;

    const modCommands = [
        'mute', 'unmute', 'warn', 'warnings', 'clearwarns',
        'purge', 'purgebots', 'purgehumans', 'purgeall',
        'lock', 'unlock', 'slowmode', 'role'
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
            
            const targetMember = await guild.members.fetch(user.id);
            if (!targetMember.moderatable) return await interaction.reply({ content: '❌ Cannot mute this user!', ephemeral: true });
            if (OWNER_IDS.includes(targetMember.id)) return await interaction.reply({ content: '❌ Cannot mute bot owner!', ephemeral: true });

            await targetMember.timeout(duration * 60 * 1000, reason);
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
                const description = options.getString('description') || 'React with 🎉 to participate!';
                
                const endTime = Date.now() + (duration * 60 * 1000);
                
                const embed = new EmbedBuilder()
                    .setTitle('🎉 GIVEAWAY 🎉')
                    .setDescription(`**${prize}**\n\n${description}`)
                    .addFields(
                        { name: '⏰ Time Remaining', value: formatTime(duration * 60), inline: true },
                        { name: '🏆 Winners', value: winners.toString(), inline: true },
                        { name: '👤 Entries', value: '0 (0%)', inline: true }
                    )
                    .setColor('Gold')
                    .setFooter({ text: `Ends at` })
                    .setTimestamp(endTime);

                const message = await channel.send({ embeds: [embed] });
                await message.react('🎉');

                const giveawayData = {
                    messageId: message.id,
                    channelId: channel.id,
                    guildId: guild.id,
                    prize,
                    description,
                    winners,
                    endTime,
                    participants: new Set(),
                    host: member.user.id
                };

                giveaways.set(message.id, giveawayData);
                activeGiveaways.set(message.id, giveawayData);

                // Start the timer
                const updateInterval = setInterval(async () => {
                    const now = Date.now();
                    const timeLeft = Math.max(0, Math.floor((endTime - now) / 1000));
                    
                    if (timeLeft <= 0) {
                        clearInterval(updateInterval);
                        activeGiveaways.delete(message.id);
                        
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
                            .setTitle('🎉 GIVEAWAY ENDED 🎉')
                            .setDescription(`**${finalData.prize}**\n\n${finalData.description}`)
                            .addFields(
                                { name: '🏆 Winner(s)', value: winnersList.length > 0 ? winnersList.map(id => `<@${id}>`).join(', ') : 'No participants', inline: false },
                                { name: '👤 Total Entries', value: finalData.participants.size.toString(), inline: true },
                                { name: '🏆 Winners', value: finalData.winners.toString(), inline: true }
                            )
                            .setColor('Green')
                            .setFooter({ text: `Ended at` })
                            .setTimestamp();

                        await message.edit({ embeds: [finalEmbed] });
                        
                        if (winnersList.length > 0) {
                            await channel.send(`🎉 Congratulations ${winnersList.map(id => `<@${id}>`).join(', ')}! You won **${finalData.prize}**!`);
                        }
                        
                        giveaways.delete(message.id);
                        return;
                    }

                    // Update the embed
                    const participants = giveaways.get(message.id)?.participants || new Set();
                    const totalMembers = guild.memberCount;
                    const entryCount = participants.size;
                    const percentage = totalMembers > 0 ? Math.round((entryCount / totalMembers) * 100) : 0;
                    
                    const updatedEmbed = new EmbedBuilder()
                        .setTitle('🎉 GIVEAWAY 🎉')
                        .setDescription(`**${prize}**\n\n${description}`)
                        .addFields(
                            { name: '⏰ Time Remaining', value: formatTime(timeLeft), inline: true },
                            { name: '🏆 Winners', value: winners.toString(), inline: true },
                            { name: '👤 Entries', value: `${entryCount} (${percentage}%)`, inline: true }
                        )
                        .setColor('Gold')
                        .setFooter({ text: `Ends at` })
                        .setTimestamp(endTime);

                    await message.edit({ embeds: [updatedEmbed] });
                }, 5000); // Update every 5 seconds

                await interaction.reply({ content: `✅ Giveaway created! Check <#${channel.id}> for details.`, ephemeral: true });
            }
        }

    } catch (error) {
        console.error('Command error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Error executing command.', ephemeral: true });
        } else {
            await interaction.editReply({ content: '❌ Error executing command.', ephemeral: true });
        }
    }
});

// Handle giveaway reactions
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name !== '🎉') return;

    const giveawayData = giveaways.get(reaction.message.id);
    if (!giveawayData) return;

    giveawayData.participants.add(user.id);
    giveaways.set(reaction.message.id, giveawayData);
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name !== '🎉') return;

    const giveawayData = giveaways.get(reaction.message.id);
    if (!giveawayData) return;

    giveawayData.participants.delete(user.id);
    giveaways.set(reaction.message.id, giveawayData);
});

// AutoMod: Detect Discord ToS violations
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (message.content.length < 2) return;
    if (hasPermission(message.member)) return; // Don't moderate mods/owners

    const detected = detectToSContent(message.content);
    if (detected) {
        try {
            await message.delete();
            await message.author.send(`❌ Your message was removed for violating Discord's Terms of Service. Please review the rules.`);
            
            // Add strike
            const strikes = userStrikes.get(message.author.id) || 0;
            userStrikes.set(message.author.id, strikes + 1);

            // Auto-mute after 3 strikes
            if (strikes + 1 >= 3) {
                try {
                    const targetMember = await message.guild.members.fetch(message.author.id);
                    if (targetMember && targetMember.moderatable) {
                        await targetMember.timeout(30 * 60 * 1000, '3 strikes - auto mute');
                        await message.channel.send(`🔇 <@${message.author.id}> has been auto-muted for 30 minutes due to repeated violations.`);
                        await logAction(message.guild, 'mute', message.author, client.user, 'Auto-mute after 3 strikes', 30 * 60);
                    }
                } catch (error) {
                    console.error('Failed to auto-mute:', error);
                }
                userStrikes.set(message.author.id, 0); // Reset strikes
            } else {
                await message.channel.send(`⚠️ <@${message.author.id}> your message was removed. Strikes: ${strikes + 1}/3`);
            }
            
            await logAction(message.guild, 'automod', message.author, client.user, 'ToS violation detected');
        } catch (error) {
            console.error('AutoMod error:', error);
        }
    }
});

// Member join/leave logging
client.on(Events.GuildMemberAdd, async member => {
    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
        const embed = new EmbedBuilder()
            .setTitle('Member Joined')
            .setDescription(`<@${member.user.id}> (${member.user.tag})`)
            .addFields(
                { name: 'Account Created', value: member.user.createdAt.toDateString(), inline: true }
            )
            .setColor('Green')
            .setTimestamp();
        await logChannel.send({ embeds: [embed] });
    }

    const welcomeChannel = member.guild.systemChannel;
    if (welcomeChannel) {
        await welcomeChannel.send({
            content: `Welcome to the server, <@${member.user.id}>! 🎉`
        });
    }
});

client.on(Events.GuildMemberRemove, async member => {
    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
        const embed = new EmbedBuilder()
            .setTitle('Member Left')
            .setDescription(`<@${member.user.id}> (${member.user.tag})`)
            .setColor('Red')
            .setTimestamp();
        await logChannel.send({ embeds: [embed] });
    }

    const goodbyeChannel = member.guild.systemChannel;
    if (goodbyeChannel) {
        await goodbyeChannel.send({
            content: `Goodbye, ${member.user.username}! 👋`
        });
    }
});

// Message logging
client.on(Events.MessageDelete, async message => {
    if (message.author?.bot) return;
    
    const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel && message.content) {
        const embed = new EmbedBuilder()
            .setTitle('Message Deleted')
            .setDescription(`**Channel:** <#${message.channel.id}>\n**Author:** <@${message.author.id}> (${message.author.tag})\n**Content:** ${message.content}`)
            .setColor('Orange')
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
            .setTitle('Message Edited')
            .setDescription(`**Channel:** <#${newMessage.channel.id}>\n**Author:** <@${newMessage.author.id}> (${newMessage.author.tag})\n**Before:** ${oldMessage.content}\n**After:** ${newMessage.content}`)
            .setColor('Blue')
            .setTimestamp();
        await logChannel.send({ embeds: [embed] });
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
