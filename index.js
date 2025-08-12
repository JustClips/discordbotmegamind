require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ActivityType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || '1398413061169352949';
const OWNER_IDS = process.env.OWNER_IDS ? process.env.OWNER_IDS.split(',') : ['YOUR_DISCORD_USER_ID'];
const STARBOARD_CHANNEL_ID = process.env.STARBOARD_CHANNEL_ID || 'YOUR_STARBOARD_CHANNEL_ID';
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || 'YOUR_WELCOME_CHANNEL_ID';

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
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildInvites
    ] 
});

// Data stores (use database in production)
const userBalances = new Map();
const userCooldowns = new Map();
const warnings = new Map();
const voteKicks = new Map();
const voteKickCooldowns = new Map();
const temporaryLocks = new Map();
const starboardMessages = new Map();
const userLevels = new Map();
const userExperience = new Map();
const userMessages = new Map();
const customCommands = new Map();
const autoResponses = new Map();
const suggestionChannels = new Map();
const ticketChannels = new Map();
const ticketCounters = new Map();

// Utility functions
function hasPermission(member, permissionLevel = 'mod') {
    if (OWNER_IDS.includes(member.id)) return true;
    if (permissionLevel === 'mod' && member.roles.cache.has(MOD_ROLE_ID)) return true;
    if (permissionLevel === 'user') return true;
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

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function generateProgressBar(current, max, length = 20) {
    const progress = Math.round((current / max) * length);
    const empty = length - progress;
    return '█'.repeat(progress) + '░'.repeat(empty);
}

// Command definitions
const commands = [
    // Moderation Commands
    new SlashCommandBuilder()
        .setName('mod')
        .setDescription('Moderation commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('mute')
                .setDescription('Mute a user')
                .addUserOption(option => option.setName('user').setDescription('User to mute').setRequired(true))
                .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(false))
                .addStringOption(option => option.setName('reason').setDescription('Reason for mute').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unmute')
                .setDescription('Unmute a user')
                .addUserOption(option => option.setName('user').setDescription('User to unmute').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for unmute').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('warn')
                .setDescription('Warn a user')
                .addUserOption(option => option.setName('user').setDescription('User to warn').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('warnings')
                .setDescription('View warnings for a user')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clearwarns')
                .setDescription('Clear all warnings for a user')
                .addUserOption(option => option.setName('user').setDescription('User to clear warnings for').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('purge')
                .setDescription('Delete messages')
                .addIntegerOption(option => option.setName('amount').setDescription('Number of messages (1-1000)').setRequired(true).setMinValue(1).setMaxValue(1000))
                .addUserOption(option => option.setName('user').setDescription('Only delete messages from this user').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('lock')
                .setDescription('Lock a channel')
                .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes (0 = permanent)').setRequired(false))
                .addStringOption(option => option.setName('reason').setDescription('Reason for locking').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unlock')
                .setDescription('Unlock a channel'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('slowmode')
                .setDescription('Set slowmode for channel')
                .addIntegerOption(option => option.setName('seconds').setDescription('Seconds between messages').setRequired(true).setMinValue(0).setMaxValue(21600)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('kick')
                .setDescription('Kick a user')
                .addUserOption(option => option.setName('user').setDescription('User to kick').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for kick').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('ban')
                .setDescription('Ban a user')
                .addUserOption(option => option.setName('user').setDescription('User to ban').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for ban').setRequired(false))
                .addIntegerOption(option => option.setName('delete_messages').setDescription('Delete messages (days)').setRequired(false).setMinValue(0).setMaxValue(7))),

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
                .addRoleOption(option => option.setName('role').setDescription('Role to get info for').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new role')
                .addStringOption(option => option.setName('name').setDescription('Role name').setRequired(true))
                .addStringOption(option => option.setName('color').setDescription('Role color (hex)').setRequired(false))
                .addBooleanOption(option => option.setName('hoist').setDescription('Display separately').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a role')
                .addRoleOption(option => option.setName('role').setDescription('Role to delete').setRequired(true))),

    // Utility Commands
    new SlashCommandBuilder()
        .setName('utility')
        .setDescription('Utility commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('userinfo')
                .setDescription('Get information about a user')
                .addUserOption(option => option.setName('user').setDescription('User to get info for').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('serverinfo')
                .setDescription('Get information about the server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('avatar')
                .setDescription('Get a user\'s avatar')
                .addUserOption(option => option.setName('user').setDescription('User to get avatar for').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('ping')
                .setDescription('Check bot latency'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('uptime')
                .setDescription('Check bot uptime'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Show bot statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('channelinfo')
                .setDescription('Get channel information')
                .addChannelOption(option => option.setName('channel').setDescription('Channel to get info for').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('emoji')
                .setDescription('Get emoji information')
                .addStringOption(option => option.setName('emoji').setDescription('Emoji to get info for').setRequired(true))),

    // Fun Commands
    new SlashCommandBuilder()
        .setName('fun')
        .setDescription('Fun commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('8ball')
                .setDescription('Ask the magic 8-ball a question')
                .addStringOption(option => option.setName('question').setDescription('Your question').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('coinflip')
                .setDescription('Flip a coin'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('roll')
                .setDescription('Roll a dice')
                .addIntegerOption(option => option.setName('sides').setDescription('Number of sides (default: 6)').setRequired(false))
                .addIntegerOption(option => option.setName('count').setDescription('Number of dice (default: 1)').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
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
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('meme')
                .setDescription('Get a random meme'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('joke')
                .setDescription('Get a random joke'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cat')
                .setDescription('Get a random cat picture'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('dog')
                .setDescription('Get a random dog picture'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('quote')
                .setDescription('Get an inspirational quote')),

    // Economy Commands
    new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Economy commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('balance')
                .setDescription('Check your coin balance')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View the coin leaderboard')
                .addStringOption(option => 
                    option.setName('type')
                        .setDescription('Leaderboard type')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Coins', value: 'coins' },
                            { name: 'Level', value: 'level' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('daily')
                .setDescription('Claim your daily reward'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('weekly')
                .setDescription('Claim your weekly reward'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('gamble')
                .setDescription('Gamble your coins')
                .addIntegerOption(option => option.setName('amount').setDescription('Amount to gamble').setRequired(true).setMinValue(10).setMaxValue(10000)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('work')
                .setDescription('Work to earn coins'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pay')
                .setDescription('Pay coins to another user')
                .addUserOption(option => option.setName('user').setDescription('User to pay').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('Amount to pay').setRequired(true).setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('shop')
                .setDescription('View the item shop'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Buy an item from the shop')
                .addStringOption(option => option.setName('item').setDescription('Item to buy').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('inventory')
                .setDescription('View your inventory')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false))),

    // Leveling Commands
    new SlashCommandBuilder()
        .setName('level')
        .setDescription('Leveling commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('rank')
                .setDescription('Check your rank')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View the level leaderboard'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('rewards')
                .setDescription('View level rewards'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('setxp')
                .setDescription('Set XP for a user (admin only)')
                .addUserOption(option => option.setName('user').setDescription('User to set XP for').setRequired(true))
                .addIntegerOption(option => option.setName('xp').setDescription('XP amount').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset user level (admin only)')
                .addUserOption(option => option.setName('user').setDescription('User to reset').setRequired(true))),

    // Voting Commands
    new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Voting commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('votekick')
                .setDescription('Start a vote to kick a user')
                .addUserOption(option => option.setName('user').setDescription('User to vote kick').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for votekick').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('poll')
                .setDescription('Create a poll')
                .addStringOption(option => option.setName('question').setDescription('Poll question').setRequired(true))
                .addStringOption(option => option.setName('option1').setDescription('First option').setRequired(true))
                .addStringOption(option => option.setName('option2').setDescription('Second option').setRequired(true))
                .addStringOption(option => option.setName('option3').setDescription('Third option').setRequired(false))
                .addStringOption(option => option.setName('option4').setDescription('Fourth option').setRequired(false))
                .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes (default: 5)').setRequired(false))),

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
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View starred messages')),

    // Suggestion Commands
    new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Suggestion system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('submit')
                .setDescription('Submit a suggestion')
                .addStringOption(option => option.setName('title').setDescription('Suggestion title').setRequired(true))
                .addStringOption(option => option.setName('description').setDescription('Suggestion description').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('approve')
                .setDescription('Approve a suggestion')
                .addStringOption(option => option.setName('id').setDescription('Suggestion ID').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for approval').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reject')
                .setDescription('Reject a suggestion')
                .addStringOption(option => option.setName('id').setDescription('Suggestion ID').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for rejection').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List suggestions')),

    // Ticket Commands
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ticket system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a ticket')
                .addStringOption(option => option.setName('subject').setDescription('Ticket subject').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('close')
                .setDescription('Close a ticket')
                .addStringOption(option => option.setName('reason').setDescription('Reason for closing').setRequired(false)))
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
                .setName('setup')
                .setDescription('Setup ticket system')),

    // Custom Commands
    new SlashCommandBuilder()
        .setName('custom')
        .setDescription('Custom command management')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a custom command')
                .addStringOption(option => option.setName('name').setDescription('Command name').setRequired(true))
                .addStringOption(option => option.setName('response').setDescription('Command response').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a custom command')
                .addStringOption(option => option.setName('name').setDescription('Command name').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List custom commands')),

    // Auto Response Commands
    new SlashCommandBuilder()
        .setName('autoresponse')
        .setDescription('Auto response management')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add an auto response')
                .addStringOption(option => option.setName('trigger').setDescription('Trigger word/phrase').setRequired(true))
                .addStringOption(option => option.setName('response').setDescription('Response message').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove an auto response')
                .addStringOption(option => option.setName('trigger').setDescription('Trigger word/phrase').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List auto responses')),

    // Configuration Commands
    new SlashCommandBuilder()
        .setName('config')
        .setDescription('Bot configuration')
        .addSubcommand(subcommand =>
            subcommand
                .setName('prefix')
                .setDescription('Set bot prefix')
                .addStringOption(option => option.setName('prefix').setDescription('New prefix').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('modrole')
                .setDescription('Set moderator role')
                .addRoleOption(option => option.setName('role').setDescription('Moderator role').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('welcome')
                .setDescription('Set welcome channel')
                .addChannelOption(option => option.setName('channel').setDescription('Welcome channel').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('logs')
                .setDescription('Set log channel')
                .addChannelOption(option => option.setName('channel').setDescription('Log channel').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current configuration')),

    // Help Command
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information')
        .addStringOption(option => 
            option.setName('category')
                .setDescription('Command category')
                .setRequired(false)
                .addChoices(
                    { name: 'Moderation', value: 'mod' },
                    { name: 'Utility', value: 'utility' },
                    { name: 'Fun', value: 'fun' },
                    { name: 'Economy', value: 'economy' },
                    { name: 'Leveling', value: 'level' },
                    { name: 'Voting', value: 'vote' }
                ))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Register commands
client.once(Events.ClientReady, async () => {
    console.log(`🚀 ${client.user.tag} is ready!`);
    
    try {
        console.log('🔄 Refreshing application (/) commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Successfully reloaded application (/) commands.');
        
        // Set bot status
        client.user.setActivity('/help | Premium Bot', { type: ActivityType.Playing });
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
});

// Handle interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, channel, guild } = interaction;

    try {
        // Help Command
        if (commandName === 'help') {
            const category = options.getString('category');
            
            if (!category) {
                const embed = new EmbedBuilder()
                    .setTitle('🤖 Premium Bot Commands')
                    .setColor('#00ff00')
                    .setDescription('Use `/help [category]` for detailed information')
                    .addFields(
                        { name: '🛡️ Moderation', value: '`/mod` - All moderation commands', inline: false },
                        { name: '🎭 Role Management', value: '`/role` - Role management commands', inline: false },
                        { name: '🔧 Utility', value: '`/utility` - Utility commands', inline: false },
                        { name: '🎮 Fun', value: '`/fun` - Fun and entertainment', inline: false },
                        { name: '💰 Economy', value: '`/economy` - Economy system', inline: false },
                        { name: '📊 Leveling', value: '`/level` - Leveling system', inline: false },
                        { name: '🗳️ Voting', value: '`/vote` - Voting commands', inline: false },
                        { name: '⭐ Starboard', value: '`/starboard` - Starboard system', inline: false },
                        { name: '💡 Suggestions', value: '`/suggestion` - Suggestion system', inline: false },
                        { name: '🎫 Tickets', value: '`/ticket` - Ticket system', inline: false },
                        { name: '⚙️ Configuration', value: '`/config` - Bot configuration', inline: false }
                    )
                    .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            } else {
                let embed;
                switch (category) {
                    case 'mod':
                        embed = new EmbedBuilder()
                            .setTitle('🛡️ Moderation Commands')
                            .setColor('#ff0000')
                            .addFields(
                                { name: '/mod mute', value: 'Mute a user', inline: false },
                                { name: '/mod unmute', value: 'Unmute a user', inline: false },
                                { name: '/mod warn', value: 'Warn a user', inline: false },
                                { name: '/mod warnings', value: 'View user warnings', inline: false },
                                { name: '/mod purge', value: 'Delete messages', inline: false },
                                { name: '/mod lock', value: 'Lock a channel', inline: false },
                                { name: '/mod unlock', value: 'Unlock a channel', inline: false },
                                { name: '/mod slowmode', value: 'Set channel slowmode', inline: false }
                            );
                        break;
                    case 'utility':
                        embed = new EmbedBuilder()
                            .setTitle('🔧 Utility Commands')
                            .setColor('#0000ff')
                            .addFields(
                                { name: '/utility userinfo', value: 'Get user information', inline: false },
                                { name: '/utility serverinfo', value: 'Get server information', inline: false },
                                { name: '/utility avatar', value: 'Get user avatar', inline: false },
                                { name: '/utility ping', value: 'Check bot latency', inline: false },
                                { name: '/utility stats', value: 'View bot statistics', inline: false }
                            );
                        break;
                    case 'fun':
                        embed = new EmbedBuilder()
                            .setTitle('🎮 Fun Commands')
                            .setColor('#ffff00')
                            .addFields(
                                { name: '/fun 8ball', value: 'Ask the magic 8-ball', inline: false },
                                { name: '/fun coinflip', value: 'Flip a coin', inline: false },
                                { name: '/fun roll', value: 'Roll dice', inline: false },
                                { name: '/fun rps', value: 'Play Rock Paper Scissors', inline: false },
                                { name: '/fun meme', value: 'Get a random meme', inline: false }
                            );
                        break;
                    case 'economy':
                        embed = new EmbedBuilder()
                            .setTitle('💰 Economy Commands')
                            .setColor('#00ffff')
                            .addFields(
                                { name: '/economy balance', value: 'Check coin balance', inline: false },
                                { name: '/economy leaderboard', value: 'View leaderboard', inline: false },
                                { name: '/economy daily', value: 'Claim daily reward', inline: false },
                                { name: '/economy gamble', value: 'Gamble coins', inline: false },
                                { name: '/economy work', value: 'Work for coins', inline: false }
                            );
                        break;
                    case 'level':
                        embed = new EmbedBuilder()
                            .setTitle('📊 Leveling Commands')
                            .setColor('#ff00ff')
                            .addFields(
                                { name: '/level rank', value: 'Check your rank', inline: false },
                                { name: '/level leaderboard', value: 'View level leaderboard', inline: false },
                                { name: '/level rewards', value: 'View level rewards', inline: false }
                            );
                        break;
                    case 'vote':
                        embed = new EmbedBuilder()
                            .setTitle('🗳️ Voting Commands')
                            .setColor('#ffa500')
                            .addFields(
                                { name: '/vote votekick', value: 'Start a votekick', inline: false },
                                { name: '/vote poll', value: 'Create a poll', inline: false }
                            );
                        break;
                    default:
                        embed = new EmbedBuilder()
                            .setTitle('❓ Help')
                            .setColor('#ffffff')
                            .setDescription('Invalid category. Use `/help` for all categories.');
                }
                
                embed
                    .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            }
        }

        // Moderation Commands
        else if (commandName === 'mod') {
            if (!hasPermission(member)) {
                return await interaction.reply({
                    content: '❌ You don\'t have permission to use moderation commands!',
                    ephemeral: true
                });
            }

            const subcommand = options.getSubcommand();
            
            if (subcommand === 'mute') {
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
            
            else if (subcommand === 'unmute') {
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
            
            else if (subcommand === 'warn') {
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
            
            else if (subcommand === 'warnings') {
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
            
            else if (subcommand === 'clearwarns') {
                const user = options.getUser('user');
                warnings.delete(user.id);
                await interaction.reply({
                    content: `✅ Cleared all warnings for <@${user.id}>`
                });
            }
            
            else if (subcommand === 'purge') {
                const amount = options.getInteger('amount');
                const user = options.getUser('user');
                
                await interaction.deferReply({ ephemeral: true });
                
                let deletedCount = 0;
                let remaining = Math.min(amount, 1000);
                
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
            
            else if (subcommand === 'lock') {
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
            
            else if (subcommand === 'unlock') {
                await channel.permissionOverwrites.create(guild.roles.everyone, { SendMessages: null });
                for (const ownerId of OWNER_IDS) {
                    const overwrite = channel.permissionOverwrites.cache.get(ownerId);
                    if (overwrite) await overwrite.delete();
                }
                await interaction.reply({ content: `🔓 <#${channel.id}> has been unlocked by <@${member.user.id}>` });
            }
            
            else if (subcommand === 'slowmode') {
                const seconds = options.getInteger('seconds');
                await channel.setRateLimitPerUser(seconds);
                await interaction.reply({
                    content: seconds === 0 
                        ? `⏱️ Slowmode disabled in <#${channel.id}> by <@${member.user.id}>`
                        : `⏱️ Slowmode set to ${seconds} seconds in <#${channel.id}> by <@${member.user.id}>`
                });
            }
        }

        // Role Management
        else if (commandName === 'role') {
            if (!hasPermission(member)) {
                return await interaction.reply({
                    content: '❌ You don\'t have permission to manage roles!',
                    ephemeral: true
                });
            }

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
        else if (commandName === 'utility') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === 'userinfo') {
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
            
            else if (subcommand === 'serverinfo') {
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
            
            else if (subcommand === 'avatar') {
                const user = options.getUser('user') || interaction.user;
                const embed = new EmbedBuilder()
                    .setTitle(`${user.username}'s Avatar`)
                    .setImage(user.displayAvatarURL({ size: 1024 }))
                    .setFooter({ text: `Requested by ${interaction.user.username}` })
                    .setTimestamp();
                await interaction.reply({ embeds: [embed] });
            }
            
            else if (subcommand === 'ping') {
                const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
                const latency = sent.createdTimestamp - interaction.createdTimestamp;
                await interaction.editReply(`🏓 Pong! Latency is ${latency}ms. API Latency is ${Math.round(client.ws.ping)}ms`);
            }
            
            else if (subcommand === 'uptime') {
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);
                
                await interaction.reply({
                    content: `⏱️ Uptime: ${days}d ${hours}h ${minutes}m ${seconds}s`
                });
            }
        }

        // Fun Commands
        else if (commandName === 'fun') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === '8ball') {
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
            
            else if (subcommand === 'coinflip') {
                const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
                await interaction.reply({
                    content: `🪙 You flipped **${result}**!`
                });
            }
            
            else if (subcommand === 'roll') {
                const sides = options.getInteger('sides') || 6;
                const count = Math.min(options.getInteger('count') || 1, 10);
                let results = [];
                for (let i = 0; i < count; i++) {
                    results.push(Math.floor(Math.random() * sides) + 1);
                }
                await interaction.reply({
                    content: `🎲 You rolled: ${results.join(', ')} (d${sides})`
                });
            }
            
            else if (subcommand === 'rps') {
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
        }

        // Economy Commands
        else if (commandName === 'economy') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === 'balance') {
                const user = options.getUser('user') || interaction.user;
                const userId = user.id;
                if (!userBalances.has(userId)) userBalances.set(userId, 100);
                await interaction.reply({
                    content: `💰 ${user.username}'s balance: **${userBalances.get(userId)}** coins`
                });
            }
            
            else if (subcommand === 'leaderboard') {
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
            
            else if (subcommand === 'daily') {
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
            
            else if (subcommand === 'gamble') {
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
        }

        // Leveling Commands
        else if (commandName === 'level') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === 'rank') {
                const user = options.getUser('user') || interaction.user;
                const userId = user.id;
                
                if (!userLevels.has(userId)) userLevels.set(userId, 1);
                if (!userExperience.has(userId)) userExperience.set(userId, 0);
                
                const level = userLevels.get(userId);
                const xp = userExperience.get(userId);
                const xpNeeded = level * 100;
                const progress = generateProgressBar(xp, xpNeeded);
                
                const embed = new EmbedBuilder()
                    .setTitle(`${user.username}'s Rank`)
                    .setColor('Gold')
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: 'Level', value: level.toString(), inline: true },
                        { name: 'XP', value: `${xp}/${xpNeeded}`, inline: true },
                        { name: 'Progress', value: progress, inline: false }
                    )
                    .setFooter({ text: `Requested by ${interaction.user.username}` })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed] });
            }
        }

        // Voting Commands
        else if (commandName === 'vote') {
            const subcommand = options.getSubcommand();
            
            if (subcommand === 'votekick') {
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
        }

    } catch (error) {
        console.error('Command Error:', error);
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

// Message handling for leveling system
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.guild) return;
    
    const userId = message.author.id;
    
    // Initialize user data
    if (!userMessages.has(userId)) userMessages.set(userId, 0);
    if (!userExperience.has(userId)) userExperience.set(userId, 0);
    if (!userLevels.has(userId)) userLevels.set(userId, 1);
    
    // Increment message count
    userMessages.set(userId, userMessages.get(userId) + 1);
    
    // Add XP every 5 messages
    if (userMessages.get(userId) % 5 === 0) {
        const currentXp = userExperience.get(userId);
        const currentLevel = userLevels.get(userId);
        const newXp = currentXp + 10;
        const xpNeeded = currentLevel * 100;
        
        userExperience.set(userId, newXp);
        
        // Level up check
        if (newXp >= xpNeeded) {
            const newLevel = currentLevel + 1;
            userLevels.set(userId, newLevel);
            userExperience.set(userId, newXp - xpNeeded);
            
            // Send level up message
            await message.channel.send({
                content: `🎉 <@${userId}> leveled up to level ${newLevel}!`
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
        const starboardChannel = message.guild.channels.cache.get(STARBOARD_CHANNEL_ID);
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
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID) || member.guild.systemChannel;
    if (welcomeChannel) {
        const embed = new EmbedBuilder()
            .setTitle('Welcome!')
            .setDescription(`Welcome to the server, <@${member.user.id}>! 🎉`)
            .setColor('Green')
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: 'Member Count', value: member.guild.memberCount.toString(), inline: true },
                { name: 'Account Created', value: member.user.createdAt.toDateString(), inline: true }
            )
            .setFooter({ text: 'We\'re glad to have you here!' })
            .setTimestamp();
        
        await welcomeChannel.send({ embeds: [embed] });
    }
});

// Goodbye message
client.on(Events.GuildMemberRemove, async member => {
    const goodbyeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID) || member.guild.systemChannel;
    if (goodbyeChannel) {
        const embed = new EmbedBuilder()
            .setTitle('Goodbye!')
            .setDescription(`${member.user.username} has left the server. 👋`)
            .setColor('Red')
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: 'We\'ll miss you!' })
            .setTimestamp();
        
        await goodbyeChannel.send({ embeds: [embed] });
    }
});

// Error handling
client.on(Events.Error, error => {
    console.error('Discord Client Error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
