require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

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
        GatewayIntentBits.GuildModeration
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

// Check if user can manage roles (for role commands)
function canManageRoles(member, targetRole) {
    // Bot owners can always manage roles
    if (OWNER_IDS.includes(member.id)) return true;
    
    // Check if member has ManageRoles permission
    if (!member.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
    
    // Check if target role is lower than member's highest role
    const highestRole = member.roles.highest;
    return targetRole.position < highestRole.position;
}

// Check if user can manage target member
function canManageMember(member, targetMember) {
    // Bot owners can always manage members
    if (OWNER_IDS.includes(member.id)) return true;
    
    // Check if member has ModerateMembers permission
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) return false;
    
    // Check if target member is lower in role hierarchy
    return member.roles.highest.position > targetMember.roles.highest.position;
}

// Command definitions
const commands = [
    // Mute command
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to mute')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in minutes (default: 10)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for mute')
                .setRequired(false)),

    // Unmute command
    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to unmute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for unmute')
                .setRequired(false)),

    // Purge all messages (up to 250)
    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from channel (up to 250)')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-250)')
                .setRequired(true)),

    // Purge human messages only
    new SlashCommandBuilder()
        .setName('purgehumans')
        .setDescription('Delete messages from humans only (up to 250)')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to check (1-250)')
                .setRequired(true)),

    // Purge bot messages only
    new SlashCommandBuilder()
        .setName('purgebots')
        .setDescription('Delete messages from bots only (up to 250)')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to check (1-250)')
                .setRequired(true)),

    // Lock channel command with duration and reason
    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock the current channel temporarily')
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in minutes (0 = permanent)')
                .setRequired(false)
                .setMinValue(0))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for locking the channel')
                .setRequired(false)),

    // Unlock channel command
    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock the current channel'),

    // Slowmode command
    new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode for the current channel')
        .addIntegerOption(option =>
            option.setName('seconds')
                .setDescription('Seconds between messages (0 to disable)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600)),

    // Warn command
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to warn')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for warning')
                .setRequired(true)),

    // Clear user messages command
    new SlashCommandBuilder()
        .setName('clearuser')
        .setDescription('Delete messages from a specific user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose messages to delete')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to check (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)),

    // Role management commands
    new SlashCommandBuilder()
        .setName('addrole')
        .setDescription('Add a role to a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to add role to')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to add')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('removerole')
        .setDescription('Remove a role from a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remove role from')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to remove')
                .setRequired(true)),

    // Nickname command
    new SlashCommandBuilder()
        .setName('nick')
        .setDescription('Change a user\'s nickname')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to change nickname for')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('nickname')
                .setDescription('New nickname (leave empty to reset)')
                .setRequired(false)),

    // Channel topic command
    new SlashCommandBuilder()
        .setName('topic')
        .setDescription('Set the channel topic')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('New channel topic')
                .setRequired(true)),

    // Announce command
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Make an announcement')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Announcement message')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send announcement to')
                .setRequired(false)),

    // Gamble command
    new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Gamble some coins')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to gamble (10-1000)')
                .setRequired(true)
                .setMinValue(10)
                .setMaxValue(1000)),

    // Balance command
    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your coin balance'),

    // Leaderboard command
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the coin leaderboard'),

    // Vote kick command
    new SlashCommandBuilder()
        .setName('votekick')
        .setDescription('Start a vote to kick a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to vote kick')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for votekick')
                .setRequired(false))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Store for temporary locks
const temporaryLocks = new Map();

// Store for warnings (in production, use a database)
const warnings = new Map();

// Store for gambling data
const userBalances = new Map(); // userId -> balance
const userCooldowns = new Map(); // userId -> timestamp

// Store for votekick data
const voteKicks = new Map(); // channelId -> {targetUser, votes, voters, startTime}
const voteKickCooldowns = new Map(); // targetUserId -> timestamp

