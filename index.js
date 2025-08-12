require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

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

    // Lock channel command
    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock the current channel')
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
                .setMaxValue(21600))
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

    const { commandName, options, member, channel } = interaction;

    // Check permissions
    if (!hasPermission(member)) {
        return await interaction.reply({
            content: '❌ You don\'t have permission to use this command! You need the Moderator role or be the bot owner.',
            ephemeral: true
        });
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
                content: `✅ ${user.tag} has been muted for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** ${member.user.tag}`
            });

            // Send DM to user with moderator info
            try {
                await user.send(`You have been muted in ${interaction.guild.name} for ${duration} minutes.\n**Reason:** ${reason}\n**Moderator:** ${member.user.tag}`);
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
                    content: `✅ ${user.tag} has been unmuted.\n**Reason:** ${reason}\n**Moderator:** ${member.user.tag}`
                });

                // Send DM to user with moderator info
                try {
                    await user.send(`You have been unmuted in ${interaction.guild.name}.\n**Reason:** ${reason}\n**Moderator:** ${member.user.tag}`);
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

        // Lock channel command
        else if (commandName === 'lock') {
            const reason = options.getString('reason') || 'No reason provided';

            try {
                // Update channel permissions to deny SEND_MESSAGES for @everyone
                await channel.permissionOverwrites.create(interaction.guild.roles.everyone, {
                    SendMessages: false
                });

                await interaction.reply({
                    content: `🔒 **${channel.name}** has been successfully locked by ${member.user.tag}\n**Reason:** ${reason}`
                });

                // Log to console
                console.log(`${channel.name} locked by ${member.user.tag} - Reason: ${reason}`);
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
                // Update channel permissions to allow SEND_MESSAGES for @everyone
                await channel.permissionOverwrites.create(interaction.guild.roles.everyone, {
                    SendMessages: null // Remove the overwrite
                });

                await interaction.reply({
                    content: `🔓 **${channel.name}** has been successfully unlocked by ${member.user.tag}`
                });

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
                        content: `⏱️ Slowmode has been disabled in ${channel.name} by ${member.user.tag}`
                    });
                } else {
                    await interaction.reply({
                        content: `⏱️ Slowmode has been set to ${seconds} seconds in ${channel.name} by ${member.user.tag}`
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
