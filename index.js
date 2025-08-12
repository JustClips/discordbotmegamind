require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ActivityType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || '1398413061169352949';
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID || 'YOUR_ADMIN_ROLE_ID';
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
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildWebhooks
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
const serverConfig = new Map();
const userInventory = new Map();
const shopItems = new Map();
const userBadges = new Map();
const userAchievements = new Map();
const userMarriages = new Map();
const userPets = new Map();
const userBank = new Map();
const userStocks = new Map();
const serverLogs = new Map();
const userReminders = new Map();
const userNotes = new Map();
const userTodos = new Map();
const userPolls = new Map();
const userVotes = new Map();
const userReputation = new Map();
const userDailyStreak = new Map();
const userWeeklyStreak = new Map();
const userMonthlyStreak = new Map();

// Initialize shop items
shopItems.set('common', [
    { id: 'basic_potion', name: 'Basic Potion', price: 50, description: 'Restores 10 HP' },
    { id: 'energy_drink', name: 'Energy Drink', price: 75, description: 'Boosts XP gain for 1 hour' },
    { id: 'lucky_charm', name: 'Lucky Charm', price: 100, description: 'Increases gamble win chance' }
]);

shopItems.set('rare', [
    { id: 'super_potion', name: 'Super Potion', price: 200, description: 'Restores 50 HP' },
    { id: 'xp_booster', name: 'XP Booster', price: 300, description: 'Doubles XP gain for 2 hours' },
    { id: 'golden_coin', name: 'Golden Coin', price: 500, description: 'Guaranteed win on next gamble' }
]);

shopItems.set('epic', [
    { id: 'legendary_potion', name: 'Legendary Potion', price: 1000, description: 'Full HP restore' },
    { id: 'time_warp', name: 'Time Warp', price: 1500, description: 'Reset all cooldowns' },
    { id: 'fortune_cookie', name: 'Fortune Cookie', price: 2000, description: 'Massive coin reward' }
]);

