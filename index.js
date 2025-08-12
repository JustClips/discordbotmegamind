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
                                .addStringOption(option => option.setName('message_id').setDescription('Reaction message ID').setRequired(true)))))

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
                    .setName('dad joke')
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
                    .setName('fortune')
                    .setDescription('Read your fortune'))
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
                    .setName('pacman')
                    .setDescription('Play pacman'))
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
                    .setName('demon slayer')
                    .setDescription('Play demon slayer'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('jujutsu kaisen')
                    .setDescription('Play jujutsu kaisen'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('my hero academia')
                    .setDescription('Play my hero academia'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('dragon ball')
                    .setDescription('Play dragon ball'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('one punch man')
                    .setDescription('Play one punch man'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('tokyo ghoul')
                    .setDescription('Play tokyo ghoul'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('death note')
                    .setDescription('Play death note'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('fullmetal alchemist')
                    .setDescription('Play fullmetal alchemist'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('fairy tail')
                    .setDescription('Play fairy tail'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('bleach')
                    .setDescription('Play bleach'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('hunter x hunter')
                    .setDescription('Play hunter x hunter'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('gintama')
                    .setDescription('Play gintama'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('your name')
                    .setDescription('Play your name'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('weathering with you')
                    .setDescription('Play weathering with you'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('a silent voice')
                    .setDescription('Play a silent voice'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('spirited away')
                    .setDescription('Play spirited away'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('princess mononoke')
                    .setDescription('Play princess mononoke'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('howl\'s moving castle')
                    .setDescription('Play howl\'s moving castle'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ponyo')
                    .setDescription('Play ponyo'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('kiki\'s delivery service')
                    .setDescription('Play kiki\'s delivery service'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('castle in the sky')
                    .setDescription('Play castle in the sky'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('my neighbor totoro')
                    .setDescription('Play my neighbor totoro'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('grave of the fireflies')
                    .setDescription('Play grave of the fireflies'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('akira')
                    .setDescription('Play akira'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ghost in the shell')
                    .setDescription('Play ghost in the shell'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('cowboy bebop')
                    .setDescription('Play cowboy bebop'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('neon genesis evangelion')
                    .setDescription('Play neon genesis evangelion'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('serial experiments lain')
                    .setDescription('Play serial experiments lain'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('perfect blue')
                    .setDescription('Play perfect blue'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('paprika')
                    .setDescription('Play paprika'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('your name')
                    .setDescription('Play your name'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('weathering with you')
                    .setDescription('Play weathering with you'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('a silent voice')
                    .setDescription('Play a silent voice'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('spirited away')
                    .setDescription('Play spirited away'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('princess mononoke')
                    .setDescription('Play princess mononoke'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('howl\'s moving castle')
                    .setDescription('Play howl\'s moving castle'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ponyo')
                    .setDescription('Play ponyo'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('kiki\'s delivery service')
                    .setDescription('Play kiki\'s delivery service'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('castle in the sky')
                    .setDescription('Play castle in the sky'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('my neighbor totoro')
                    .setDescription('Play my neighbor totoro'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('grave of the fireflies')
                    .setDescription('Play grave of the fireflies'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('akira')
                    .setDescription('Play akira'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ghost in the shell')
                    .setDescription('Play ghost in the shell'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('cowboy bebop')
                    .setDescription('Play cowboy bebop'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('neon genesis evangelion')
                    .setDescription('Play neon genesis evangelion'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('serial experiments lain')
                    .setDescription('Play serial experiments lain'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('perfect blue')
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
                            .setName('video_poker')
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
                            .setName('scratch_cards')
                            .setDescription('Scratch cards')
                            .addSubcommand(sub =>
                                sub
                                    .setName('play')
                                    .setDescription('Play scratch cards')
                                    .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                    .addSubcommandGroup(group =>
                        group
                            .setName('wheel_of_fortune')
                            .setDescription('Wheel of fortune')
                            .addSubcommand(sub =>
                                sub
                                    .setName('spin')
                                    .setDescription('Spin the wheel')
                                    .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                    .addSubcommandGroup(group =>
                        group
                            .setName('high_low')
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
                                    .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                    .addSubcommandGroup(group =>
                        group
                            .setName('war')
                            .setDescription('War card game')
                            .addSubcommand(sub =>
                                sub
                                    .setName('play')
                                    .setDescription('Play war')
                                    .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                    .addSubcommandGroup(group =>
                        group
                            .setName('war')
                            .setDescription('War card game')
                            .addSubcommand(sub =>
                                sub
                                    .setName('play')
                                    .setDescription('Play war')
                                    .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                    .addSubcommandGroup(group =>
                        group
                            .setName('war')
                            .setDescription('War card game')
                            .addSubcommand(sub =>
                                sub
                                    .setName('play')
                                    .setDescription('Play war')
                                    .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                    .addSubcommandGroup(group =>
                        group
                            .setName('war')
                            .setDescription('War card game')
                            .addSubcommand(sub =>
                                sub
                                    .setName('play')
                                    .setDescription('Play war')
                                    .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                    .addSubcommandGroup(group =>
                        group
                            .setName('war')
                            .setDescription('War card game')
                            .addSubcommand(sub =>
                                sub
                                    .setName('play')
                                    .setDescription('Play war')
                                    .addIntegerOption(option => option.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1).setMaxValue(10000))))
                    .addSubcommandGroup(group =>
                        group
                            .setName('war')
                            .setDescription('War card game')
                            .addSubcommand......
