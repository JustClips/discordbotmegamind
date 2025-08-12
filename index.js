require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Configuration
const MOD_ROLE_ID = '1398413061169352949';
const OWNER_IDS = ['YOUR_DISCORD_USER_ID']; // Add your Discord user ID here

// Create a new client instance
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
const userBalances = new Map(); // userId -> balance
const userCooldowns = new Map(); // userId -> timestamp
const warnings = new Map(); // userId -> [warnings]
const voteKicks = new Map(); // channelId -> voteKickData
const voteKickCooldowns = new Map(); // userId -> timestamp
const temporaryLocks = new Map(); // channelId -> lockData
const starboardMessages = new Map(); // messageId -> starCount
const starboardChannelId = 'YOUR_STARBOARD_CHANNEL_ID'; // Set this to your starboard channel ID

// Command definitions
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
        .addIntegerOption(option => option.setName('amount').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .addUserOption(option => option.setName('user').setDescription('Only delete messages from this user').setRequired(false)),

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

    // Role Management
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

    // Utility Commands
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Get information about a user')
        .addUserOption(option => option.setName('user').setDescription('User to get info for').setRequired(false)),

    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Get information about the server'),

    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get a user\'s avatar')
        .addUserOption(option => option.setName('user').setDescription('User to get avatar for').setRequired(false)),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information'),

    // Fun Commands
    new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8-ball a question')
        .addStringOption(option => option.setName('question').setDescription('Your question').setRequired(true)),

    new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin'),

    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll a dice')
        .addIntegerOption(option => option.setName('sides').setDescription('Number of sides (default: 6)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock Paper Scissors')
        .addStringOption(option => 
            option.setName('choice')
                .setDescription('Your choice')
                .setRequired(true)
                .addChoices(
                    { name: 'Rock', value: 'rock' },
                    { name: 'Paper', value: 'paper' },
                    { name: 'Scissors', value: 'scissors' }
                )),

    // Economy Commands
    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your coin balance'),

    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the coin leaderboard'),

    new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward'),

    new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Gamble your coins')
        .addIntegerOption(option => option.setName('amount').setDescription('Amount to gamble').setRequired(true).setMinValue(10).setMaxValue(1000)),

    // Voting Commands
    new SlashCommandBuilder()
        .setName('votekick')
        .setDescription('Start a vote to kick a user')
        .addUserOption(option => option.setName('user').setDescription('User to vote kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for votekick').setRequired(false)),

    // Starboard Commands
    new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('Starboard settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Set the starboard channel')
                .addChannelOption(option => option.setName('channel').setDescription('Channel to use as starboard').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('threshold')
                .setDescription('Set star threshold')
                .addIntegerOption(option => option.setName('count').setDescription('Number of stars needed').setRequired(true).setMinValue(1)))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Register commands
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    
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

// Handle interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, channel, guild } = interaction;

    // Check permissions for mod commands
    const modCommands = ['mute', 'unmute', 'warn', 'warnings', 'clearwarns', 'purge', 'lock', 'unlock', 'slowmode', 'role'];
    if (modCommands.includes(commandName) && !hasPermission(member)) {
        return await interaction.reply({
            content: '❌ You don\'t have permission to use this command!',
            ephemeral: true
        });
    }

    try {
        // Moderation Commands
        if (commandName === 'mute') {
            const user = options.getUser('user');
            const duration = options.getInteger('duration') || 10;
            const reason = options.getString('reason') || 'No reason provided';
            
            const targetMember = await guild.members.fetch(user.id);
            if (!targetMember) return await interaction.reply({ content: '❌ User not found!', ephemeral: true });
            if (!targetMember.moderatable) return await interaction.reply({ content: '❌ Cannot mute this user!', ephemeral: true });
            if (OWNER_IDS.includes(targetMember.id)) return await interaction.reply({ content: '❌ Cannot mute bot owner!', ephemeral: true });

            const muteDuration = duration * 60 * 1000;
            await targetMember.timeout(muteDuration, reason);
            
            await interaction.reply({
                content: `✅ <@${user.id}> has been muted for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
            });
        }

        else if (commandName === 'unmute') {
            const user = options.getUser('user');
            const reason = options.getString('reason') || 'No reason provided';
            
            const targetMember = await guild.members.fetch(user.id);
            if (!targetMember) return await interaction.reply({ content: '❌ User not found!', ephemeral: true });
            if (!targetMember.isCommunicationDisabled()) return await interaction.reply({ content: '❌ User is not muted!', ephemeral: true });

            await targetMember.timeout(null);
            await interaction.reply({
                content: `✅ <@${user.id}> has been unmuted.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
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
                content: `⚠️ <@${user.id}> has been warned.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
            });
        }

        else if (commandName === 'warnings') {
            const user = options.getUser('user') || interaction.user;
            
            if (!warnings.has(user.id) || warnings.get(user.id).length === 0) {
                return await interaction.reply({
                    content: `<@${user.id}> has no warnings.`,
                    ephemeral: true
                });
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

        else if (commandName === 'lock') {
            const duration = options.getInteger('duration') || 0;
            const reason = options.getString('reason') || 'No reason provided';

            await channel.permissionOverwrites.create(guild.roles.everyone, { SendMessages: false });
            for (const ownerId of OWNER_IDS) {
                await channel.permissionOverwrites.create(ownerId, { SendMessages: true });
            }

            if (duration > 0) {
                await interaction.reply({
                    content: `🔒 <#${channel.id}> has been locked for ${duration} minutes by <@${member.user.id}>\n**Reason:** ${reason}`
                });
                
                setTimeout(async () => {
                    await channel.permissionOverwrites.create(guild.roles.everyone, { SendMessages: null });
                    for (const ownerId of OWNER_IDS) {
                        const overwrite = channel.permissionOverwrites.cache.get(ownerId);
                        if (overwrite) await overwrite.delete();
                    }
                    await channel.send(`🔓 <#${channel.id}> has been automatically unlocked`);
                }, duration * 60 * 1000);
            } else {
                await interaction.reply({
                    content: `🔒 <#${channel.id}> has been permanently locked by <@${member.user.id}>\n**Reason:** ${reason}`
                });
            }
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
                    ? `⏱️ Slowmode disabled in <#${channel.id}> by <@${member.user.id}>`
                    : `⏱️ Slowmode set to ${seconds} seconds in <#${channel.id}> by <@${member.user.id}>`
            });
        }

        // Role Management
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

        // Utility Commands
        else if (commandName === 'userinfo') {
            const user = options.getUser('user') || interaction.user;
            const member = await guild.members.fetch(user.id);
            
            const embed = new EmbedBuilder()
                .setTitle(`${user.username}'s Info`)
                .setColor('Blue')
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: 'Username', value: user.username, inline: true },
                    { name: 'Discriminator', value: user.discriminator, inline: true },
                    { name: 'ID', value: user.id, inline: true },
                    { name: 'Account Created', value: user.createdAt.toDateString(), inline: true },
                    { name: 'Joined Server', value: member.joinedAt.toDateString(), inline: true },
                    { name: 'Roles', value: member.roles.cache.map(r => r.toString()).join(' ') || 'None', inline: false }
                )
                .setFooter({ text: `Requested by ${interaction.user.username}` })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'serverinfo') {
            const embed = new EmbedBuilder()
                .setTitle(`${guild.name}'s Info`)
                .setColor('Green')
                .setThumbnail(guild.iconURL())
                .addFields(
                    { name: 'Server Name', value: guild.name, inline: true },
                    { name: 'Server ID', value: guild.id, inline: true },
                    { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
                    { name: 'Members', value: guild.memberCount.toString(), inline: true },
                    { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
                    { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
                    { name: 'Created', value: guild.createdAt.toDateString(), inline: true }
                )
                .setFooter({ text: `Requested by ${interaction.user.username}` })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'avatar') {
            const user = options.getUser('user') || interaction.user;
            const embed = new EmbedBuilder()
                .setTitle(`${user.username}'s Avatar`)
                .setImage(user.displayAvatarURL({ size: 1024 }))
                .setFooter({ text: `Requested by ${interaction.user.username}` })
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        else if (commandName === 'ping') {
            const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            await interaction.editReply(`🏓 Pong! Latency is ${latency}ms. API Latency is ${Math.round(client.ws.ping)}ms`);
        }

        else if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('Bot Commands')
                .setColor('Purple')
                .setDescription('Here are all available commands:')
                .addFields(
                    { name: '🛡️ Moderation', value: '`/mute`, `/unmute`, `/warn`, `/warnings`, `/clearwarns`, `/purge`, `/lock`, `/unlock`, `/slowmode`', inline: false },
                    { name: '🎭 Role Management', value: '`/role add`, `/role remove`, `/role info`', inline: false },
                    { name: '🔧 Utility', value: '`/userinfo`, `/serverinfo`, `/avatar`, `/ping`, `/help`', inline: false },
                    { name: '🎮 Fun', value: '`/8ball`, `/coinflip`, `/roll`, `/rps`', inline: false },
                    { name: '💰 Economy', value: '`/balance`, `/leaderboard`, `/daily`, `/gamble`', inline: false },
                    { name: '🗳️ Voting', value: '`/votekick`', inline: false }
                )
                .setFooter({ text: 'Use / before each command' });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Fun Commands
        else if (commandName === '8ball') {
            const responses = [
                'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes - definitely.',
                'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.',
                'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
                'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
                'Don\'t count on it.', 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'
            ];
            const response = responses[Math.floor(Math.random() * responses.length)];
            await interaction.reply({
                content: `🎱 **Question:** ${options.getString('question')}\n**Answer:** ${response}`
            });
        }

        else if (commandName === 'coinflip') {
            const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
            await interaction.reply({
                content: `🪙 You flipped **${result}**!`
            });
        }

        else if (commandName === 'roll') {
            const sides = options.getInteger('sides') || 6;
            const result = Math.floor(Math.random() * sides) + 1;
            await interaction.reply({
                content: `🎲 You rolled a **${result}** on a ${sides}-sided die!`
            });
        }

        else if (commandName === 'rps') {
            const choices = ['rock', 'paper', 'scissors'];
            const userChoice = options.getString('choice');
            const botChoice = choices[Math.floor(Math.random() * choices.length)];
            
            let result;
            if (userChoice === botChoice) {
                result = "It's a tie!";
            } else if (
                (userChoice === 'rock' && botChoice === 'scissors') ||
                (userChoice === 'paper' && botChoice === 'rock') ||
                (userChoice === 'scissors' && botChoice === 'paper')
            ) {
                result = "You win!";
            } else {
                result = "I win!";
            }
            
            await interaction.reply({
                content: `You chose **${userChoice}**, I chose **${botChoice}**.\n**${result}**`
            });
        }

        // Economy Commands
        else if (commandName === 'balance') {
            const userId = interaction.user.id;
            if (!userBalances.has(userId)) userBalances.set(userId, 100);
            await interaction.reply({
                content: `💰 Your balance: **${userBalances.get(userId)}** coins`
            });
        }

        else if (commandName === 'leaderboard') {
            const sortedUsers = Array.from(userBalances.entries())
                .map(([userId, balance]) => ({ userId, balance }))
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 10);
            
            if (sortedUsers.length === 0) {
                return await interaction.reply({ content: '❌ No users found!', ephemeral: true });
            }
            
            let leaderboardText = '**🏆 Coin Leaderboard**\n\n';
            sortedUsers.forEach((user, index) => {
                const position = index + 1;
                const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `#${position}`;
                leaderboardText += `${emoji} <@${user.userId}> - ${user.balance} coins\n`;
            });
            
            await interaction.reply({ content: leaderboardText });
        }

        else if (commandName === 'daily') {
            const userId = interaction.user.id;
            const now = Date.now();
            const lastDaily = userCooldowns.get(`${userId}-daily`) || 0;
            const cooldown = 86400000; // 24 hours
            
            if (now - lastDaily < cooldown) {
                const remaining = cooldown - (now - lastDaily);
                const hours = Math.floor(remaining / 3600000);
                const minutes = Math.floor((remaining % 3600000) / 60000);
                return await interaction.reply({
                    content: `❌ You can claim your daily reward in ${hours}h ${minutes}m!`,
                    ephemeral: true
                });
            }
            
            if (!userBalances.has(userId)) userBalances.set(userId, 100);
            const newBalance = userBalances.get(userId) + 100;
            userBalances.set(userId, newBalance);
            userCooldowns.set(`${userId}-daily`, now);
            
            await interaction.reply({
                content: `✅ You claimed your daily reward of 100 coins!\nNew balance: ${newBalance} coins`
            });
        }

        else if (commandName === 'gamble') {
            const amount = options.getInteger('amount');
            const userId = interaction.user.id;
            
            if (!userBalances.has(userId)) userBalances.set(userId, 100);
            const balance = userBalances.get(userId);
            
            if (amount > balance) {
                return await interaction.reply({
                    content: `❌ You don't have enough coins! Your balance: ${balance} coins`,
                    ephemeral: true
                });
            }
            
            const lastGamble = userCooldowns.get(`${userId}-gamble`) || 0;
            const now = Date.now();
            const cooldownTime = 30000; // 30 seconds
            
            if (now - lastGamble < cooldownTime) {
                const remaining = Math.ceil((cooldownTime - (now - lastGamble)) / 1000);
                return await interaction.reply({
                    content: `❌ Please wait ${remaining} seconds before gambling again!`,
                    ephemeral: true
                });
            }
            
            userCooldowns.set(`${userId}-gamble`, now);
            const isWin = Math.random() < 0.5;
            const newBalance = isWin ? balance + amount : balance - amount;
            userBalances.set(userId, newBalance);
            
            await interaction.reply({
                content: isWin 
                    ? `🎉 You won ${amount} coins!\nNew balance: ${newBalance} coins` 
                    : `😢 You lost ${amount} coins!\nNew balance: ${newBalance} coins`
            });
        }

        // Voting Commands
        else if (commandName === 'votekick') {
            const targetUser = options.getUser('user');
            const reason = options.getString('reason') || 'No reason provided';
            
            if (targetUser.id === interaction.user.id) {
                return await interaction.reply({ content: '❌ You cannot votekick yourself!', ephemeral: true });
            }
            
            if (targetUser.bot) {
                return await interaction.reply({ content: '❌ You cannot votekick bots!', ephemeral: true });
            }
            
            const lastVoteKick = voteKickCooldowns.get(targetUser.id) || 0;
            const now = Date.now();
            const cooldownTime = 600000; // 10 minutes
            
            if (now - lastVoteKick < cooldownTime) {
                const remaining = Math.ceil((cooldownTime - (now - lastVoteKick)) / 60000);
                return await interaction.reply({
                    content: `❌ This user was recently in a votekick! Please wait ${remaining} minutes.`,
                    ephemeral: true
                });
            }
            
            if (voteKicks.has(channel.id)) {
                return await interaction.reply({ content: '❌ There is already an active votekick!', ephemeral: true });
            }
            
            const voteKickData = {
                targetUser: targetUser,
                votes: 1,
                voters: [interaction.user.id],
                startTime: now,
                reason: reason
            };
            
            voteKicks.set(channel.id, voteKickData);
            voteKickCooldowns.set(targetUser.id, now);
            
            const voteKickMessage = await interaction.reply({
                content: `🗳️ **VOTEKICK STARTED**\n\n<@${targetUser.id}> is being voted to be kicked!\n**Reason:** ${reason}\n\n✅ Votes: 1/5\n\nReact with ✅ to vote YES\nReact with ❌ to vote NO\n\nVoting ends in 60 seconds!`,
                fetchReply: true
            });
            
            await voteKickMessage.react('✅');
            await voteKickMessage.react('❌');
            
            const filter = (reaction, user) => ['✅', '❌'].includes(reaction.emoji.name) && !user.bot;
            const collector = voteKickMessage.createReactionCollector({ filter, time: 60000 });
            
            collector.on('collect', async (reaction, user) => {
                if (voteKicks.get(channel.id).voters.includes(user.id)) return;
                
                const currentData = voteKicks.get(channel.id);
                currentData.voters.push(user.id);
                if (reaction.emoji.name === '✅') currentData.votes++;
                voteKicks.set(channel.id, currentData);
                
                const updatedVotes = voteKicks.get(channel.id).votes;
                await voteKickMessage.edit({
                    content: `🗳️ **VOTEKICK STARTED**\n\n<@${targetUser.id}> is being voted to be kicked!\n**Reason:** ${reason}\n\n✅ Votes: ${updatedVotes}/5\n\nReact with ✅ to vote YES\nReact with ❌ to vote NO\n\nVoting ends in 60 seconds!`
                });
            });
            
            collector.on('end', async () => {
                const finalData = voteKicks.get(channel.id);
                if (!finalData) return;
                voteKicks.delete(channel.id);
                
                if (finalData.votes >= 5) {
                    try {
                        const targetMember = await guild.members.fetch(finalData.targetUser.id);
                        if (targetMember) {
                            await targetMember.kick(`Votekick: ${finalData.reason}`);
                            await interaction.followUp({
                                content: `✅ <@${finalData.targetUser.id}> has been kicked by community vote!`
                            });
                        }
                    } catch (error) {
                        await interaction.followUp({
                            content: `❌ Failed to kick <@${finalData.targetUser.id}>.`
                        });
                    }
                } else {
                    await interaction.followUp({
                        content: `❌ Votekick failed. Only ${finalData.votes}/5 votes were received.`
                    });
                }
            });
        }

        // Starboard Commands
        else if (commandName === 'starboard') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === 'setchannel') {
                // In a real implementation, you'd save this to a database
                await interaction.reply({ content: '✅ Starboard channel set!', ephemeral: true });
            } else if (subcommand === 'threshold') {
                // In a real implementation, you'd save this to a database
                await interaction.reply({ content: '✅ Star threshold set!', ephemeral: true });
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

// Starboard functionality
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (reaction.emoji.name !== '⭐') return;
    if (user.bot) return;
    
    const message = reaction.message;
    if (!starboardMessages.has(message.id)) {
        starboardMessages.set(message.id, 1);
    } else {
        starboardMessages.set(message.id, starboardMessages.get(message.id) + 1);
    }
    
    const starCount = starboardMessages.get(message.id);
    if (starCount >= 3) { // Star threshold
        const starboardChannel = message.guild.channels.cache.get(starboardChannelId);
        if (starboardChannel) {
            const embed = new EmbedBuilder()
                .setColor('Gold')
                .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
                .setDescription(message.content)
                .addFields({ name: 'Source', value: `[Jump to message](${message.url})`, inline: true })
                .addFields({ name: 'Stars', value: `⭐ ${starCount}`, inline: true })
                .setTimestamp();
            
            if (message.attachments.size > 0) {
                embed.setImage(message.attachments.first().url);
            }
            
            await starboardChannel.send({ embeds: [embed] });
        }
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

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