// Utility functions
function hasPermission(member, permissionLevel = 'mod') {
    if (OWNER_IDS.includes(member.id)) return 'owner';
    if (permissionLevel === 'admin' && member.roles.cache.has(ADMIN_ROLE_ID)) return 'admin';
    if (permissionLevel === 'mod' && member.roles.cache.has(MOD_ROLE_ID)) return 'mod';
    if (permissionLevel === 'user') return 'user';
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

function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
                .setName('ban')
                .setDescription('Ban a user')
                .addUserOption(option => option.setName('user').setDescription('User to ban').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for ban').setRequired(false))
                .addIntegerOption(option => option.setName('delete_messages').setDescription('Delete messages (days)').setRequired(false).setMinValue(0).setMaxValue(7)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('softban')
                .setDescription('Softban a user (kick + delete messages)')
                .addUserOption(option => option.setName('user').setDescription('User to softban').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for softban').setRequired(false))
                .addIntegerOption(option => option.setName('delete_days').setDescription('Days of messages to delete').setRequired(false).setMinValue(1).setMaxValue(7)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unban')
                .setDescription('Unban a user')
                .addStringOption(option => option.setName('user_id').setDescription('User ID to unban').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for unban').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tempban')
                .setDescription('Temporarily ban a user')
                .addUserOption(option => option.setName('user').setDescription('User to tempban').setRequired(true))
                .addIntegerOption(option => option.setName('duration').setDescription('Duration in hours').setRequired(true))
                .addStringOption(option => option.setName('reason').setDescription('Reason for tempban').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('View user moderation history')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('note')
                .setDescription('Add a note to a user')
                .addUserOption(option => option.setName('user').setDescription('User to add note to').setRequired(true))
                .addStringOption(option => option.setName('note').setDescription('Note content').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('notes')
                .setDescription('View user notes')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clearnotes')
                .setDescription('Clear all notes for a user')
                .addUserOption(option => option.setName('user').setDescription('User to clear notes for').setRequired(true))),

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
                .addBooleanOption(option => option.setName('hoist').setDescription('Display separately').setRequired(false))
                .addBooleanOption(option => option.setName('mentionable').setDescription('Mentionable role').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a role')
                .addRoleOption(option => option.setName('role').setDescription('Role to delete').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit a role')
                .addRoleOption(option => option.setName('role').setDescription('Role to edit').setRequired(true))
                .addStringOption(option => option.setName('name').setDescription('New role name').setRequired(false))
                .addStringOption(option => option.setName('color').setDescription('New role color (hex)').setRequired(false))
                .addBooleanOption(option => option.setName('hoist').setDescription('Display separately').setRequired(false))
                .addBooleanOption(option => option.setName('mentionable').setDescription('Mentionable role').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all roles in the server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('massadd')
                .setDescription('Add a role to multiple users')
                .addRoleOption(option => option.setName('role').setDescription('Role to add').setRequired(true))
                .addStringOption(option => option.setName('users').setDescription('User IDs (comma separated)').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('massremove')
                .setDescription('Remove a role from multiple users')
                .addRoleOption(option => option.setName('role').setDescription('Role to remove').setRequired(true))
                .addStringOption(option => option.setName('users').setDescription('User IDs (comma separated)').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('permissions')
                .setDescription('View role permissions')
                .addRoleOption(option => option.setName('role').setDescription('Role to check').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clone')
                .setDescription('Clone a role')
                .addRoleOption(option => option.setName('role').setDescription('Role to clone').setRequired(true))
                .addStringOption(option => option.setName('new_name').setDescription('New role name').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('position')
                .setDescription('Set role position')
                .addRoleOption(option => option.setName('role').setDescription('Role to move').setRequired(true))
                .addIntegerOption(option => option.setName('position').setDescription('New position').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('bulkcreate')
                .setDescription('Create multiple roles')
                .addStringOption(option => option.setName('names').setDescription('Role names (comma separated)').setRequired(true))
                .addStringOption(option => option.setName('color').setDescription('Role color (hex)').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('bulkdelete')
                .setDescription('Delete multiple roles')
                .addStringOption(option => option.setName('roles').setDescription('Role IDs (comma separated)').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('bulkedit')
                .setDescription('Edit multiple roles')
                .addStringOption(option => option.setName('roles').setDescription('Role IDs (comma separated)').setRequired(true))
                .addStringOption(option => option.setName('color').setDescription('New color (hex)').setRequired(false))
                .addBooleanOption(option => option.setName('hoist').setDescription('Display separately').setRequired(false))
                .addBooleanOption(option => option.setName('mentionable').setDescription('Mentionable role').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('assignable')
                .setDescription('Set role as self-assignable')
                .addRoleOption(option => option.setName('role').setDescription('Role to make assignable').setRequired(true))
                .addBooleanOption(option => option.setName('assignable').setDescription('Make assignable').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('selfassign')
                .setDescription('Assign yourself a role')
                .addRoleOption(option => option.setName('role').setDescription('Role to assign').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('selfremove')
                .setDescription('Remove a role from yourself')
                .addRoleOption(option => option.setName('role').setDescription('Role to remove').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reactionroles')
                .setDescription('Manage reaction roles')
                .addSubcommandGroup(group =>
                    group
                        .setName('setup')
                        .setDescription('Setup reaction roles')
                        .addSubcommand(sub =>
                            sub
                                .setName('message')
                                .setDescription('Create reaction role message')
                                .addChannelOption(option => option.setName('channel').setDescription('Channel for message').setRequired(true))
                                .addStringOption(option => option.setName('title').setDescription('Message title').setRequired(true))
                                .addStringOption(option => option.setName('description').setDescription('Message description').setRequired(false))))
                .addSubcommandGroup(group =>
                    group
                        .setName('add')
                        .setDescription('Add reaction role')
                        .addSubcommand(sub =>
                            sub
                                .setName('role')
                                .setDescription('Add role to reaction message')
                                .addStringOption(option => option.setName('message_id').setDescription('Reaction message ID').setRequired(true))
                                .addRoleOption(option => option.setName('role').setDescription('Role to add').setRequired(true))
                                .addStringOption(option => option.setName('emoji').setDescription('Reaction emoji').setRequired(true))))
                .addSubcommandGroup(group =>
                    group
                        .setName('remove')
                        .setDescription('Remove reaction role')
                        .addSubcommand(sub =>
                            sub
                                .setName('role')
                                .setDescription('Remove role from reaction message')
                                .addStringOption(option => option.setName('message_id').setDescription('Reaction message ID').setRequired(true))
                                .addRoleOption(option => option.setName('role').setDescription('Role to remove').setRequired(true))))
                .addSubcommandGroup(group =>
                    group
                        .setName('list')
                        .setDescription('List reaction roles')
                        .addSubcommand(sub =>
                            sub
                                .setName('message')
                                .setDescription('List reaction roles for message')
                                .addStringOption(option => option.setName('message_id').setDescription('Reaction message ID').setRequired(true))))
                .addSubcommandGroup(group =>
                    group
                        .setName('clear')
                        .setDescription('Clear reaction roles')
                        .addSubcommand(sub =>
                            sub
                                .setName('message')
                                .setDescription('Clear all reaction roles from message')
                                .addStringOption(option => option.setName('message_id').setDescription('Reaction message ID').setRequired(true))))),

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
                .addStringOption(option => option.setName('emoji').setDescription('Emoji to get info for').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('servericon')
                .setDescription('Get server icon'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('banner')
                .setDescription('Get server banner'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('inviteinfo')
                .setDescription('Get invite information')
                .addStringOption(option => option.setName('invite').setDescription('Invite code').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('permissions')
                .setDescription('Check user permissions')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false))
                .addChannelOption(option => option.setName('channel').setDescription('Channel to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('permissionsfor')
                .setDescription('Check permissions for a role')
                .addRoleOption(option => option.setName('role').setDescription('Role to check').setRequired(true))
                .addChannelOption(option => option.setName('channel').setDescription('Channel to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('auditlog')
                .setDescription('View recent audit log entries')
                .addIntegerOption(option => option.setName('limit').setDescription('Number of entries (1-100)').setRequired(false).setMinValue(1).setMaxValue(100)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('prune')
                .setDescription('Prune inactive members')
                .addIntegerOption(option => option.setName('days').setDescription('Days of inactivity').setRequired(true).setMinValue(1).setMaxValue(30))
                .addRoleOption(option => option.setName('role').setDescription('Role to exclude').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('vanity')
                .setDescription('Get vanity URL information'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('widget')
                .setDescription('Get server widget information'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('features')
                .setDescription('List server features'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('boosts')
                .setDescription('View server boosts'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('emojilist')
                .setDescription('List all server emojis'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stickers')
                .setDescription('List all server stickers'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('webhooks')
                .setDescription('List channel webhooks')
                .addChannelOption(option => option.setName('channel').setDescription('Channel to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('integrations')
                .setDescription('List server integrations'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('templates')
                .setDescription('List server templates'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('invites')
                .setDescription('List server invites'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('bans')
                .setDescription('List server bans'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('roles')
                .setDescription('List user roles')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('permissionslist')
                .setDescription('List all permissions')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('channelperms')
                .setDescription('List channel permissions')
                .addChannelOption(option => option.setName('channel').setDescription('Channel to check').setRequired(true))
                .addRoleOption(option => option.setName('role').setDescription('Role to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('voicestats')
                .setDescription('View voice channel statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('membercount')
                .setDescription('Get member count information'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('onlinecount')
                .setDescription('Get online member count'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('rolecount')
                .setDescription('Get role member counts'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('channelcount')
                .setDescription('Get channel counts'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('activity')
                .setDescription('View recent server activity'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('joins')
                .setDescription('View recent member joins'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaves')
                .setDescription('View recent member leaves'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('messages')
                .setDescription('View recent message statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reactions')
                .setDescription('View recent reaction statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('commands')
                .setDescription('View command usage statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('logs')
                .setDescription('View recent logs')
                .addIntegerOption(option => option.setName('limit').setDescription('Number of logs (1-100)').setRequired(false).setMinValue(1).setMaxValue(100)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('export')
                .setDescription('Export server data')
                .addStringOption(option => 
                    option.setName('type')
                        .setDescription('Data type to export')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Members', value: 'members' },
                            { name: 'Roles', value: 'roles' },
                            { name: 'Channels', value: 'channels' },
                            { name: 'Bans', value: 'bans' }
                        ))),

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
                .setDescription('Get an inspirational quote'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('fact')
                .setDescription('Get a random fact'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('trivia')
                .setDescription('Play a trivia game'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('wouldyourather')
                .setDescription('Play Would You Rather'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('truthordare')
                .setDescription('Play Truth or Dare'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('neverhaveiever')
                .setDescription('Play Never Have I Ever'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('compliment')
                .setDescription('Get a compliment')
                .addUserOption(option => option.setName('user').setDescription('User to compliment').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('insult')
                .setDescription('Get an insult (friendly)')
                .addUserOption(option => option.setName('user').setDescription('User to insult').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('roast')
                .setDescription('Get a roast (friendly)')
                .addUserOption(option => option.setName('user').setDescription('User to roast').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pickupline')
                .setDescription('Get a pickup line'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('dadjoke')
                .setDescription('Get a dad joke'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pun')
                .setDescription('Get a pun'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('fortune')
                .setDescription('Get your fortune'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('horoscope')
                .setDescription('Get your horoscope')
                .addStringOption(option => 
                    option.setName('sign')
                        .setDescription('Your zodiac sign')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Aries', value: 'aries' },
                            { name: 'Taurus', value: 'taurus' },
                            { name: 'Gemini', value: 'gemini' },
                            { name: 'Cancer', value: 'cancer' },
                            { name: 'Leo', value: 'leo' },
                            { name: 'Virgo', value: 'virgo' },
                            { name: 'Libra', value: 'libra' },
                            { name: 'Scorpio', value: 'scorpio' },
                            { name: 'Sagittarius', value: 'sagittarius' },
                            { name: 'Capricorn', value: 'capricorn' },
                            { name: 'Aquarius', value: 'aquarius' },
                            { name: 'Pisces', value: 'pisces' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('magic')
                .setDescription('Perform a magic trick'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tarot')
                .setDescription('Get a tarot reading'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('riddle')
                .setDescription('Solve a riddle'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('wordgame')
                .setDescription('Play a word game'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('anagram')
                .setDescription('Solve an anagram')
                .addStringOption(option => option.setName('word').setDescription('Word to scramble').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('hangman')
                .setDescription('Play hangman'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tictactoe')
                .setDescription('Play Tic Tac Toe')
                .addUserOption(option => option.setName('opponent').setDescription('Opponent to play against').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('connect4')
                .setDescription('Play Connect 4')
                .addUserOption(option => option.setName('opponent').setDescription('Opponent to play against').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('chess')
                .setDescription('Play chess')
                .addUserOption(option => option.setName('opponent').setDescription('Opponent to play against').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('checkers')
                .setDescription('Play checkers')
                .addUserOption(option => option.setName('opponent').setDescription('Opponent to play against').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('battleship')
                .setDescription('Play battleship')
                .addUserOption(option => option.setName('opponent').setDescription('Opponent to play against').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('uno')
                .setDescription('Play UNO')
                .addUserOption(option => option.setName('opponent').setDescription('Opponent to play against').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cards')
                .setDescription('Play cards')
                .addUserOption(option => option.setName('opponent').setDescription('Opponent to play against').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('slots')
                .setDescription('Play slots')
                .addIntegerOption(option => option.setName('bet').setDescription('Amount to bet').setRequired(false).setMinValue(1).setMaxValue(1000)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('blackjack')
                .setDescription('Play blackjack')
                .addIntegerOption(option => option.setName('bet').setDescription('Amount to bet').setRequired(false).setMinValue(1).setMaxValue(1000)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('roulette')
                .setDescription('Play roulette')
                .addIntegerOption(option => option.setName('bet').setDescription('Amount to bet').setRequired(false).setMinValue(1).setMaxValue(1000)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('keno')
                .setDescription('Play keno')
                .addIntegerOption(option => option.setName('bet').setDescription('Amount to bet').setRequired(false).setMinValue(1).setMaxValue(1000)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('lottery')
                .setDescription('Enter the lottery')
                .addIntegerOption(option => option.setName('tickets').setDescription('Number of tickets').setRequired(false).setMinValue(1).setMaxValue(100)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('scratch')
                .setDescription('Scratch cards')
                .addIntegerOption(option => option.setName('cards').setDescription('Number of cards').setRequired(false).setMinValue(1).setMaxValue(10)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('minesweeper')
                .setDescription('Play minesweeper'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sudoku')
                .setDescription('Play sudoku'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('crossword')
                .setDescription('Play crossword'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('wordsearch')
                .setDescription('Play word search'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('memory')
                .setDescription('Play memory game'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('simon')
                .setDescription('Play Simon says'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('snake')
                .setDescription('Play snake'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tetris')
                .setDescription('Play tetris'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pong')
                .setDescription('Play pong'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('breakout')
                .setDescription('Play breakout'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('arkanoid')
                .setDescription('Play arkanoid'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('asteroids')
                .setDescription('Play asteroids'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('spaceinvaders')
                .setDescription('Play space invaders'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('frogger')
                .setDescription('Play frogger'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('donkeykong')
                .setDescription('Play donkey kong'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('mario')
                .setDescription('Play mario'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sonic')
                .setDescription('Play sonic'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pokemon')
                .setDescription('Play pokemon'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('digimon')
                .setDescription('Play digimon'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('naruto')
                .setDescription('Play naruto'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('onepiece')
                .setDescription('Play one piece'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('attackontitan')
                .setDescription('Play attack on titan'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('demonslayer')
                .setDescription('Play demon slayer'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('jujutsukaisen')
                .setDescription('Play jujutsu kaisen'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('myheroacademia')
                .setDescription('Play my hero academia'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('dragonball')
                .setDescription('Play dragon ball'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('onepunchman')
                .setDescription('Play one punch man'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tokyoghoul')
                .setDescription('Play tokyo ghoul'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('deathnote')
                .setDescription('Play death note'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('fullmetalalchemist')
                .setDescription('Play fullmetal alchemist'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('fairytail')
                .setDescription('Play fairy tail'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('bleach')
                .setDescription('Play bleach'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('hunterxhunter')
                .setDescription('Play hunter x hunter'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('gintama')
                .setDescription('Play gintama'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('yourname')
                .setDescription('Play your name'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('weatheringwithyou')
                .setDescription('Play weathering with you'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('asilentvoice')
                .setDescription('Play a silent voice'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('spiritedaway')
                .setDescription('Play spirited away'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('princessmononoke')
                .setDescription('Play princess mononoke'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('howlsmovingcastle')
                .setDescription('Play howl\'s moving castle'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('ponyo')
                .setDescription('Play ponyo'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('kikisdeliveryservice')
                .setDescription('Play kiki\'s delivery service'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('castleinthesky')
                .setDescription('Play castle in the sky'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('myneighbortotoro')
                .setDescription('Play my neighbor totoro'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('graveofthefireflies')
                .setDescription('Play grave of the fireflies'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('akira')
                .setDescription('Play akira'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('ghostintheshell')
                .setDescription('Play ghost in the shell'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cowboybebop')
                .setDescription('Play cowboy bebop'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('neongenesisevangelion')
                .setDescription('Play neon genesis evangelion'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('serialexperimentslain')
                .setDescription('Play serial experiments lain'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('perfectblue')
                .setDescription('Play perfect blue'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('paprika')
                .setDescription('Play paprika')),

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
                            { name: 'Level', value: 'level' },
                            { name: 'Reputation', value: 'rep' }
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
                .setName('monthly')
                .setDescription('Claim your monthly reward'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('yearly')
                .setDescription('Claim your yearly reward'))
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
                .setName('crime')
                .setDescription('Commit a crime for coins'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('heist')
                .setDescription('Plan a heist')
                .addUserOption(option => option.setName('partner').setDescription('Partner for heist').setRequired(false)))
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
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('use')
                .setDescription('Use an item from your inventory')
                .addStringOption(option => option.setName('item').setDescription('Item to use').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sell')
                .setDescription('Sell an item from your inventory')
                .addStringOption(option => option.setName('item').setDescription('Item to sell').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('gift')
                .setDescription('Gift an item to another user')
                .addUserOption(option => option.setName('user').setDescription('User to gift to').setRequired(true))
                .addStringOption(option => option.setName('item').setDescription('Item to gift').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('trade')
                .setDescription('Trade items with another user')
                .addUserOption(option => option.setName('user').setDescription('User to trade with').setRequired(true))
                .addStringOption(option => option.setName('give').setDescription('Item to give').setRequired(true))
                .addStringOption(option => option.setName('receive').setDescription('Item to receive').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('bank')
                .setDescription('Bank commands')
                .addSubcommandGroup(group =>
                    group
                        .setName('deposit')
                        .setDescription('Deposit coins')
                        .addSubcommand(sub =>
                            sub
                                .setName('coins')
                                .setDescription('Deposit coins')
                                .addIntegerOption(option => option.setName('amount').setDescription('Amount to deposit').setRequired(true).setMinValue(1))))
                .addSubcommandGroup(group =>
                    group
                        .setName('withdraw')
                        .setDescription('Withdraw coins')
                        .addSubcommand(sub =>
                            sub
                                .setName('coins')
                                .setDescription('Withdraw coins')
                                .addIntegerOption(option => option.setName('amount').setDescription('Amount to withdraw').setRequired(true).setMinValue(1))))
                .addSubcommandGroup(group =>
                    group
                        .setName('balance')
                        .setDescription('Check bank balance')
                        .addSubcommand(sub =>
                            sub
                                .setName('check')
                                .setDescription('Check bank balance')))
                .addSubcommandGroup(group =>
                    group
                        .setName('interest')
                        .setDescription('Check interest rate')
                        .addSubcommand(sub =>
                            sub
                                .setName('rate')
                                .setDescription('Check interest rate')))
                .addSubcommandGroup(group =>
                    group
                        .setName('loan')
                        .setDescription('Loan commands')
                        .addSubcommand(sub =>
                            sub
                                .setName('apply')
                                .setDescription('Apply for a loan')
                                .addIntegerOption(option => option.setName('amount').setDescription('Amount to borrow').setRequired(true).setMinValue(100)))
                        .addSubcommand(sub =>
                            sub
                                .setName('pay')
                                .setDescription('Pay back a loan')
                                .addIntegerOption(option => option.setName('amount').setDescription('Amount to pay').setRequired(true).setMinValue(1)))
                        .addSubcommand(sub =>
                            sub
                                .setName('balance')
                                .setDescription('Check loan balance')))
                .addSubcommandGroup(group =>
                    group
                        .setName('invest')
                        .setDescription('Investment commands')
                        .addSubcommand(sub =>
                            sub
                                .setName('stocks')
                                .setDescription('View stocks'))
                        .addSubcommand(sub =>
                            sub
                                .setName('buy')
                                .setDescription('Buy stocks')
                                .addStringOption(option => option.setName('stock').setDescription('Stock to buy').setRequired(true))
                                .addIntegerOption(option => option.setName('shares').setDescription('Number of shares').setRequired(true).setMinValue(1)))
                        .addSubcommand(sub =>
                            sub
                                .setName('sell')
                                .setDescription('Sell stocks')
                                .addStringOption(option => option.setName('stock').setDescription('Stock to sell').setRequired(true))
                                .addIntegerOption(option => option.setName('shares').setDescription('Number of shares').setRequired(true).setMinValue(1)))
                        .addSubcommand(sub =>
                            sub
                                .setName('portfolio')
                                .setDescription('View stock portfolio'))
                        .addSubcommand(sub =>
                            sub
                                .setName('dividends')
                                .setDescription('Check dividends')))
                .addSubcommandGroup(group =>
                    group
                        .setName('transfer')
                        .setDescription('Transfer between accounts')
                        .addSubcommand(sub =>
                            sub
                                .setName('send')
                                .setDescription('Send money to another user')
                                .addUserOption(option => option.setName('user').setDescription('User to send to').setRequired(true))
                                .addIntegerOption(option => option.setName('amount').setDescription('Amount to send').setRequired(true).setMinValue(1)))))
        .addSubcommand(subcommand =>
            subcommand
                .setName('achievements')
                .setDescription('View achievements')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('badges')
                .setDescription('View badges')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reputation')
                .setDescription('Reputation commands')
                .addSubcommandGroup(group =>
                    group
                        .setName('give')
                        .setDescription('Give reputation')
                        .addSubcommand(sub =>
                            sub
                                .setName('rep')
                                .setDescription('Give reputation to a user')
                                .addUserOption(option => option.setName('user').setDescription('User to give rep to').setRequired(true))))
                .addSubcommandGroup(group =>
                    group
                        .setName('check')
                        .setDescription('Check reputation')
                        .addSubcommand(sub =>
                            sub
                                .setName('rep')
                                .setDescription('Check reputation')
                                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false))))
                .addSubcommandGroup(group =>
                    group
                        .setName('leaderboard')
                        .setDescription('View reputation leaderboard')
                        .addSubcommand(sub =>
                            sub
                                .setName('rep')
                                .setDescription('View reputation leaderboard'))))
        .addSubcommand(subcommand =>
            subcommand
                .setName('streaks')
                .setDescription('View daily streaks')
                .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset economy data (admin only)')
                .addUserOption(option => option.setName('user').setDescription('User to reset').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('setbalance')
                .setDescription('Set user balance (admin only)')
                .addUserOption(option => option.setName('user').setDescription('User to set balance for').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('New balance').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('addbalance')
                .setDescription('Add to user balance (admin only)')
                .addUserOption(option => option.setName('user').setDescription('User to add balance to').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('Amount to add').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('removebalance')
                .setDescription('Remove from user balance (admin only)')
                .addUserOption(option => option.setName('user').setDescription('User to remove balance from').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('Amount to remove').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('multiplybalance')
                .setDescription('Multiply user balance (admin only)')
                .addUserOption(option => option.setName('user').setDescription('User to multiply balance for').setRequired(true))
                .addNumberOption(option => option.setName('multiplier').setDescription('Multiplier').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('dividebalance')
                .setDescription('Divide user balance (admin only)')
                .addUserOption(option => option.setName('user').setDescription('User to divide balance for').setRequired(true))
                .addNumberOption(option => option.setName('divisor').setDescription('Divisor').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('setmultiplier')
                .setDescription('Set economy multiplier (admin only)')
                .addNumberOption(option => option.setName('multiplier').setDescription('New multiplier').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('resetmultiplier')
                .setDescription('Reset economy multiplier (admin only)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('blacklist')
                .setDescription('Blacklist user from economy (admin only)')
                .addUserOption(option => option.setName('user').setDescription('User to blacklist').setRequired(true))
                .addBooleanOption(option => option.setName('blacklisted').setDescription('Blacklist status').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('whitelist')
                .setDescription('Whitelist user for economy (admin only)')
                .addUserOption(option => option.setName('user').setDescription('User to whitelist').setRequired(true))
                .addBooleanOption(option => option.setName('whitelisted').setDescription('Whitelist status').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('tax')
                .setDescription('Tax system commands')
                .addSubcommandGroup(group =>
                    group
                        .setName('set')
                        .setDescription('Set tax rate')
                        .addSubcommand(sub =>
                            sub
                                .setName('rate')
                                .setDescription('Set tax rate')
                                .addIntegerOption(option => option.setName('rate').setDescription('Tax rate (0-100)').setRequired(true).setMinValue(0).setMaxValue(100))))
                .addSubcommandGroup(group =>
                    group
                        .setName('check')
                        .setDescription('Check tax rate')
                        .addSubcommand(sub =>
                            sub
                                .setName('rate')
                                .setDescription('Check tax rate')))
                .addSubcommandGroup(group =>
                    group
                        .setName('collect')
                        .setDescription('Collect taxes')
                        .addSubcommand(sub =>
                            sub
                                .setName('taxes')
                                .setDescription('Collect taxes')))
                .addSubcommandGroup(group =>
                    group
                        .setName('distribute')
                        .setDescription('Distribute taxes')
                        .addSubcommand(sub =>
                            sub
                                .setName('taxes')
                                .setDescription('Distribute taxes to users')))
                .addSubcommandGroup(group =>
                    group
                        .setName('exempt')
                        .setDescription('Exempt user from taxes')
                        .addSubcommand(sub =>
                            sub
                                .setName('user')
                                .setDescription('Exempt user from taxes')
                                .addUserOption(option => option.setName('user').setDescription('User to exempt').setRequired(true))
                                .addBooleanOption(option => option.setName('exempt').setDescription('Exempt status').setRequired(true))))
                .addSubcommandGroup(group =>
                    group
                        .setName('view')
                        .setDescription('View tax records')
                        .addSubcommand(sub =>
                            sub
                                .setName('records')
                                .setDescription('View tax records'))))
        .addSubcommand(subcommand =>
            subcommand
                .setName('lottery')
                .setDescription('Lottery system')
                .addSubcommandGroup(group =>
                    group
                        .setName('buy')
                        .setDescription('Buy lottery tickets')
                        .addSubcommand(sub =>
                            sub
                                .setName('tickets')
                                .setDescription('Buy lottery tickets')
                                .addIntegerOption(option => option.setName('amount').setDescription('Number of tickets').setRequired(false).setMinValue(1).setMaxValue(100))))
                .addSubcommandGroup(group =>
                    group
                        .setName('draw')
                        .setDescription('Draw lottery (admin only)')
                        .addSubcommand(sub =>
                            sub
                                .setName('winner')
                                .setDescription('Draw lottery winner')))
                .addSubcommandGroup(group =>
                    group
                        .setName('jackpot')
                        .setDescription('View current jackpot')
                        .addSubcommand(sub =>
                            sub
                                .setName('amount')
                                .setDescription('View current jackpot')))
                .addSubcommandGroup(group =>
                    group
                        .setName('history')
                        .setDescription('View lottery history')
                        .addSubcommand(sub =>
                            sub
                                .setName('draws')
                                .setDescription('View lottery history'))))
        .addSubcommand(subcommand =>
            subcommand
                .setName('auction')
                .setDescription('Auction system')
                .addSubcommandGroup(group =>
                    group
                        .setName('create')
                        .setDescription('Create auction')
                        .addSubcommand(sub =>
                            sub
                                .setName('item')
                                .setDescription('Create auction for item')
                                .addStringOption(option => option.setName('item').setDescription('Item to auction').setRequired(true))
                                .addIntegerOption(option => option.setName('starting_bid').setDescription('Starting bid').setRequired(true).setMinValue(1))
                                .addIntegerOption(option => option.setName('duration').setDescription('Duration in hours').setRequired(true).setMinValue(1).setMaxValue(168))))
                .addSubcommandGroup(group =>
                    group
                        .setName('bid')
                        .setDescription('Place bid')
                        .addSubcommand(sub =>
                            sub
                                .setName('place')
                                .setDescription('Place bid on item')
                                .addStringOption(option => option.setName('auction_id').setDescription('Auction ID').setRequired(true))
                                .addIntegerOption(option => option.setName('amount').setDescription('Bid amount').setRequired(true).setMinValue(1))))
                .addSubcommandGroup(group =>
                    group
                        .setName('view')
                        .setDescription('View auctions')
                        .addSubcommand(sub =>
                            sub
                                .setName('active')
                                .setDescription('View active auctions'))
                        .addSubcommand(sub =>
                            sub
                                .setName('item')
                                .setDescription('View specific auction')
                                .addStringOption(option => option.setName('auction_id').setDescription('Auction ID').setRequired(true))))
                .addSubcommandGroup(group =>
                    group
                        .setName('cancel')
                        .setDescription('Cancel auction')
                        .addSubcommand(sub =>
                            sub
                                .setName('auction')
                                .setDescription('Cancel auction')
                                .addStringOption(option => option.setName('auction_id').setDescription('Auction ID').setRequired(true))))
                .addSubcommandGroup(group =>
                    group
                        .setName('end')
                        .setDescription('End auction')
                        .addSubcommand(sub =>
                            sub
                                .setName('auction')
                                .setDescription('End auction')
                                .addStringOption(option => option.setName('auction_id').setDescription('Auction ID').setRequired(true))))
                .addSubcommandGroup(group =>
                    group
                        .setName('history')
                        .setDescription('View auction history')
                        .addSubcommand(sub =>
                            sub
                                .setName('bids')
                                .setDescription('View auction history'))))
        .addSubcommand(subcommand =>
            subcommand
                .setName('casino')
                .setDescription('Casino games')
                .addSubcommandGroup(group =>
                    group
                        .setName('slots')
                        .setDescription('Slot machine')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play slots')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('blackjack')
                        .setDescription('Blackjack')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play blackjack')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('roulette')
                        .setDescription('Roulette')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play roulette')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('keno')
                        .setDescription('Keno')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play keno')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('craps')
                        .setDescription('Craps')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play craps')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('baccarat')
                        .setDescription('Baccarat')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play baccarat')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('poker')
                        .setDescription('Poker')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play poker')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('videopoker')
                        .setDescription('Video poker')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play video poker')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('bingo')
                        .setDescription('Bingo')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play bingo')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('scratchcards')
                        .setDescription('Scratch cards')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play scratch cards')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('wheeloffortune')
                        .setDescription('Wheel of fortune')
                        .addSubcommand(sub =>
                            sub
                                .setName('spin')
                                .setDescription('Spin the wheel')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('highlow')
                        .setDescription('High low')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play high low')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                .addSubcommandGroup(group =>
                    group
                        .setName('war')
                        .setDescription('War card game')
                        .addSubcommand(sub =>
                            sub
                                .setName('play')
                                .setDescription('Play war')
                                .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))),

    // Ticket System
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ticket system commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new ticket')
                .addStringOption(option => option.setName('reason').setDescription('Reason for ticket').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('close')
                .setDescription('Close a ticket')
                .addStringOption(option => option.setName('reason').setDescription('Reason for closing').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user to a ticket')
                .addUserOption(option => option.setName('user').setDescription('User to add').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from a ticket')
                .addUserOption(option => option.setName('user').setDescription('User to remove').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all open tickets'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup ticket system')
                .addChannelOption(option => option.setName('category').setDescription('Category for tickets').setRequired(true))
                .addRoleOption(option => option.setName('support_role').setDescription('Support role').setRequired(true)))
];

// Register commands
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

// Event handlers
client.once(Events.ClientReady, () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    client.user.setActivity('/help for commands', { type: ActivityType.Listening });
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    // Handle moderation commands
    if (commandName === 'mod') {
        const subcommand = options.getSubcommand();
        
        switch (subcommand) {
            case 'mute':
                // Handle mute command
                await interaction.reply({ content: 'Mute command executed!', ephemeral: true });
                break;
            case 'unmute':
                // Handle unmute command
                await interaction.reply({ content: 'Unmute command executed!', ephemeral: true });
                break;
            case 'warn':
                // Handle warn command
                await interaction.reply({ content: 'Warn command executed!', ephemeral: true });
                break;
            case 'warnings':
                // Handle warnings command
                await interaction.reply({ content: 'Warnings command executed!', ephemeral: true });
                break;
            case 'clearwarns':
                // Handle clear warnings command
                await interaction.reply({ content: 'Clear warnings command executed!', ephemeral: true });
                break;
            case 'purge':
                // Handle purge command
                await interaction.reply({ content: 'Purge command executed!', ephemeral: true });
                break;
            case 'lock':
                // Handle lock command
                await interaction.reply({ content: 'Lock command executed!', ephemeral: true });
                break;
            case 'unlock':
                // Handle unlock command
                await interaction.reply({ content: 'Unlock command executed!', ephemeral: true });
                break;
            case 'slowmode':
                // Handle slowmode command
                await interaction.reply({ content: 'Slowmode command executed!', ephemeral: true });
                break;
            case 'ban':
                // Handle ban command
                await interaction.reply({ content: 'Ban command executed!', ephemeral: true });
                break;
            case 'softban':
                // Handle softban command
                await interaction.reply({ content: 'Softban command executed!', ephemeral: true });
                break;
            case 'unban':
                // Handle unban command
                await interaction.reply({ content: 'Unban command executed!', ephemeral: true });
                break;
            case 'tempban':
                // Handle tempban command
                await interaction.reply({ content: 'Tempban command executed!', ephemeral: true });
                break;
            case 'history':
                // Handle history command
                await interaction.reply({ content: 'History command executed!', ephemeral: true });
                break;
            case 'note':
                // Handle note command
                await interaction.reply({ content: 'Note command executed!', ephemeral: true });
                break;
            case 'notes':
                // Handle notes command
                await interaction.reply({ content: 'Notes command executed!', ephemeral: true });
                break;
            case 'clearnotes':
                // Handle clear notes command
                await interaction.reply({ content: 'Clear notes command executed!', ephemeral: true });
                break;
        }
    }

    // Handle role commands
    if (commandName === 'role') {
        const subcommand = options.getSubcommand();
        
        switch (subcommand) {
            case 'add':
                // Handle add role command
                await interaction.reply({ content: 'Add role command executed!', ephemeral: true });
                break;
            case 'remove':
                // Handle remove role command
                await interaction.reply({ content: 'Remove role command executed!', ephemeral: true });
                break;
            case 'info':
                // Handle role info command
                await interaction.reply({ content: 'Role info command executed!', ephemeral: true });
                break;
            case 'create':
                // Handle create role command
                await interaction.reply({ content: 'Create role command executed!', ephemeral: true });
                break;
            case 'delete':
                // Handle delete role command
                await interaction.reply({ content: 'Delete role command executed!', ephemeral: true });
                break;
            case 'edit':
                // Handle edit role command
                await interaction.reply({ content: 'Edit role command executed!', ephemeral: true });
                break;
            case 'list':
                // Handle list roles command
                await interaction.reply({ content: 'List roles command executed!', ephemeral: true });
                break;
            case 'massadd':
                // Handle mass add roles command
                await interaction.reply({ content: 'Mass add roles command executed!', ephemeral: true });
                break;
            case 'massremove':
                // Handle mass remove roles command
                await interaction.reply({ content: 'Mass remove roles command executed!', ephemeral: true });
                break;
            case 'permissions':
                // Handle role permissions command
                await interaction.reply({ content: 'Role permissions command executed!', ephemeral: true });
                break;
            case 'clone':
                // Handle clone role command
                await interaction.reply({ content: 'Clone role command executed!', ephemeral: true });
                break;
            case 'position':
                // Handle role position command
                await interaction.reply({ content: 'Role position command executed!', ephemeral: true });
                break;
            case 'bulkcreate':
                // Handle bulk create roles command
                await interaction.reply({ content: 'Bulk create roles command executed!', ephemeral: true });
                break;
            case 'bulkdelete':
                // Handle bulk delete roles command
                await interaction.reply({ content: 'Bulk delete roles command executed!', ephemeral: true });
                break;
            case 'bulkedit':
                // Handle bulk edit roles command
                await interaction.reply({ content: 'Bulk edit roles command executed!', ephemeral: true });
                break;
            case 'assignable':
                // Handle assignable role command
                await interaction.reply({ content: 'Assignable role command executed!', ephemeral: true });
                break;
            case 'selfassign':
                // Handle self assign role command
                await interaction.reply({ content: 'Self assign role command executed!', ephemeral: true });
                break;
            case 'selfremove':
                // Handle self remove role command
                await interaction.reply({ content: 'Self remove role command executed!', ephemeral: true });
                break;
            case 'reactionroles':
                // Handle reaction roles command
                await interaction.reply({ content: 'Reaction roles command executed!', ephemeral: true });
                break;
        }
    }

    // Handle utility commands
    if (commandName === 'utility') {
        const subcommand = options.getSubcommand();
        
        switch (subcommand) {
            case 'userinfo':
                // Handle user info command
                await interaction.reply({ content: 'User info command executed!', ephemeral: true });
                break;
            case 'serverinfo':
                // Handle server info command
                await interaction.reply({ content: 'Server info command executed!', ephemeral: true });
                break;
            case 'avatar':
                // Handle avatar command
                await interaction.reply({ content: 'Avatar command executed!', ephemeral: true });
                break;
            case 'ping':
                // Handle ping command
                await interaction.reply({ content: `Pong! Latency is ${Date.now() - interaction.createdTimestamp}ms`, ephemeral: true });
                break;
            case 'uptime':
                // Handle uptime command
                await interaction.reply({ content: 'Uptime command executed!', ephemeral: true });
                break;
            case 'stats':
                // Handle stats command
                await interaction.reply({ content: 'Stats command executed!', ephemeral: true });
                break;
            case 'channelinfo':
                // Handle channel info command
                await interaction.reply({ content: 'Channel info command executed!', ephemeral: true });
                break;
            case 'emoji':
                // Handle emoji command
                await interaction.reply({ content: 'Emoji command executed!', ephemeral: true });
                break;
            case 'servericon':
                // Handle server icon command
                await interaction.reply({ content: 'Server icon command executed!', ephemeral: true });
                break;
            case 'banner':
                // Handle banner command
                await interaction.reply({ content: 'Banner command executed!', ephemeral: true });
                break;
            case 'inviteinfo':
                // Handle invite info command
                await interaction.reply({ content: 'Invite info command executed!', ephemeral: true });
                break;
            case 'permissions':
                // Handle permissions command
                await interaction.reply({ content: 'Permissions command executed!', ephemeral: true });
                break;
            case 'permissionsfor':
                // Handle permissions for command
                await interaction.reply({ content: 'Permissions for command executed!', ephemeral: true });
                break;
            case 'auditlog':
                // Handle audit log command
                await interaction.reply({ content: 'Audit log command executed!', ephemeral: true });
                break;
            case 'prune':
                // Handle prune command
                await interaction.reply({ content: 'Prune command executed!', ephemeral: true });
                break;
            case 'vanity':
                // Handle vanity command
                await interaction.reply({ content: 'Vanity command executed!', ephemeral: true });
                break;
            case 'widget':
                // Handle widget command
                await interaction.reply({ content: 'Widget command executed!', ephemeral: true });
                break;
            case 'features':
                // Handle features command
                await interaction.reply({ content: 'Features command executed!', ephemeral: true });
                break;
            case 'boosts':
                // Handle boosts command
                await interaction.reply({ content: 'Boosts command executed!', ephemeral: true });
                break;
            case 'emojilist':
                // Handle emoji list command
                await interaction.reply({ content: 'Emoji list command executed!', ephemeral: true });
                break;
            case 'stickers':
                // Handle stickers command
                await interaction.reply({ content: 'Stickers command executed!', ephemeral: true });
                break;
            case 'webhooks':
                // Handle webhooks command
                await interaction.reply({ content: 'Webhooks command executed!', ephemeral: true });
                break;
            case 'integrations':
                // Handle integrations command
                await interaction.reply({ content: 'Integrations command executed!', ephemeral: true });
                break;
            case 'templates':
                // Handle templates command
                await interaction.reply({ content: 'Templates command executed!', ephemeral: true });
                break;
            case 'invites':
                // Handle invites command
                await interaction.reply({ content: 'Invites command executed!', ephemeral: true });
                break;
            case 'bans':
                // Handle bans command
                await interaction.reply({ content: 'Bans command executed!', ephemeral: true });
                break;
            case 'roles':
                // Handle roles command
                await interaction.reply({ content: 'Roles command executed!', ephemeral: true });
                break;
            case 'permissionslist':
                // Handle permissions list command
                await interaction.reply({ content: 'Permissions list command executed!', ephemeral: true });
                break;
            case 'channelperms':
                // Handle channel permissions command
                await interaction.reply({ content: 'Channel permissions command executed!', ephemeral: true });
                break;
            case 'voicestats':
                // Handle voice stats command
                await interaction.reply({ content: 'Voice stats command executed!', ephemeral: true });
                break;
            case 'membercount':
                // Handle member count command
                await interaction.reply({ content: 'Member count command executed!', ephemeral: true });
                break;
            case 'onlinecount':
                // Handle online count command
                await interaction.reply({ content: 'Online count command executed!', ephemeral: true });
                break;
            case 'rolecount':
                // Handle role count command
                await interaction.reply({ content: 'Role count command executed!', ephemeral: true });
                break;
            case 'channelcount':
                // Handle channel count command
                await interaction.reply({ content: 'Channel count command executed!', ephemeral: true });
                break;
            case 'activity':
                // Handle activity command
                await interaction.reply({ content: 'Activity command executed!', ephemeral: true });
                break;
            case 'joins':
                // Handle joins command
                await interaction.reply({ content: 'Joins command executed!', ephemeral: true });
                break;
            case 'leaves':
                // Handle leaves command
                await interaction.reply({ content: 'Leaves command executed!', ephemeral: true });
                break;
            case 'messages':
                // Handle messages command
                await interaction.reply({ content: 'Messages command executed!', ephemeral: true });
                break;
            case 'reactions':
                // Handle reactions command
                await interaction.reply({ content: 'Reactions command executed!', ephemeral: true });
                break;
            case 'commands':
                // Handle commands command
                await interaction.reply({ content: 'Commands command executed!', ephemeral: true });
                break;
            case 'logs':
                // Handle logs command
                await interaction.reply({ content: 'Logs command executed!', ephemeral: true });
                break;
            case 'export':
                // Handle export command
                await interaction.reply({ content: 'Export command executed!', ephemeral: true });
                break;
        }
    }

    // Handle fun commands
    if (commandName === 'fun') {
        const subcommand = options.getSubcommand();
        
        switch (subcommand) {
            case '8ball':
                // Handle 8ball command
                await interaction.reply({ content: '8ball command executed!', ephemeral: true });
                break;
            case 'coinflip':
                // Handle coinflip command
                await interaction.reply({ content: 'Coinflip command executed!', ephemeral: true });
                break;
            case 'roll':
                // Handle roll command
                await interaction.reply({ content: 'Roll command executed!', ephemeral: true });
                break;
            case 'rps':
                // Handle rps command
                await interaction.reply({ content: 'RPS command executed!', ephemeral: true });
                break;
            case 'meme':
                // Handle meme command
                await interaction.reply({ content: 'Meme command executed!', ephemeral: true });
                break;
            case 'joke':
                // Handle joke command
                await interaction.reply({ content: 'Joke command executed!', ephemeral: true });
                break;
            case 'cat':
                // Handle cat command
                await interaction.reply({ content: 'Cat command executed!', ephemeral: true });
                break;
            case 'dog':
                // Handle dog command
                await interaction.reply({ content: 'Dog command executed!', ephemeral: true });
                break;
            case 'quote':
                // Handle quote command
                await interaction.reply({ content: 'Quote command executed!', ephemeral: true });
                break;
            case 'fact':
                // Handle fact command
                await interaction.reply({ content: 'Fact command executed!', ephemeral: true });
                break;
            case 'trivia':
                // Handle trivia command
                await interaction.reply({ content: 'Trivia command executed!', ephemeral: true });
                break;
            case 'wouldyourather':
                // Handle would you rather command
                await interaction.reply({ content: 'Would you rather command executed!', ephemeral: true });
                break;
            case 'truthordare':
                // Handle truth or dare command
                await interaction.reply({ content: 'Truth or dare command executed!', ephemeral: true });
                break;
            case 'neverhaveiever':
                // Handle never have i ever command
                await interaction.reply({ content: 'Never have I ever command executed!', ephemeral: true });
                break;
            case 'compliment':
                // Handle compliment command
                await interaction.reply({ content: 'Compliment command executed!', ephemeral: true });
                break;
            case 'insult':
                // Handle insult command
                await interaction.reply({ content: 'Insult command executed!', ephemeral: true });
                break;
            case 'roast':
                // Handle roast command
                await interaction.reply({ content: 'Roast command executed!', ephemeral: true });
                break;
            case 'pickupline':
                // Handle pickup line command
                await interaction.reply({ content: 'Pickup line command executed!', ephemeral: true });
                break;
            case 'dadjoke':
                // Handle dad joke command
                await interaction.reply({ content: 'Dad joke command executed!', ephemeral: true });
                break;
            case 'pun':
                // Handle pun command
                await interaction.reply({ content: 'Pun command executed!', ephemeral: true });
                break;
            case 'fortune':
                // Handle fortune command
                await interaction.reply({ content: 'Fortune command executed!', ephemeral: true });
                break;
            case 'horoscope':
                // Handle horoscope command
                await interaction.reply({ content: 'Horoscope command executed!', ephemeral: true });
                break;
            case 'magic':
                // Handle magic command
                await interaction.reply({ content: 'Magic command executed!', ephemeral: true });
                break;
            case 'tarot':
                // Handle tarot command
                await interaction.reply({ content: 'Tarot command executed!', ephemeral: true });
                break;
            case 'riddle':
                // Handle riddle command
                await interaction.reply({ content: 'Riddle command executed!', ephemeral: true });
                break;
            case 'wordgame':
                // Handle word game command
                await interaction.reply({ content: 'Word game command executed!', ephemeral: true });
                break;
            case 'anagram':
                // Handle anagram command
                await interaction.reply({ content: 'Anagram command executed!', ephemeral: true });
                break;
            case 'hangman':
                // Handle hangman command
                await interaction.reply({ content: 'Hangman command executed!', ephemeral: true });
                break;
            case 'tictactoe':
                // Handle tic tac toe command
                await interaction.reply({ content: 'Tic tac toe command executed!', ephemeral: true });
                break;
            case 'connect4':
                // Handle connect 4 command
                await interaction.reply({ content: 'Connect 4 command executed!', ephemeral: true });
                break;
            case 'chess':
                // Handle chess command
                await interaction.reply({ content: 'Chess command executed!', ephemeral: true });
                break;
            case 'checkers':
                // Handle checkers command
                await interaction.reply({ content: 'Checkers command executed!', ephemeral: true });
                break;
            case 'battleship':
                // Handle battleship command
                await interaction.reply({ content: 'Battleship command executed!', ephemeral: true });
                break;
            case 'uno':
                // Handle uno command
                await interaction.reply({ content: 'UNO command executed!', ephemeral: true });
                break;
            case 'cards':
                // Handle cards command
                await interaction.reply({ content: 'Cards command executed!', ephemeral: true });
                break;
            case 'slots':
                // Handle slots command
                await interaction.reply({ content: 'Slots command executed!', ephemeral: true });
                break;
            case 'blackjack':
                // Handle blackjack command
                await interaction.reply({ content: 'Blackjack command executed!', ephemeral: true });
                break;
            case 'roulette':
                // Handle roulette command
                await interaction.reply({ content: 'Roulette command executed!', ephemeral: true });
                break;
            case 'keno':
                // Handle keno command
                await interaction.reply({ content: 'Keno command executed!', ephemeral: true });
                break;
            case 'lottery':
                // Handle lottery command
                await interaction.reply({ content: 'Lottery command executed!', ephemeral: true });
                break;
            case 'scratch':
                // Handle scratch command
                await interaction.reply({ content: 'Scratch command executed!', ephemeral: true });
                break;
            case 'minesweeper':
                // Handle minesweeper command
                await interaction.reply({ content: 'Minesweeper command executed!', ephemeral: true });
                break;
            case 'sudoku':
                // Handle sudoku command
                await interaction.reply({ content: 'Sudoku command executed!', ephemeral: true });
                break;
            case 'crossword':
                // Handle crossword command
                await interaction.reply({ content: 'Crossword command executed!', ephemeral: true });
                break;
            case 'wordsearch':
                // Handle word search command
                await interaction.reply({ content: 'Word search command executed!', ephemeral: true });
                break;
            case 'memory':
                // Handle memory command
                await interaction.reply({ content: 'Memory command executed!', ephemeral: true });
                break;
            case 'simon':
                // Handle simon command
                await interaction.reply({ content: 'Simon command executed!', ephemeral: true });
                break;
            case 'snake':
                // Handle snake command
                await interaction.reply({ content: 'Snake command executed!', ephemeral: true });
                break;
            case 'tetris':
                // Handle tetris command
                await interaction.reply({ content: 'Tetris command executed!', ephemeral: true });
                break;
            case 'pong':
                // Handle pong command
                await interaction.reply({ content: 'Pong command executed!', ephemeral: true });
                break;
            case 'breakout':
                // Handle breakout command
                await interaction.reply({ content: 'Breakout command executed!', ephemeral: true });
                break;
            case 'arkanoid':
                // Handle arkanoid command
                await interaction.reply({ content: 'Arkanoid command executed!', ephemeral: true });
                break;
            case 'asteroids':
                // Handle asteroids command
                await interaction.reply({ content: 'Asteroids command executed!', ephemeral: true });
                break;
            case 'spaceinvaders':
                // Handle space invaders command
                await interaction.reply({ content: 'Space invaders command executed!', ephemeral: true });
                break;
            case 'frogger':
                // Handle frogger command
                await interaction.reply({ content: 'Frogger command executed!', ephemeral: true });
                break;
            case 'donkeykong':
                // Handle donkey kong command
                await interaction.reply({ content: 'Donkey kong command executed!', ephemeral: true });
                break;
            case 'mario':
                // Handle mario command
                await interaction.reply({ content: 'Mario command executed!', ephemeral: true });
                break;
            case 'sonic':
                // Handle sonic command
                await interaction.reply({ content: 'Sonic command executed!', ephemeral: true });
                break;
            case 'pokemon':
                // Handle pokemon command
                await interaction.reply({ content: 'Pokemon command executed!', ephemeral: true });
                break;
            case 'digimon':
                // Handle digimon command
                await interaction.reply({ content: 'Digimon command executed!', ephemeral: true });
                break;
            case 'naruto':
                // Handle naruto command
                await interaction.reply({ content: 'Naruto command executed!', ephemeral: true });
                break;
            case 'onepiece':
                // Handle one piece command
                await interaction.reply({ content: 'One piece command executed!', ephemeral: true });
                break;
            case 'attackontitan':
                // Handle attack on titan command
                await interaction.reply({ content: 'Attack on titan command executed!', ephemeral: true });
                break;
            case 'demonslayer':
                // Handle demon slayer command
                await interaction.reply({ content: 'Demon slayer command executed!', ephemeral: true });
                break;
            case 'jujutsukaisen':
                // Handle jujutsu kaisen command
                await interaction.reply({ content: 'Jujutsu kaisen command executed!', ephemeral: true });
                break;
            case 'myheroacademia':
                // Handle my hero academia command
                await interaction.reply({ content: 'My hero academia command executed!', ephemeral: true });
                break;
            case 'dragonball':
                // Handle dragon ball command
                await interaction.reply({ content: 'Dragon ball command executed!', ephemeral: true });
                break;
            case 'onepunchman':
                // Handle one punch man command
                await interaction.reply({ content: 'One punch man command executed!', ephemeral: true });
                break;
            case 'tokyoghoul':
                // Handle tokyo ghoul command
                await interaction.reply({ content: 'Tokyo ghoul command executed!', ephemeral: true });
                break;
            case 'deathnote':
                // Handle death note command
                await interaction.reply({ content: 'Death note command executed!', ephemeral: true });
                break;
            case 'fullmetalalchemist':
                // Handle fullmetal alchemist command
                await interaction.reply({ content: 'Fullmetal alchemist command executed!', ephemeral: true });
                break;
            case 'fairytail':
                // Handle fairy tail command
                await interaction.reply({ content: 'Fairy tail command executed!', ephemeral: true });
                break;
            case 'bleach':
                // Handle bleach command
                await interaction.reply({ content: 'Bleach command executed!', ephemeral: true });
                break;
            case 'hunterxhunter':
                // Handle hunter x hunter command
                await interaction.reply({ content: 'Hunter x hunter command executed!', ephemeral: true });
                break;
            case 'gintama':
                // Handle gintama command
                await interaction.reply({ content: 'Gintama command executed!', ephemeral: true });
                break;
            case 'yourname':
                // Handle your name command
                await interaction.reply({ content: 'Your name command executed!', ephemeral: true });
                break;
            case 'weatheringwithyou':
                // Handle weathering with you command
                await interaction.reply({ content: 'Weathering with you command executed!', ephemeral: true });
                break;
            case 'asilentvoice':
                // Handle a silent voice command
                await interaction.reply({ content: 'A silent voice command executed!', ephemeral: true });
                break;
            case 'spiritedaway':
                // Handle spirited away command
                await interaction.reply({ content: 'Spirited away command executed!', ephemeral: true });
                break;
            case 'princessmononoke':
                // Handle princess mononoke command
                await interaction.reply({ content: 'Princess mononoke command executed!', ephemeral: true });
                break;
            case 'howlsmovingcastle':
                // Handle howl's moving castle command
                await interaction.reply({ content: 'Howl\'s moving castle command executed!', ephemeral: true });
                break;
            case 'ponyo':
                // Handle ponyo command
                await interaction.reply({ content: 'Ponyo command executed!', ephemeral: true });
                break;
            case 'kikisdeliveryservice':
                // Handle kiki's delivery service command
                await interaction.reply({ content: 'Kiki\'s delivery service command executed!', ephemeral: true });
                break;
            case 'castleinthesky':
                // Handle castle in the sky command
                await interaction.reply({ content: 'Castle in the sky command executed!', ephemeral: true });
                break;
            case 'myneighbortotoro':
                // Handle my neighbor totoro command
                await interaction.reply({ content: 'My neighbor totoro command executed!', ephemeral: true });
                break;
            case 'graveofthefireflies':
                // Handle grave of the fireflies command
                await interaction.reply({ content: 'Grave of the fireflies command executed!', ephemeral: true });
                break;
            case 'akira':
                // Handle akira command
                await interaction.reply({ content: 'Akira command executed!', ephemeral: true });
                break;
            case 'ghostintheshell':
                // Handle ghost in the shell command
                await interaction.reply({ content: 'Ghost in the shell command executed!', ephemeral: true });
                break;
            case 'cowboybebop':
                // Handle cowboy bebop command
                await interaction.reply({ content: 'Cowboy bebop command executed!', ephemeral: true });
                break;
            case 'neongenesisevangelion':
                // Handle neon genesis evangelion command
                await interaction.reply({ content: 'Neon genesis evangelion command executed!', ephemeral: true });
                break;
            case 'serialexperimentslain':
                // Handle serial experiments lain command
                await interaction.reply({ content: 'Serial experiments lain command executed!', ephemeral: true });
                break;
            case 'perfectblue':
                // Handle perfect blue command
                await interaction.reply({ content: 'Perfect blue command executed!', ephemeral: true });
                break;
            case 'paprika':
                // Handle paprika command
                await interaction.reply({ content: 'Paprika command executed!', ephemeral: true });
                break;
        }
    }

    // Handle economy commands
    if (commandName === 'economy') {
        const subcommand = options.getSubcommand();
        
        switch (subcommand) {
            case 'balance':
                // Handle balance command
                await interaction.reply({ content: 'Balance command executed!', ephemeral: true });
                break;
            case 'leaderboard':
                // Handle leaderboard command
                await interaction.reply({ content: 'Leaderboard command executed!', ephemeral: true });
                break;
            case 'daily':
                // Handle daily command
                await interaction.reply({ content: 'Daily command executed!', ephemeral: true });
                break;
            case 'weekly':
                // Handle weekly command
                await interaction.reply({ content: 'Weekly command executed!', ephemeral: true });
                break;
            case 'monthly':
                // Handle monthly command
                await interaction.reply({ content: 'Monthly command executed!', ephemeral: true });
                break;
            case 'yearly':
                // Handle yearly command
                await interaction.reply({ content: 'Yearly command executed!', ephemeral: true });
                break;
            case 'gamble':
                // Handle gamble command
                await interaction.reply({ content: 'Gamble command executed!', ephemeral: true });
                break;
            case 'work':
                // Handle work command
                await interaction.reply({ content: 'Work command executed!', ephemeral: true });
                break;
            case 'crime':
                // Handle crime command
                await interaction.reply({ content: 'Crime command executed!', ephemeral: true });
                break;
            case 'heist':
                // Handle heist command
                await interaction.reply({ content: 'Heist command executed!', ephemeral: true });
                break;
            case 'pay':
                // Handle pay command
                await interaction.reply({ content: 'Pay command executed!', ephemeral: true });
                break;
            case 'shop':
                // Handle shop command
                await interaction.reply({ content: 'Shop command executed!', ephemeral: true });
                break;
            case 'buy':
                // Handle buy command
                await interaction.reply({ content: 'Buy command executed!', ephemeral: true });
                break;
            case 'inventory':
                // Handle inventory command
                await interaction.reply({ content: 'Inventory command executed!', ephemeral: true });
                break;
            case 'use':
                // Handle use command
                await interaction.reply({ content: 'Use command executed!', ephemeral: true });
                break;
            case 'sell':
                // Handle sell command
                await interaction.reply({ content: 'Sell command executed!', ephemeral: true });
                break;
            case 'gift':
                // Handle gift command
                await interaction.reply({ content: 'Gift command executed!', ephemeral: true });
                break;
            case 'trade':
                // Handle trade command
                await interaction.reply({ content: 'Trade command executed!', ephemeral: true });
                break;
            case 'bank':
                // Handle bank command
                await interaction.reply({ content: 'Bank command executed!', ephemeral: true });
                break;
            case 'achievements':
                // Handle achievements command
                await interaction.reply({ content: 'Achievements command executed!', ephemeral: true });
                break;
            case 'badges':
                // Handle badges command
                await interaction.reply({ content: 'Badges command executed!', ephemeral: true });
                break;
            case 'reputation':
                // Handle reputation command
                await interaction.reply({ content: 'Reputation command executed!', ephemeral: true });
                break;
            case 'streaks':
                // Handle streaks command
                await interaction.reply({ content: 'Streaks command executed!', ephemeral: true });
                break;
            case 'reset':
                // Handle reset command
                await interaction.reply({ content: 'Reset command executed!', ephemeral: true });
                break;
            case 'setbalance':
                // Handle set balance command
                await interaction.reply({ content: 'Set balance command executed!', ephemeral: true });
                break;
            case 'addbalance':
                // Handle add balance command
                await interaction.reply({ content: 'Add balance command executed!', ephemeral: true });
                break;
            case 'removebalance':
                // Handle remove balance command
                await interaction.reply({ content: 'Remove balance command executed!', ephemeral: true });
                break;
            case 'multiplybalance':
                // Handle multiply balance command
                await interaction.reply({ content: 'Multiply balance command executed!', ephemeral: true });
                break;
            case 'dividebalance':
                // Handle divide balance command
                await interaction.reply({ content: 'Divide balance command executed!', ephemeral: true });
                break;
            case 'setmultiplier':
                // Handle set multiplier command
                await interaction.reply({ content: 'Set multiplier command executed!', ephemeral: true });
                break;
            case 'resetmultiplier':
                // Handle reset multiplier command
                await interaction.reply({ content: 'Reset multiplier command executed!', ephemeral: true });
                break;
            case 'blacklist':
                // Handle blacklist command
                await interaction.reply({ content: 'Blacklist command executed!', ephemeral: true });
                break;
            case 'whitelist':
                // Handle whitelist command
                await interaction.reply({ content: 'Whitelist command executed!', ephemeral: true });
                break;
            case 'tax':
                // Handle tax command
                await interaction.reply({ content: 'Tax command executed!', ephemeral: true });
                break;
            case 'lottery':
                // Handle lottery command
                await interaction.reply({ content: 'Lottery command executed!', ephemeral: true });
                break;
            case 'auction':
                // Handle auction command
                await interaction.reply({ content: 'Auction command executed!', ephemeral: true });
                break;
            case 'casino':
                // Handle casino command
                await interaction.reply({ content: 'Casino command executed!', ephemeral: true });
                break;
        }
    }

    // Handle ticket commands
    if (commandName === 'ticket') {
        const subcommand = options.getSubcommand();
        
        switch (subcommand) {
            case 'create':
                // Handle create ticket command
                await interaction.reply({ content: 'Create ticket command executed!', ephemeral: true });
                break;
            case 'close':
                // Handle close ticket command
                await interaction.reply({ content: 'Close ticket command executed!', ephemeral: true });
                break;
            case 'add':
                // Handle add user to ticket command
                await interaction.reply({ content: 'Add user to ticket command executed!', ephemeral: true });
                break;
            case 'remove':
                // Handle remove user from ticket command
                await interaction.reply({ content: 'Remove user from ticket command executed!', ephemeral: true });
                break;
            case 'list':
                // Handle list tickets command
                await interaction.reply({ content: 'List tickets command executed!', ephemeral: true });
                break;
            case 'setup':
                // Handle setup ticket system command
                await interaction.reply({ content: 'Setup ticket system command executed!', ephemeral: true });
                break;
        }
    }
});

// Login to Discord
client.login(process.env.TOKEN);
