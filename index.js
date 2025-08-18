require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Configuration
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || 'YOUR_MOD_ROLE_ID'; // Set in .env
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',').map(id => id.trim()) : []; // Multiple IDs comma-separated
const STARBOARD_CHANNEL_ID = process.env.STARBOARD_CHANNEL_ID || 'YOUR_STARBOARD_CHANNEL_ID';
const GIVEAWAY_CHANNEL_ID = process.env.GIVEAWAY_CHANNEL_ID || 'YOUR_GIVEAWAY_CHANNEL_ID'; // Optional: where giveaways are posted

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
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
    ]
});

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

// Data stores (use database in production)
const userBalances = new Map(); // For future use
const warnings = new Map();
const voteKicks = new Map();
const temporaryLocks = new Map();
const starboardMessages = new Map();

// Auto-moderation settings
const BANNED_WORDS = [
    'nigga', 'nigger', 'fag', 'slut', 'bitch', 'cunt', 'fuck', 'shit', 'asshole',
    'dick', 'pussy', 'cock', 'tits', 'boobs', 'porn', 'naked', 'sex', 'xxx'
];

// Word variations (e.g., leet speak, letter substitutions)
const SUBSTITUTIONS = {
    'a': ['4', '@'],
    'e': ['3', '€'],
    'i': ['1', '!'],
    'o': ['0'],
    's': ['5', '$'],
    't': ['7'],
    'u': ['v']
};

// Detect word variants using substitutions
function detectBannedWord(text) {
    const lowerText = text.toLowerCase();
    for (const word of BANNED_WORDS) {
        const normalizedWord = normalizeWord(word);
        if (lowerText.includes(normalizedWord)) return word;
        // Try variations
        for (let i = 0; i < lowerText.length; i++) {
            const sub = getSubstitution(lowerText[i]);
            if (sub && lowerText.slice(i, i + word.length).includes(sub)) {
                return word;
            }
        }
    }
    return null;
}

function normalizeWord(word) {
    return word.replace(/[^a-z]/g, '').toLowerCase();
}

function getSubstitution(char) {
    const subs = SUBSTITUTIONS[char];
    if (!subs) return null;
    return subs[Math.floor(Math.random() * subs.length)];
}

// Command definitions (only moderation & essential ones)
const commands = [
    // Moderation Commands
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
        .setName('giveaway')
        .setDescription('Create a giveaway')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Start a giveaway')
                .addStringOption(option => option.setName('prize').setDescription('Prize description').setRequired(true))
                .addIntegerOption(option => option.setName('duration').setDescription('Duration in seconds').setRequired(true))
                .addStringOption(option => option.setName('description').setDescription('Giveaway description').setRequired(false))),
].map(command => command.toJSON());