// Register commands
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    
    // Clear any existing temporary locks on startup
    temporaryLocks.clear();
    
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

    const { commandName, options, member, channel } = interaction;

    // Check permissions for mod commands
    if (['mute', 'unmute', 'purge', 'purgehumans', 'purgebots', 'lock', 'unlock', 'slowmode', 'warn', 'clearuser', 'addrole', 'removerole', 'nick', 'topic', 'announce'].includes(commandName)) {
        if (!hasPermission(member)) {
            return await interaction.reply({
                content: '❌ You don\'t have permission to use this command! You need the Moderator role or be the bot owner.',
                ephemeral: true
            });
        }
    }

    try {
        // Mute command
        if (commandName === 'mute') {
            const user = options.getUser('user');
            const duration = options.getInteger('duration') || 10;
            const reason = options.getString('reason') || 'No reason provided';
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Check if user can be muted
            if (!targetMember.moderatable) {
                return await interaction.reply({
                    content: '❌ I cannot mute this user! Make sure my role is higher than theirs.',
                    ephemeral: true
                });
            }

            // Check if trying to mute owner or user with higher role
            if (OWNER_IDS.includes(targetMember.id)) {
                return await interaction.reply({
                    content: '❌ You cannot mute the bot owner!',
                    ephemeral: true
                });
            }

            const muteDuration = duration * 60 * 1000; // Convert to milliseconds
            
            await targetMember.timeout(muteDuration, reason);
            
            await interaction.reply({
                content: `✅ <@${user.id}> has been muted for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
            });

            // Send DM to user with moderator info
            try {
                await user.send(`You have been muted in ${interaction.guild.name} for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`);
            } catch (error) {
                console.log('Could not send DM to user');
            }
        }

        // Unmute command
        else if (commandName === 'unmute') {
            const user = options.getUser('user');
            const reason = options.getString('reason') || 'No reason provided';
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Check if user is currently muted
            if (!targetMember.isCommunicationDisabled()) {
                return await interaction.reply({
                    content: '❌ This user is not currently muted!',
                    ephemeral: true
                });
            }

            try {
                // Remove timeout
                await targetMember.timeout(null);
                
                await interaction.reply({
                    content: `✅ <@${user.id}> has been unmuted.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
                });

                // Send DM to user with moderator info
                try {
                    await user.send(`You have been unmuted in ${interaction.guild.name}.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`);
                } catch (error) {
                    console.log('Could not send DM to user');
                }
            } catch (error) {
                console.error('Unmute error:', error);
                await interaction.reply({
                    content: '❌ Failed to unmute the user. They might not be muted or I don\'t have permission.',
                    ephemeral: true
                });
            }
        }

        // Purge all messages (up to 250)
        else if (commandName === 'purge') {
            let amount = options.getInteger('amount');

            if (amount < 1 || amount > 250) {
                return await interaction.reply({
                    content: '❌ You need to input a number between 1 and 250!',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                let deletedCount = 0;
                let remaining = amount;

                // Discord only allows bulk delete of up to 100 messages at a time
                while (remaining > 0) {
                    const batchSize = Math.min(remaining, 100);
                    const fetched = await channel.messages.fetch({ limit: batchSize });
                    
                    if (fetched.size === 0) break; // No more messages to delete
                    
                    await channel.bulkDelete(fetched, true);
                    deletedCount += fetched.size;
                    remaining -= batchSize;

                    // Small delay to avoid rate limits
                    if (remaining > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${deletedCount} messages!`,
                    ephemeral: true
                });

                // Delete the success message after 5 seconds
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 5000);
            } catch (error) {
                console.error('Purge error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete messages. I might not have permission to manage messages in this channel or some messages are too old.',
                    ephemeral: true
                });
            }
        }

        // Purge human messages only
        else if (commandName === 'purgehumans') {
            let amount = options.getInteger('amount');

            if (amount < 1 || amount > 250) {
                return await interaction.reply({
                    content: '❌ You need to input a number between 1 and 250!',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                let deletedCount = 0;
                let remaining = amount;
                let checkedCount = 0;

                // Process in batches
                while (remaining > 0 && checkedCount < 1000) { // Safety limit
                    const batchSize = Math.min(remaining, 100);
                    const fetched = await channel.messages.fetch({ limit: batchSize });
                    
                    if (fetched.size === 0) break;
                    
                    const humanMessages = fetched.filter(msg => !msg.author.bot);
                    if (humanMessages.size > 0) {
                        await channel.bulkDelete(humanMessages, true);
                        deletedCount += humanMessages.size;
                    }
                    
                    checkedCount += fetched.size;
                    remaining -= batchSize;

                    // Small delay to avoid rate limits
                    if (remaining > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${deletedCount} human messages!`,
                    ephemeral: true
                });

                // Delete the success message after 5 seconds
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 5000);
            } catch (error) {
                console.error('Purge humans error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete human messages. I might not have permission to manage messages in this channel or some messages are too old.',
                    ephemeral: true
                });
            }
        }

        // Purge bot messages only
        else if (commandName === 'purgebots') {
            let amount = options.getInteger('amount');

            if (amount < 1 || amount > 250) {
                return await interaction.reply({
                    content: '❌ You need to input a number between 1 and 250!',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                let deletedCount = 0;
                let remaining = amount;
                let checkedCount = 0;

                // Process in batches
                while (remaining > 0 && checkedCount < 1000) { // Safety limit
                    const batchSize = Math.min(remaining, 100);
                    const fetched = await channel.messages.fetch({ limit: batchSize });
                    
                    if (fetched.size === 0) break;
                    
                    const botMessages = fetched.filter(msg => msg.author.bot);
                    if (botMessages.size > 0) {
                        await channel.bulkDelete(botMessages, true);
                        deletedCount += botMessages.size;
                    }
                    
                    checkedCount += fetched.size;
                    remaining -= batchSize;

                    // Small delay to avoid rate limits
                    if (remaining > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${deletedCount} bot messages!`,
                    ephemeral: true
                });

                // Delete the success message after 5 seconds
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 5000);
            } catch (error) {
                console.error('Purge bots error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete bot messages. I might not have permission to manage messages in this channel or some messages are too old.',
                    ephemeral: true
                });
            }
        }

        // Lock channel command with duration and reason
        else if (commandName === 'lock') {
            const duration = options.getInteger('duration') || 0; // 0 = permanent
            const reason = options.getString('reason') || 'No reason provided';

            try {
                // Update channel permissions to deny SEND_MESSAGES for @everyone
                await channel.permissionOverwrites.create(interaction.guild.roles.everyone, {
                    SendMessages: false
                });

                // Allow owners to still send messages
                for (const ownerId of OWNER_IDS) {
                    await channel.permissionOverwrites.create(ownerId, {
                        SendMessages: true
                    });
                }

                // If duration is specified, schedule unlock
                if (duration > 0) {
                    const unlockTime = Date.now() + (duration * 60 * 1000);
                    
                    await interaction.reply({
                        content: `🔒 <#${channel.id}> has been locked by <@${member.user.id}> for ${duration} minutes\n**Reason:** ${reason}`
                    });

                    // Schedule automatic unlock
                    setTimeout(async () => {
                        try {
                            // Remove the temporary lock record
                            temporaryLocks.delete(channel.id);
                            
                            // Unlock the channel
                            await channel.permissionOverwrites.create(interaction.guild.roles.everyone, {
                                SendMessages: null // Remove the overwrite
                            });
                            
                            // Remove owner-specific permissions
                            for (const ownerId of OWNER_IDS) {
                                const ownerOverwrite = channel.permissionOverwrites.cache.get(ownerId);
                                if (ownerOverwrite) {
                                    await ownerOverwrite.delete();
                                }
                            }
                            
                            // Send unlock notification
                            await channel.send({
                                content: `🔓 <#${channel.id}> has been automatically unlocked after ${duration} minutes`
                            });
                            
                            console.log(`${channel.name} automatically unlocked after ${duration} minutes`);
                        } catch (error) {
                            console.error('Auto-unlock error:', error);
                        }
                    }, duration * 60 * 1000);

                    // Store the temporary lock
                    temporaryLocks.set(channel.id, {
                        unlockTime: unlockTime,
                        moderator: member.user.tag,
                        reason: reason
                    });
                } else {
                    // Permanent lock
                    await interaction.reply({
                        content: `🔒 <#${channel.id}> has been permanently locked by <@${member.user.id}>\n**Reason:** ${reason}`
                    });
                }

                // Log to console
                console.log(`${channel.name} locked by ${member.user.tag} for ${duration} minutes - Reason: ${reason}`);
            } catch (error) {
                console.error('Lock error:', error);
                await interaction.reply({
                    content: '❌ Failed to lock the channel. I might not have permission to manage channel permissions.',
                    ephemeral: true
                });
            }
        }

        // Unlock channel command
        else if (commandName === 'unlock') {
            try {
                // Check if channel was temporarily locked
                const tempLock = temporaryLocks.get(channel.id);
                
                // Update channel permissions to allow SEND_MESSAGES for @everyone
                await channel.permissionOverwrites.create(interaction.guild.roles.everyone, {
                    SendMessages: null // Remove the overwrite
                });

                // Remove owner-specific permissions
                for (const ownerId of OWNER_IDS) {
                    const ownerOverwrite = channel.permissionOverwrites.cache.get(ownerId);
                    if (ownerOverwrite) {
                        await ownerOverwrite.delete();
                    }
                }

                // Remove from temporary locks
                temporaryLocks.delete(channel.id);

                if (tempLock) {
                    await interaction.reply({
                        content: `🔓 <#${channel.id}> has been unlocked by <@${member.user.id}>\nIt was originally locked by ${tempLock.moderator} for reason: ${tempLock.reason}`
                    });
                } else {
                    await interaction.reply({
                        content: `🔓 <#${channel.id}> has been unlocked by <@${member.user.id}>`
                    });
                }

                // Log to console
                console.log(`${channel.name} unlocked by ${member.user.tag}`);
            } catch (error) {
                console.error('Unlock error:', error);
                await interaction.reply({
                    content: '❌ Failed to unlock the channel. I might not have permission to manage channel permissions.',
                    ephemeral: true
                });
            }
        }

        // Slowmode command
        else if (commandName === 'slowmode') {
            const seconds = options.getInteger('seconds');

            try {
                await channel.setRateLimitPerUser(seconds);
                
                if (seconds === 0) {
                    await interaction.reply({
                        content: `⏱️ Slowmode has been disabled in <#${channel.id}> by <@${member.user.id}>`
                    });
                } else {
                    await interaction.reply({
                        content: `⏱️ Slowmode has been set to ${seconds} seconds in <#${channel.id}> by <@${member.user.id}>`
                    });
                }

                // Log to console
                console.log(`Slowmode set to ${seconds} seconds in ${channel.name} by ${member.user.tag}`);
            } catch (error) {
                console.error('Slowmode error:', error);
                await interaction.reply({
                    content: '❌ Failed to set slowmode. I might not have permission to manage channel settings.',
                    ephemeral: true
                });
            }
        }

        // Warn command
        else if (commandName === 'warn') {
            const user = options.getUser('user');
            const reason = options.getString('reason');
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Store warning (in production, use a database)
            if (!warnings.has(user.id)) {
                warnings.set(user.id, []);
            }
            const userWarnings = warnings.get(user.id);
            userWarnings.push({
                reason: reason,
                moderator: member.user.tag,
                timestamp: new Date()
            });

            await interaction.reply({
                content: `⚠️ <@${user.id}> has been warned.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`
            });

            // Send DM to user
            try {
                await user.send(`You have been warned in ${interaction.guild.name}.\n**Reason:** ${reason}\n**Moderator:** <@${member.user.id}>`);
            } catch (error) {
                console.log('Could not send DM to user');
            }
        }

        // Clear user messages command
        else if (commandName === 'clearuser') {
            const user = options.getUser('user');
            const amount = options.getInteger('amount');

            await interaction.deferReply({ ephemeral: true });

            try {
                let deletedCount = 0;
                let remaining = amount;
                let checkedCount = 0;

                // Process in batches
                while (remaining > 0 && checkedCount < 1000) { // Safety limit
                    const batchSize = Math.min(remaining, 100);
                    const fetched = await channel.messages.fetch({ limit: batchSize });
                    
                    if (fetched.size === 0) break;
                    
                    const userMessages = fetched.filter(msg => msg.author.id === user.id);
                    if (userMessages.size > 0) {
                        await channel.bulkDelete(userMessages, true);
                        deletedCount += userMessages.size;
                    }
                    
                    checkedCount += fetched.size;
                    remaining -= batchSize;

                    // Small delay to avoid rate limits
                    if (remaining > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${deletedCount} messages from <@${user.id}>!`,
                    ephemeral: true
                });

                // Delete the success message after 5 seconds
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 5000);
            } catch (error) {
                console.error('Clear user error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete user messages. I might not have permission to manage messages in this channel or some messages are too old.',
                    ephemeral: true
                });
            }
        }

        // Add role command
        else if (commandName === 'addrole') {
            const user = options.getUser('user');
            const role = options.getRole('role');
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Check permissions
            if (!canManageRoles(member, role)) {
                return await interaction.reply({
                    content: '❌ You don\'t have permission to add this role! You need Manage Roles permission and the role must be lower than your highest role.',
                    ephemeral: true
                });
            }

            // Check if target member can receive this role
            if (!canManageMember(member, targetMember)) {
                return await interaction.reply({
                    content: '❌ You cannot manage this user! Your highest role must be higher than theirs.',
                    ephemeral: true
                });
            }

            try {
                await targetMember.roles.add(role);
                await interaction.reply({
                    content: `✅ Added role <@&${role.id}> to <@${user.id}>`
                });
            } catch (error) {
                console.error('Add role error:', error);
                await interaction.reply({
                    content: '❌ Failed to add role. I might not have permission or the role is higher than my role.',
                    ephemeral: true
                });
            }
        }

        // Remove role command
        else if (commandName === 'removerole') {
            const user = options.getUser('user');
            const role = options.getRole('role');
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Check permissions
            if (!canManageRoles(member, role)) {
                return await interaction.reply({
                    content: '❌ You don\'t have permission to remove this role! You need Manage Roles permission and the role must be lower than your highest role.',
                    ephemeral: true
                });
            }

            // Check if target member can be managed
            if (!canManageMember(member, targetMember)) {
                return await interaction.reply({
                    content: '❌ You cannot manage this user! Your highest role must be higher than theirs.',
                    ephemeral: true
                });
            }

            try {
                await targetMember.roles.remove(role);
                await interaction.reply({
                    content: `✅ Removed role <@&${role.id}> from <@${user.id}>`
                });
            } catch (error) {
                console.error('Remove role error:', error);
                await interaction.reply({
                    content: '❌ Failed to remove role. I might not have permission or the role is higher than my role.',
                    ephemeral: true
                });
            }
        }

        // Nickname command
        else if (commandName === 'nick') {
            const user = options.getUser('user');
            const nickname = options.getString('nickname') || '';
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Check if target member can be managed
            if (!canManageMember(member, targetMember)) {
                return await interaction.reply({
                    content: '❌ You cannot manage this user! Your highest role must be higher than theirs.',
                    ephemeral: true
                });
            }

            try {
                await targetMember.setNickname(nickname);
                if (nickname) {
                    await interaction.reply({
                        content: `✅ Changed nickname of <@${user.id}> to ${nickname}`
                    });
                } else {
                    await interaction.reply({
                        content: `✅ Reset nickname of <@${user.id}>`
                    });
                }
            } catch (error) {
                console.error('Nickname error:', error);
                await interaction.reply({
                    content: '❌ Failed to change nickname. I might not have permission or the user has a higher role.',
                    ephemeral: true
                });
            }
        }

        // Channel topic command
        else if (commandName === 'topic') {
            const text = options.getString('text');

            try {
                await channel.setTopic(text);
                await interaction.reply({
                    content: `✅ Channel topic updated to: ${text}`
                });
            } catch (error) {
                console.error('Topic error:', error);
                await interaction.reply({
                    content: '❌ Failed to update channel topic. I might not have permission.',
                    ephemeral: true
                });
            }
        }

        // Announce command
        else if (commandName === 'announce') {
            const message = options.getString('message');
            const targetChannel = options.getChannel('channel') || channel;

            try {
                await targetChannel.send({
                    content: `📢 **Announcement**\n\n${message}\n\n*Posted by <@${member.user.id}>*`
                });
                await interaction.reply({
                    content: `✅ Announcement posted in <#${targetChannel.id}>`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Announce error:', error);
                await interaction.reply({
                    content: '❌ Failed to post announcement. I might not have permission to send messages in that channel.',
                    ephemeral: true
                });
            }
        }

        // Gamble command
        else if (commandName === 'gamble') {
            const amount = options.getInteger('amount');
            const userId = member.user.id;

            // Initialize user balance if not exists
            if (!userBalances.has(userId)) {
                userBalances.set(userId, 100); // Starting balance
            }

            const balance = userBalances.get(userId);

            // Check if user has enough coins
            if (amount > balance) {
                return await interaction.reply({
                    content: `❌ You don't have enough coins! Your balance: ${balance} coins`,
                    ephemeral: true
                });
            }

            // Check cooldown
            const lastGamble = userCooldowns.get(userId) || 0;
            const now = Date.now();
            const cooldownTime = 30000; // 30 seconds cooldown

            if (now - lastGamble < cooldownTime) {
                const remaining = Math.ceil((cooldownTime - (now - lastGamble)) / 1000);
                return await interaction.reply({
                    content: `❌ Please wait ${remaining} seconds before gambling again!`,
                    ephemeral: true
                });
            }

            // Set cooldown
            userCooldowns.set(userId, now);

            // 50% chance to win
            const isWin = Math.random() < 0.5;
            let newBalance;

            if (isWin) {
                newBalance = balance + amount;
                userBalances.set(userId, newBalance);
                await interaction.reply({
                    content: `🎉 You won ${amount} coins!\nNew balance: ${newBalance} coins`
                });
            } else {
                newBalance = balance - amount;
                userBalances.set(userId, newBalance);
                await interaction.reply({
                    content: `😢 You lost ${amount} coins!\nNew balance: ${newBalance} coins`
                });
            }
        }

        // Balance command
        else if (commandName === 'balance') {
            const userId = member.user.id;

            // Initialize user balance if not exists
            if (!userBalances.has(userId)) {
                userBalances.set(userId, 100); // Starting balance
            }

            const balance = userBalances.get(userId);
            await interaction.reply({
                content: `💰 Your balance: ${balance} coins`
            });
        }

        // Leaderboard command
        else if (commandName === 'leaderboard') {
            // Convert map to array and sort by balance
            const sortedUsers = Array.from(userBalances.entries())
                .map(([userId, balance]) => ({ userId, balance }))
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 10); // Top 10

            if (sortedUsers.length === 0) {
                return await interaction.reply({
                    content: '❌ No users found in the leaderboard!',
                    ephemeral: true
                });
            }

            let leaderboardText = '**🏆 Coin Leaderboard**\n\n';
            sortedUsers.forEach((user, index) => {
                const position = index + 1;
                const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `#${position}`;
                leaderboardText += `${emoji} <@${user.userId}> - ${user.balance} coins\n`;
            });

            await interaction.reply({
                content: leaderboardText
            });
        }

        // Vote kick command
        else if (commandName === 'votekick') {
            const targetUser = options.getUser('user');
            const reason = options.getString('reason') || 'No reason provided';

            // Check if target is the command user
            if (targetUser.id === member.user.id) {
                return await interaction.reply({
                    content: '❌ You cannot votekick yourself!',
                    ephemeral: true
                });
            }

            // Check if target is a bot
            if (targetUser.bot) {
                return await interaction.reply({
                    content: '❌ You cannot votekick bots!',
                    ephemeral: true
                });
            }

            // Check votekick cooldown for this user
            const lastVoteKick = voteKickCooldowns.get(targetUser.id) || 0;
            const now = Date.now();
            const cooldownTime = 600000; // 10 minutes cooldown

            if (now - lastVoteKick < cooldownTime) {
                const remaining = Math.ceil((cooldownTime - (now - lastVoteKick)) / 60000);
                return await interaction.reply({
                    content: `❌ This user was recently in a votekick! Please wait ${remaining} minutes before starting another votekick.`,
                    ephemeral: true
                });
            }

            // Check if there's already a votekick in this channel
            if (voteKicks.has(channel.id)) {
                return await interaction.reply({
                    content: '❌ There is already an active votekick in this channel!',
                    ephemeral: true
                });
            }

            // Create votekick
            const voteKickData = {
                targetUser: targetUser,
                votes: 1, // Creator's vote
                voters: [member.user.id],
                startTime: now,
                reason: reason
            };

            voteKicks.set(channel.id, voteKickData);

            // Set cooldown for target user
            voteKickCooldowns.set(targetUser.id, now);

            // Send votekick message
            const voteKickMessage = await interaction.reply({
                content: `🗳️ **VOTEKICK STARTED**\n\n<@${targetUser.id}> is being voted to be kicked!\n**Reason:** ${reason}\n\n✅ Votes: 1/5\n\nReact with ✅ to vote YES\nReact with ❌ to vote NO\n\nVoting ends in 60 seconds!`,
                fetchReply: true
            });

            // Add reactions
            await voteKickMessage.react('✅');
            await voteKickMessage.react('❌');

            // Collect reactions
            const filter = (reaction, user) => {
                return ['✅', '❌'].includes(reaction.emoji.name) && !user.bot;
            };

            const collector = voteKickMessage.createReactionCollector({ 
                filter, 
                time: 60000 // 60 seconds
            });

            collector.on('collect', async (reaction, user) => {
                // Check if user already voted
                if (voteKicks.get(channel.id).voters.includes(user.id)) {
                    return;
                }

                // Add vote
                const currentData = voteKicks.get(channel.id);
                currentData.voters.push(user.id);
                
                if (reaction.emoji.name === '✅') {
                    currentData.votes++;
                }
                
                voteKicks.set(channel.id, currentData);
                
                // Update message
                const updatedVotes = voteKicks.get(channel.id).votes;
                await voteKickMessage.edit({
                    content: `🗳️ **VOTEKICK STARTED**\n\n<@${targetUser.id}> is being voted to be kicked!\n**Reason:** ${reason}\n\n✅ Votes: ${updatedVotes}/5\n\nReact with ✅ to vote YES\nReact with ❌ to vote NO\n\nVoting ends in 60 seconds!`
                });
            });

            collector.on('end', async (collected) => {
                const finalData = voteKicks.get(channel.id);
                if (!finalData) return;

                // Remove from active votekicks
                voteKicks.delete(channel.id);

                if (finalData.votes >= 5) {
                    // Kick the user
                    try {
                        const targetMember = await interaction.guild.members.fetch(finalData.targetUser.id);
                        if (targetMember) {
                            await targetMember.kick(`Votekick: ${finalData.reason}`);
                            await interaction.followUp({
                                content: `✅ <@${finalData.targetUser.id}> has been kicked by community vote!\n**Reason:** ${finalData.reason}`
                            });
                        } else {
                            await interaction.followUp({
                                content: `❌ <@${finalData.targetUser.id}> left the server before being kicked.`
                            });
                        }
                    } catch (error) {
                        console.error('Votekick error:', error);
                        await interaction.followUp({
                            content: `❌ Failed to kick <@${finalData.targetUser.id}>. I might not have permission.`
                        });
                    }
                } else {
                    await interaction.followUp({
                        content: `❌ Votekick failed. Only ${finalData.votes}/5 votes were received for <@${finalData.targetUser.id}>.`
                    });
                }
            });
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

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