// Register commands globally
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
});

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, channel, guild } = interaction;

    // Check permissions for mod commands
    const modCommands = [
        'mute', 'unmute', 'warn', 'warnings', 'clearwarns',
        'purge', 'purgebots', 'purgehumans', 'purgeall',
        'lock', 'unlock', 'slowmode', 'role', 'membercount', 'giveaway'
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

            await interaction.reply({
                content: `⚠️ <@${user.id}> has been warned.\n**Reason:** ${reason}`
            });
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
            await interaction.reply({
                content: `✅ Cleared all warnings for <@${user.id}>`
            });
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
        }

        else if (commandName === 'purgebots') {
            await interaction.deferReply({ ephemeral: true });
            const messages = await channel.messages.fetch({ limit: 100 });
            const botMessages = messages.filter(m => m.author.bot);
            if (botMessages.size === 0) return await interaction.editReply({ content: 'No bot messages found.' });
            await channel.bulkDelete(botMessages, true);
            await interaction.editReply({ content: `✅ Deleted ${botMessages.size} bot messages.` });
        }

        else if (commandName === 'purgehumans') {
            await interaction.deferReply({ ephemeral: true });
            const messages = await channel.messages.fetch({ limit: 100 });
            const humanMessages = messages.filter(m => !m.author.bot);
            if (humanMessages.size === 0) return await interaction.editReply({ content: 'No human messages found.' });
            await channel.bulkDelete(humanMessages, true);
            await interaction.editReply({ content: `✅ Deleted ${humanMessages.size} human messages.` });
        }

        else if (commandName === 'purgeall') {
            await interaction.deferReply({ ephemeral: true });
            const messages = await channel.messages.fetch({ limit: 100 });
            if (messages.size === 0) return await interaction.editReply({ content: 'No messages found.' });
            await channel.bulkDelete(messages, true);
            await interaction.editReply({ content: `✅ Deleted ${messages.size} messages.` });
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
        }

        else if (commandName === 'unlock') {
            await channel.permissionOverwrites.create(guild.roles.everyone, { SendMessages: null });
            for (const ownerId of OWNER_IDS) {
                const overwrite = channel.permissionOverwrites.cache.get(ownerId);
                if (overwrite) await overwrite.delete();
            }
            await interaction.reply({ content: `🔓 <#${channel.id}> has been unlocked by <@${member.user.id}>` });
        }

        else if (commandName === 'slowmode') {
            const seconds = options.getInteger('seconds');
            await channel.setRateLimitPerUser(seconds);
            await interaction.reply({
                content: seconds === 0 
                    ? `⏱️ Slowmode disabled in <#${channel.id}>`
                    : `⏱️ Slowmode set to ${seconds} seconds in <#${channel.id}>`
            });
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
            }
            
            else if (subcommand === 'remove') {
                const user = options.getUser('user');
                const role = options.getRole('role');
                
                const targetMember = await guild.members.fetch(user.id);
                if (!canManageRoles(member, role)) return await interaction.reply({ content: '❌ Cannot manage this role!', ephemeral: true });
                if (!canManageMember(member, targetMember)) return await interaction.reply({ content: '❌ Cannot manage this user!', ephemeral: true });
                
                await targetMember.roles.remove(role);
                await interaction.reply({ content: `✅ Removed <@&${role.id}> from <@${user.id}>` });
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
            const online = guild.presences.size;
            const offline = total - online;
            await interaction.reply({
                content: `👥 **Total Members:** ${total}\n🟢 **Online:** ${online}\n🔴 **Offline:** ${offline}`
            });
        }

        else if (commandName === 'giveaway') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === 'create') {
                const prize = options.getString('prize');
                const duration = options.getInteger('duration');
                const description = options.getString('description') || 'A random giveaway!';
                
                const embed = new EmbedBuilder()
                    .setTitle('🎉 Giveaway!')
                    .setDescription(description)
                    .addFields(
                        { name: '🎁 Prize', value: prize },
                        { name: '⏰ Duration', value: `${duration} seconds` },
                        { name: '🎯 How to enter', value: 'React with 🎉 to enter!' }
                    )
                    .setFooter({ text: `Created by ${member.user.username}` })
                    .setTimestamp();
                
                const message = await channel.send({ embeds: [embed] });
                await message.react('🎉');
                
                // Simple reaction collector (no real timer logic here)
                await interaction.reply({ content: `✅ Giveaway created! Check <#${channel.id}> for details.` });
            }
        }

    } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Error executing command.', ephemeral: true });
        } else {
            await interaction.editReply({ content: '❌ Error executing command.', ephemeral: true });
        }
    }
});

// Handle ! commands (prefix commands)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'help') {
        const embed = new EmbedBuilder()
            .setTitle('Bot Commands')
            .setDescription('Use `/` or `!` prefix')
            .addFields(
                { name: '🛡️ Moderation', value: '`/mute`, `/unmute`, `/warn`, `/warnings`, `/clearwarns`, `/purge`, `/purgebots`, `/purgehumans`, `/purgeall`, `/lock`, `/unlock`, `/slowmode`, `/role`', inline: false },
                { name: '📊 Info', value: '`/membercount`', inline: false },
                { name: '🎁 Giveaways', value: '`/giveaway create`', inline: false }
            )
            .setColor('Purple');
        return await message.channel.send({ embeds: [embed] });
    }

    // Only allow owners/mods to use commands
    if (!hasPermission(message.member)) {
        return await message.reply('❌ You do not have permission to use this command!');
    }

    // Example: !purge 10
    if (command === 'purge') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 500) {
            return await message.reply('❌ Please provide a valid number between 1 and 500.');
        }
        
        try {
            const messages = await message.channel.messages.fetch({ limit: amount });
            await message.channel.bulkDelete(messages);
            await message.channel.send(`✅ Deleted ${messages.size} messages.`);
        } catch (err) {
            await message.reply('❌ Failed to delete messages.');
        }
    }
});

// Automod: Detect banned words with bypasses
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (message.content.length < 2) return;

    const detected = detectBannedWord(message.content);
    if (detected) {
        const reason = `Used banned word: ${detected}`;
        await message.delete();
        await message.author.send(`❌ Your message was removed for violating Discord's ToS. Reason: ${reason}`);
        await message.channel.send(`⚠️ Message removed for inappropriate content.`);

        // Optionally warn or mute
        if (!warnings.has(message.author.id)) warnings.set(message.author.id, []);
        warnings.get(message.author.id).push({
            reason: 'Automod: Inappropriate content',
            timestamp: new Date()
        });
    }
});

// Welcome message
client.on(Events.GuildMemberAdd, async member => {
    const welcomeChannel = member.guild.systemChannel;
    if (welcomeChannel) {
        await welcomeChannel.send({
            content: `Welcome to the server, <@${member.user.id}>! 🎉`
        });
    }
});

// Goodbye message
client.on(Events.GuildMemberRemove, async member => {
    const goodbyeChannel = member.guild.systemChannel;
    if (goodbyeChannel) {
        await goodbyeChannel.send({
            content: `Goodbye, ${member.user.username}! 👋`
        });
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
